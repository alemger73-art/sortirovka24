"""Optional FrontPad tasks on application startup."""

from __future__ import annotations

import logging
import os

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.food_items import Food_items
from services.frontpad_client import api_error_message, call_frontpad, get_menu_secret
from services.frontpad_settings import Frontpad_settingsService

logger = logging.getLogger(__name__)


async def verify_frontpad_connection(session: AsyncSession) -> None:
    """Log FrontPad API status once at startup (non-blocking)."""
    service = Frontpad_settingsService(session)
    secret = await get_menu_secret(service)
    if not secret:
        logger.info("[FrontPad] No API secret configured")
        return
    try:
        result = await call_frontpad(secret, "get_products")
        err = api_error_message(result)
        if err:
            logger.warning("[FrontPad] Startup check failed: %s", err)
        else:
            logger.info("[FrontPad] API connection OK (get_products)")
    except Exception as exc:
        logger.warning("[FrontPad] Startup check error: %s", exc)


async def maybe_sync_menu_on_startup(session: AsyncSession) -> None:
    """Sync menu from FrontPad when enabled and local catalog is empty."""
    flag = (os.getenv("FRONTPAD_SYNC_ON_START") or "").strip().lower()
    if flag not in ("1", "true", "yes"):
        return

    count = (
        await session.execute(select(func.count(Food_items.id)))
    ).scalar() or 0
    if count > 0:
        logger.info("[FrontPad] Skip startup sync: %s items already in DB", count)
        return

    service = Frontpad_settingsService(session)
    if not await get_menu_secret(service):
        return

    logger.info("[FrontPad] Starting menu sync (empty catalog, FRONTPAD_SYNC_ON_START)")
    try:
        from routers.frontpad import sync_menu

        await sync_menu(db=session)
    except Exception as exc:
        logger.warning("[FrontPad] Startup menu sync failed: %s", exc)
