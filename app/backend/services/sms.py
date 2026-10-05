"""SMS delivery for phone verification (Mobizon.kz)."""

import logging
import os
from dataclasses import dataclass
from typing import Any

import httpx
from core.deploy_safety import external_side_effects_allowed
from core.env import is_production

logger = logging.getLogger(__name__)

MOBIZON_API_BASE = os.getenv("MOBIZON_API_URL", "https://api.mobizon.kz").rstrip("/")
MOBIZON_SEND_PATH = "/service/message/sendSmsMessage"
MOBIZON_STATUS_PATH = "/service/message/getSMSStatus"
SMS_SENDER = os.getenv("MOBIZON_SENDER", "").strip()

# Mobizon campaign status: 1 = awaiting moderation
MOBIZON_CAMPAIGN_MODERATION = 1
MOBIZON_FAILED_STATUSES = {"UNDELIV", "REJECTD", "EXPIRED", "DELETED"}


class SMSDeliveryError(Exception):
    """Raised when an SMS could not be delivered via the configured provider."""


@dataclass
class SMSDeliveryResult:
    delivered: bool
    pending_moderation: bool
    message_id: str | None = None
    provider_message: str = ""
    provider_status: str = ""


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
    if not external_side_effects_allowed():
        logger.info("SMS side effects disabled. Skipping verification message.")
        return SMSDeliveryResult(
            delivered=False,
            pending_moderation=False,
            provider_message="external_side_effects_disabled",
        )
    provider = _provider()
    # Keep this exact text aligned with the provider-approved OTP template.
    text = f"Sortirovka24 kod: {code}"

    if provider == "mobizon":
        return await _send_mobizon(phone, text)

    if _debug_mode() and not is_production():
        logger.warning("[SMS] No provider configured — debug mode, SMS not sent to %s", phone)
        return SMSDeliveryResult(delivered=False, pending_moderation=False, provider_message="debug_mode")

    raise SMSDeliveryError("SMS provider is not configured")


def should_expose_code_on_screen(result: SMSDeliveryResult) -> bool:
    # Verification codes must never be returned to a production browser.  A
    # delayed provider response is not a safe reason to bypass phone ownership.
    return not is_production() and (_debug_mode() or _expose_code_enabled())


async def _mobizon_post(path: str, *, params: dict[str, Any] | None = None, data: dict[str, str] | None = None) -> dict[str, Any]:
    api_key = os.getenv("MOBIZON_API_KEY", "").strip()
    if not api_key:
        raise SMSDeliveryError("MOBIZON_API_KEY is not set")

    form = {**(params or {}), **(data or {}), "output": "json", "api": "v1", "apiKey": api_key}
    url = f"{MOBIZON_API_BASE}{path}"

    async with httpx.AsyncClient(timeout=20.0) as client:
        # Mobizon accepts POST parameters. Keep credentials out of request URLs
        # which HTTP clients and proxies commonly log.
        response = await client.post(url, data=form)
        response.raise_for_status()
        try:
            payload = response.json()
        except ValueError as exc:
            raise SMSDeliveryError("SMS-сервис вернул некорректный ответ") from exc

    if not isinstance(payload, dict) or payload.get("code") is None:
        raise SMSDeliveryError("Mobizon returned invalid response")
    api_code = str(payload["code"])
    if api_code != "0":
        safe_code = api_code if api_code.isdecimal() else "unknown"
        logger.warning("[SMS] Mobizon API error code=%s", safe_code)
        # Provider diagnostics may contain the recipient, message or API key.
        # Only a bounded error code may reach the browser.
        raise SMSDeliveryError(f"Mobizon отклонил запрос (код {safe_code}).")
    return payload


async def _send_mobizon(phone: str, text: str) -> SMSDeliveryResult:
    recipient = _digits_only(phone)
    if len(recipient) != 11 or not recipient.startswith("7") or not recipient.isascii():
        raise SMSDeliveryError("Invalid phone number for SMS")

    payload: dict[str, Any] = {}
    try:
        send_data: dict[str, str] = {"recipient": recipient, "text": text}
        if SMS_SENDER:
            send_data["from"] = SMS_SENDER
        payload = await _mobizon_post(MOBIZON_SEND_PATH, data=send_data)
    except httpx.HTTPError as exc:
        logger.error("[SMS] Mobizon HTTP error: %s", type(exc).__name__)
        raise SMSDeliveryError("Mobizon request failed") from exc
    except ValueError as exc:
        logger.error("[SMS] Mobizon returned non-JSON response")
        raise SMSDeliveryError("Mobizon returned invalid response") from exc

    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    message_id = str(data.get("messageId") or data.get("message_id") or "")
    campaign_status = data.get("status")
    pending_moderation = campaign_status in (MOBIZON_CAMPAIGN_MODERATION, "1", 1)
    status_name = ""

    if message_id:
        try:
            status_payload = await _mobizon_post(
                MOBIZON_STATUS_PATH,
                data={"ids[0]": message_id},
            )
            status_rows = status_payload.get("data")
            row = None
            if isinstance(status_rows, list):
                row = next((item for item in status_rows if isinstance(item, dict) and str(item.get("id")) == message_id), None)
            elif isinstance(status_rows, dict):
                row = status_rows.get(message_id)
                if row is None:
                    row = next((item for item in status_rows.values() if isinstance(item, dict) and str(item.get("id")) == message_id), None)
            if isinstance(row, dict):
                status_name = str(row.get("status") or "").upper()
                if status_name in {"DELIVRD", "ENQUEUD", "ACCEPTD", "PDLIVRD"}:
                    pending_moderation = False
        except Exception as exc:
            logger.warning("[SMS] Could not fetch Mobizon status for %s: %s", message_id, type(exc).__name__)
    else:
        # Mobizon accepted the request but delivery is not confirmed yet.
        pending_moderation = True

    if status_name in MOBIZON_FAILED_STATUSES:
        logger.warning("[SMS] Mobizon messageId=%s delivery_status=%s", message_id, status_name)
        raise SMSDeliveryError(f"SMS не доставлено (статус {status_name}).")

    logger.info(
        "[SMS] Mobizon messageId=%s recipient_suffix=%s status=%s pending_moderation=%s",
        message_id or "n/a",
        recipient[-4:],
        status_name or "unconfirmed",
        pending_moderation,
    )
    return SMSDeliveryResult(
        delivered=status_name == "DELIVRD",
        pending_moderation=pending_moderation,
        message_id=message_id or None,
        provider_message=str(payload.get("message") or ""),
        provider_status=status_name,
    )
