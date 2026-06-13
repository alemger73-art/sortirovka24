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
from services.gastronom_settings import Gastronom_settingsService
from services.telegram import notify_gastronom_order

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/gastronom", tags=["gastronom"])


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


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    image_url: Optional[str] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


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


class SettingsUpdate(BaseModel):
    settings: Dict[str, str]


def _serialize(obj) -> Dict[str, Any]:
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# ─── Public catalog ────────────────────────────────────────────────

@router.get("/catalog")
async def get_catalog(db: AsyncSession = Depends(get_db)):
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
    svc = Gastronom_ordersService(db)
    payload = {
        **data.model_dump(),
        "status": "new",
        "created_at": datetime.now().isoformat(),
    }
    obj = await svc.create(payload)
    if not obj:
        raise HTTPException(status_code=400, detail="Failed to create order")

    try:
        items = json.loads(data.order_items) if data.order_items else []
    except json.JSONDecodeError:
        items = []

    await notify_gastronom_order({
        "order_id": obj.id,
        "customer_name": data.customer_name,
        "customer_phone": data.customer_phone,
        "customer_address": data.customer_address,
        "payment_method": data.payment_method,
        "comment": data.comment or "",
        "total_amount": data.total_amount,
        "items": items,
    })

    return _serialize(obj)


@router.put("/orders/{order_id}/status")
async def update_order_status(order_id: int, status: str, request: Request, db: AsyncSession = Depends(get_db)):
    _require_admin(request)
    svc = Gastronom_ordersService(db)
    obj = await svc.update(order_id, {"status": status})
    if not obj:
        raise HTTPException(status_code=404, detail="Order not found")
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
