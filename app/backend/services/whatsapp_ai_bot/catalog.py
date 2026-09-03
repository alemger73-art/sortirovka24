"""Read-only DAM ALEM catalog helpers for the WhatsApp bot (no order creation)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from services.food_categories import Food_categoriesService
from services.food_items import Food_itemsService
from services.food_restaurants import Food_restaurantsService
from services.food_settings import Food_settingsService

_DAM_ALEM_NEEDLES = (
    "dam alem",
    "дам алем",
    "damalem",
    "däm әлемі",
)


@dataclass(frozen=True)
class CatalogItem:
    id: int
    name: str
    price: float
    category_id: Optional[int] = None
    description: str = ""


@dataclass(frozen=True)
class CatalogCategory:
    id: int
    name: str
    slug: str = ""


@dataclass(frozen=True)
class CatalogSnapshot:
    restaurant_id: Optional[int]
    brand: str
    categories: tuple[CatalogCategory, ...]
    items: tuple[CatalogItem, ...]


def is_dam_alem_name(name: Optional[str]) -> bool:
    """True when restaurant name looks like DAM ALEM (ru/en variants)."""
    if not name:
        return False
    lowered = name.lower()
    compact = re.sub(r"\s+", "", lowered)
    for needle in _DAM_ALEM_NEEDLES:
        n = needle.lower()
        if n in lowered or re.sub(r"\s+", "", n) in compact:
            return True
    return False


async def resolve_dam_alem_restaurant_id(db: AsyncSession) -> Optional[int]:
    """Find DAM ALEM restaurant id via Food_restaurantsService."""
    svc = Food_restaurantsService(db)
    result = await svc.get_list(skip=0, limit=500)
    for row in result.get("items") or []:
        if is_dam_alem_name(getattr(row, "name", None)):
            rid = getattr(row, "id", None)
            return int(rid) if rid is not None else None
    return None


def format_price(price: Optional[float]) -> str:
    """Format price for WhatsApp replies (tenge)."""
    if price is None:
        return "—"
    try:
        value = int(round(float(price)))
    except (TypeError, ValueError):
        return "—"
    formatted = f"{value:,}".replace(",", " ")
    return f"{formatted} ₸"


def find_category(
    catalog: CatalogSnapshot,
    query: str,
) -> Optional[CatalogCategory]:
    """Match category by case-insensitive name/slug (exact, then substring)."""
    q = (query or "").strip().lower()
    if not q:
        return None
    exact: Optional[CatalogCategory] = None
    partial: Optional[CatalogCategory] = None
    for cat in catalog.categories:
        name = (cat.name or "").lower()
        slug = (cat.slug or "").lower()
        if name == q or slug == q:
            exact = cat
            break
        if q in name or q in slug:
            if partial is None:
                partial = cat
    return exact or partial


def search_items(
    catalog: CatalogSnapshot,
    query: str,
    *,
    limit: int = 15,
) -> List[CatalogItem]:
    """Case-insensitive substring search over active item names."""
    q = (query or "").strip().lower()
    if not q:
        return []
    hits: List[CatalogItem] = []
    for item in catalog.items:
        if q in (item.name or "").lower():
            hits.append(item)
            if len(hits) >= limit:
                break
    return hits


def items_in_category(
    catalog: CatalogSnapshot,
    category_id: int,
    *,
    limit: int = 40,
) -> List[CatalogItem]:
    """Active items belonging to the given category."""
    out: List[CatalogItem] = []
    for item in catalog.items:
        if item.category_id == category_id:
            out.append(item)
            if len(out) >= limit:
                break
    return out


def _is_active_flag(value: object) -> bool:
    return value is not False


async def load_catalog(db: AsyncSession) -> CatalogSnapshot:
    """Load read-only DAM ALEM catalog snapshot (active categories/items only)."""
    restaurant_id = await resolve_dam_alem_restaurant_id(db)

    brand = "DAM ALEM"
    try:
        settings = await Food_settingsService(db).get_all_as_dict()
        for key in ("hero_banner_title", "brand_name", "restaurant_brand"):
            raw = (settings.get(key) or "").strip()
            if raw:
                brand = raw
                break
    except Exception:
        pass

    if restaurant_id is None:
        return CatalogSnapshot(
            restaurant_id=None,
            brand=brand,
            categories=tuple(),
            items=tuple(),
        )

    cats_result = await Food_categoriesService(db).get_list(
        skip=0,
        limit=500,
        query_dict={"restaurant_id": restaurant_id},
        sort="sort_order",
    )
    items_result = await Food_itemsService(db).get_list(
        skip=0,
        limit=2000,
        query_dict={"restaurant_id": restaurant_id},
        sort="sort_order",
    )

    categories: List[CatalogCategory] = []
    for row in cats_result.get("items") or []:
        if not _is_active_flag(getattr(row, "is_active", None)):
            continue
        cid = getattr(row, "id", None)
        if cid is None:
            continue
        categories.append(
            CatalogCategory(
                id=int(cid),
                name=(getattr(row, "name", None) or "").strip() or f"#{cid}",
                slug=(getattr(row, "slug", None) or "").strip(),
            )
        )

    items: List[CatalogItem] = []
    for row in items_result.get("items") or []:
        if not _is_active_flag(getattr(row, "is_active", None)):
            continue
        if getattr(row, "available", None) is False:
            continue
        iid = getattr(row, "id", None)
        if iid is None:
            continue
        price_raw = getattr(row, "price", None)
        try:
            price = float(price_raw or 0)
        except (TypeError, ValueError):
            price = 0.0
        cat_id = getattr(row, "category_id", None)
        items.append(
            CatalogItem(
                id=int(iid),
                name=(getattr(row, "name", None) or "").strip() or f"#{iid}",
                price=price,
                category_id=int(cat_id) if cat_id is not None else None,
                description=(getattr(row, "description", None) or "").strip(),
            )
        )

    # Prefer sort_order order from services; keep stable tuples.
    return CatalogSnapshot(
        restaurant_id=restaurant_id,
        brand=brand,
        categories=tuple(categories),
        items=tuple(items),
    )
