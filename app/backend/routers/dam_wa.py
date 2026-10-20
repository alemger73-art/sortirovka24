"""Webhook from the DAM ALEM WhatsApp server («waha-dam»): incoming messages for the sales bot.
Only our WAHA knows the key; the answer is produced in the background so WAHA never waits for the AI."""

from __future__ import annotations

import asyncio
import hmac
import logging

import httpx
from fastapi import APIRouter, HTTPException, Query, Request

from services import dam_wa_bot

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/dam-wa", tags=["dam-wa"])
_tasks: set[asyncio.Task] = set()
_locks: dict[str, asyncio.Lock] = {}


async def _process(event: dict) -> None:
    p = event.get("payload") or {}
    chat = str((p.get("to") if p.get("fromMe") else p.get("from")) or "")
    lock = _locks.setdefault(chat, asyncio.Lock())  # one message at a time per chat
    async with lock:
        try:
            async with httpx.AsyncClient() as client:
                outcome = await dam_wa_bot.handle_event(event, client)
                if outcome.action != "ignored":
                    logger.info("[DamWA] %s", outcome.action)
        except Exception as exc:
            logger.warning("[DamWA] event failed: %s", exc)


@router.post("/waha")
async def waha_webhook(request: Request, key: str = Query("")):
    expected = dam_wa_bot.hook_key()
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
