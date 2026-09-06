"""Environment configuration for the WhatsApp bot (backend-only secrets)."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class WhatsAppBotConfig:
    """Runtime flags and Meta Cloud API settings. Never expose to frontend."""

    enabled: bool
    verify_token: str
    app_secret: str
    access_token: str
    phone_number_id: str
    business_account_id: str
    api_version: str
    graph_base_url: str
    session_ttl_seconds: int


def get_whatsapp_config() -> WhatsAppBotConfig:
    """Read WhatsApp settings from process environment. Default: bot disabled."""
    return WhatsAppBotConfig(
        enabled=_env_bool("WHATSAPP_BOT_ENABLED", default=False),
        verify_token=(os.environ.get("WHATSAPP_VERIFY_TOKEN") or "").strip(),
        app_secret=(os.environ.get("WHATSAPP_APP_SECRET") or "").strip(),
        access_token=(os.environ.get("WHATSAPP_ACCESS_TOKEN") or "").strip(),
        phone_number_id=(os.environ.get("WHATSAPP_PHONE_NUMBER_ID") or "").strip(),
        business_account_id=(os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID") or "").strip(),
        api_version=(os.environ.get("WHATSAPP_API_VERSION") or "v21.0").strip() or "v21.0",
        graph_base_url=(os.environ.get("WHATSAPP_GRAPH_BASE_URL") or "https://graph.facebook.com").strip()
        or "https://graph.facebook.com",
        session_ttl_seconds=_env_int("WHATSAPP_SESSION_TTL_SECONDS", 3600),
    )
