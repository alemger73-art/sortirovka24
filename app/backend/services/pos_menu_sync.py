"""ДАМ АЛЕМ menu from the cashier («Касса Dam Alem»): dishes and prices are kept there, the site follows.

The owner creates dishes, changes prices, photos and the stop list in the cashier. Every 30 seconds the site asks
the cashier for its menu over the servers' internal network (with the API key); when anything changed, the site's
dishes are brought in step: name, price, description, weight, photo, shown on the site (is_active) and in stock
(available). A dish the owner marks «на сайте» for the first time is created here.

Which site dish belongs to which cashier dish is kept in pos_menu_links (created on first use, never altered).
Site dishes not linked to the cashier are never touched. Switched off unless POS_MENU_URL and POS_INTEGRATION_KEY are set.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import Column, Integer, MetaData, Table, delete, insert, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from models.food_categories import Food_categories
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 30
LOCK_KEY = 724_001  # one sync at a time even with several server workers
BUSINESS_ID = "dam_alem"
SITE_URL = os.getenv("PUBLIC_SITE_URL", "https://www.sortirovka24.kz").rstrip("/")
CLOUDINARY_BASE = os.getenv("CLOUDINARY_IMAGE_BASE", "https://res.cloudinary.com/djpdmlkr9/image/upload").rstrip("/")

links = MetaData()
item_links = Table("pos_menu_links", links,
                   Column("pos_item_id", Integer, primary_key=True),
                   Column("food_item_id", Integer, nullable=False, unique=True))
category_links = Table("pos_category_links", links,
                       Column("pos_category_id", Integer, primary_key=True),
                       Column("food_category_id", Integer, nullable=False))  # several cashier categories may share one


def settings() -> tuple[str, str] | None:
    url, key = os.getenv("POS_MENU_URL", "").strip(), os.getenv("POS_INTEGRATION_KEY", "").strip()
    return (url, key) if url and len(key) >= 32 else None


def absolute_image(value: str | None) -> str | None:
    """The address a browser can open, for the cashier's dish card. Mirrors resolveImageSrc on the site."""
    if not value:
        return None
    if value.startswith("https://"):
        return value
    if value.startswith("/") and not value.startswith("//"):
        return SITE_URL + value
    return f"{CLOUDINARY_BASE}/{value}" if "/" in value else None


async def ensure_tables(db: AsyncSession) -> None:
    await db.run_sync(lambda session: links.create_all(session.connection(), checkfirst=True))


async def _locked(db: AsyncSession) -> bool:
    if db.bind.dialect.name != "postgresql":
        return True
    return bool((await db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY})).scalar())


def _desired(item: dict[str, Any]) -> dict[str, Any]:
    fields = {
        "name": item["site_name"] or item["name"],
        "price": float(item["price"]),
        "description": item.get("description"),
        "weight": item.get("weight"),
        "is_active": bool(item["on_site"]),
        "available": bool(item["on_sale"]),
        "sales_department": item["point"],
    }
    if item.get("photo_url"):
        fields["image_url"] = item["photo_url"]  # without a photo in the cashier the site keeps its own picture
    return fields


async def apply_menu(db: AsyncSession, menu: dict[str, Any]) -> dict[str, Any] | None:
    """Bring the site's dishes in step with the cashier's menu. Returns what to report back, or None if another
    worker is syncing right now."""
    await ensure_tables(db)
    if not await _locked(db):
        return None
    restaurant = (await db.execute(select(Food_restaurants).where(Food_restaurants.business_id == BUSINESS_ID)
                                   .order_by(Food_restaurants.id).limit(1))).scalar_one_or_none()
    if restaurant is None:
        raise RuntimeError("На сайте нет ресторана ДАМ АЛЕМ")
    item_link = dict((await db.execute(select(item_links.c.pos_item_id, item_links.c.food_item_id))).all())
    cat_link = dict((await db.execute(select(category_links.c.pos_category_id, category_links.c.food_category_id))).all())
    pos_categories = {c["id"]: c for c in menu["categories"]}
    now = datetime.now(timezone.utc).isoformat()
    created = updated = 0

    async def own(model, row_id: int | None):
        row = await db.get(model, row_id) if row_id else None
        return row if row is not None and row.restaurant_id == restaurant.id else None

    async def site_category(pos_category_id: int) -> int:
        if pos_category_id in cat_link:
            return cat_link[pos_category_id]
        pos = pos_categories[pos_category_id]
        hint = await own(Food_categories, pos.get("site_category_id"))
        if hint is not None:
            category_id = hint.id
        else:
            category = Food_categories(restaurant_id=restaurant.id, name=pos["name"], is_active=True,
                                       sort_order=50 + int(pos.get("sort") or 0), created_at=now)
            db.add(category)
            await db.flush()
            category_id = category.id
        await db.execute(insert(category_links).values(pos_category_id=pos_category_id, food_category_id=category_id))
        cat_link[pos_category_id] = category_id
        return category_id

    for item in menu["items"]:
        pos_id = item["id"]
        row = await own(Food_items, item_link.get(pos_id))
        if pos_id in item_link and row is None:  # the site dish was removed from the database: forget the link
            await db.execute(delete(item_links).where(item_links.c.pos_item_id == pos_id))
            del item_link[pos_id]
        if row is None:
            hint = await own(Food_items, item.get("site_id"))
            if hint is not None and hint.id not in item_link.values():
                row = hint
            elif not item["on_site"]:
                continue  # sold only in the café
            else:
                row = Food_items(restaurant_id=restaurant.id, business_id=restaurant.business_id,
                                 category_id=await site_category(item["category_id"]), sort_order=int(item.get("sort") or 0),
                                 is_recommended=False, is_popular=False, is_combo=False, modifiers_enabled=False,
                                 created_at=now, menu_version=1, **_desired(item))
                db.add(row)
                await db.flush()
                created += 1
            await db.execute(insert(item_links).values(pos_item_id=pos_id, food_item_id=row.id))
            item_link[pos_id] = row.id
        changes = {k: v for k, v in _desired(item).items() if getattr(row, k) != v}
        if changes:
            for k, v in changes.items():
                setattr(row, k, v)
            row.menu_version = (row.menu_version or 1) + 1  # open carts notice the dish changed
            updated += 1
            logger.info("[pos-menu] dish %s (%s): %s", row.id, row.name, sorted(changes))
    await db.commit()

    report_images = {}
    for item in menu["items"]:
        if item["id"] in item_link and not item.get("photo_url"):
            row = await db.get(Food_items, item_link[item["id"]])
            report_images[item["id"]] = absolute_image(row.image_url if row else None) or ""
    if created or updated:
        logger.info("[pos-menu] created %s, updated %s", created, updated)
    return {"items": item_link, "categories": cat_link, "images": report_images}


async def sync_once(client: httpx.AsyncClient, session_maker: async_sessionmaker, url: str, key: str,
                    last_version: str | None) -> str | None:
    """One round: returns the menu version now in step, so an unchanged menu costs one small request."""
    headers = {"X-Api-Key": key}
    response = await client.get(url, headers=headers)
    response.raise_for_status()
    menu = response.json()
    if menu.get("version") == last_version:
        return last_version
    async with session_maker() as db:
        report = await apply_menu(db, menu)
    if report is None:
        return last_version
    (await client.post(url.rstrip("/") + "/links", headers=headers, json=report)).raise_for_status()
    return menu.get("version")


async def run_forever(session_maker: async_sessionmaker) -> None:
    cfg = settings()
    if cfg is None:
        logger.info("[pos-menu] menu from the cashier is switched off (POS_MENU_URL / POS_INTEGRATION_KEY not set)")
        return
    url, key = cfg
    version: str | None = None
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            try:
                version = await sync_once(client, session_maker, url, key, version)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # the cashier being restarted must not stop the site; try again next round
                logger.warning("[pos-menu] sync failed: %s", exc)
            await asyncio.sleep(INTERVAL_SECONDS)
