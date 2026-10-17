"""Environment settings for the Wazzup (WhatsApp + Instagram) AI order bot.

All secrets are backend-only. The bot is disabled unless WAZZUP_BOT_ENABLED=1.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import FrozenSet


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _env_bool(name: str, default: bool = False) -> bool:
    raw = _env(name)
    if not raw:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


def _env_int(name: str, default: int) -> int:
    try:
        return int(_env(name) or default)
    except ValueError:
        return default


@dataclass(frozen=True)
class WazzupBotConfig:
    enabled: bool
    api_key: str
    api_base_url: str
    # Secret placed in the webhook URL (?token=...). Wazzup does not sign webhooks.
    webhook_token: str
    # Optional allowlist of Wazzup channel UUIDs the bot answers in. Empty = all.
    channel_ids: FrozenSet[str]
    # Public backend URL, used to register the webhook with Wazzup on startup.
    public_base_url: str
    anthropic_api_key: str
    anthropic_model: str
    anthropic_base_url: str
    # Bot stays silent in a chat for this long after an operator writes there.
    human_pause_minutes: int
    session_ttl_seconds: int
    max_tool_rounds: int

    @property
    def ready(self) -> bool:
        return bool(self.enabled and self.api_key and self.webhook_token and self.anthropic_api_key)

    def channel_allowed(self, channel_id: str) -> bool:
        return not self.channel_ids or channel_id in self.channel_ids

    @property
    def webhook_url(self) -> str:
        if not self.public_base_url or not self.webhook_token:
            return ""
        return f"{self.public_base_url.rstrip('/')}/api/v1/wazzup/webhook?token={self.webhook_token}"


def get_wazzup_config() -> WazzupBotConfig:
    channels = frozenset(c.strip() for c in _env("WAZZUP_CHANNEL_IDS").split(",") if c.strip())
    return WazzupBotConfig(
        enabled=_env_bool("WAZZUP_BOT_ENABLED"),
        api_key=_env("WAZZUP_API_KEY"),
        api_base_url=_env("WAZZUP_API_BASE_URL", "https://api.wazzup24.com"),
        webhook_token=_env("WAZZUP_WEBHOOK_TOKEN"),
        channel_ids=channels,
        public_base_url=_env("WAZZUP_PUBLIC_BASE_URL") or _env("PUBLIC_BACKEND_URL"),
        anthropic_api_key=_env("ANTHROPIC_API_KEY"),
        anthropic_model=_env("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
        anthropic_base_url=_env("ANTHROPIC_BASE_URL", "https://api.anthropic.com"),
        human_pause_minutes=_env_int("WAZZUP_HUMAN_PAUSE_MINUTES", 30),
        session_ttl_seconds=_env_int("WAZZUP_SESSION_TTL_SECONDS", 6 * 3600),
        max_tool_rounds=_env_int("WAZZUP_MAX_TOOL_ROUNDS", 8),
    )
