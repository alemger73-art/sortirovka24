"""Tell the owner in Telegram when a WhatsApp bot's AI stops answering (bad API key, no credit, outage).

Without this the bots quietly fall back to a canned reply and nobody notices for days.
One notice per bot every few hours, so a dead key does not flood the chat.
"""
from __future__ import annotations

import html
import logging
import time

import httpx

logger = logging.getLogger(__name__)

NOTICE_EVERY = 6 * 3600
_last_notice: dict[str, float] = {}


def _reason(exc: Exception) -> str:
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if status == 401:
        return "ключ Anthropic недействителен (ошибка 401) — нужен новый ключ"
    if status in (402, 403):
        return f"доступ к Anthropic закрыт (ошибка {status}) — проверьте оплату и ключ"
    if status == 429:
        return "слишком много запросов или закончился лимит (ошибка 429)"
    return f"{type(exc).__name__}: {str(exc)[:160]}"


async def report_ai_failure(client: httpx.AsyncClient, bot: str, exc: Exception) -> None:
    """`bot` is the human name shown to the owner, e.g. «Сортировка 24» or «DAM ALEM»."""
    now = time.time()
    if now - _last_notice.get(bot, 0.0) < NOTICE_EVERY:
        return
    _last_notice[bot] = now
    from services.news_agent import approval_chat, bot_token, owner_send
    if not bot_token() or not approval_chat():
        return
    text = (f"⚠️ <b>WhatsApp-бот {html.escape(bot)}: ИИ не отвечает</b>\n\n{html.escape(_reason(exc))}.\n\n"
            "Пока это не исправлено, бот отвечает заготовкой и зовёт сотрудника.")
    try:
        await owner_send(client, "support", "sendMessage", {"text": text, "parse_mode": "HTML"})
    except Exception as notice_exc:
        logger.warning("[AiHealth] owner notice failed: %s", notice_exc)
