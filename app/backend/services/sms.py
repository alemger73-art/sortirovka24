"""Phone verification code delivery: Telegram (Gateway or our bot), SMS (Mobizon).
WhatsApp is offered for sign-in only, in reverse: the person writes to our number (services/wa_login)."""

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


OTP_CHANNEL_ORDER = ("whatsapp", "telegram", "sms")


def _telegram_gateway_ready() -> bool:
    return bool(os.getenv("TELEGRAM_GATEWAY_TOKEN", "").strip())


def telegram_bot_mode() -> bool:
    """No paid Gateway: codes come from our own bot after the person shares the number."""
    if _telegram_gateway_ready():
        return False
    from services import telegram_login
    return telegram_login.enabled()


def _telegram_ready() -> bool:
    return _telegram_gateway_ready() or telegram_bot_mode()


# ── WhatsApp through our own WAHA (portal number +7 700 428 02 80) ──────────
_waha_state: dict[str, Any] = {"working": False, "checked": 0.0}


def _waha_configured() -> bool:
    return bool(os.getenv("WAHA_URL", "").strip() and os.getenv("WAHA_API_KEY", "").strip())


def _waha_ready() -> bool:
    return _waha_configured() and bool(_waha_state["working"])


def _waha_session() -> str:
    return os.getenv("WAHA_SESSION", "default").strip() or "default"


async def refresh_waha_status(force: bool = False) -> bool:
    """Is the WhatsApp session connected? Cached for a minute so the login page stays fast."""
    import time
    if not _waha_configured():
        _waha_state["working"] = False
        return False
    if not force and time.monotonic() - _waha_state["checked"] < 60:
        return bool(_waha_state["working"])
    base = os.getenv("WAHA_URL", "").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(f"{base}/api/sessions/{_waha_session()}",
                                 headers={"X-Api-Key": os.getenv("WAHA_API_KEY", "").strip()})
        _waha_state["working"] = r.status_code == 200 and (r.json() or {}).get("status") == "WORKING"
    except (httpx.HTTPError, ValueError):
        _waha_state["working"] = False
    _waha_state["checked"] = time.monotonic()
    from services import wa_guard
    await wa_guard.observe_session(bool(_waha_state["working"]))
    return bool(_waha_state["working"])


def _whatsapp_ready() -> bool:
    """WhatsApp login works only one way: the person writes to our WAHA number first (see services/wa_login)."""
    from services import wa_guard
    return _waha_ready() and wa_guard.offer_login()


def _sms_ready() -> bool:
    return _provider() == "mobizon" and bool(os.getenv("MOBIZON_API_KEY", "").strip())


def available_channels(include_whatsapp: bool = False) -> list[str]:
    """Channels a customer can pick, in display order. WhatsApp only for sign-in, where the person writes to us."""
    ready = {"whatsapp": include_whatsapp and _whatsapp_ready(), "telegram": _telegram_ready(), "sms": _sms_ready()}
    return [c for c in OTP_CHANNEL_ORDER if ready[c]]


async def send_verification_code(phone: str, code: str, channel: str | None = None) -> SMSDeliveryResult:
    """Send a login code to *phone* through Telegram or SMS. WhatsApp never gets a code from us:
    the number was restricted for writing first to people who had not written to it."""
    if channel == "whatsapp":
        raise SMSDeliveryError("Код в WhatsApp больше не отправляется. Выберите Telegram.")
    channels = available_channels()
    if channel and channel not in channels:
        raise SMSDeliveryError("Этот способ получения кода сейчас недоступен. Выберите другой.")
    chosen = channel or (channels[0] if channels else None)
    if chosen == "telegram":
        if not external_side_effects_allowed():
            logger.info("OTP side effects disabled. Skipping %s message.", chosen)
            return SMSDeliveryResult(delivered=False, pending_moderation=False, provider_message="external_side_effects_disabled")
        if telegram_bot_mode():
            return SMSDeliveryResult(delivered=False, pending_moderation=False, provider_message="telegram_bot")
        return await _send_telegram_gateway(phone, code)
    return await _send_sms_code(phone, code)


async def _send_telegram_gateway(phone: str, code: str) -> SMSDeliveryResult:
    """Telegram Gateway: the code arrives in the official «Verification Codes» chat.
    Undelivered codes are refunded by Telegram, so a number without Telegram costs nothing."""
    token = os.getenv("TELEGRAM_GATEWAY_TOKEN", "").strip()
    recipient = "+" + _digits_only(phone)
    base = os.getenv("TELEGRAM_GATEWAY_URL", "https://gatewayapi.telegram.org").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(f"{base}/sendVerificationMessage",
                headers={"Authorization": f"Bearer {token}"},
                json={"phone_number": recipient, "code": code, "ttl": 300})
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise SMSDeliveryError("Telegram сейчас недоступен. Попробуйте WhatsApp.") from exc
    if not isinstance(payload, dict) or not payload.get("ok"):
        error = str((payload or {}).get("error") or "") if isinstance(payload, dict) else ""
        logger.warning("[OTP] Telegram Gateway error=%s", error[:60])
        if "PHONE_NUMBER" in error.upper() or "NOT_FOUND" in error.upper():
            raise SMSDeliveryError("У этого номера нет Telegram. Выберите WhatsApp.")
        raise SMSDeliveryError("Не удалось отправить код в Telegram. Попробуйте WhatsApp.")
    result = payload.get("result") or {}
    return SMSDeliveryResult(delivered=True, pending_moderation=False, message_id=str(result.get("request_id") or ""), provider_message="telegram")


async def _send_sms_code(phone: str, code: str) -> SMSDeliveryResult:
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
