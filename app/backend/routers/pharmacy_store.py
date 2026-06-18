"""АПТЕКА — каталог лекарств, заказы и настройки.

Переиспользует общий движок зон доставки (services.gastronom_delivery) и
лояльности (services.gastronom_loyalty), но хранит свой каталог и заказы.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from core.auth import AccessTokenError, decode_access_token
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.pharmacy_categories import Pharmacy_categoriesService
from services.pharmacy_orders import Pharmacy_ordersService
from services.pharmacy_products import Pharmacy_productsService
from services.pharmacy_settings import Pharmacy_settingsService
from services.pharmacy_seed import (
    ensure_pharmacy_location_settings,
    ensure_pharmacy_loyalty_settings,
    seed_pharmacy_if_empty,
)
from services.gastronom_delivery import (
    geocode_address,
    resolve_delivery_quote,
    validate_order_delivery,
    reverse_geocode,
    enrich_quote_with_location,
)
from services.gastronom_loyalty import (
    gift_comment_line,
    gift_order_line,
    resolve_loyalty_gift,
)
from services.telegram import notify_pharmacy_order, notify_pharmacy_status_change

logger = logging.getLogger(__name__)

from services.module_settings import require_module

router = APIRouter(
    prefix="/api/v1/pharmacy",
    tags=["pharmacy"],
    dependencies=[Depends(require_module("pharmacy"))],
)

VALID_PAYMENT_METHODS = {"cash", "kaspi_qr", "halyk_qr"}
VALID_ORDER_STATUSES = {"new", "processing", "delivered", "cancelled"}


def _normalize_phone_digits(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())


def _require_admin(request: Request) -> None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Admin authentication required")
    token = auth[7:].strip()
    try:
        payload = decode_access_token(token)
    except AccessTokenError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e
    if payload.get("role") != "admin" or not payload.get("username"):
        raise HTTPException(status_code=403, detail="Admin access required")


# ─── Schemas ───────────────────────────────────────────────────────

class CategoryData(BaseModel):
    name: str
    image_url: Optional[str] = ""
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True
    is_rx: Optional[bool] = False


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_rx: Optional[bool] = None


class ProductData(BaseModel):
    category_id: Optional[int] = None
    name: str
    description: Optional[str] = ""
    price: float
    old_price: Optional[float] = None
    weight: Optional[str] = ""
    image_url: Optional[str] = ""
    is_popular: Optional[bool] = False
    is_active: Optional[bool] = True
    in_stock: Optional[bool] = True
    requires_prescription: Optional[bool] = False
    manufacturer: Optional[str] = ""
    country: Optional[str] = ""
    active_ingredient: Optional[str] = ""
    dosage_form: Optional[str] = ""
    sort_order: Optional[int] = 0


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    old_price: Optional[float] = None
    weight: Optional[str] = None
    image_url: Optional[str] = None
    is_popular: Optional[bool] = None
    is_active: Optional[bool] = None
    in_stock: Optional[bool] = None
    requires_prescription: Optional[bool] = None
    manufacturer: Optional[str] = None
    country: Optional[str] = None
    active_ingredient: Optional[str] = None
    dosage_form: Optional[str] = None
    sort_order: Optional[int] = None


class OrderData(BaseModel):
    customer_name: str
    customer_phone: str
    customer_address: str
    payment_method: str = "cash"
    comment: Optional[str] = ""
    order_items: str
    total_amount: float
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None
    delivery_zone_id: Optional[str] = None
    delivery_fee: Optional[float] = None


class DeliveryQuoteRequest(BaseModel):
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class SettingsUpdate(BaseModel):
    settings: Dict[str, str]


def _validate_order_payload(
    data: "OrderData",
    products_by_id: Dict[int, Any],
    min_order: float,
    delivery_fee: float,
) -> tuple[list, float, bool]:
    if not data.customer_name.strip():
        raise HTTPException(status_code=400, detail="Укажите имя")
    if not data.customer_address.strip():
        raise HTTPException(status_code=400, detail="Укажите адрес доставки")
    if len(_normalize_phone_digits(data.customer_phone)) < 10:
        raise HTTPException(status_code=400, detail="Некорректный номер телефона")
    if data.payment_method not in VALID_PAYMENT_METHODS:
        raise HTTPException(status_code=400, detail="Недопустимый способ оплаты")

    try:
        raw_items = json.loads(data.order_items) if data.order_items else []
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Некорректный состав заказа")
    if not isinstance(raw_items, list) or len(raw_items) == 0:
        raise HTTPException(status_code=400, detail="Корзина пуста")

    validated_items: list = []
    subtotal = 0.0
    has_rx = False
    for raw in raw_items:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="Некорректный товар в заказе")
        if raw.get("is_gift"):
            continue
        prod_id = raw.get("id")
        qty = raw.get("qty")
        if prod_id is None or not isinstance(qty, (int, float)) or qty <= 0:
            raise HTTPException(status_code=400, detail="Некорректное количество товара")
        product = products_by_id.get(int(prod_id))
        if not product or product.is_active is False:
            raise HTTPException(status_code=400, detail=f"Товар #{prod_id} недоступен")
        if product.in_stock is False:
            raise HTTPException(status_code=400, detail=f"«{product.name}» сейчас нет в наличии")
        price = float(product.price)
        line_sum = round(price * int(qty), 2)
        subtotal += line_sum
        if product.requires_prescription:
            has_rx = True
        validated_items.append({
            "id": product.id,
            "name": product.name,
            "weight": product.weight or "",
            "qty": int(qty),
            "price": price,
            "sum": line_sum,
            "rx": bool(product.requires_prescription),
        })

    subtotal = round(subtotal, 2)
    if min_order > 0 and subtotal < min_order:
        raise HTTPException(status_code=400, detail=f"Минимальный заказ {int(min_order)} ₸")

    expected_total = round(subtotal + delivery_fee, 2)
    if abs(expected_total - round(float(data.total_amount), 2)) > 0.01:
        raise HTTPException(status_code=400, detail="Сумма заказа не совпадает с каталогом")

    return validated_items, expected_total, has_rx


def _serialize(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ─── Public catalog ────────────────────────────────────────────────

@router.get("/catalog")
async def get_catalog(db: AsyncSession = Depends(get_db)):
    await seed_pharmacy_if_empty(db)
    await ensure_pharmacy_location_settings(db)
    await ensure_pharmacy_loyalty_settings(db)

    cat_svc = Pharmacy_categoriesService(db)
    prod_svc = Pharmacy_productsService(db)
    set_svc = Pharmacy_settingsService(db)

    categories = await cat_svc.get_list(limit=100)
    products = await prod_svc.get_list(limit=500)
    settings = await set_svc.get_all_as_dict()

    active_categories = [c for c in categories["items"] if c.is_active is not False]
    active_products = [p for p in products["items"] if p.is_active is not False]

    return {
        "categories": [_serialize(c) for c in active_categories],
        "products": [_serialize(p) for p in active_products],
        "settings": settings,
    }


@router.post("/delivery-quote")
async def delivery_quote(data: DeliveryQuoteRequest, db: AsyncSession = Depends(get_db)):
    await ensure_pharmacy_location_settings(db)
    await ensure_pharmacy_loyalty_settings(db)
    set_svc = Pharmacy_settingsService(db)
    settings = await set_svc.get_all_as_dict()

    lat, lng = data.lat, data.lng
    if lat is not None and lng is not None:
        lat_f, lng_f = float(lat), float(lng)
        quote = resolve_delivery_quote(settings, lat_f, lng_f)
        display, city = await reverse_geocode(lat_f, lng_f)
        if display:
            quote["display_address"] = display
        enrich_quote_with_location(quote, settings, lat_f, lng_f, detected_city=city, via_gps=True)
        return quote

    if data.address and data.address.strip():
        coords = await geocode_address(data.address.strip(), settings=settings)
        if not coords:
            raise HTTPException(
                status_code=404,
                detail="Не нашли этот адрес. Попробуйте GPS или напишите короче: «пер. Урановый 10»",
            )
        lat, lng = coords
        quote = resolve_delivery_quote(settings, lat, lng)
        quote["geocoded_address"] = data.address.strip()
        display, city = await reverse_geocode(lat, lng)
        quote["display_address"] = display or data.address.strip()
        enrich_quote_with_location(quote, settings, lat, lng, detected_city=city, via_gps=False)
        return quote

    raise HTTPException(status_code=400, detail="Укажите адрес или координаты")


# ─── Categories CRUD ───────────────────────────────────────────────

@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    svc = Pharmacy_categoriesService(db)
    result = await svc.get_list(limit=200)
    return {"items": [_serialize(c) for c in result["items"]], "total": result["total"]}


@router.post("/categories", status_code=201)
async def create_category(data: CategoryData, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Pharmacy_categoriesService(db)
    obj = await svc.create({**data.model_dump(), "created_at": datetime.now().isoformat()})
    return _serialize(obj)


@router.put("/categories/{cat_id}")
async def update_category(cat_id: int, data: CategoryUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Pharmacy_categoriesService(db)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    obj = await svc.update(cat_id, updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Category not found")
    return _serialize(obj)


@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    prod_svc = Pharmacy_productsService(db)
    linked = await prod_svc.get_list(limit=1, query_dict={"category_id": cat_id})
    if linked["total"] and linked["total"] > 0:
        raise HTTPException(
            status_code=409,
            detail="Нельзя удалить категорию с товарами. Сначала удалите или перенесите товары.",
        )
    svc = Pharmacy_categoriesService(db)
    if not await svc.delete(cat_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True}


# ─── Products CRUD ─────────────────────────────────────────────────

@router.get("/products")
async def list_products(db: AsyncSession = Depends(get_db)):
    svc = Pharmacy_productsService(db)
    result = await svc.get_list(limit=500)
    return {"items": [_serialize(p) for p in result["items"]], "total": result["total"]}


@router.post("/products", status_code=201)
async def create_product(data: ProductData, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Pharmacy_productsService(db)
    obj = await svc.create({**data.model_dump(), "created_at": datetime.now().isoformat()})
    return _serialize(obj)


@router.put("/products/{prod_id}")
async def update_product(prod_id: int, data: ProductUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Pharmacy_productsService(db)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    obj = await svc.update(prod_id, updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    return _serialize(obj)


@router.delete("/products/{prod_id}")
async def delete_product(prod_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Pharmacy_productsService(db)
    if not await svc.delete(prod_id):
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True}


# ─── Orders ────────────────────────────────────────────────────────

@router.get("/orders")
async def list_orders(request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Pharmacy_ordersService(db)
    result = await svc.get_list(limit=200)
    return {"items": [_serialize(o) for o in result["items"]], "total": result["total"]}


@router.post("/orders", status_code=201)
async def create_order(data: OrderData, db: AsyncSession = Depends(get_db)):
    prod_svc = Pharmacy_productsService(db)
    set_svc = Pharmacy_settingsService(db)
    settings = await set_svc.get_all_as_dict()
    min_order = float(settings.get("min_order") or 0)

    try:
        client_delivery_fee = float(data.delivery_fee if data.delivery_fee is not None else settings.get("delivery_fee") or 0)
        delivery_fee, zone_name, zone_id = validate_order_delivery(
            settings,
            data.delivery_lat,
            data.delivery_lng,
            data.delivery_zone_id,
            client_delivery_fee,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    all_products = await prod_svc.get_list(limit=500)
    products_by_id = {p.id: p for p in all_products["items"]}

    validated_items, expected_total, has_rx = _validate_order_payload(
        data, products_by_id, min_order, delivery_fee
    )

    subtotal = round(expected_total - delivery_fee, 2)
    loyalty_gift = resolve_loyalty_gift(subtotal, settings)
    if loyalty_gift:
        validated_items.append(gift_order_line(loyalty_gift))

    user_comment = (data.comment or "").strip()
    delivery_note = f"Зона доставки: {zone_name} ({int(delivery_fee)} ₸)" if zone_name else ""
    rx_note = "⚠ В заказе есть рецептурные препараты — при получении нужен рецепт." if has_rx else ""
    gift_note = gift_comment_line(loyalty_gift) if loyalty_gift else ""
    notes = [n for n in (delivery_note, rx_note, gift_note) if n]
    prefix = "\n".join(notes)
    if prefix:
        full_comment = f"{prefix}\n{user_comment}".strip() if user_comment else prefix
    else:
        full_comment = user_comment

    svc = Pharmacy_ordersService(db)
    payload = {
        "customer_name": data.customer_name.strip(),
        "customer_phone": data.customer_phone.strip(),
        "customer_address": data.customer_address.strip(),
        "payment_method": data.payment_method,
        "comment": full_comment,
        "order_items": json.dumps(validated_items, ensure_ascii=False),
        "total_amount": expected_total,
        "status": "new",
        "created_at": datetime.now().isoformat(),
    }
    obj = await svc.create(payload)
    if not obj:
        raise HTTPException(status_code=400, detail="Failed to create order")

    await notify_pharmacy_order({
        "order_id": obj.id,
        "customer_name": payload["customer_name"],
        "customer_phone": payload["customer_phone"],
        "customer_address": payload["customer_address"],
        "payment_method": payload["payment_method"],
        "comment": payload["comment"],
        "total_amount": expected_total,
        "items": validated_items,
        "delivery_fee": delivery_fee,
        "delivery_zone": zone_name,
        "loyalty_gift": loyalty_gift,
        "has_rx": has_rx,
    })

    return _serialize(obj)


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: int, status: str, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    if status not in VALID_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Недопустимый статус заказа")
    svc = Pharmacy_ordersService(db)
    existing = await svc.get_by_id(order_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    old_status = existing.status
    obj = await svc.update(order_id, {"status": status})
    if not obj:
        raise HTTPException(status_code=404, detail="Order not found")
    if old_status != status:
        await notify_pharmacy_status_change({
            "order_id": obj.id,
            "customer_name": obj.customer_name,
            "customer_phone": obj.customer_phone,
            "old_status": old_status,
            "new_status": status,
            "total_amount": obj.total_amount,
        })
    return _serialize(obj)


# ─── Settings ──────────────────────────────────────────────────────

@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db)):
    svc = Pharmacy_settingsService(db)
    return await svc.get_all_as_dict()


@router.put("/settings")
async def update_settings(data: SettingsUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Pharmacy_settingsService(db)
    await svc.upsert_many(data.settings)
    return await svc.get_all_as_dict()
