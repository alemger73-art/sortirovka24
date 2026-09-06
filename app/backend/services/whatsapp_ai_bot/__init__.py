"""Official WhatsApp AI bot for DAM ALEM — isolated server module.

Stage 1: webhook verification + signed ingress.
Stage 2: sessions + read-only catalog + Cloud API text replies.
No OpenAI. No order creation.
"""

from services.whatsapp_ai_bot.commands import BotIntent, parse_intent
from services.whatsapp_ai_bot.config import WhatsAppBotConfig, get_whatsapp_config
from services.whatsapp_ai_bot.ingress import (
    InboundWhatsAppMessage,
    ParsedWhatsAppEvent,
    extract_inbound_message,
    parse_webhook_payload,
)
from services.whatsapp_ai_bot.verify import (
    SignatureResult,
    VerifyChallengeResult,
    verify_meta_signature,
    verify_webhook_challenge,
)

__all__ = [
    "BotIntent",
    "InboundWhatsAppMessage",
    "ParsedWhatsAppEvent",
    "SignatureResult",
    "VerifyChallengeResult",
    "WhatsAppBotConfig",
    "extract_inbound_message",
    "get_whatsapp_config",
    "parse_intent",
    "parse_webhook_payload",
    "verify_meta_signature",
    "verify_webhook_challenge",
]
