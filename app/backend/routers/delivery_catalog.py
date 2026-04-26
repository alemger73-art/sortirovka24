"""
Публичный каталог доставки еды: REST /api/categories и /api/products.
Использует те же таблицы food_categories / food_items, что и entities API.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models.food_categories import Food_categories
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from services.food_restaurants import Food_restaurantsService
from services.food_categories import Food_categoriesService
from services.food_items import Food_itemsService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["delivery_catalog"])


def slugify(text: str) -> str:
    s = (text or "").strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.ASCII)
    s = re.sub(r"[-\s]+", "-", s).strip("-")
    return s or "category"


def _category_slug(cat: Food_categories) -> str:
    raw = (getattr(cat, "slug", None) or "").strip()
    if raw:
        return raw
    return slugify(cat.name or f"cat-{cat.id}")


def _category_image(cat: Food_categories) -> str:
    img = (getattr(cat, "image", None) or "").strip()
    if img:
        return img
    return (cat.icon or "").strip()


def _serialize_category(cat: Food_categories) -> Dict[str, Any]:
    return {
        "id": cat.id,
        "restaurant_id": getattr(cat, "restaurant_id", None),
        "name": cat.name,
        "slug": _category_slug(cat),
        "image": _category_image(cat),
        "category_type": getattr(cat, "category_type", None),
        "order": cat.sort_order or 0,
    }


def _serialize_product(p: Food_items, slug_by_cat_id: Dict[int, str]) -> Dict[str, Any]:
    is_pop = getattr(p, "is_popular", None)
    if is_pop is None:
        is_pop = bool(p.is_recommended)
    is_cmb = bool(getattr(p, "is_combo", None) or False)
    cid = p.category_id or 0
    return {
        "id": p.id,
        "restaurant_id": getattr(p, "restaurant_id", None),
        "title": p.name,
        "description": p.description or "",
        "price": float(p.price or 0),
        "image": p.image_url or "",
        "category_id": cid,
        "category_slug": slug_by_cat_id.get(cid, ""),
        "is_popular": is_pop,
        "is_combo": is_cmb,
        "available": getattr(p, "available", None) is not False,
        "created_at": p.created_at,
    }


async def _load_categories(db: AsyncSession, active_only: bool) -> List[Food_categories]:
    svc = Food_categoriesService(db)
    res = await svc.get_list(skip=0, limit=500, query_dict=None, sort="sort_order")
    items: List[Food_categories] = list(res["items"])
    if active_only:
        items = [c for c in items if c.is_active is not False]
    return items


async def _load_items(db: AsyncSession, active_only: bool) -> List[Food_items]:
    svc = Food_itemsService(db)
    res = await svc.get_list(skip=0, limit=2000, query_dict=None, sort="sort_order")
    items: List[Food_items] = list(res["items"])
    if active_only:
        items = [i for i in items if i.is_active is not False]
    return items


async def _load_restaurants(db: AsyncSession, active_only: bool) -> List[Food_restaurants]:
    svc = Food_restaurantsService(db)
    res = await svc.get_list(skip=0, limit=500, query_dict=None, sort="sort_order")
    items: List[Food_restaurants] = list(res["items"])
    if active_only:
        items = [r for r in items if r.is_active is not False]
    return items


def _serialize_restaurant(r: Food_restaurants) -> Dict[str, Any]:
    return {
        "id": r.id,
        "name": r.name or "",
        "photo": r.photo or "",
        "description": r.description or "",
        "whatsapp_phone": r.whatsapp_phone or "",
        "working_hours": r.working_hours or "",
        "min_order": float(r.min_order or 0),
        "delivery_time": r.delivery_time or "",
        "cuisine_type": r.cuisine_type or "",
        "rating": float(r.rating or 4.5),
    }


# ─── GET (каталог) ─────────────────────────────────────────────


@router.get("/categories", response_model=Dict[str, List[Dict[str, Any]]])
async def api_list_categories(
    restaurant_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    cats = await _load_categories(db, active_only=True)
    if restaurant_id:
        cats = [c for c in cats if getattr(c, "restaurant_id", None) == restaurant_id]
    cats_sorted = sorted(cats, key=lambda c: (c.sort_order or 0, c.id or 0))
    return {"categories": [_serialize_category(c) for c in cats_sorted]}


@router.get("/products", response_model=Dict[str, List[Dict[str, Any]]])
async def api_list_products(
    category: Optional[str] = Query(None, description="slug категории или all"),
    restaurant_id: Optional[int] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
):
    cats = await _load_categories(db, active_only=True)
    slug_by_id: Dict[int, str] = {}
    for c in cats:
        slug_by_id[c.id] = _category_slug(c)

    items = await _load_items(db, active_only=True)
    items = [i for i in items if getattr(i, "available", None) is not False]

    if restaurant_id:
        items = [i for i in items if getattr(i, "restaurant_id", None) == restaurant_id]

    if category and category != "all":
        cid = next((c.id for c in cats if _category_slug(c) == category), None)
        if cid is None:
            return {"products": []}
        items = [i for i in items if i.category_id == cid]

    items = items[:limit]

    return {"products": [_serialize_product(p, slug_by_id) for p in items]}


@router.get("/restaurants", response_model=Dict[str, List[Dict[str, Any]]])
async def api_list_restaurants(db: AsyncSession = Depends(get_db)):
    restaurants = await _load_restaurants(db, active_only=True)
    return {"restaurants": [_serialize_restaurant(r) for r in restaurants]}


# ─── Pydantic: тело как в ТЗ (title / image) ───────────────────


class ApiCategoryCreate(BaseModel):
    name: str
    slug: Optional[str] = None
    image: Optional[str] = None
    order: Optional[int] = None
    icon: Optional[str] = None


class ApiCategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    image: Optional[str] = None
    order: Optional[int] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class ApiProductCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    price: float = Field(..., ge=0)
    image: Optional[str] = ""
    category_id: int
    is_popular: bool = False
    is_combo: bool = False


class ApiProductUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    image: Optional[str] = None
    category_id: Optional[int] = None
    is_popular: Optional[bool] = None
    is_combo: Optional[bool] = None
    is_active: Optional[bool] = None


# ─── POST / PUT / DELETE ───────────────────────────────────────


@router.post("/categories", response_model=Dict[str, Any], status_code=201)
async def api_create_category(body: ApiCategoryCreate, db: AsyncSession = Depends(get_db)):
    svc = Food_categoriesService(db)
    slug = (body.slug or "").strip() or slugify(body.name)
    data = {
        "name": body.name,
        "slug": slug,
        "image": body.image or "",
        "icon": body.icon or "🍽",
        "sort_order": body.order if body.order is not None else 99,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    row = await svc.create(data)
    if not row:
        raise HTTPException(status_code=400, detail="Failed to create category")
    return {"category": _serialize_category(row)}


@router.put("/categories/{category_id}", response_model=Dict[str, Any])
async def api_update_category(category_id: int, body: ApiCategoryUpdate, db: AsyncSession = Depends(get_db)):
    svc = Food_categoriesService(db)
    existing = await svc.get_by_id(category_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    upd: Dict[str, Any] = {}
    if body.name is not None:
        upd["name"] = body.name
    if body.slug is not None:
        upd["slug"] = body.slug.strip() or slugify(body.name or existing.name or "")
    if body.image is not None:
        upd["image"] = body.image
    if body.icon is not None:
        upd["icon"] = body.icon
    if body.order is not None:
        upd["sort_order"] = body.order
    if body.is_active is not None:
        upd["is_active"] = body.is_active
    row = await svc.update(category_id, upd)
    if not row:
        raise HTTPException(status_code=400, detail="Update failed")
    return {"category": _serialize_category(row)}


@router.delete("/categories/{category_id}", status_code=204)
async def api_delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    cnt = await db.execute(
        select(func.count(Food_items.id)).where(Food_items.category_id == category_id)
    )
    n = cnt.scalar() or 0
    if n > 0:
        raise HTTPException(status_code=400, detail="Category has products; reassign or delete products first")
    svc = Food_categoriesService(db)
    ok = await svc.delete(category_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Category not found")


@router.post("/products", response_model=Dict[str, Any], status_code=201)
async def api_create_product(body: ApiProductCreate, db: AsyncSession = Depends(get_db)):
    cat_svc = Food_categoriesService(db)
    if not await cat_svc.get_by_id(body.category_id):
        raise HTTPException(status_code=400, detail="Invalid category_id")
    svc = Food_itemsService(db)
    data = {
        "category_id": body.category_id,
        "name": body.title,
        "description": body.description or "",
        "price": body.price,
        "image_url": body.image or "",
        "is_active": True,
        "is_recommended": body.is_popular,
        "is_popular": body.is_popular,
        "is_combo": body.is_combo,
        "weight": "",
        "sort_order": 99,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    row = await svc.create(data)
    if not row:
        raise HTTPException(status_code=400, detail="Failed to create product")
    cats = await _load_categories(db, active_only=False)
    slug_by_id = {c.id: _category_slug(c) for c in cats}
    return {"product": _serialize_product(row, slug_by_id)}


@router.put("/products/{product_id}", response_model=Dict[str, Any])
async def api_update_product(product_id: int, body: ApiProductUpdate, db: AsyncSession = Depends(get_db)):
    svc = Food_itemsService(db)
    existing = await svc.get_by_id(product_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Product not found")
    upd: Dict[str, Any] = {}
    if body.title is not None:
        upd["name"] = body.title
    if body.description is not None:
        upd["description"] = body.description
    if body.price is not None:
        upd["price"] = body.price
    if body.image is not None:
        upd["image_url"] = body.image
    if body.category_id is not None:
        cat_svc = Food_categoriesService(db)
        if not await cat_svc.get_by_id(body.category_id):
            raise HTTPException(status_code=400, detail="Invalid category_id")
        upd["category_id"] = body.category_id
    if body.is_popular is not None:
        upd["is_popular"] = body.is_popular
        upd["is_recommended"] = body.is_popular
    if body.is_combo is not None:
        upd["is_combo"] = body.is_combo
    if body.is_active is not None:
        upd["is_active"] = body.is_active
    row = await svc.update(product_id, upd)
    if not row:
        raise HTTPException(status_code=400, detail="Update failed")
    cats = await _load_categories(db, active_only=False)
    slug_by_id = {c.id: _category_slug(c) for c in cats}
    return {"product": _serialize_product(row, slug_by_id)}


@router.delete("/products/{product_id}", status_code=204)
async def api_delete_product(product_id: int, db: AsyncSession = Depends(get_db)):
    svc = Food_itemsService(db)
    ok = await svc.delete(product_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Product not found")
