"""Seed DAM ALEM full menu into food_categories, food_items, modifier_groups."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from models.food_categories import Food_categories
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.item_modifier_groups import Item_modifier_groups
from models.modifier_groups import Modifier_groups
from models.modifier_options import Modifier_options
from services.dam_alem_catalog_data import CATEGORIES, build_items, build_modifier_groups
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

RESTAURANT_NAMES = ("dam alem", "дам алем", "damalem", "däm әлемі")
EXPECTED_ITEM_COUNT = len(build_items())
EXPECTED_CATEGORY_COUNT = len(CATEGORIES)
# Treat catalog as complete only when most of the full menu is present.
MIN_COMPLETE_ITEMS = max(100, int(EXPECTED_ITEM_COUNT * 0.85))
MIN_COMPLETE_CATEGORIES = max(15, EXPECTED_CATEGORY_COUNT - 3)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


async def _find_dam_alem_restaurant(db: AsyncSession) -> Optional[Food_restaurants]:
    res = await db.execute(select(Food_restaurants))
    for r in res.scalars().all():
        n = (r.name or "").lower().replace(" ", "")
        if any(k.replace(" ", "") in n or k in (r.name or "").lower() for k in RESTAURANT_NAMES):
            return r
    return None


async def _ensure_restaurant(db: AsyncSession) -> Food_restaurants:
    existing = await _find_dam_alem_restaurant(db)
    if existing:
        return existing
    row = Food_restaurants(
        name="DAM ALEM",
        photo="https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png",
        description="Доставка еды №1 в Сортировке.",
        whatsapp_phone="+77470304096",
        working_hours="10:00 – 22:00",
        min_order=2000,
        delivery_time="35–45 мин",
        cuisine_type="Казахская, европейская",
        rating=4.9,
        is_active=True,
        sort_order=1,
        created_at=_now(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def _clear_restaurant_catalog(db: AsyncSession, restaurant_id: int) -> None:
    cat_res = await db.execute(
        select(Food_categories.id).where(Food_categories.restaurant_id == restaurant_id)
    )
    cat_ids = [r[0] for r in cat_res.all()]
    if not cat_ids:
        return

    item_res = await db.execute(
        select(Food_items.id).where(Food_items.restaurant_id == restaurant_id)
    )
    item_ids = [r[0] for r in item_res.all()]

    if item_ids:
        await db.execute(
            delete(Item_modifier_groups).where(Item_modifier_groups.food_item_id.in_(item_ids))
        )
        await db.execute(delete(Food_items).where(Food_items.id.in_(item_ids)))

    await db.execute(delete(Food_categories).where(Food_categories.id.in_(cat_ids)))

    # Modifier groups are DAM ALEM–only in this project
    await db.execute(delete(Modifier_options))
    await db.execute(delete(Modifier_groups))
    await db.execute(delete(Item_modifier_groups))

    await db.commit()


async def seed_dam_alem_catalog(db: AsyncSession, *, replace: bool = True) -> Dict[str, int]:
    """Import full DAM ALEM menu. Returns counts."""
    restaurant = await _ensure_restaurant(db)
    rid = restaurant.id

    if replace:
        await _clear_restaurant_catalog(db, rid)

    cat_slug_to_id: Dict[str, int] = {}
    for slug, name, sort_order, icon, cat_type, is_active in CATEGORIES:
        row = Food_categories(
            restaurant_id=rid,
            name=name,
            slug=slug,
            icon=icon,
            category_type=cat_type,
            sort_order=sort_order,
            is_active=is_active,
            created_at=_now(),
        )
        db.add(row)
        await db.flush()
        cat_slug_to_id[slug] = row.id

    group_key_to_id: Dict[str, int] = {}
    for g in build_modifier_groups():
        mg = Modifier_groups(
            name=g["name"],
            type="single" if g["type"] == "single" else "multiple",
            is_required=bool(g.get("is_required")),
            min_select=int(g.get("min_select") or 0),
            max_select=int(g.get("max_select") or 0),
            sort_order=int(g.get("sort_order") or 0),
            is_active=True,
            created_at=_now(),
        )
        db.add(mg)
        await db.flush()
        group_key_to_id[g["key"]] = mg.id
        for idx, opt in enumerate(g.get("options") or []):
            db.add(
                Modifier_options(
                    group_id=mg.id,
                    name=opt["name"],
                    price=float(opt.get("price") or 0),
                    sort_order=idx,
                    is_active=True,
                    created_at=_now(),
                )
            )

    items_data = build_items()
    item_count = 0
    link_count = 0
    for it in items_data:
        cid = cat_slug_to_id.get(it["category_slug"])
        if not cid:
            logger.warning("Unknown category slug: %s", it["category_slug"])
            continue
        row = Food_items(
            restaurant_id=rid,
            category_id=cid,
            name=it["name"],
            description=it.get("description") or "",
            price=float(it["price"]),
            image_url="",
            is_active=True,
            available=True,
            is_recommended=bool(it.get("is_popular")),
            is_popular=bool(it.get("is_popular")),
            is_combo=bool(it.get("is_combo")),
            weight=it.get("weight") or "",
            sort_order=int(it.get("sort_order") or 0),
            frontpad_id=(it.get("sku") or "") or None,
            created_at=_now(),
        )
        db.add(row)
        await db.flush()
        item_count += 1
        for sort_idx, gkey in enumerate(it.get("mod_groups") or []):
            gid = group_key_to_id.get(gkey)
            if not gid:
                continue
            db.add(
                Item_modifier_groups(
                    food_item_id=row.id,
                    modifier_group_id=gid,
                    sort_order=sort_idx,
                    created_at=_now(),
                )
            )
            link_count += 1

    await db.commit()
    stats = {
        "restaurant_id": rid,
        "categories": len(cat_slug_to_id),
        "items": item_count,
        "modifier_groups": len(group_key_to_id),
        "item_modifier_links": link_count,
    }
    logger.info("DAM ALEM catalog seeded: %s", stats)
    return stats


async def ensure_dam_alem_catalog(*, force: bool = False) -> Optional[Dict[str, int]]:
    """Seed menu when catalog is empty, or when DAM_ALEM_SEED_CATALOG=force."""
    import os

    from core.database import db_manager
    from models.food_items import Food_items
    from sqlalchemy import func, select

    mode = (os.environ.get("DAM_ALEM_SEED_CATALOG") or "").strip().lower()
    if mode == "skip":
        return None
    force = force or mode in ("1", "true", "yes", "force")

    if not db_manager.async_session_maker:
        return None

    async with db_manager.async_session_maker() as db:
        restaurant = await _find_dam_alem_restaurant(db)
        if not restaurant:
            logger.info("DAM ALEM restaurant not found; catalog seed skipped")
            return None
        count_res = await db.execute(
            select(func.count(Food_items.id)).where(Food_items.restaurant_id == restaurant.id)
        )
        count = int(count_res.scalar() or 0)
        cat_res = await db.execute(
            select(func.count(Food_categories.id)).where(Food_categories.restaurant_id == restaurant.id)
        )
        cat_count = int(cat_res.scalar() or 0)

        complete = (
            count >= MIN_COMPLETE_ITEMS
            and cat_count >= MIN_COMPLETE_CATEGORIES
        )
        if complete and not force:
            logger.info(
                "DAM ALEM catalog complete (%d items, %d categories); seed skipped",
                count,
                cat_count,
            )
            return None
        if count > 0 and not force:
            logger.warning(
                "DAM ALEM catalog incomplete (%d/%d items, %d/%d categories); re-seeding",
                count,
                EXPECTED_ITEM_COUNT,
                cat_count,
                EXPECTED_CATEGORY_COUNT,
            )
        return await seed_dam_alem_catalog(db, replace=True)
