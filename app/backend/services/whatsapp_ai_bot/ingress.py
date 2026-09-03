"""Parse Meta WhatsApp Cloud API webhook payloads without logging PII."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger(__name__)


def wa_id_fingerprint(value: str) -> str:
    """Stable non-reversible short hash for logs (not the phone / wa_id itself)."""
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()
    return digest[:12]


def _fingerprint(value: str) -> str:
    return wa_id_fingerprint(value)


@dataclass(frozen=True)
class ParsedWhatsAppEvent:
    """Minimal safe view of one inbound Meta webhook."""

    object_type: Optional[str]
    event_kind: str  # message | status | unknown | empty
    message_id: Optional[str] = None
    wa_id_fingerprint: Optional[str] = None
    message_type: Optional[str] = None
    entry_count: int = 0
    has_contacts: bool = False
    notes: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class InboundWhatsAppMessage:
    """Inbound message fields needed to reply (not for logging PII)."""

    event_kind: str
    message_id: Optional[str]
    wa_id: Optional[str]
    message_type: Optional[str]
    text: Optional[str]


def _first_message_and_contact(
    value: dict[str, Any],
) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]], Optional[dict[str, Any]]]:
    """Return (message, contact, status) from the first change value, if any."""
    messages = value.get("messages")
    contacts = value.get("contacts")
    statuses = value.get("statuses")
    message = messages[0] if isinstance(messages, list) and messages else None
    contact = contacts[0] if isinstance(contacts, list) and contacts else None
    status = statuses[0] if isinstance(statuses, list) and statuses else None
    return (
        message if isinstance(message, dict) else None,
        contact if isinstance(contact, dict) else None,
        status if isinstance(status, dict) else None,
    )


def _extract_message_text(message: dict[str, Any]) -> Optional[str]:
    """Pull user-visible text from text / button / interactive payloads."""
    msg_type = str(message.get("type") or "").lower()

    if msg_type == "text":
        text_obj = message.get("text")
        if isinstance(text_obj, dict):
            body = text_obj.get("body")
            if body is not None and str(body).strip():
                return str(body).strip()
        return None

    if msg_type == "button":
        button = message.get("button")
        if isinstance(button, dict):
            for key in ("text", "payload"):
                val = button.get(key)
                if val is not None and str(val).strip():
                    return str(val).strip()
        return None

    if msg_type == "interactive":
        interactive = message.get("interactive")
        if not isinstance(interactive, dict):
            return None
        for reply_key in ("button_reply", "list_reply"):
            reply = interactive.get(reply_key)
            if isinstance(reply, dict):
                for key in ("title", "id", "description"):
                    val = reply.get(key)
                    if val is not None and str(val).strip():
                        return str(val).strip()
        return None

    return None


def _iter_change_values(payload: dict[str, Any]):
    entries = payload.get("entry")
    if not isinstance(entries, list):
        return
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        changes = entry.get("changes")
        if not isinstance(changes, list):
            continue
        for change in changes:
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if isinstance(value, dict):
                yield value


def parse_webhook_payload(payload: Any) -> ParsedWhatsAppEvent:
    """Extract message id, wa_id fingerprint and message type from Meta webhook JSON.

    Does not retain message body text or raw phone numbers for logging.
    Unknown / malformed shapes are handled safely.
    """
    if not isinstance(payload, dict):
        return ParsedWhatsAppEvent(
            object_type=None,
            event_kind="unknown",
            notes=("non_object_payload",),
        )

    object_type = payload.get("object")
    object_type_str = str(object_type) if object_type is not None else None
    entries = payload.get("entry")
    if not isinstance(entries, list):
        return ParsedWhatsAppEvent(
            object_type=object_type_str,
            event_kind="unknown",
            notes=("missing_entry",),
        )

    entry_count = len(entries)
    if entry_count == 0:
        return ParsedWhatsAppEvent(
            object_type=object_type_str,
            event_kind="empty",
            entry_count=0,
            notes=("empty_entry",),
        )

    # Walk first usable change; ignore unknown shapes.
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        changes = entry.get("changes")
        if not isinstance(changes, list):
            continue
        for change in changes:
            if not isinstance(change, dict):
                continue
            value = change.get("value")
            if not isinstance(value, dict):
                continue

            message, contact, status = _first_message_and_contact(value)

            wa_raw: Optional[str] = None
            if contact:
                wa_raw = contact.get("wa_id")
            if not wa_raw and isinstance(message, dict):
                wa_raw = message.get("from")
            if not wa_raw and isinstance(status, dict):
                wa_raw = status.get("recipient_id")

            wa_fp = _fingerprint(str(wa_raw)) if wa_raw else None

            if message:
                msg_id = message.get("id")
                msg_type = message.get("type")
                return ParsedWhatsAppEvent(
                    object_type=object_type_str,
                    event_kind="message",
                    message_id=str(msg_id) if msg_id else None,
                    wa_id_fingerprint=wa_fp,
                    message_type=str(msg_type) if msg_type else "unknown",
                    entry_count=entry_count,
                    has_contacts=contact is not None,
                )

            if status:
                st_id = status.get("id")
                st_type = status.get("status")
                return ParsedWhatsAppEvent(
                    object_type=object_type_str,
                    event_kind="status",
                    message_id=str(st_id) if st_id else None,
                    wa_id_fingerprint=wa_fp,
                    message_type=str(st_type) if st_type else "status",
                    entry_count=entry_count,
                    has_contacts=False,
                )

    return ParsedWhatsAppEvent(
        object_type=object_type_str,
        event_kind="unknown",
        entry_count=entry_count,
        notes=("no_message_or_status",),
    )


def extract_inbound_message(payload: Any) -> Optional[InboundWhatsAppMessage]:
    """Extract the first inbound message (with text when available).

    Returns None when the payload has no message object.
    """
    if not isinstance(payload, dict):
        return None

    for value in _iter_change_values(payload):
        message, contact, _status = _first_message_and_contact(value)
        if not message:
            continue

        wa_raw: Optional[str] = None
        if contact:
            raw = contact.get("wa_id")
            if raw is not None and str(raw).strip():
                wa_raw = str(raw).strip()
        if not wa_raw:
            raw_from = message.get("from")
            if raw_from is not None and str(raw_from).strip():
                wa_raw = str(raw_from).strip()

        msg_id = message.get("id")
        msg_type = message.get("type")
        return InboundWhatsAppMessage(
            event_kind="message",
            message_id=str(msg_id) if msg_id else None,
            wa_id=wa_raw,
            message_type=str(msg_type) if msg_type else "unknown",
            text=_extract_message_text(message),
        )

    return None


def log_parsed_event(event: ParsedWhatsAppEvent, *, enabled: bool) -> None:
    """Info-level log without customer text or phone numbers."""
    logger.info(
        "whatsapp_webhook event_kind=%s message_type=%s message_id=%s "
        "wa_fp=%s entries=%s object=%s bot_enabled=%s notes=%s",
        event.event_kind,
        event.message_type,
        event.message_id,
        event.wa_id_fingerprint,
        event.entry_count,
        event.object_type,
        enabled,
        ",".join(event.notes) if event.notes else "-",
    )
