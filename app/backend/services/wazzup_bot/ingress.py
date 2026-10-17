"""Parse Wazzup v3 webhook payloads into simple inbound events."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

SUPPORTED_CHAT_TYPES = {"whatsapp", "instagram"}


@dataclass(frozen=True)
class WazzupMessage:
    message_id: str
    channel_id: str
    chat_type: str
    chat_id: str
    msg_type: str
    status: str
    text: str
    is_echo: bool
    contact_name: str
    contact_phone: str
    is_deleted: bool = False
    is_edited: bool = False

    @property
    def key(self):
        return (self.channel_id, self.chat_type, self.chat_id)

    @property
    def inbound(self) -> bool:
        return not self.is_echo and self.status == "inbound"


def parse_messages(payload: object) -> List[WazzupMessage]:
    if not isinstance(payload, dict):
        return []
    raw = payload.get("messages")
    if not isinstance(raw, list):
        return []
    out: List[WazzupMessage] = []
    for m in raw:
        if not isinstance(m, dict):
            continue
        chat_type = str(m.get("chatType") or "")
        chat_id = str(m.get("chatId") or "").strip()
        channel_id = str(m.get("channelId") or "").strip()
        if chat_type not in SUPPORTED_CHAT_TYPES or not chat_id or not channel_id:
            continue
        contact = m.get("contact") if isinstance(m.get("contact"), dict) else {}
        out.append(
            WazzupMessage(
                message_id=str(m.get("messageId") or ""),
                channel_id=channel_id,
                chat_type=chat_type,
                chat_id=chat_id,
                msg_type=str(m.get("type") or ""),
                status=str(m.get("status") or ""),
                text=str(m.get("text") or ""),
                is_echo=bool(m.get("isEcho")),
                contact_name=str(contact.get("name") or "").strip(),
                contact_phone=str(contact.get("phone") or "").strip(),
                is_deleted=bool(m.get("isDeleted")),
                is_edited=bool(m.get("isEdited")),
            )
        )
    return out


def is_test_ping(payload: object) -> bool:
    return isinstance(payload, dict) and payload.get("test") is True


def whatsapp_phone(chat_id: str) -> Optional[str]:
    """WhatsApp chatId is the customer's number (digits); verified by WhatsApp itself."""
    digits = "".join(c for c in chat_id if c.isdigit())
    return digits or None
