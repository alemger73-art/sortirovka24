"""FrontPad / Compad POS Integration Router.

Provides endpoints for:
- Settings management (get/update FrontPad API credentials)
- Connection testing
- Full menu sync (categories, products, modifiers with proper mapping)
- Order transmission to FrontPad
- Sync log retrieval
- Debug endpoint to inspect raw API responses

IMPORTANT: FrontPad uses SEPARATE concerns:
  - MENU retrieval: get_products method with menu_secret (or shared secret)
  - ORDER creation: new_order method with order_secret + affiliate_id + delivery_product_id

FrontPad API docs:
  Base URL: https://app.frontpad.ru/api/index.php?{METHOD}
  Method: POST, Encoding: UTF-8, Rate limit: 30 req/min
  Required param: secret (API key)
  
  Available methods: get_products, new_order, get_status, get_client, get_certificate
  
  get_products response structure:
  {
    "result": "success",
    "products": [
      {
        "product_id": "123",
        "product_name": "Name",
        "product_price": "450.00",
        "product_cat_name": "Category",
        "product_descr": "Description",
        "product_image": "https://...",
        "product_active": "1",
        "product_weight": "350",
        "product_mod": "1",  // has modifiers flag
        "modifiers": [
          {
            "modifier_id": "10",
            "modifier_name": "Extra cheese",
            "modifier_price": "50.00"
          }
        ]
      }
    ]
  }
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.frontpad_settings import Frontpad_settingsService
from services.frontpad_sync_log import Frontpad_sync_logService
from services.food_items import Food_itemsService
from services.food_categories import Food_categoriesService
from services.food_modifiers import Food_modifiersService
from services.food_item_modifiers import Food_item_modifiersService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/frontpad", tags=["frontpad"])

# FrontPad API base URL - method goes in query string
FRONTPAD_API_BASE = "https://app.frontpad.ru/api/index.php"

# Fallback category name for products without a category
FALLBACK_CATEGORY = "Прочее"


# ---------- Pydantic Schemas ----------

class FrontpadSettingsUpdate(BaseModel):
    menu_secret: Optional[str] = None       # Secret key for get_products (menu)
    order_secret: Optional[str] = None      # Secret key for new_order (orders)
    affiliate_id: Optional[str] = None      # Affiliate ID (for orders only)
    delivery_product_id: Optional[str] = None  # Delivery product ID (for orders only)
    sync_interval: Optional[str] = None     # "manual", "1h", "24h"
    # Legacy support: if api_key is sent, treat it as order_secret
    api_key: Optional[str] = None


class FrontpadSettingsResponse(BaseModel):
    menu_secret: str = ""
    order_secret: str = ""
    affiliate_id: str = ""
    delivery_product_id: str = ""
    sync_interval: str = "manual"
    last_sync_status: str = ""
    last_sync_at: str = ""
    last_sync_error: str = ""
    # Legacy field
    api_key: str = ""


class OrderItem(BaseModel):
    product_id: int
    quantity: int


class SendOrderRequest(BaseModel):
    order_items: List[OrderItem]
    customer_name: str
    customer_phone: str
    delivery_address: Optional[str] = None
    comment: Optional[str] = None


class SyncLogResponse(BaseModel):
    id: int
    sync_type: str
    status: str
    products_synced: Optional[int] = None
    categories_synced: Optional[int] = None
    modifiers_synced: Optional[int] = 0
    errors: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None


class SyncResult(BaseModel):
    success: bool
    message: str
    categories_received: int = 0
    categories_synced: int = 0
    products_received: int = 0
    products_synced: int = 0
    products_displayed: int = 0
    modifiers_received: int = 0
    modifiers_synced: int = 0
    errors: List[str] = []


class DebugApiResponse(BaseModel):
    success: bool
    message: str = ""
    http_status: int = 0
    response_keys: List[str] = []
    products_count: int = 0
    categories_found: List[str] = []
    modifiers_count: int = 0
    sample_product: Optional[Dict[str, Any]] = None
    raw_response_truncated: str = ""


# ---------- Helper Functions ----------

async def _get_setting(service: Frontpad_settingsService, key: str) -> str:
    """Get a single setting value by key."""
    item = await service.get_by_field("setting_key", key)
    if item:
        return item.setting_value or ""
    return ""


async def _set_setting(service: Frontpad_settingsService, key: str, value: str) -> None:
    """Set a single setting value by key (create or update)."""
    item = await service.get_by_field("setting_key", key)
    if item:
        await service.update(item.id, {"setting_value": value, "updated_at": datetime.now().isoformat()})
    else:
        await service.create({
            "setting_key": key,
            "setting_value": value,
            "updated_at": datetime.now().isoformat(),
        })


async def _get_menu_secret(service: Frontpad_settingsService) -> str:
    """Get the secret key for menu retrieval.
    
    Priority: menu_secret > api_key (legacy fallback)
    """
    menu_secret = await _get_setting(service, "menu_secret")
    if menu_secret:
        return menu_secret
    # Fallback to legacy api_key
    return await _get_setting(service, "api_key")


async def _get_order_secret(service: Frontpad_settingsService) -> str:
    """Get the secret key for order creation.
    
    Priority: order_secret > api_key (legacy fallback)
    """
    order_secret = await _get_setting(service, "order_secret")
    if order_secret:
        return order_secret
    # Fallback to legacy api_key
    return await _get_setting(service, "api_key")


async def _call_frontpad(secret: str, method: str, extra_params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Call the FrontPad API.
    
    FrontPad API format:
      POST https://app.frontpad.ru/api/index.php?{method}
      Body (form-encoded): secret=<secret>&other_params...
    """
    url = f"{FRONTPAD_API_BASE}?{method}"
    data = {"secret": secret}
    if extra_params:
        data.update(extra_params)

    logger.info(f"[FrontPad API] Calling method={method}, url={url}")

    async with httpx.AsyncClient(timeout=60.0) as http_client:
        response = await http_client.post(url, data=data)
        logger.info(f"[FrontPad API] Response status={response.status_code}, length={len(response.text)}")
        response.raise_for_status()
        
        # Try to parse JSON
        try:
            result = response.json()
        except Exception:
            logger.error(f"[FrontPad API] Failed to parse JSON response: {response.text[:500]}")
            raise ValueError(f"Невалидный JSON ответ от FrontPad: {response.text[:200]}")
        
        # Log response structure for debugging
        if isinstance(result, dict):
            keys = list(result.keys())
            logger.info(f"[FrontPad API] Response keys: {keys}")
            if "error" in result:
                logger.error(f"[FrontPad API] Error in response: {result.get('error')}")
        
        return result


def _check_api_error(result: Any) -> Optional[str]:
    """Check if FrontPad response contains an error. Returns error message or None."""
    if isinstance(result, dict) and result.get("error"):
        error_code = result.get("error", "")
        error_messages = {
            "invalid_secret": "Неверный API ключ (secret)",
            "api_off": "API выключено в настройках FrontPad",
            "invalid_plant": "API недоступно на текущем тарифе",
            "requests_limit": "Превышен лимит запросов (30/мин)",
            "cash_close": "Смена закрыта в FrontPad",
        }
        return error_messages.get(error_code, f"Ошибка API: {error_code}")
    return None


def _parse_products_from_response(result: Any) -> List[Dict[str, Any]]:
    """Extract products list from various FrontPad response formats.
    
    FrontPad may return products as:
    - dict with "products" key containing a list
    - dict with "products" key containing a dict (keyed by product_id)
    - dict with numeric keys (each value is a product)
    - list of products directly
    """
    products = []
    
    if isinstance(result, dict):
        # Check for "products" key first
        if "products" in result:
            raw = result["products"]
            if isinstance(raw, list):
                products = raw
            elif isinstance(raw, dict):
                products = list(raw.values())
            else:
                logger.warning(f"[FrontPad] Unexpected 'products' type: {type(raw)}")
        else:
            # Maybe the dict itself contains products keyed by ID
            potential_products = []
            for key, val in result.items():
                if key in ("result", "error", "message", "count", "modifiers"):
                    continue
                if isinstance(val, dict) and ("product_name" in val or "product_id" in val or "name" in val):
                    potential_products.append(val)
            if potential_products:
                products = potential_products
    elif isinstance(result, list):
        products = result
    
    logger.info(f"[FrontPad] Parsed {len(products)} products from response")
    return products


def _parse_modifiers_from_response(result: Any) -> List[Dict[str, Any]]:
    """Extract top-level modifiers list from FrontPad response."""
    modifiers = []
    
    if isinstance(result, dict) and "modifiers" in result:
        raw = result["modifiers"]
        if isinstance(raw, list):
            modifiers = raw
        elif isinstance(raw, dict):
            modifiers = list(raw.values())
    
    logger.info(f"[FrontPad] Parsed {len(modifiers)} top-level modifiers from response")
    return modifiers


def _extract_categories_from_products(products: List[Dict[str, Any]]) -> Dict[str, str]:
    """Extract unique categories from products.
    
    Returns dict: {category_name_lower: original_category_name}
    """
    categories: Dict[str, str] = {}
    
    for product in products:
        cat_name = (
            product.get("product_cat_name")
            or product.get("category_name")
            or product.get("category")
            or ""
        ).strip()
        
        if not cat_name:
            cat_name = FALLBACK_CATEGORY
        
        key = cat_name.lower()
        if key not in categories:
            categories[key] = cat_name
    
    logger.info(f"[FrontPad] Extracted {len(categories)} unique categories from products")
    for key, name in categories.items():
        logger.debug(f"  Category: '{name}'")
    
    return categories


def _safe_int_price(raw_value: Any) -> int:
    """Safely convert a price value to integer (kopecks or rubles)."""
    if raw_value is None:
        return 0
    try:
        return int(round(float(str(raw_value).replace(",", ".").strip())))
    except (ValueError, TypeError):
        return 0


# ---------- Routes ----------

@router.get("/settings", response_model=FrontpadSettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    """Get current FrontPad integration settings."""
    service = Frontpad_settingsService(db)
    menu_secret = await _get_setting(service, "menu_secret")
    order_secret = await _get_setting(service, "order_secret")
    legacy_key = await _get_setting(service, "api_key")
    
    return FrontpadSettingsResponse(
        menu_secret=menu_secret,
        order_secret=order_secret,
        affiliate_id=await _get_setting(service, "affiliate_id"),
        delivery_product_id=await _get_setting(service, "delivery_product_id"),
        sync_interval=await _get_setting(service, "sync_interval") or "manual",
        last_sync_status=await _get_setting(service, "last_sync_status"),
        last_sync_at=await _get_setting(service, "last_sync_at"),
        last_sync_error=await _get_setting(service, "last_sync_error"),
        api_key=legacy_key,
    )


@router.put("/settings", response_model=FrontpadSettingsResponse)
async def update_settings(payload: FrontpadSettingsUpdate, db: AsyncSession = Depends(get_db)):
    """Update FrontPad integration settings."""
    service = Frontpad_settingsService(db)
    
    if payload.menu_secret is not None:
        await _set_setting(service, "menu_secret", payload.menu_secret)
    if payload.order_secret is not None:
        await _set_setting(service, "order_secret", payload.order_secret)
    if payload.affiliate_id is not None:
        await _set_setting(service, "affiliate_id", payload.affiliate_id)
    if payload.delivery_product_id is not None:
        await _set_setting(service, "delivery_product_id", payload.delivery_product_id)
    if payload.sync_interval is not None:
        await _set_setting(service, "sync_interval", payload.sync_interval)
    # Legacy support
    if payload.api_key is not None:
        await _set_setting(service, "api_key", payload.api_key)

    menu_secret = await _get_setting(service, "menu_secret")
    order_secret = await _get_setting(service, "order_secret")
    legacy_key = await _get_setting(service, "api_key")
    
    return FrontpadSettingsResponse(
        menu_secret=menu_secret,
        order_secret=order_secret,
        affiliate_id=await _get_setting(service, "affiliate_id"),
        delivery_product_id=await _get_setting(service, "delivery_product_id"),
        sync_interval=await _get_setting(service, "sync_interval") or "manual",
        last_sync_status=await _get_setting(service, "last_sync_status"),
        last_sync_at=await _get_setting(service, "last_sync_at"),
        last_sync_error=await _get_setting(service, "last_sync_error"),
        api_key=legacy_key,
    )


@router.post("/test-connection")
async def test_connection(db: AsyncSession = Depends(get_db)):
    """Test the FrontPad API connection using the MENU secret key.
    
    This tests the get_products endpoint specifically, which is used for menu retrieval.
    """
    service = Frontpad_settingsService(db)
    menu_secret = await _get_menu_secret(service)
    if not menu_secret:
        raise HTTPException(
            status_code=400,
            detail="Ключ для меню не настроен. Укажите 'Секрет для меню (get_products)' в настройках."
        )

    try:
        result = await _call_frontpad(menu_secret, "get_products")
        
        # Check for API errors
        error_msg = _check_api_error(result)
        if error_msg:
            return {"success": False, "message": error_msg}
        
        # Count products for info
        products = _parse_products_from_response(result)
        categories = _extract_categories_from_products(products)
        
        return {
            "success": True,
            "message": f"Подключение успешно! Найдено товаров: {len(products)}, категорий: {len(categories)}",
        }
    except httpx.HTTPStatusError as e:
        return {"success": False, "message": f"HTTP ошибка: {e.response.status_code}"}
    except httpx.ConnectError:
        return {"success": False, "message": "Не удалось подключиться к серверу FrontPad."}
    except Exception as e:
        logger.error(f"[FrontPad] Test connection error: {e}", exc_info=True)
        return {"success": False, "message": f"Ошибка: {str(e)}"}


@router.post("/debug-api", response_model=DebugApiResponse)
async def debug_api(db: AsyncSession = Depends(get_db)):
    """Debug endpoint: call get_products and return raw response analysis.
    
    Shows exactly what FrontPad returns so the user can diagnose issues.
    """
    service = Frontpad_settingsService(db)
    menu_secret = await _get_menu_secret(service)
    if not menu_secret:
        return DebugApiResponse(
            success=False,
            message="Ключ для меню не настроен. Укажите 'Секрет для меню (get_products)' в настройках.",
        )

    try:
        result = await _call_frontpad(menu_secret, "get_products")
        
        # Check for API errors
        error_msg = _check_api_error(result)
        if error_msg:
            raw_str = json.dumps(result, ensure_ascii=False, default=str)[:3000]
            return DebugApiResponse(
                success=False,
                message=error_msg,
                response_keys=list(result.keys()) if isinstance(result, dict) else [],
                raw_response_truncated=raw_str,
            )
        
        # Analyze response
        response_keys = list(result.keys()) if isinstance(result, dict) else []
        products = _parse_products_from_response(result)
        categories = _extract_categories_from_products(products) if products else {}
        top_modifiers = _parse_modifiers_from_response(result)
        
        # Get sample product (first one)
        sample = None
        if products:
            sample = products[0]
            # Truncate long fields in sample
            if isinstance(sample, dict):
                sample = {k: (str(v)[:200] if isinstance(v, str) and len(str(v)) > 200 else v) for k, v in sample.items()}
        
        # Truncate raw response for display
        raw_str = json.dumps(result, ensure_ascii=False, default=str)[:3000]
        
        return DebugApiResponse(
            success=True,
            message=f"API ответил успешно. Товаров: {len(products)}, категорий: {len(categories)}, модификаторов: {len(top_modifiers)}",
            http_status=200,
            response_keys=response_keys,
            products_count=len(products),
            categories_found=list(categories.values()),
            modifiers_count=len(top_modifiers),
            sample_product=sample,
            raw_response_truncated=raw_str,
        )
    except httpx.HTTPStatusError as e:
        return DebugApiResponse(
            success=False,
            message=f"HTTP ошибка: {e.response.status_code}",
            http_status=e.response.status_code,
            raw_response_truncated=e.response.text[:3000] if e.response else "",
        )
    except httpx.ConnectError:
        return DebugApiResponse(
            success=False,
            message="Не удалось подключиться к серверу FrontPad.",
        )
    except Exception as e:
        logger.error(f"[FrontPad] Debug API error: {e}", exc_info=True)
        return DebugApiResponse(
            success=False,
            message=f"Ошибка: {str(e)}",
        )


@router.post("/sync", response_model=SyncResult)
async def sync_menu(db: AsyncSession = Depends(get_db)):
    """Trigger a full menu sync from FrontPad/Compad.

    Uses the MENU secret key (menu_secret) — separate from order secret.

    Sync flow:
    1. Fetch all products via get_products API (using menu_secret)
    2. Extract unique categories from products
    3. Create/update categories in DB (with frontpad_id tracking)
    4. Create/update products with correct category_id mapping
    5. Extract and sync modifiers (both top-level and per-product)
    6. Link modifiers to products via food_item_modifiers
    7. Deactivate products not present in FrontPad response
    8. Log everything with detailed counts
    """
    settings_service = Frontpad_settingsService(db)
    log_service = Frontpad_sync_logService(db)
    food_items_service = Food_itemsService(db)
    food_categories_service = Food_categoriesService(db)
    food_modifiers_service = Food_modifiersService(db)
    food_item_modifiers_service = Food_item_modifiersService(db)

    # Use MENU secret for get_products
    menu_secret = await _get_menu_secret(settings_service)
    if not menu_secret:
        raise HTTPException(
            status_code=400,
            detail="Ключ для меню не настроен. Укажите 'Секрет для меню (get_products)' в настройках."
        )

    # Create sync log entry
    started_at = datetime.now().isoformat()
    log_entry = await log_service.create({
        "sync_type": "manual",
        "status": "in_progress",
        "products_synced": 0,
        "categories_synced": 0,
        "started_at": started_at,
    })
    log_id = log_entry.id if log_entry else None

    sync_errors: List[str] = []

    try:
        # Update last sync status
        await _set_setting(settings_service, "last_sync_status", "in_progress")
        await _set_setting(settings_service, "last_sync_at", started_at)
        await _set_setting(settings_service, "last_sync_error", "")

        # ===== STEP 1: Fetch products from FrontPad =====
        logger.info("=" * 60)
        logger.info("[FrontPad Sync] Starting full menu synchronization")
        logger.info("[FrontPad Sync] Using MENU secret key for get_products")
        logger.info("=" * 60)

        result = await _call_frontpad(menu_secret, "get_products")

        # Check for API errors
        error_msg = _check_api_error(result)
        if error_msg:
            await _set_setting(settings_service, "last_sync_status", "failed")
            await _set_setting(settings_service, "last_sync_error", error_msg)
            if log_id:
                await log_service.update(log_id, {
                    "status": "failed",
                    "errors": error_msg,
                    "completed_at": datetime.now().isoformat(),
                })
            return SyncResult(success=False, message=error_msg, errors=[error_msg])

        # ===== STEP 2: Parse products =====
        products = _parse_products_from_response(result)
        logger.info(f"[FrontPad Sync] Получено товаров из API: {len(products)}")

        if not products:
            # Detailed debug info when no products found
            if isinstance(result, dict):
                logger.warning(f"[FrontPad Sync] Raw response keys: {list(result.keys())}")
                raw_str = json.dumps(result, ensure_ascii=False, default=str)[:2000]
                logger.warning(f"[FrontPad Sync] Raw response (truncated): {raw_str}")
            
            msg = (
                "API вернул пустой список товаров. "
                "Возможные причины: 1) Неверный ключ для меню, "
                "2) Товарам не присвоены артикулы в FrontPad, "
                "3) API включено, но товары не настроены для интернет-магазина. "
                "Используйте кнопку 'Отладка API' для просмотра сырого ответа."
            )
            logger.warning(f"[FrontPad Sync] {msg}")
            
            await _set_setting(settings_service, "last_sync_status", "warning")
            await _set_setting(settings_service, "last_sync_error", msg)
            if log_id:
                await log_service.update(log_id, {
                    "status": "warning",
                    "errors": msg,
                    "completed_at": datetime.now().isoformat(),
                })
            return SyncResult(success=False, message=msg, errors=[msg])

        # ===== STEP 3: Extract and sync categories =====
        fp_categories = _extract_categories_from_products(products)
        logger.info(f"[FrontPad Sync] Уникальных категорий из товаров: {len(fp_categories)}")

        # Load existing categories
        existing_cats_result = await food_categories_service.get_list(skip=0, limit=1000)
        existing_cats = existing_cats_result.get("items", [])
        
        # Build lookup maps
        cat_by_name: Dict[str, Any] = {}
        cat_by_fpid: Dict[str, Any] = {}
        for cat in existing_cats:
            cat_by_name[cat.name.lower()] = cat
            fp_id = getattr(cat, "frontpad_id", None)
            if fp_id:
                cat_by_fpid[fp_id] = cat

        # Map: category_name_lower -> category_id
        category_id_map: Dict[str, int] = {}
        categories_synced = 0

        # Ensure fallback category exists
        if FALLBACK_CATEGORY.lower() not in cat_by_name:
            fallback_cat = await food_categories_service.create({
                "name": FALLBACK_CATEGORY,
                "icon": "📦",
                "is_active": True,
                "sort_order": 999,
                "created_at": datetime.now().isoformat(),
            })
            if fallback_cat:
                cat_by_name[FALLBACK_CATEGORY.lower()] = fallback_cat
                category_id_map[FALLBACK_CATEGORY.lower()] = fallback_cat.id
                logger.info(f"[FrontPad Sync] Создана fallback категория '{FALLBACK_CATEGORY}' id={fallback_cat.id}")

        fallback_cat_obj = cat_by_name.get(FALLBACK_CATEGORY.lower())
        fallback_cat_id = fallback_cat_obj.id if fallback_cat_obj else 1

        for cat_key, cat_name in fp_categories.items():
            if cat_key in cat_by_name:
                existing_cat = cat_by_name[cat_key]
                category_id_map[cat_key] = existing_cat.id
                logger.debug(f"[FrontPad Sync] Категория '{cat_name}' уже существует (id={existing_cat.id})")
            else:
                try:
                    new_cat = await food_categories_service.create({
                        "name": cat_name,
                        "is_active": True,
                        "sort_order": len(cat_by_name) + 1,
                        "created_at": datetime.now().isoformat(),
                    })
                    if new_cat:
                        cat_by_name[cat_key] = new_cat
                        category_id_map[cat_key] = new_cat.id
                        categories_synced += 1
                        logger.info(f"[FrontPad Sync] Создана категория '{cat_name}' id={new_cat.id}")
                except Exception as e:
                    err = f"Ошибка создания категории '{cat_name}': {e}"
                    logger.error(f"[FrontPad Sync] {err}")
                    sync_errors.append(err)
                    category_id_map[cat_key] = fallback_cat_id

        # Fill in any existing categories not yet in the map
        for cat in existing_cats:
            key = cat.name.lower()
            if key not in category_id_map:
                category_id_map[key] = cat.id

        logger.info(f"[FrontPad Sync] Категорий синхронизировано (новых): {categories_synced}")
        logger.info(f"[FrontPad Sync] Всего категорий в маппинге: {len(category_id_map)}")

        # ===== STEP 4: Sync products =====
        products_synced = 0
        products_active = 0
        synced_frontpad_ids: set = set()

        # Collect all per-product modifiers for step 5
        product_modifiers_map: Dict[str, List[Dict[str, Any]]] = {}

        for idx, product in enumerate(products):
            fp_id = ""
            try:
                fp_id = str(
                    product.get("product_id")
                    or product.get("id")
                    or ""
                ).strip()
                
                if not fp_id:
                    logger.warning(f"[FrontPad Sync] Товар #{idx} без product_id, пропускаем: {product}")
                    continue

                synced_frontpad_ids.add(fp_id)

                name = (
                    product.get("product_name")
                    or product.get("name")
                    or ""
                ).strip()
                
                if not name:
                    logger.warning(f"[FrontPad Sync] Товар fp_id={fp_id} без имени, пропускаем")
                    continue

                description = (
                    product.get("product_descr")
                    or product.get("description")
                    or product.get("descr")
                    or ""
                ).strip()

                price = _safe_int_price(
                    product.get("product_price")
                    or product.get("price")
                    or 0
                )

                # Category mapping
                cat_name = (
                    product.get("product_cat_name")
                    or product.get("category_name")
                    or product.get("category")
                    or ""
                ).strip()
                
                if not cat_name:
                    cat_name = FALLBACK_CATEGORY

                category_id = category_id_map.get(cat_name.lower(), fallback_cat_id)

                # Active status
                active_raw = product.get("product_active", product.get("active", "1"))
                is_active = str(active_raw).strip() in ("1", "true", "True", "yes")

                if is_active:
                    products_active += 1

                # Weight
                weight = str(
                    product.get("product_weight")
                    or product.get("weight")
                    or ""
                ).strip()

                # Image
                image_url_fp = (
                    product.get("product_image")
                    or product.get("image")
                    or product.get("image_url")
                    or ""
                ).strip()

                # Collect per-product modifiers
                prod_mods = product.get("modifiers", [])
                if isinstance(prod_mods, dict):
                    prod_mods = list(prod_mods.values())
                if prod_mods:
                    product_modifiers_map[fp_id] = prod_mods

                # Check if product already exists by frontpad_id
                existing_item = await food_items_service.get_by_field("frontpad_id", fp_id)

                if existing_item:
                    update_data: Dict[str, Any] = {
                        "name": name,
                        "description": description,
                        "price": price,
                        "category_id": category_id,
                        "is_active": is_active,
                        "weight": weight,
                    }
                    photo_locked = getattr(existing_item, "photo_locked", False) or False
                    if not photo_locked and image_url_fp:
                        update_data["image_url"] = image_url_fp

                    await food_items_service.update(existing_item.id, update_data)
                    logger.debug(f"[FrontPad Sync] Обновлён товар '{name}' (id={existing_item.id}, fp_id={fp_id}, cat='{cat_name}')")
                else:
                    await food_items_service.create({
                        "name": name,
                        "description": description,
                        "price": price,
                        "category_id": category_id,
                        "is_active": is_active,
                        "weight": weight,
                        "image_url": image_url_fp,
                        "frontpad_id": fp_id,
                        "photo_locked": False,
                        "sort_order": products_synced + 1,
                        "created_at": datetime.now().isoformat(),
                    })
                    logger.debug(f"[FrontPad Sync] Создан товар '{name}' (fp_id={fp_id}, cat='{cat_name}', price={price})")

                products_synced += 1

            except Exception as e:
                err = f"Ошибка синхронизации товара #{idx} (fp_id={fp_id}): {e}"
                logger.error(f"[FrontPad Sync] {err}", exc_info=True)
                sync_errors.append(err)

        logger.info(f"[FrontPad Sync] Товаров синхронизировано: {products_synced}")
        logger.info(f"[FrontPad Sync] Товаров активных: {products_active}")

        # ===== STEP 5: Sync modifiers =====
        modifiers_synced = 0
        
        all_modifiers: Dict[str, Dict[str, Any]] = {}
        
        top_level_mods = _parse_modifiers_from_response(result)
        for mod in top_level_mods:
            mod_id = str(mod.get("modifier_id") or mod.get("id") or "").strip()
            if mod_id:
                all_modifiers[mod_id] = mod
        
        for fp_product_id, mods in product_modifiers_map.items():
            for mod in mods:
                mod_id = str(mod.get("modifier_id") or mod.get("id") or "").strip()
                if mod_id:
                    all_modifiers[mod_id] = mod

        logger.info(f"[FrontPad Sync] Всего уникальных модификаторов: {len(all_modifiers)}")

        modifier_id_map: Dict[str, int] = {}

        for mod_fp_id, mod_data in all_modifiers.items():
            try:
                mod_name = (
                    mod_data.get("modifier_name")
                    or mod_data.get("name")
                    or ""
                ).strip()
                
                if not mod_name:
                    continue

                mod_price = _safe_int_price(
                    mod_data.get("modifier_price")
                    or mod_data.get("price")
                    or 0
                )

                existing_mod = None
                try:
                    existing_mod = await food_modifiers_service.get_by_field("frontpad_id", mod_fp_id)
                except Exception:
                    pass
                
                if not existing_mod:
                    existing_mod = await food_modifiers_service.get_by_field("name", mod_name)

                if existing_mod:
                    update_fields: Dict[str, Any] = {
                        "price": mod_price,
                        "is_active": True,
                    }
                    if not getattr(existing_mod, "frontpad_id", None):
                        update_fields["frontpad_id"] = mod_fp_id
                    await food_modifiers_service.update(existing_mod.id, update_fields)
                    modifier_id_map[mod_fp_id] = existing_mod.id
                    logger.debug(f"[FrontPad Sync] Обновлён модификатор '{mod_name}' (id={existing_mod.id})")
                else:
                    new_mod = await food_modifiers_service.create({
                        "name": mod_name,
                        "price": mod_price,
                        "is_active": True,
                        "frontpad_id": mod_fp_id,
                        "created_at": datetime.now().isoformat(),
                    })
                    if new_mod:
                        modifier_id_map[mod_fp_id] = new_mod.id
                        logger.debug(f"[FrontPad Sync] Создан модификатор '{mod_name}' (id={new_mod.id})")

                modifiers_synced += 1

            except Exception as e:
                err = f"Ошибка синхронизации модификатора fp_id={mod_fp_id}: {e}"
                logger.error(f"[FrontPad Sync] {err}", exc_info=True)
                sync_errors.append(err)

        logger.info(f"[FrontPad Sync] Модификаторов синхронизировано: {modifiers_synced}")

        # ===== STEP 6: Link modifiers to products =====
        links_created = 0
        for fp_product_id, mods in product_modifiers_map.items():
            try:
                db_product = await food_items_service.get_by_field("frontpad_id", fp_product_id)
                if not db_product:
                    continue

                existing_links = await food_item_modifiers_service.list_by_field(
                    "food_item_id", db_product.id, skip=0, limit=1000
                )
                existing_mod_ids = {link.modifier_id for link in existing_links}

                for mod in mods:
                    mod_fp_id = str(mod.get("modifier_id") or mod.get("id") or "").strip()
                    db_mod_id = modifier_id_map.get(mod_fp_id)
                    
                    if db_mod_id and db_mod_id not in existing_mod_ids:
                        await food_item_modifiers_service.create({
                            "food_item_id": db_product.id,
                            "modifier_id": db_mod_id,
                        })
                        links_created += 1

            except Exception as e:
                err = f"Ошибка привязки модификаторов к товару fp_id={fp_product_id}: {e}"
                logger.error(f"[FrontPad Sync] {err}")
                sync_errors.append(err)

        logger.info(f"[FrontPad Sync] Связей товар-модификатор создано: {links_created}")

        # ===== STEP 7: Deactivate products not in FrontPad =====
        if synced_frontpad_ids:
            all_items_result = await food_items_service.get_list(skip=0, limit=10000)
            all_items = all_items_result.get("items", [])
            deactivated = 0
            for item in all_items:
                item_fp_id = getattr(item, "frontpad_id", None)
                if item_fp_id and item_fp_id not in synced_frontpad_ids and item.is_active:
                    await food_items_service.update(item.id, {"is_active": False})
                    deactivated += 1
                    logger.debug(f"[FrontPad Sync] Деактивирован товар '{item.name}' (fp_id={item_fp_id})")
            
            if deactivated:
                logger.info(f"[FrontPad Sync] Деактивировано товаров (нет в FrontPad): {deactivated}")

        # ===== STEP 8: Final summary =====
        active_items_result = await food_items_service.get_list(
            skip=0, limit=10000, query_dict={"is_active": True}
        )
        products_displayed = active_items_result.get("total", 0)

        logger.info("=" * 60)
        logger.info("[FrontPad Sync] ИТОГИ СИНХРОНИЗАЦИИ:")
        logger.info(f"  Категорий получено: {len(fp_categories)}")
        logger.info(f"  Категорий создано новых: {categories_synced}")
        logger.info(f"  Товаров получено из API: {len(products)}")
        logger.info(f"  Товаров синхронизировано: {products_synced}")
        logger.info(f"  Товаров отображается (активных): {products_displayed}")
        logger.info(f"  Модификаторов получено: {len(all_modifiers)}")
        logger.info(f"  Модификаторов синхронизировано: {modifiers_synced}")
        logger.info(f"  Связей товар-модификатор: {links_created}")
        logger.info(f"  Ошибок: {len(sync_errors)}")
        logger.info("=" * 60)

        # Update sync status
        completed_at = datetime.now().isoformat()
        status = "success" if not sync_errors else "partial"
        await _set_setting(settings_service, "last_sync_status", status)
        await _set_setting(settings_service, "last_sync_at", completed_at)
        
        error_summary = "; ".join(sync_errors[:5]) if sync_errors else ""
        await _set_setting(settings_service, "last_sync_error", error_summary)

        if log_id:
            await log_service.update(log_id, {
                "status": status,
                "products_synced": products_synced,
                "categories_synced": categories_synced,
                "errors": error_summary or None,
                "completed_at": completed_at,
            })

        message = (
            f"Синхронизация завершена. "
            f"Категорий: {len(fp_categories)} (новых: {categories_synced}), "
            f"Товаров: {products_synced} (активных: {products_displayed}), "
            f"Модификаторов: {modifiers_synced}"
        )
        if sync_errors:
            message += f". Ошибок: {len(sync_errors)}"

        return SyncResult(
            success=True,
            message=message,
            categories_received=len(fp_categories),
            categories_synced=categories_synced,
            products_received=len(products),
            products_synced=products_synced,
            products_displayed=products_displayed,
            modifiers_received=len(all_modifiers),
            modifiers_synced=modifiers_synced,
            errors=sync_errors[:10],
        )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[FrontPad Sync] CRITICAL ERROR: {error_msg}", exc_info=True)
        await _set_setting(settings_service, "last_sync_status", "failed")
        await _set_setting(settings_service, "last_sync_error", error_msg)

        if log_id:
            await log_service.update(log_id, {
                "status": "failed",
                "errors": error_msg,
                "completed_at": datetime.now().isoformat(),
            })

        return SyncResult(
            success=False,
            message=f"Ошибка синхронизации: {error_msg}",
            errors=[error_msg],
        )


@router.post("/send-order")
async def send_order(payload: SendOrderRequest, db: AsyncSession = Depends(get_db)):
    """Transmit an order to FrontPad using the new_order method.

    Uses the ORDER secret key (order_secret) — separate from menu secret.
    Also uses affiliate_id and delivery_product_id if configured.
    """
    settings_service = Frontpad_settingsService(db)
    food_items_service = Food_itemsService(db)

    # Use ORDER secret for new_order
    order_secret = await _get_order_secret(settings_service)
    if not order_secret:
        raise HTTPException(
            status_code=400,
            detail="Ключ для заказов не настроен. Укажите 'Секрет для заказов (new_order)' в настройках."
        )

    # Build order params for FrontPad
    order_params: Dict[str, Any] = {
        "name": payload.customer_name,
        "phone": payload.customer_phone,
    }
    if payload.delivery_address:
        order_params["street"] = payload.delivery_address
    if payload.comment:
        order_params["descr"] = payload.comment

    # Map product IDs to FrontPad IDs
    for idx, item in enumerate(payload.order_items):
        food_item = await food_items_service.get_by_id(item.product_id)
        if food_item and food_item.frontpad_id:
            order_params[f"product[{idx}]"] = food_item.frontpad_id
            order_params[f"product_kol[{idx}]"] = str(item.quantity)
        else:
            order_params[f"product[{idx}]"] = str(item.product_id)
            order_params[f"product_kol[{idx}]"] = str(item.quantity)

    # Add affiliate ID if configured
    affiliate_id = await _get_setting(settings_service, "affiliate_id")
    if affiliate_id:
        order_params["affiliate"] = affiliate_id

    # Add delivery product if configured
    delivery_product_id = await _get_setting(settings_service, "delivery_product_id")
    if delivery_product_id:
        # Add delivery as an extra product line
        next_idx = len(payload.order_items)
        order_params[f"product[{next_idx}]"] = delivery_product_id
        order_params[f"product_kol[{next_idx}]"] = "1"

    try:
        result = await _call_frontpad(order_secret, "new_order", order_params)

        if isinstance(result, dict) and result.get("error"):
            error_code = result.get("error", "")
            return {"success": False, "message": f"Ошибка FrontPad: {error_code}"}

        order_number = ""
        if isinstance(result, dict):
            order_number = result.get("order_number", "") or result.get("order_id", "")

        return {
            "success": True,
            "message": "Заказ успешно отправлен в FrontPad.",
            "frontpad_order_number": str(order_number),
        }
    except Exception as e:
        logger.error(f"[FrontPad] Order error: {str(e)}", exc_info=True)
        return {"success": False, "message": f"Ошибка отправки заказа: {str(e)}"}


@router.get("/sync-log", response_model=List[SyncLogResponse])
async def get_sync_log(db: AsyncSession = Depends(get_db)):
    """Get the sync history log."""
    service = Frontpad_sync_logService(db)
    result = await service.get_list(skip=0, limit=50, sort="-id")
    items = result.get("items", [])
    return [
        SyncLogResponse(
            id=item.id,
            sync_type=item.sync_type,
            status=item.status,
            products_synced=item.products_synced,
            categories_synced=item.categories_synced,
            errors=item.errors,
            started_at=item.started_at,
            completed_at=item.completed_at,
        )
        for item in items
    ]