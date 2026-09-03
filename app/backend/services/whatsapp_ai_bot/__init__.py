"""Official WhatsApp AI bot for DAM ALEM — isolated server module.

Stage 1: webhook verification + signed ingress only.
No OpenAI, no outbound replies, no order creation.
"""

from services.whatsapp_ai_bot.config import WhatsAppBotConfig, get_whatsapp_config
from services.whatsapp_ai_bot.ingress import ParsedWhatsAppEvent, parse_webhook_payload
from services.whatsapp_ai_bot.verify import (
    SignatureResult,
    VerifyChallengeResult,
    verify_meta_signature,
    verify_webhook_challenge,
)

__all__ = [
    "ParsedWhatsAppEvent",
    "SignatureResult",
    "VerifyChallengeResult",
    "WhatsAppBotConfig",
    "get_whatsapp_config",
    "parse_webhook_payload",
    "verify_meta_signature",
    "verify_webhook_challenge",
]
