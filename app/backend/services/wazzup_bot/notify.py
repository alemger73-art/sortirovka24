"""Send order-status updates back to the chat the order came from."""

from __future__ import annotations

import logging

from sqlalchemy import select

from services.wazzup_bot.client import WazzupClient
from services.wazzup_bot.config import get_wazzup_config

logger = logging.getLogger(__name__)


async def send_order_status(db, order_id, text: str) -> bool:
    """True if the update went out via Wazzup; False lets other channels try."""
    cfg = get_wazzup_config()
    if not (cfg.enabled and cfg.api_key):
        return False
    from models.crm import ChannelConfirmation

    row = await db.scalar(select(ChannelConfirmation).where(ChannelConfirmation.order_id == int(order_id)))
    reply_to = (row.payload or {}).get("reply_to") if row is not None else None
    if not isinstance(reply_to, dict) or not all(reply_to.get(k) for k in ("channel_id", "chat_type", "chat_id")):
        return False
    sent = await WazzupClient(cfg).send_text(
        channel_id=reply_to["channel_id"], chat_type=reply_to["chat_type"], chat_id=reply_to["chat_id"], text=text
    )
    if sent:
        from services.wazzup_bot.sessions import get_store

        get_store(cfg.session_ttl_seconds).mark_ours(sent)
    return bool(sent)
