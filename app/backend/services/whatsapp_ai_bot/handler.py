"""Inbound WhatsApp message handler — catalog replies only (stage 2).

No OpenAI. No order creation. Never log full message text or phone numbers.
"""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from services.whatsapp_ai_bot.catalog import (
    CatalogSnapshot,
    find_category,
    format_price,
    items_in_category,
    load_catalog,
    search_items,
)
from services.whatsapp_ai_bot.cloud_api import WhatsAppCloudClient
from services.whatsapp_ai_bot.commands import BotIntent, help_text, parse_intent
from services.whatsapp_ai_bot.config import WhatsAppBotConfig, get_whatsapp_config
from services.whatsapp_ai_bot.ingress import InboundWhatsAppMessage, wa_id_fingerprint
from services.whatsapp_ai_bot.session_store import get_session_store

logger = logging.getLogger(__name__)

_ASK_TEXT = (
    "Пожалуйста, напишите текстовое сообщение.\n"
    "Отправьте «помощь», чтобы увидеть команды."
)
_EMPTY_CATALOG = (
    "Каталог DAM ALEM временно недоступен. Попробуйте позже или откройте меню на сайте."
)


def build_reply_text(intent: BotIntent, catalog: CatalogSnapshot) -> str:
    """Build a plain-text reply for the given intent and catalog snapshot."""
    brand = catalog.brand or "DAM ALEM"

    if intent.name == "help":
        return help_text(brand)

    if intent.name == "menu":
        if not catalog.categories:
            return _EMPTY_CATALOG
        lines = [f"📋 Меню {brand}", ""]
        for cat in catalog.categories:
            lines.append(f"• {cat.name}")
        lines.extend(
            [
                "",
                "Напишите: категория <название>",
                "или: найди <блюдо>",
            ]
        )
        return "\n".join(lines)

    if intent.name == "category":
        query = (intent.query or "").strip()
        if not query:
            return "Укажите категорию. Пример: категория пицца"
        cat = find_category(catalog, query)
        if cat is None:
            return (
                f"Категория «{query}» не найдена.\n"
                "Отправьте «меню», чтобы увидеть список."
            )
        dishes = items_in_category(catalog, cat.id)
        if not dishes:
            return f"В категории «{cat.name}» пока нет блюд."
        lines = [f"🍽 {cat.name}", ""]
        for item in dishes:
            lines.append(f"• {item.name} — {format_price(item.price)}")
        return "\n".join(lines)

    if intent.name == "search":
        query = (intent.query or "").strip()
        if not query:
            return "Что искать? Пример: найди шашлык"
        hits = search_items(catalog, query)
        if not hits:
            return f"По запросу «{query}» ничего не найдено."
        lines = [f"🔎 Найдено по «{query}»:", ""]
        for item in hits:
            lines.append(f"• {item.name} — {format_price(item.price)}")
        return "\n".join(lines)

    if intent.name == "lookup":
        query = (intent.query or "").strip()
        if not query:
            return help_text(brand)
        cat = find_category(catalog, query)
        if cat is not None:
            dishes = items_in_category(catalog, cat.id)
            lines = [f"🍽 {cat.name}", ""]
            if not dishes:
                lines.append("В этой категории пока нет блюд.")
            else:
                for item in dishes:
                    lines.append(f"• {item.name} — {format_price(item.price)}")
            return "\n".join(lines)
        hits = search_items(catalog, query)
        if hits:
            lines = [f"🔎 Похоже на «{query}»:", ""]
            for item in hits:
                lines.append(f"• {item.name} — {format_price(item.price)}")
            return "\n".join(lines)
        return (
            f"Не нашёл «{query}».\n"
            "Отправьте «меню» или «найди <название>».\n"
            "«помощь» — список команд."
        )

    return help_text(brand)


async def handle_inbound_message(
    db: AsyncSession,
    inbound: InboundWhatsAppMessage,
    *,
    config: Optional[WhatsAppBotConfig] = None,
    cloud_client: Optional[WhatsAppCloudClient] = None,
) -> None:
    """Process one inbound WhatsApp message: catalog reply only."""
    cfg = config or get_whatsapp_config()
    if not cfg.enabled:
        logger.info("whatsapp_handler skip disabled")
        return

    if inbound.event_kind != "message":
        logger.info("whatsapp_handler skip event_kind=%s", inbound.event_kind)
        return

    wa_id = (inbound.wa_id or "").strip()
    if not wa_id:
        logger.info("whatsapp_handler skip missing_wa_id")
        return

    wa_fp = wa_id_fingerprint(wa_id)
    store = get_session_store(ttl_seconds=cfg.session_ttl_seconds)
    message_id = (inbound.message_id or "").strip()
    if message_id and not store.mark_seen(wa_id, message_id):
        logger.info(
            "whatsapp_handler skip duplicate message_id=%s wa_fp=%s",
            message_id,
            wa_fp,
        )
        return

    client = cloud_client or WhatsAppCloudClient(cfg)

    text = (inbound.text or "").strip()
    msg_type = (inbound.message_type or "").lower()
    if not text:
        logger.info(
            "whatsapp_handler non_text_or_empty type=%s wa_fp=%s",
            msg_type or "-",
            wa_fp,
        )
        await client.send_text(wa_id, _ASK_TEXT)
        return

    # Never log full text / phone — fingerprint only.
    intent = parse_intent(text)
    logger.info(
        "whatsapp_handler intent=%s wa_fp=%s message_id=%s",
        intent.name,
        wa_fp,
        message_id or "-",
    )

    catalog = await load_catalog(db)
    reply = build_reply_text(intent, catalog)
    await client.send_text(wa_id, reply)
