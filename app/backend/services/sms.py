"""SMS delivery for phone verification (Mobizon.kz)."""

import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MOBIZON_API_BASE = os.getenv("MOBIZON_API_URL", "https://api.mobizon.kz").rstrip("/")
MOBIZON_SEND_PATH = "/service/message/sendSmsMessage"
MOBIZON_STATUS_PATH = "/service/message/getSMSStatus"
SMS_SENDER = os.getenv("MOBIZON_SENDER", "").strip()

# Mobizon campaign status: 1 = awaiting moderation
MOBIZON_CAMPAIGN_MODERATION = 1


class SMSDeliveryError(Exception):
    """Raised when an SMS could not be delivered via the configured provider."""


@dataclass
class SMSDeliveryResult:
    delivered: bool
    pending_moderation: bool
    message_id: str | None = None
    provider_message: str = ""


def _digits_only(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    return digits


def _provider() -> str:
    return os.getenv("SMS_PROVIDER", "").strip().lower()


def _debug_mode() -> bool:
    return os.getenv("DEBUG", "").strip().lower() in ("1", "true", "yes", "on")


def _expose_code_enabled() -> bool:
    return os.getenv("SMS_EXPOSE_CODE", "").strip().lower() in ("1", "true", "yes", "on")


async def send_verification_code(phone: str, code: str) -> SMSDeliveryResult:
    """Send a registration verification code to *phone*."""
    provider = _provider()
    # Short text passes Mobizon moderation faster.
    text = f"Sortirovka24 kod: {code}"

    if provider == "mobizon":
        return await _send_mobizon(phone, text)

    if _debug_mode():
        logger.warning("[SMS] No provider configured — debug mode, SMS not sent to %s", phone)
        return SMSDeliveryResult(delivered=False, pending_moderation=False, provider_message="debug_mode")

    raise SMSDeliveryError("SMS provider is not configured")


def should_expose_code_on_screen(result: SMSDeliveryResult) -> bool:
    if _debug_mode() or _expose_code_enabled():
        return True
    # Only show on-screen when SMS is genuinely pending (Mobizon moderation, etc.)
    return result.pending_moderation


async def _mobizon_post(path: str, *, params: dict[str, Any] | None = None, data: dict[str, str] | None = None) -> dict[str, Any]:
    api_key = os.getenv("MOBIZON_API_KEY", "").strip()
    if not api_key:
        raise SMSDeliveryError("MOBIZON_API_KEY is not set")

    query = {"output": "json", "api": "v1", "apiKey": api_key, **(params or {})}
    url = f"{MOBIZON_API_BASE}{path}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(url, params=query, data=data or {})
        response.raise_for_status()
        payload = response.json()

    api_code = payload.get("code")
    if api_code not in (0, "0", None):
        message = payload.get("message") or payload.get("data") or "Unknown Mobizon error"
        raise SMSDeliveryError(str(message))
    return payload


async def _send_mobizon(phone: str, text: str) -> SMSDeliveryResult:
    recipient = _digits_only(phone)
    if len(recipient) < 11:
        raise SMSDeliveryError("Invalid phone number for SMS")

    payload: dict[str, Any] = {}
    try:
        send_data: dict[str, str] = {"recipient": recipient, "text": text}
        if SMS_SENDER:
            send_data["from"] = SMS_SENDER
        payload = await _mobizon_post(MOBIZON_SEND_PATH, data=send_data)
    except httpx.HTTPError as exc:
        logger.error("[SMS] Mobizon HTTP error: %s", exc)
        raise SMSDeliveryError("Mobizon request failed") from exc
    except ValueError as exc:
        logger.error("[SMS] Mobizon returned non-JSON response")
        raise SMSDeliveryError("Mobizon returned invalid response") from exc

    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    message_id = str(data.get("messageId") or data.get("message_id") or "")
    campaign_status = data.get("status")
    pending_moderation = campaign_status in (MOBIZON_CAMPAIGN_MODERATION, "1", 1)

    if message_id:
        try:
            status_payload = await _mobizon_post(
                MOBIZON_STATUS_PATH,
                data={"ids[0]": message_id},
            )
            status_rows = status_payload.get("data")
            if isinstance(status_rows, list) and status_rows:
                row = status_rows[0]
                status_name = str(row.get("status") or "").upper()
                if status_name in {"MODERATION", "PENDING", "NEW", "QUEUED"}:
                    pending_moderation = True
                if status_name in {"DELIVERED", "SENT"}:
                    pending_moderation = False
        except Exception as exc:
            logger.warning("[SMS] Could not fetch Mobizon status for %s: %s", message_id, exc)
            pending_moderation = True
    else:
        # Mobizon accepted the request but delivery is not confirmed yet.
        pending_moderation = True

    logger.info(
        "[SMS] Mobizon messageId=%s recipient=%s pending_moderation=%s",
        message_id or "n/a",
        recipient,
        pending_moderation,
    )
    return SMSDeliveryResult(
        delivered=not pending_moderation,
        pending_moderation=pending_moderation,
        message_id=message_id or None,
        provider_message=str(payload.get("message") or ""),
    )
