"""Firebase Cloud Messaging (FCM) helpers for native push notifications."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

FCM_LEGACY_URL = "https://fcm.googleapis.com/fcm/send"


def push_enabled() -> bool:
    return bool(os.environ.get("FCM_SERVER_KEY", "").strip())


async def send_push_to_token(
    token: str,
    *,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
) -> bool:
    """Send a push notification to a single device token via FCM legacy HTTP API."""
    server_key = os.environ.get("FCM_SERVER_KEY", "").strip()
    if not server_key:
        logger.debug("FCM_SERVER_KEY not set — push skipped")
        return False

    payload: dict[str, Any] = {
        "to": token,
        "notification": {"title": title, "body": body},
        "priority": "high",
    }
    if data:
        payload["data"] = data

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                FCM_LEGACY_URL,
                json=payload,
                headers={
                    "Authorization": f"key={server_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code == 200:
            result = resp.json()
            if result.get("failure", 0):
                logger.warning("FCM delivery failure: %s", result)
                return False
            return True
        logger.warning("FCM HTTP %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("FCM send failed: %s", exc)
    return False
