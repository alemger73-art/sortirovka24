"""Shared FrontPad API client (menu + orders)."""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, Optional

import httpx

from core.deploy_safety import external_side_effects_allowed
from services.frontpad_settings import Frontpad_settingsService

logger = logging.getLogger(__name__)

FRONTPAD_API_BASE = "https://app.frontpad.ru/api/index.php"


async def get_setting(service: Frontpad_settingsService, key: str) -> str:
    item = await service.get_by_field("setting_key", key)
    if item:
        return item.setting_value or ""
    return ""


async def get_menu_secret(service: Frontpad_settingsService) -> str:
    menu_secret = await get_setting(service, "menu_secret")
    if menu_secret:
        return menu_secret
    env_secret = (os.getenv("FRONTPAD_MENU_SECRET") or os.getenv("FRONTPAD_SECRET") or "").strip()
    if env_secret:
        return env_secret
    return await get_setting(service, "api_key")


async def get_order_secret(service: Frontpad_settingsService) -> str:
    order_secret = await get_setting(service, "order_secret")
    if order_secret:
        return order_secret
    env_secret = (
        os.getenv("FRONTPAD_ORDER_SECRET")
        or os.getenv("FRONTPAD_MENU_SECRET")
        or os.getenv("FRONTPAD_SECRET")
        or ""
    ).strip()
    if env_secret:
        return env_secret
    return await get_setting(service, "api_key")


async def call_frontpad(
    secret: str,
    method: str,
    extra_params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not external_side_effects_allowed():
        raise RuntimeError("FrontPad integration is disabled in this environment")
    raise RuntimeError("FrontPad integration has been removed")


def api_error_message(result: Any) -> Optional[str]:
    if isinstance(result, dict) and result.get("error"):
        error_code = result.get("error", "")
        messages = {
            "invalid_secret": "Неверный API ключ (secret)",
            "api_off": "API выключено в настройках FrontPad",
            "invalid_plant": "API недоступно на текущем тарифе",
            "requests_limit": "Превышен лимит запросов (30/мин)",
            "cash_close": "Смена закрыта в FrontPad",
        }
        return messages.get(error_code, f"Ошибка API: {error_code}")
    return None
