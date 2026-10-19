"""Webhook from our own WAHA server: incoming WhatsApp messages for the support bot.

Only WAHA (same docker network) knows the key; the answer is sent asynchronously so
WAHA never waits for the AI."""

from __future__ import annotations

import asyncio
import hmac
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from services import support_bot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/support-bot", tags=["support-bot"])
_tasks: set[asyncio.Task] = set()


async def _process(event: dict) -> None:
    try:
        async with httpx.AsyncClient() as client:
            outcome = await support_bot.handle_event(event, client)
            if outcome.action not in ("ignored",):
                logger.info("[SupportBot] %s", outcome.action)
    except Exception as exc:
        logger.warning("[SupportBot] event failed: %s", exc)


@router.post("/waha")
async def waha_webhook(request: Request, key: str = Query("")):
    expected = support_bot.hook_key()
    if not expected or not hmac.compare_digest(key, expected):
        raise HTTPException(403, "forbidden")
    try:
        event = await request.json()
    except ValueError:
        raise HTTPException(400, "bad json")
    if isinstance(event, dict):
        task = asyncio.create_task(_process(event))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    return {"ok": True}
