"""Wazzup webhook: WhatsApp + Instagram messages for the DAM ALEM AI bot.

Wazzup does not sign webhooks, so the URL carries a secret token
(?token=WAZZUP_WEBHOOK_TOKEN) and the bot answers only in allowed channels.
"""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from services.wazzup_bot.config import get_wazzup_config
from services.wazzup_bot.ingress import is_test_ping, parse_messages

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/wazzup", tags=["wazzup"])

_background: set = set()


async def _process(payload: object) -> None:
    try:
        from core.database import db_manager
        from services.wazzup_bot.agent import handle_message

        messages = parse_messages(payload)
        if not messages:
            return
        if not db_manager.async_session_maker:
            await db_manager.ensure_initialized()
        if not db_manager.async_session_maker:
            logger.warning("wazzup webhook: db unavailable")
            return
        for msg in messages:
            async with db_manager.async_session_maker() as session:
                await handle_message(session, msg)
    except Exception:
        logger.exception("wazzup webhook processing failed")


@router.post("/webhook")
async def wazzup_webhook(request: Request, token: Optional[str] = Query(None)):
    config = get_wazzup_config()
    if not config.webhook_token or not token or not hmac.compare_digest(token, config.webhook_token):
        raise HTTPException(status_code=403, detail="Forbidden")
    raw = await request.body()
    try:
        payload = json.loads(raw.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        return JSONResponse({"ok": True})
    if is_test_ping(payload):
        return JSONResponse({"ok": True})
    if not config.ready:
        return JSONResponse({"ok": True, "enabled": False})
    # Ack fast (Wazzup times out at 30s); Claude + DB work runs in the background.
    task = asyncio.create_task(_process(payload))
    _background.add(task)
    task.add_done_callback(_background.discard)
    return JSONResponse({"ok": True})


@router.get("/status")
async def wazzup_status(token: Optional[str] = Query(None)):
    """Quick health check for setup: which settings are present (no secrets)."""
    config = get_wazzup_config()
    if not config.webhook_token or not token or not hmac.compare_digest(token, config.webhook_token):
        raise HTTPException(status_code=403, detail="Forbidden")
    return {
        "enabled": config.enabled,
        "ready": config.ready,
        "wazzup_api_key": bool(config.api_key),
        "anthropic_api_key": bool(config.anthropic_api_key),
        "model": config.anthropic_model,
        "channels_allowlist": len(config.channel_ids),
        "webhook_url_configured": bool(config.webhook_url),
    }
