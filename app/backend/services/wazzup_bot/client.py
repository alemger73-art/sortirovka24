"""Minimal Wazzup API v3 client: send text, register webhook."""

from __future__ import annotations

import logging
import uuid
from typing import Optional

import httpx

from services.wazzup_bot.config import WazzupBotConfig

logger = logging.getLogger(__name__)

# Per-channel text limits from the Wazzup docs.
TEXT_LIMITS = {"instagram": 1000, "whatsapp": 10000}


def split_text(text: str, limit: int) -> list[str]:
    """Split on paragraph/line boundaries so long menus survive Instagram's limit."""
    text = (text or "").strip()
    if len(text) <= limit:
        return [text] if text else []
    parts: list[str] = []
    current = ""
    for line in text.split("\n"):
        while len(line) > limit:
            if current:
                parts.append(current)
                current = ""
            parts.append(line[:limit])
            line = line[limit:]
        candidate = f"{current}\n{line}" if current else line
        if len(candidate) > limit:
            parts.append(current)
            current = line
        else:
            current = candidate
    if current.strip():
        parts.append(current)
    return [p.strip() for p in parts if p.strip()]


class WazzupClient:
    def __init__(self, config: WazzupBotConfig):
        self.config = config

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.config.api_key}", "Content-Type": "application/json"}

    async def send_text(self, *, channel_id: str, chat_type: str, chat_id: str, text: str) -> list[str]:
        """Send text (split if needed). Returns Wazzup messageIds of sent parts."""
        if not self.config.api_key:
            logger.warning("wazzup send skipped: no API key")
            return []
        sent: list[str] = []
        limit = TEXT_LIMITS.get(chat_type, 4000)
        async with httpx.AsyncClient(timeout=15.0) as http:
            for part in split_text(text, limit):
                body = {
                    "channelId": channel_id,
                    "chatType": chat_type,
                    "chatId": chat_id,
                    "text": part,
                    # Wazzup's send route is not idempotent; a unique id per part
                    # prevents duplicate delivery on client-side retries.
                    "crmMessageId": uuid.uuid4().hex,
                }
                try:
                    resp = await http.post(f"{self.config.api_base_url}/v3/message", json=body, headers=self._headers())
                except httpx.HTTPError as exc:
                    logger.error("wazzup send failed: %s", exc)
                    break
                if resp.status_code not in (200, 201):
                    logger.error("wazzup send error %s: %s", resp.status_code, resp.text[:300])
                    break
                message_id: Optional[str] = (resp.json() or {}).get("messageId")
                if message_id:
                    sent.append(message_id)
        return sent

    async def register_webhook(self, url: str) -> bool:
        body = {
            "webhooksUri": url,
            "subscriptions": {
                "messagesAndStatuses": True,
                "contactsAndDealsCreation": False,
                "channelsUpdates": False,
                "templateStatus": False,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=20.0) as http:
                resp = await http.patch(f"{self.config.api_base_url}/v3/webhooks", json=body, headers=self._headers())
        except httpx.HTTPError as exc:
            logger.error("wazzup webhook registration failed: %s", exc)
            return False
        if resp.status_code >= 300:
            logger.error("wazzup webhook registration error %s: %s", resp.status_code, resp.text[:300])
            return False
        logger.info("wazzup webhook registered")
        return True
