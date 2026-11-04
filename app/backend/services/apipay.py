"""ApiPay.kz: a Kaspi invoice sent to the payer's phone number (https://apipay.kz/apipay-api-docs.md).

The payer gets the invoice in the Kaspi app; ApiPay reports the outcome with a signed webhook
(`invoice.status_changed`). Keys live only in the server environment:
APIPAY_API_KEY (X-API-Key header) and APIPAY_WEBHOOK_SECRET (HMAC-SHA256 of the raw webhook body)."""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("APIPAY_BASE_URL", "https://api.apipay.kz/api/v1").rstrip("/")
DESCRIPTION_LIMIT = 60  # Kaspi shows the payer only the first 60 characters


class ApiPayError(Exception):
    """The invoice was not created; the message is safe to show the payer, `code` is ApiPay's error_code."""

    def __init__(self, message: str, code: str = ""):
        super().__init__(message)
        self.code = code


def api_key() -> str:
    return os.getenv("APIPAY_API_KEY", "").strip()


def enabled() -> bool:
    return bool(api_key() and os.getenv("APIPAY_WEBHOOK_SECRET", "").strip())


def kaspi_phone(value: str) -> str:
    """ApiPay expects 8XXXXXXXXXX."""
    digits = re.sub(r"\D", "", value or "")[-10:]
    if len(digits) != 10 or not digits.startswith("7"):
        raise ApiPayError("Нужен казахстанский номер телефона с Kaspi")
    return "8" + digits


async def create_invoice(*, phone: str, amount: int, description: str, order_id: str) -> dict[str, Any]:
    """Asks ApiPay to send a Kaspi invoice. Returns the invoice (status `processing`)."""
    body = {"phone_number": kaspi_phone(phone), "amount": int(amount), "description": description[:DESCRIPTION_LIMIT],
            "external_order_id": order_id, "external_order_id_idempotency": order_id}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(f"{BASE_URL}/invoices", json=body,
                                         headers={"X-API-Key": api_key(), "Accept": "application/json"})
    except httpx.HTTPError as exc:
        raise ApiPayError("Kaspi сейчас не отвечает. Попробуйте через пару минут.") from exc
    data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if response.status_code >= 400:
        code = str(data.get("error_code") or response.status_code)
        logger.warning("[ApiPay] invoice for %s refused: %s %s", order_id, code, data.get("message"))
        raise ApiPayError("Не получилось выставить счёт в Kaspi. Попробуйте позже.", code)
    return data


def valid_signature(raw_body: bytes, signature: str | None) -> bool:
    secret = os.getenv("APIPAY_WEBHOOK_SECRET", "").strip()
    if not secret or not signature:
        return False
    expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())
