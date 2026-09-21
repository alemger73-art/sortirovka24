"""Broadcast push notifications to registered devices."""

from __future__ import annotations

import logging
import json

from models.push_devices import PushDevice
from services.push_notifications import (
    native_push_enabled,
    push_enabled,
    send_push_to_token,
    send_web_push_subscription,
    web_push_enabled,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Devices registered via POST /api/v1/push/register-admin
ADMIN_DEVICE_USER_ID = "__admin_panel__"


async def broadcast_push(
    db: AsyncSession,
    *,
    title: str,
    body: str,
    data: dict[str, str] | None = None,
    user_id: str | None = None,
    platform: str | None = None,
) -> dict[str, int | bool]:
    """Send a push to all active devices (optionally filtered by user/platform)."""
    if not push_enabled():
        logger.debug("Push providers are not configured — broadcast skipped")
        return {"sent": 0, "failed": 0, "total": 0, "skipped": True}

    query = select(PushDevice).where(PushDevice.is_active.is_(True))
    if user_id:
        query = query.where(PushDevice.user_id == user_id)
    if platform:
        query = query.where(PushDevice.platform == platform)

    devices = (await db.execute(query)).scalars().all()
    sent = 0
    failed = 0

    for device in devices:
        expired = False
        if device.platform == "web":
            if not web_push_enabled():
                continue
            try:
                subscription = json.loads(device.token)
            except (TypeError, ValueError):
                ok, expired = False, True
            else:
                ok, expired = await send_web_push_subscription(
                    subscription, title=title, body=body, data=data
                )
        else:
            if not native_push_enabled():
                continue
            ok = await send_push_to_token(device.token, title=title, body=body, data=data)
        if ok:
            sent += 1
        else:
            failed += 1
        if expired:
            device.is_active = False

    if any(not device.is_active for device in devices):
        await db.commit()

    return {"sent": sent, "failed": failed, "total": len(devices), "skipped": False}


async def notify_published_news(news_id: int, title: str) -> None:
    """Background helper: push when admin publishes news."""
    from core.database import db_manager

    if not push_enabled() or not db_manager.async_session_maker:
        return

    headline = (title or "Новая новость").strip()[:120]
    try:
        async with db_manager.async_session_maker() as db:
            result = await broadcast_push(
                db,
                title="Sortirovka24",
                body=headline,
                data={"path": f"/news/{news_id}"},
            )
            logger.info("News push broadcast: %s", result)
    except Exception as exc:
        logger.warning("News push broadcast failed: %s", exc)
