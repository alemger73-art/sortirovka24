"""Stage 2 inbound message handler: sessions + catalog + Cloud API replies."""

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


def _format_categories(catalog: CatalogSnapshot) -> str:
    if not catalog.categories:
        return f"{catalog.restaurant_name}: категории пока недоступны."
    lines = [f"📋 *{catalog.restaurant_name}* — категории:"]
    for idx, cat in enumerate(catalog.categories[:20], 1):
        lines.append(f"{idx}. {cat.name}")
    lines.append("")
    lines.append("Напишите название категории, например: *пицца*")
    if catalog.working_hours:
        lines.append(f"⏰ {catalog.working_hours}")
    if catalog.min_order_amount > 0:
        lines.append(f"Мин. заказ: {format_price(catalog.min_order_amount)}")
    return "\n".join(lines)


def _format_items(title: str, items, *, empty_hint: str) -> str:
    if not items:
        return empty_hint
    lines = [title, ""]
    for item in items:
        lines.append(f"• {item.name} — {format_price(item.price)}")
    lines.append("")
    lines.append("Напишите *меню* для списка категорий.")
    return "\n".join(lines)


def build_reply_text(intent: BotIntent, catalog: CatalogSnapshot) -> str:
    brand = catalog.restaurant_name or "DAM ALEM"

    if intent.name == "help":
        return help_text(brand=brand)

    if intent.name == "menu":
        return _format_categories(catalog)

    if intent.name == "category":
        cat = find_category(catalog.categories, intent.query)
        if not cat:
            return (
                f"Категория «{intent.query}» не найдена.\n"
                "Напишите *меню*, чтобы увидеть список."
            )
        items = items_in_category(catalog.items, cat.id)
        return _format_items(
            f"*{cat.name}*:",
            items,
            empty_hint=f"В категории «{cat.name}» пока нет блюд.",
        )

    if intent.name == "search":
        found = search_items(catalog.items, intent.query)
        return _format_items(
            f"Поиск «{intent.query}»:",
            found,
            empty_hint=f"Ничего не нашли по запросу «{intent.query}». Напишите *меню*.",
        )

    if intent.name == "lookup":
        cat = find_category(catalog.categories, intent.query)
        if cat:
            items = items_in_category(catalog.items, cat.id)
            return _format_items(
                f"*{cat.name}*:",
                items,
                empty_hint=f"В категории «{cat.name}» пока нет блюд.",
            )
        found = search_items(catalog.items, intent.query)
        if found:
            return _format_items(
                f"Нашли по «{intent.query}»:",
                found,
                empty_hint="",
            )
        return (
            f"Не понял запрос «{intent.query}».\n"
            "Напишите *меню*, *помощь* или название блюда."
        )

    return help_text(brand=brand)


async def handle_inbound_message(
    db: AsyncSession,
    inbound: InboundWhatsAppMessage,
    *,
    config: Optional[WhatsAppBotConfig] = None,
    cloud_client: Optional[WhatsAppCloudClient] = None,
) -> None:
    """Process one inbound WhatsApp message. Never creates food orders."""
    cfg = config or get_whatsapp_config()
    if not cfg.enabled:
        return
    if inbound.event_kind != "message" or not inbound.wa_id:
        return

    store = get_session_store(ttl_seconds=cfg.session_ttl_seconds)
    if inbound.message_id and not store.mark_seen(inbound.wa_id, inbound.message_id):
        logger.info(
            "whatsapp_handler duplicate message_id=%s wa_fp=%s",
            inbound.message_id,
            wa_id_fingerprint(inbound.wa_id),
        )
        return

    session = store.get_or_create(inbound.wa_id)
    client = cloud_client or WhatsAppCloudClient(cfg)

    if inbound.message_type and inbound.message_type != "text":
        await client.send_text(
            to_wa_id=inbound.wa_id,
            body="Пока понимаю только текст. Напишите *меню* или *помощь*.",
        )
        session.last_intent = "unsupported_type"
        return

    intent = parse_intent(inbound.text or "")
    session.last_intent = intent.name

    try:
        catalog = await load_catalog(db)
    except Exception:
        logger.exception(
            "whatsapp_handler catalog load failed wa_fp=%s",
            wa_id_fingerprint(inbound.wa_id),
        )
        await client.send_text(
            to_wa_id=inbound.wa_id,
            body="Меню временно недоступно. Попробуйте чуть позже или откройте сайт /food.",
        )
        return

    if intent.name == "category" and intent.query:
        cat = find_category(catalog.categories, intent.query)
        if cat:
            session.last_category_id = cat.id
            session.last_category_name = cat.name

    reply = build_reply_text(intent, catalog)
    # Do not log reply content length with user text — only metadata.
    logger.info(
        "whatsapp_handler intent=%s message_id=%s wa_fp=%s restaurant_id=%s",
        intent.name,
        inbound.message_id,
        wa_id_fingerprint(inbound.wa_id),
        catalog.restaurant_id,
    )
    await client.send_text(to_wa_id=inbound.wa_id, body=reply)
