"""Load FrontPad API secrets from environment into DB when not yet configured."""

from __future__ import annotations

import logging
import os
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from services.frontpad_settings import Frontpad_settingsService

logger = logging.getLogger(__name__)


def _env_menu_secret() -> str:
    return (os.getenv("FRONTPAD_MENU_SECRET") or os.getenv("FRONTPAD_SECRET") or "").strip()


def _env_order_secret() -> str:
    return (os.getenv("FRONTPAD_ORDER_SECRET") or os.getenv("FRONTPAD_SECRET") or "").strip()


async def ensure_frontpad_settings_from_env(session: AsyncSession) -> None:
    """Persist env FrontPad secrets to DB if keys are missing (first deploy / local .env)."""
    menu = _env_menu_secret()
    order = _env_order_secret()
    if not menu and not order:
        return

    service = Frontpad_settingsService(session)
    now = datetime.now().isoformat()

    async def _ensure(key: str, value: str) -> None:
        if not value:
            return
        existing = await service.get_by_field("setting_key", key)
        if existing and (existing.setting_value or "").strip():
            return
        if existing:
            await service.update(existing.id, {"setting_value": value, "updated_at": now})
        else:
            await service.create({"setting_key": key, "setting_value": value, "updated_at": now})
        logger.info("[FrontPad] Loaded %s from environment", key)

    await _ensure("menu_secret", menu)
    await _ensure("order_secret", order or menu)
    if menu:
        await _ensure("api_key", menu)

    affiliate = (os.getenv("FRONTPAD_AFFILIATE_ID") or "").strip()
    if affiliate:
        await _ensure("affiliate_id", affiliate)

    delivery_pid = (os.getenv("FRONTPAD_DELIVERY_PRODUCT_ID") or "").strip()
    if delivery_pid:
        await _ensure("delivery_product_id", delivery_pid)
