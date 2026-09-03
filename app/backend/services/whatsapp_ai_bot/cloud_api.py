"""WhatsApp Cloud API client — outbound text only (no media / templates)."""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from services.whatsapp_ai_bot.config import WhatsAppBotConfig, get_whatsapp_config

logger = logging.getLogger(__name__)


class WhatsAppCloudClient:
    """Thin async client for Meta Graph WhatsApp messages."""

    def __init__(self, config: Optional[WhatsAppBotConfig] = None) -> None:
        self.config = config or get_whatsapp_config()

    def _messages_url(self) -> str:
        base = (self.config.graph_base_url or "https://graph.facebook.com").rstrip("/")
        version = (self.config.api_version or "v21.0").strip("/")
        phone_id = self.config.phone_number_id.strip()
        return f"{base}/{version}/{phone_id}/messages"

    async def send_text(self, to_wa_id: str, body: str) -> bool:
        """Send a plain text message. Skips when token/phone_number_id missing."""
        token = (self.config.access_token or "").strip()
        phone_id = (self.config.phone_number_id or "").strip()
        if not token or not phone_id:
            logger.info(
                "whatsapp_cloud_api send_text skipped missing_creds "
                "has_token=%s has_phone_id=%s",
                bool(token),
                bool(phone_id),
            )
            return False

        to = (to_wa_id or "").strip()
        text = (body or "").strip()
        if not to or not text:
            logger.info("whatsapp_cloud_api send_text skipped empty_to_or_body")
            return False

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "text",
            "text": {"preview_url": False, "body": text[:4096]},
        }
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    self._messages_url(),
                    json=payload,
                    headers=headers,
                )
            # Log status only — response bodies may contain PII.
            logger.info(
                "whatsapp_cloud_api send_text status=%s",
                response.status_code,
            )
            return 200 <= response.status_code < 300
        except Exception:
            logger.exception("whatsapp_cloud_api send_text failed")
            return False
