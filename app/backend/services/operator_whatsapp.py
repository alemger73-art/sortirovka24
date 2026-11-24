"""New DAM ALEM orders also arrive in WhatsApp — the same card the operator gets in Telegram.

Sent from the Сортировка 24 WhatsApp number to the numbers in DAM_ORDER_WA_TO (comma-separated, e.g. the
DAM ALEM phone). It goes through support_bot.send_text, so the number's hourly/daily send limits still apply.
"""
from __future__ import annotations

import asyncio
import html
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)
_background: set[asyncio.Task] = set()


def recipients() -> list[str]:
    """WhatsApp chat ids from DAM_ORDER_WA_TO: «+7 747 030 40 96, 87001234567» → ['77470304096@c.us', …]."""
    out = []
    for raw in (os.getenv("DAM_ORDER_WA_TO") or "").split(","):
        digits = re.sub(r"\D", "", raw)
        if len(digits) == 11 and digits.startswith("8"):
            digits = "7" + digits[1:]
        if len(digits) == 11 and digits.startswith("7"):
            out.append(f"{digits}@c.us")
    return list(dict.fromkeys(out))


def enabled() -> bool:
    from core.deploy_safety import external_side_effects_allowed
    return bool(recipients()) and external_side_effects_allowed()


def whatsapp_text(card_html: str) -> str:
    """The Telegram card in WhatsApp formatting: bold *…*, italic _…_, a link as «text: url»."""
    text = re.sub(r'<a href="([^"]+)">([^<]+)</a>', r"\2: \1", card_html)
    text = re.sub(r"</?b>", "*", text)
    text = re.sub(r"</?i>", "_", text)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text)


async def _send(message: str) -> None:
    from services.support_bot import send_text
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            for chat_id in recipients():
                if not await send_text(client, chat_id, message):
                    logger.warning("[OperatorWA] order not sent to %s (send limit or WhatsApp error)", chat_id[-6:])
    except Exception as exc:
        logger.warning("[OperatorWA] not sent: %s", exc)


def notify_new_order(order: Any) -> None:
    """Called after a new DAM ALEM order is saved; the card is built now, sent in the background."""
    if not enabled():
        return
    from services.operator_telegram import card
    message = whatsapp_text(card(order))
    try:
        job = asyncio.get_running_loop().create_task(_send(message))
    except RuntimeError:
        return
    _background.add(job)
    job.add_done_callback(_background.discard)
