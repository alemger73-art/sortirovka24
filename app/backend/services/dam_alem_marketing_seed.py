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
from sqlalchemy import func, select

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


async def _ensure_food_banners(db) -> int:
    res = await db.execute(
        select(func.count(Banners.id)).where(
            Banners.banner_type == "food_delivery",
            Banners.active.is_(True),
        )
    )
    count = int(res.scalar() or 0)
    if count >= len(FOOD_BANNERS):
        return 0

    existing_titles = set()
    if count > 0:
        rows = await db.execute(
            select(Banners.title).where(Banners.banner_type == "food_delivery")
        )
        existing_titles = {str(r[0] or "").strip() for r in rows.all()}

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
        for key, default_value in MARKETING_SETTING_KEYS.items():
            existing = (current.get(key) or "").strip()
            should_set = force
            if not should_set:
                if key in MARKETING_JSON_KEYS:
                    should_set = _json_empty(existing)
                else:
                    should_set = not existing
            if should_set:
                created = await _upsert_setting(db, key, default_value)
                settings_changed += 1
                logger.info(
                    "DAM ALEM marketing setting %s %s",
                    key,
                    "created" if created else "updated",
                )

        banners_added = await _ensure_food_banners(db)

        if settings_changed == 0 and banners_added == 0:
            logger.info("DAM ALEM marketing already configured; seed skipped")
            return None

        await db.commit()
        stats = {
            "settings_updated": settings_changed,
            "banners_added": banners_added,
            "promo_codes": len(PROMO_CODES),
        }
        logger.info("DAM ALEM marketing seeded: %s", stats)
        return stats
