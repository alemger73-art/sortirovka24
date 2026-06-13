"""ГАСТРАНОМ — каталог, заказы и настройки."""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from core.auth import AccessTokenError, decode_access_token
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from services.gastronom_categories import Gastronom_categoriesService
from services.gastronom_orders import Gastronom_ordersService
from services.gastronom_products import Gastronom_productsService
from services.gastronom_seed import ensure_alcohol_category, ensure_gastronom_location_settings, seed_gastronom_if_empty
from services.gastronom_settings import Gastronom_settingsService
from services.gastronom_delivery import (
    geocode_address,
    resolve_delivery_quote,
    validate_order_delivery,
    reverse_geocode,
    enrich_quote_with_location,
)
from services.telegram import notify_gastronom_order, notify_gastronom_status_change

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gastronom", tags=["gastronom"])

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
        decode_access_token(token)
    except AccessTokenError as e:
        raise HTTPException(status_code=401, detail=str(e))


# ─── Schemas ───────────────────────────────────────────────────────

class CategoryData(BaseModel):
    name: str
    image_url: Optional[str] = ""
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True
    is_alcohol: Optional[bool] = False


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_alcohol: Optional[bool] = None


class ProductData(BaseModel):
    category_id: Optional[int] = None
    name: str
    description: Optional[str] = ""
    price: float
    weight: Optional[str] = ""
    image_url: Optional[str] = ""
    is_popular: Optional[bool] = False
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 0


class ProductUpdate(BaseModel):
    category_id: Optional[int] = None
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    weight: Optional[str] = None
    image_url: Optional[str] = None
    is_popular: Optional[bool] = None
    is_active: Optional[bool] = None
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
) -> tuple[list, float]:
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
    for raw in raw_items:
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="Некорректный товар в заказе")
        prod_id = raw.get("id")
        qty = raw.get("qty")
        if prod_id is None or not isinstance(qty, (int, float)) or qty <= 0:
            raise HTTPException(status_code=400, detail="Некорректное количество товара")
        product = products_by_id.get(int(prod_id))
        if not product or product.is_active is False:
            raise HTTPException(status_code=400, detail=f"Товар #{prod_id} недоступен")
        price = float(product.price)
        line_sum = round(price * int(qty), 2)
        subtotal += line_sum
        validated_items.append({
            "id": product.id,
            "name": product.name,
            "weight": product.weight or "",
            "qty": int(qty),
            "price": price,
            "sum": line_sum,
        })

    subtotal = round(subtotal, 2)
    if min_order > 0 and subtotal < min_order:
        raise HTTPException(status_code=400, detail=f"Минимальный заказ {int(min_order)} ₸")

    expected_total = round(subtotal + delivery_fee, 2)
    if abs(expected_total - round(float(data.total_amount), 2)) > 0.01:
        raise HTTPException(status_code=400, detail="Сумма заказа не совпадает с каталогом")

    return validated_items, expected_total


def _serialize(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ─── Public catalog ────────────────────────────────────────────────

@router.get("/catalog")
async def get_catalog(db: AsyncSession = Depends(get_db)):
    await seed_gastronom_if_empty(db)
    await ensure_alcohol_category(db)
    await ensure_gastronom_location_settings(db)

    cat_svc = Gastronom_categoriesService(db)
    prod_svc = Gastronom_productsService(db)
    set_svc = Gastronom_settingsService(db)

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
    await ensure_gastronom_location_settings(db)
    set_svc = Gastronom_settingsService(db)
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
    svc = Gastronom_categoriesService(db)
    result = await svc.get_list(limit=200)
    return {"items": [_serialize(c) for c in result["items"]], "total": result["total"]}


@router.post("/categories", status_code=201)
async def create_category(data: CategoryData, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_categoriesService(db)
    obj = await svc.create({**data.model_dump(), "created_at": datetime.now().isoformat()})
    return _serialize(obj)


@router.put("/categories/{cat_id}")
async def update_category(cat_id: int, data: CategoryUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_categoriesService(db)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    obj = await svc.update(cat_id, updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Category not found")
    return _serialize(obj)


@router.delete("/categories/{cat_id}")
async def delete_category(cat_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    prod_svc = Gastronom_productsService(db)
    linked = await prod_svc.get_list(limit=1, query_dict={"category_id": cat_id})
    if linked["total"] and linked["total"] > 0:
        raise HTTPException(
            status_code=409,
            detail="Нельзя удалить категорию с товарами. Сначала удалите или перенесите товары.",
        )
    svc = Gastronom_categoriesService(db)
    if not await svc.delete(cat_id):
        raise HTTPException(status_code=404, detail="Category not found")
    return {"success": True}


# ─── Products CRUD ─────────────────────────────────────────────────

@router.get("/products")
async def list_products(db: AsyncSession = Depends(get_db)):
    svc = Gastronom_productsService(db)
    result = await svc.get_list(limit=500)
    return {"items": [_serialize(p) for p in result["items"]], "total": result["total"]}


@router.post("/products", status_code=201)
async def create_product(data: ProductData, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_productsService(db)
    obj = await svc.create({**data.model_dump(), "created_at": datetime.now().isoformat()})
    return _serialize(obj)


@router.put("/products/{prod_id}")
async def update_product(prod_id: int, data: ProductUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_productsService(db)
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    obj = await svc.update(prod_id, updates)
    if not obj:
        raise HTTPException(status_code=404, detail="Product not found")
    return _serialize(obj)


@router.delete("/products/{prod_id}")
async def delete_product(prod_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_productsService(db)
    if not await svc.delete(prod_id):
        raise HTTPException(status_code=404, detail="Product not found")
    return {"success": True}


# ─── Orders ────────────────────────────────────────────────────────

@router.get("/orders")
async def list_orders(request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_ordersService(db)
    result = await svc.get_list(limit=200)
    return {"items": [_serialize(o) for o in result["items"]], "total": result["total"]}


@router.post("/orders", status_code=201)
async def create_order(data: OrderData, db: AsyncSession = Depends(get_db)):
    prod_svc = Gastronom_productsService(db)
    set_svc = Gastronom_settingsService(db)
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

    validated_items, expected_total = _validate_order_payload(
        data, products_by_id, min_order, delivery_fee
    )

    user_comment = (data.comment or "").strip()
    delivery_note = f"Зона доставки: {zone_name} ({int(delivery_fee)} ₸)" if zone_name else ""
    if delivery_note:
        full_comment = f"{delivery_note}\n{user_comment}".strip() if user_comment else delivery_note
    else:
        full_comment = user_comment

    svc = Gastronom_ordersService(db)
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

    await notify_gastronom_order({
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
    })

    return _serialize(obj)


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: int, status: str, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    if status not in VALID_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Недопустимый статус заказа")
    svc = Gastronom_ordersService(db)
    existing = await svc.get_by_id(order_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Order not found")
    old_status = existing.status
    obj = await svc.update(order_id, {"status": status})
    if not obj:
        raise HTTPException(status_code=404, detail="Order not found")
    if old_status != status:
        await notify_gastronom_status_change({
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
    svc = Gastronom_settingsService(db)
    return await svc.get_all_as_dict()


@router.put("/settings")
async def update_settings(data: SettingsUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_settingsService(db)
    await svc.upsert_many(data.settings)
    return await svc.get_all_as_dict()
