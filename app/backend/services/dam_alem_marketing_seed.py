"""Seed DAM ALEM marketing settings and promo banners on startup."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from models.banners import Banners
from models.food_settings import Food_settings
from services.dam_alem_marketing_defaults import (
    FOOD_BANNERS,
    MARKETING_JSON_KEYS,
    MARKETING_SETTING_KEYS,
    PROMO_CODES,
)
from sqlalchemy import select

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _json_empty(raw: Optional[str]) -> bool:
    if not raw or not str(raw).strip():
        return True
    try:
        data = json.loads(raw)
        return isinstance(data, list) and len(data) == 0
    except (TypeError, ValueError):
        return True


def _is_legacy_default_gifts(raw: str) -> bool:
    """Upgrade only the old built-in five-tier gift set, never merchant data."""
    try:
        gifts = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return False
    if not isinstance(gifts, list):
        return False
    ids = {g.get('id') for g in gifts if isinstance(g, dict)}
    if ids == {'dam-gift-fries', 'dam-gift-lemonade', 'dam-gift-sauce', 'dam-gift-dessert'}:
        return True
    if len(gifts) != 5:
        return False
    expected = {
        "dam-gift-shake": 5000,
        "dam-gift-fries": 8000,
        "dam-gift-lemonade": 12000,
        "dam-gift-sauce": 15000,
        "dam-gift-dessert": 20000,
    }
    actual = {
        str(gift.get("id") or ""): int(gift.get("min_amount") or 0)
        for gift in gifts
        if isinstance(gift, dict)
    }
    return actual == expected


def _is_legacy_default_promos(raw: str) -> bool:
    """Recognize the original built-in campaign set without touching custom codes."""
    try:
        promos = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return False
    if not isinstance(promos, list):
        return False
    codes = {str(promo.get("code") or "").strip().upper() for promo in promos if isinstance(promo, dict)}
    return codes <= {"DAMALEM10", "PIZZA500", "OBED15", "DOSTAVKA", "SEMYA20", "ALEM500", "WEEKEND"} and len(codes) >= 4 and all(
        not promo.get("valid_from") and not promo.get("valid_until")
        for promo in promos
        if isinstance(promo, dict)
    )


def _is_legacy_promo_slides(raw: str) -> bool:
    try:
        slides = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return False
    legacy_lines = {
        "Добавляем автоматически",
        "От 5 000 ₸ — подарок бесплатно",
        "−10% на заказ, максимум 1 000 ₸",
    }
    return isinstance(slides, list) and any(
        isinstance(slide, dict) and legacy_lines.intersection(slide.get("lines") or [])
        for slide in slides
    )


async def _upsert_setting(db, key: str, value: str) -> bool:
    res = await db.execute(select(Food_settings).where(Food_settings.setting_key == key))
    row = res.scalar_one_or_none()
    if row:
        row.setting_value = value
        row.is_active = True
        return False
    db.add(
        Food_settings(
            setting_key=key,
            setting_value=value,
            is_active=True,
        )
    )
    return True


def _defaults_by_title() -> dict[str, dict]:
    return {str(b.get("title") or "").strip(): b for b in FOOD_BANNERS}


_LEGACY_BANNER_TITLES = {
    "Подарок к каждому заказу": "Подарок на выбор от 5 000 ₸",
    "Комплексный обед −15%": "Доставка бесплатно",
    "Пицца выгоднее на 500 ₸": "Заказ выгоднее на 500 ₸",
}


async def _refresh_food_banner_images(db) -> int:
    """Upgrade built-in legacy banners and replace unstable images."""
    defaults = _defaults_by_title()
    result = await db.execute(select(Banners).where(Banners.banner_type == "food_delivery"))
    rows = list(result.scalars())
    existing_titles = {str(row.title or "").strip() for row in rows}
    updated = 0
    for row in rows:
        old_title = str(row.title or "").strip()
        target_title = _LEGACY_BANNER_TITLES.get(old_title, old_title)
        default = defaults.get(target_title)
        if not default:
            continue
        if target_title != old_title:
            if target_title in existing_titles:
                row.active = False
                updated += 1
                continue
            row.title = target_title
            row.subtitle = default.get("subtitle") or ""
            row.button_text = default.get("button_text") or "Подробнее"
            row.button_url = default.get("button_url") or "/food"
            row.link_url = default.get("button_url") or "/food"
            existing_titles.add(target_title)
            updated += 1
        new_url = str(default.get("image_url") or "").strip()
        if not new_url:
            continue
        old_url = str(row.image_url or "").strip()
        if old_url == new_url:
            continue
        if not old_url or "unsplash.com" in old_url or "images.unsplash" in old_url:
            row.image_url = new_url
            updated += 1
    return updated


async def _ensure_food_banners(db) -> int:
    defaults = _defaults_by_title()
    rows = await db.execute(select(Banners).where(Banners.banner_type == "food_delivery"))
    existing_titles = {str(r.title or "").strip() for r in rows.scalars()}

    added = 0
    for banner in FOOD_BANNERS:
        title = str(banner.get("title") or "").strip()
        if title in existing_titles:
            continue
        db.add(
            Banners(
                title=title,
                banner_text=banner.get("banner_text") or "",
                subtitle=banner.get("subtitle") or "",
                image_url=banner.get("image_url") or "",
                link_url=banner.get("link_url") or "/food",
                button_text=banner.get("button_text") or "Подробнее",
                button_url=banner.get("button_url") or "/food",
                banner_type="food_delivery",
                active=True,
                created_at=_now(),
            )
        )
        added += 1
    return added


async def ensure_dam_alem_marketing(*, force: bool = False) -> Optional[Dict[str, Any]]:
    """Fill food_settings marketing keys and food_delivery banners when missing."""
    from core.database import db_manager
    from services.food_settings import Food_settingsService

    mode = (os.environ.get("DAM_ALEM_SEED_MARKETING") or "").strip().lower()
    if mode == "skip":
        return None
    force = force or mode in ("1", "true", "yes", "force")

    if not db_manager.async_session_maker:
        return None

    async with db_manager.async_session_maker() as db:
        svc = Food_settingsService(db)
        current = await svc.get_all_as_dict()

        settings_changed = 0
        from models.food_restaurants import Food_restaurants
        from services.food_operations import brand
        for restaurant in (await db.scalars(select(Food_restaurants))).all():
            if not restaurant.merchant_key and brand(restaurant.name):
                restaurant.merchant_key = 'dam_alem'
                settings_changed += 1
        if current.get('unpriced_catalog_revision') != '2026-09-19':
            from models.food_items import Food_items
            from sqlalchemy import update, or_
            dam_ids = [r.id for r in (await db.scalars(select(Food_restaurants))).all() if brand(r.name, r.merchant_key)]
            await db.execute(update(Food_items).where(Food_items.restaurant_id.in_(dam_ids),
                or_(Food_items.price.is_(None), Food_items.price <= 0)).values(is_active=False))
            await _upsert_setting(db, 'unpriced_catalog_revision', '2026-09-19')
            settings_changed += 1
        for key, default_value in MARKETING_SETTING_KEYS.items():
            existing = (current.get(key) or "").strip()
            should_set = force
            if not should_set:
                if key in MARKETING_JSON_KEYS:
                    should_set = _json_empty(existing)
                else:
                    should_set = not existing
            if key == "loyalty_gifts" and _is_legacy_default_gifts(existing):
                should_set = True
            if key in ('promo_codes', 'loyalty_gifts') and key in current and not (key == 'loyalty_gifts' and _is_legacy_default_gifts(existing)):
                # Existing owner settings, including an empty list, are authoritative.
                should_set = force
            if key == "promo_slides" and _is_legacy_promo_slides(existing):
                should_set = True
            if should_set:
                created = await _upsert_setting(db, key, default_value)
                settings_changed += 1
                logger.info(
                    "DAM ALEM marketing setting %s %s",
                    key,
                    "created" if created else "updated",
                )

        banners_patched = 0
        banners_added = 0
        if current.get('combo_banner_revision') != '2026-09-20':
            from models.food_items import Food_items
            from models.food_restaurants import Food_restaurants
            from services.food_operations import brand
            restaurants = (await db.scalars(select(Food_restaurants))).all()
            ids = [r.id for r in restaurants if brand(r.name, r.merchant_key)]
            combos = (await db.scalars(select(Food_items).where(Food_items.restaurant_id.in_(ids),
                Food_items.is_combo.is_(True), Food_items.is_active.is_(True), Food_items.price > 0))).all()
            if combos:
                existing_banners = (await db.scalars(select(Banners).where(Banners.banner_type == 'food_delivery'))).all()
                for banner in existing_banners:
                    url = banner.button_url or banner.link_url or ''
                    if 'product=' not in url and 'item=' not in url:
                        banner.active = False
                        banners_patched += 1
                for combo in combos:
                    url = f'/food#product={combo.id}'
                    if any((b.button_url or b.link_url) == url for b in existing_banners):
                        continue
                    title = 'UFO Старт' if 'курин' in combo.name.lower() else 'UFO Сила' if 'говяж' in combo.name.lower() else combo.name
                    db.add(Banners(title=title, subtitle=combo.description or '', image_url=combo.image_url or '',
                        button_text='В корзину', button_url=url, link_url=url, banner_type='food_delivery', active=True, created_at=_now()))
                    banners_added += 1
                await _upsert_setting(db, 'combo_banner_revision', '2026-09-20')
                settings_changed += 1

        if settings_changed == 0 and banners_added == 0 and banners_patched == 0:
            logger.info("DAM ALEM marketing already configured; seed skipped")
            return None

        await db.commit()
        stats = {
            "settings_updated": settings_changed,
            "banners_added": banners_added,
            "banners_patched": banners_patched,
            "promo_codes": len(PROMO_CODES),
        }
        logger.info("DAM ALEM marketing seeded: %s", stats)
        return stats
