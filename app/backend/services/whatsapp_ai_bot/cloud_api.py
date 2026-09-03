"""WhatsApp Cloud API outbound client (text only in stage 2)."""

from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from services.whatsapp_ai_bot.config import WhatsAppBotConfig

logger = logging.getLogger(__name__)


class WhatsAppCloudClient:
    def __init__(self, config: WhatsAppBotConfig):
        self._config = config

    @property
    def configured(self) -> bool:
        return bool(self._config.access_token and self._config.phone_number_id)

    def _messages_url(self) -> str:
        version = (self._config.api_version or "v21.0").lstrip("/")
        base = (self._config.graph_base_url or "https://graph.facebook.com").rstrip("/")
        return f"{base}/{version}/{self._config.phone_number_id}/messages"

    async def send_text(self, *, to_wa_id: str, body: str) -> bool:
        """Send a plain text message. Returns False if skipped or failed (never raises to caller path)."""
        text = (body or "").strip()
        if not text:
            return False
        if not self.configured:
            logger.warning("whatsapp_cloud_api skip send: access token or phone_number_id missing")
            return False
        if not to_wa_id:
            return False

        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to_wa_id,
            "type": "text",
            "text": {"preview_url": False, "body": text[:4096]},
        }
        headers = {
            "Authorization": f"Bearer {self._config.access_token}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                response = await client.post(self._messages_url(), json=payload, headers=headers)
            if response.status_code >= 400:
                # Do not log response body (may echo recipient identifiers).
                logger.warning(
                    "whatsapp_cloud_api send failed status=%s",
                    response.status_code,
                )
                return False
            return True
        except Exception as exc:
            logger.warning("whatsapp_cloud_api send error: %s", type(exc).__name__)
            return False
