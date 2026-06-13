"""SMS delivery for phone verification (Mobizon.kz)."""

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MOBIZON_API_BASE = os.getenv("MOBIZON_API_URL", "https://api.mobizon.kz").rstrip("/")
MOBIZON_SEND_PATH = "/service/message/sendSmsMessage"
SMS_SENDER = os.getenv("MOBIZON_SENDER", "").strip()


class SMSDeliveryError(Exception):
    """Raised when an SMS could not be delivered via the configured provider."""


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


async def send_verification_code(phone: str, code: str) -> None:
    """Send a registration verification code to *phone*."""
    provider = _provider()
    text = f"Код подтверждения Sortirovka24: {code}. Действует 5 мин."

    if provider == "mobizon":
        await _send_mobizon(phone, text)
        return

    if _debug_mode():
        logger.warning("[SMS] No provider configured — debug mode, SMS not sent to %s", phone)
        return

    raise SMSDeliveryError("SMS provider is not configured")


async def _send_mobizon(phone: str, text: str) -> None:
    api_key = os.getenv("MOBIZON_API_KEY", "").strip()
    if not api_key:
        raise SMSDeliveryError("MOBIZON_API_KEY is not set")

    recipient = _digits_only(phone)
    if len(recipient) < 11:
        raise SMSDeliveryError("Invalid phone number for SMS")

    url = f"{MOBIZON_API_BASE}{MOBIZON_SEND_PATH}"
    params: dict[str, Any] = {
        "output": "json",
        "api": "v1",
        "apiKey": api_key,
    }
    data: dict[str, str] = {
        "recipient": recipient,
        "text": text,
    }
    if SMS_SENDER:
        data["from"] = SMS_SENDER

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(url, params=params, data=data)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        logger.error("[SMS] Mobizon HTTP error: %s", exc)
        raise SMSDeliveryError("Mobizon request failed") from exc
    except ValueError as exc:
        logger.error("[SMS] Mobizon returned non-JSON response")
        raise SMSDeliveryError("Mobizon returned invalid response") from exc

    code = payload.get("code")
    if code not in (0, "0", None):
        message = payload.get("message") or payload.get("data") or "Unknown Mobizon error"
        logger.error("[SMS] Mobizon API error code=%s message=%s", code, message)
        raise SMSDeliveryError(str(message))

    message_id = (payload.get("data") or {}).get("messageId") if isinstance(payload.get("data"), dict) else None
    logger.info("[SMS] Sent to %s via Mobizon (messageId=%s)", recipient, message_id or "n/a")
