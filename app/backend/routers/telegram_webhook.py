"""Telegram Bot webhook — inline buttons for DAM ALEM food orders."""

from __future__ import annotations

import logging
import os
import secrets
from typing import Any, Optional

from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from services.food_telegram_flow import handle_food_callback
from services.telegram import (
    CATEGORY_FOOD,
    CATEGORY_FOOD_COURIER,
    answer_callback_query,
)
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/telegram", tags=["telegram"])


def _verify_secret(secret_header: Optional[str]) -> None:
    expected = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="Telegram webhook is not configured")
    if not secret_header or not secrets.compare_digest(secret_header.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid webhook secret")


def _callback_category(data: str) -> Optional[str]:
    if data.startswith("fo_"):
        return CATEGORY_FOOD
    if data.startswith("fcd_"):
        return CATEGORY_FOOD_COURIER
    return None


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_telegram_bot_api_secret_token: Optional[str] = Header(None),
):
    """Unified webhook for operator & courier bots (same URL on both bots if needed)."""
    _verify_secret(x_telegram_bot_api_secret_token)
    try:
        update: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(update, dict):
        raise HTTPException(400, 'Invalid update')
    callback = update.get("callback_query")
    if not callback:
        return {"ok": True}
    if not isinstance(callback, dict):
        raise HTTPException(400, 'Invalid callback')

    data = str(callback.get("data") or "")
    # Legacy interactive bots must explicitly allow their operators/chats.
    chats = {x.strip() for x in os.getenv('TELEGRAM_CALLBACK_CHAT_IDS', '').split(',') if x.strip()}
    senders = {x.strip() for x in os.getenv('TELEGRAM_CALLBACK_USER_IDS', '').split(',') if x.strip()}
    message, sender = callback.get('message'), callback.get('from')
    if not isinstance(message, dict) or not isinstance(sender, dict) or not isinstance(message.get('chat'), dict):
        raise HTTPException(403, 'Callback sender is not authorized')
    chat_id = str(message['chat'].get('id', ''))
    sender_id = str(sender.get('id', ''))
    if chat_id not in chats or sender_id not in senders:
        raise HTTPException(403, 'Callback sender is not authorized')
    callback_id = str(callback.get("id") or "")
    category = _callback_category(data)
    if not category or not callback_id:
        await answer_callback_query(callback_id, category=category)
        return {"ok": True}

    try:
        answer_text = await handle_food_callback(db, data)
    except Exception as exc:
        await db.rollback()
        logger.exception("Telegram callback error: %s", exc)
        answer_text = "Ошибка сервера"

    await answer_callback_query(callback_id, text=answer_text or "Готово", category=category)
    return {"ok": True}
