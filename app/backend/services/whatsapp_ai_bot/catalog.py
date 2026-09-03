"""Read-only DAM ALEM catalog access for WhatsApp bot (no order writes)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from services.food_categories import Food_categoriesService
from services.food_items import Food_itemsService
from services.food_restaurants import Food_restaurantsService
from services.food_settings import Food_settingsService


def _norm(text: str) -> str:
    return " ".join((text or "").lower().replace("ё", "е").split())


def is_dam_alem_name(name: Optional[str]) -> bool:
    n = _norm(name or "").replace(" ", "")
    return "damalem" in n or "дамалем" in n


@dataclass(frozen=True)
class CatalogCategory:
    id: int
    name: str


@dataclass(frozen=True)
class CatalogItem:
    id: int
    name: str
    price: float
    category_id: Optional[int]
    description: str = ""


@dataclass(frozen=True)
class CatalogSnapshot:
    restaurant_id: Optional[int]
    restaurant_name: str
    categories: List[CatalogCategory]
    items: List[CatalogItem]
    min_order_amount: float
    working_hours: str


async def resolve_dam_alem_restaurant_id(db: AsyncSession) -> tuple[Optional[int], str]:
    svc = Food_restaurantsService(db)
    result = await svc.get_list(skip=0, limit=100, query_dict=None, sort="sort_order")
    restaurants = result.get("items") or []
    for row in restaurants:
        if is_dam_alem_name(getattr(row, "name", None)):
            return int(row.id), str(row.name or "DAM ALEM")
    if restaurants:
        first = restaurants[0]
        return int(first.id), str(first.name or "DAM ALEM")
    return None, "DAM ALEM"


async def load_catalog(db: AsyncSession, *, item_limit: int = 400) -> CatalogSnapshot:
    restaurant_id, restaurant_name = await resolve_dam_alem_restaurant_id(db)

    cat_svc = Food_categoriesService(db)
    cats_res = await cat_svc.get_list(skip=0, limit=200, query_dict=None, sort="sort_order")
    categories: List[CatalogCategory] = []
    for row in cats_res.get("items") or []:
        if getattr(row, "is_active", True) is False:
            continue
        rid = getattr(row, "restaurant_id", None)
        if restaurant_id is not None and rid not in (None, restaurant_id):
            continue
        if row.id is None or not (row.name or "").strip():
            continue
        categories.append(CatalogCategory(id=int(row.id), name=str(row.name).strip()))

    items_svc = Food_itemsService(db)
    items_res = await items_svc.get_list(skip=0, limit=item_limit, query_dict=None, sort="sort_order")
    items: List[CatalogItem] = []
    for row in items_res.get("items") or []:
        if getattr(row, "is_active", True) is False:
            continue
        if getattr(row, "available", True) is False:
            continue
        rid = getattr(row, "restaurant_id", None)
        if restaurant_id is not None and rid not in (None, restaurant_id):
            continue
        if row.id is None or not (row.name or "").strip():
            continue
        try:
            price = float(row.price or 0)
        except (TypeError, ValueError):
            price = 0.0
        items.append(
            CatalogItem(
                id=int(row.id),
                name=str(row.name).strip(),
                price=price,
                category_id=int(row.category_id) if row.category_id is not None else None,
                description=str(getattr(row, "description", "") or "").strip(),
            )
        )

    settings_svc = Food_settingsService(db)
    settings = await settings_svc.get_all_as_dict()
    try:
        min_order = float(settings.get("min_order_amount") or 0)
    except (TypeError, ValueError):
        min_order = 0.0

    return CatalogSnapshot(
        restaurant_id=restaurant_id,
        restaurant_name=restaurant_name,
        categories=categories,
        items=items,
        min_order_amount=min_order,
        working_hours=str(settings.get("working_hours") or "").strip(),
    )


def find_category(categories: Sequence[CatalogCategory], query: str) -> Optional[CatalogCategory]:
    q = _norm(query)
    if not q:
        return None
    # Exact / startswith first
    for cat in categories:
        name = _norm(cat.name)
        if name == q or name.startswith(q) or q.startswith(name):
            return cat
    for cat in categories:
        if q in _norm(cat.name):
            return cat
    return None


def search_items(items: Sequence[CatalogItem], query: str, *, limit: int = 8) -> List[CatalogItem]:
    q = _norm(query)
    if not q or len(q) < 2:
        return []
    scored: List[tuple[int, CatalogItem]] = []
    for item in items:
        name = _norm(item.name)
        if name == q:
            scored.append((0, item))
        elif name.startswith(q):
            scored.append((1, item))
        elif q in name:
            scored.append((2, item))
    scored.sort(key=lambda pair: (pair[0], pair[1].name.lower()))
    return [item for _, item in scored[:limit]]


def items_in_category(items: Sequence[CatalogItem], category_id: int, *, limit: int = 12) -> List[CatalogItem]:
    matched = [i for i in items if i.category_id == category_id]
    return matched[:limit]


def format_price(amount: float) -> str:
    try:
        return f"{int(round(amount)):,}".replace(",", " ") + " ₸"
    except (TypeError, ValueError):
        return "— ₸"
