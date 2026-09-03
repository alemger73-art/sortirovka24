"""Official WhatsApp AI bot for DAM ALEM — isolated server module.

Stage 1: webhook verification + signed ingress.
Stage 2: in-memory sessions, read-only DAM ALEM catalog, Cloud API text replies.
No OpenAI. No order creation.
"""

from services.whatsapp_ai_bot.catalog import (
    CatalogCategory,
    CatalogItem,
    CatalogSnapshot,
    find_category,
    format_price,
    is_dam_alem_name,
    items_in_category,
    load_catalog,
    resolve_dam_alem_restaurant_id,
    search_items,
)
from services.whatsapp_ai_bot.cloud_api import WhatsAppCloudClient
from services.whatsapp_ai_bot.commands import BotIntent, help_text, parse_intent
from services.whatsapp_ai_bot.config import WhatsAppBotConfig, get_whatsapp_config
from services.whatsapp_ai_bot.handler import build_reply_text, handle_inbound_message
from services.whatsapp_ai_bot.ingress import (
    InboundWhatsAppMessage,
    ParsedWhatsAppEvent,
    extract_inbound_message,
    parse_webhook_payload,
    wa_id_fingerprint,
)
from services.whatsapp_ai_bot.session_store import (
    InMemorySessionStore,
    get_session_store,
    reset_session_store_for_tests,
)
from services.whatsapp_ai_bot.verify import (
    SignatureResult,
    VerifyChallengeResult,
    verify_meta_signature,
    verify_webhook_challenge,
)

__all__ = [
    "BotIntent",
    "CatalogCategory",
    "CatalogItem",
    "CatalogSnapshot",
    "InMemorySessionStore",
    "InboundWhatsAppMessage",
    "ParsedWhatsAppEvent",
    "SignatureResult",
    "VerifyChallengeResult",
    "WhatsAppBotConfig",
    "WhatsAppCloudClient",
    "build_reply_text",
    "extract_inbound_message",
    "find_category",
    "format_price",
    "get_session_store",
    "get_whatsapp_config",
    "handle_inbound_message",
    "help_text",
    "is_dam_alem_name",
    "items_in_category",
    "load_catalog",
    "parse_intent",
    "parse_webhook_payload",
    "reset_session_store_for_tests",
    "resolve_dam_alem_restaurant_id",
    "search_items",
    "verify_meta_signature",
    "verify_webhook_challenge",
    "wa_id_fingerprint",
]
