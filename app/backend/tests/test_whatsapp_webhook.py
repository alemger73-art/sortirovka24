"""Stage 1 WhatsApp webhook: Meta verify challenge + HMAC ingress (no OpenAI / orders)."""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from httpx import ASGITransport, AsyncClient

from main import app
from services.whatsapp_ai_bot.ingress import parse_webhook_payload
from services.whatsapp_ai_bot.verify import verify_meta_signature, verify_webhook_challenge


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _sign(body: bytes, secret: str) -> str:
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


SAMPLE_MESSAGE_PAYLOAD = {
    "object": "whatsapp_business_account",
    "entry": [
        {
            "id": "WABA_ID",
            "changes": [
                {
                    "field": "messages",
                    "value": {
                        "messaging_product": "whatsapp",
                        "metadata": {
                            "display_phone_number": "77001234567",
                            "phone_number_id": "PHONE_ID",
                        },
                        "contacts": [
                            {
                                "profile": {"name": "Test User"},
                                "wa_id": "77009876543",
                            }
                        ],
                        "messages": [
                            {
                                "from": "77009876543",
                                "id": "wamid.TEST_MESSAGE_001",
                                "timestamp": "1710000000",
                                "type": "text",
                                "text": {"body": "SECRET_CLIENT_TEXT_SHOULD_NOT_APPEAR"},
                            }
                        ],
                    },
                }
            ],
        }
    ],
}


# ---------- unit: verify challenge ----------


def test_verify_challenge_success():
    result = verify_webhook_challenge(
        mode="subscribe",
        verify_token="my-verify-token",
        challenge="1234567890",
        expected_token="my-verify-token",
    )
    assert result.ok is True
    assert result.challenge == "1234567890"


def test_verify_challenge_wrong_token():
    result = verify_webhook_challenge(
        mode="subscribe",
        verify_token="wrong",
        challenge="123",
        expected_token="expected",
    )
    assert result.ok is False
    assert result.reason == "verify_token_mismatch"


# ---------- unit: HMAC ----------


def test_hmac_signature_valid():
    body = b'{"object":"whatsapp_business_account"}'
    secret = "app-secret-for-tests"
    header = _sign(body, secret)
    result = verify_meta_signature(raw_body=body, signature_header=header, app_secret=secret)
    assert result.ok is True


def test_hmac_signature_invalid():
    body = b'{"object":"whatsapp_business_account"}'
    result = verify_meta_signature(
        raw_body=body,
        signature_header="sha256=" + ("ab" * 32),
        app_secret="app-secret-for-tests",
    )
    assert result.ok is False
    assert result.reason == "signature_mismatch"


def test_hmac_signature_missing():
    result = verify_meta_signature(
        raw_body=b"{}",
        signature_header=None,
        app_secret="app-secret-for-tests",
    )
    assert result.ok is False
    assert result.reason == "missing_signature"


# ---------- unit: ingress privacy / unknown ----------


def test_parse_message_extracts_safe_fields_only():
    event = parse_webhook_payload(SAMPLE_MESSAGE_PAYLOAD)
    assert event.event_kind == "message"
    assert event.message_id == "wamid.TEST_MESSAGE_001"
    assert event.message_type == "text"
    assert event.wa_id_fingerprint
    assert len(event.wa_id_fingerprint) == 12
    # fingerprint must not equal raw wa_id / phone
    assert event.wa_id_fingerprint != "77009876543"
    dumped = json.dumps(event.__dict__)
    assert "SECRET_CLIENT_TEXT_SHOULD_NOT_APPEAR" not in dumped
    assert "77009876543" not in dumped


def test_parse_unknown_webhook_type_safe():
    event = parse_webhook_payload({"object": "page", "entry": [{"weird": True}]})
    assert event.event_kind == "unknown"
    assert event.message_id is None
    assert "no_message_or_status" in event.notes


def test_parse_non_object_safe():
    event = parse_webhook_payload(["not", "a", "dict"])
    assert event.event_kind == "unknown"
    assert "non_object_payload" in event.notes


# ---------- HTTP: GET verify ----------


@pytest.mark.asyncio
async def test_http_get_verify_success(client: AsyncClient, monkeypatch):
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "meta-verify-token")
    response = await client.get(
        "/api/v1/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "meta-verify-token",
            "hub.challenge": "challenge-42",
        },
    )
    assert response.status_code == 200
    assert response.text == "challenge-42"


@pytest.mark.asyncio
async def test_http_get_verify_wrong_token(client: AsyncClient, monkeypatch):
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "meta-verify-token")
    response = await client.get(
        "/api/v1/whatsapp/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "nope",
            "hub.challenge": "challenge-42",
        },
    )
    assert response.status_code == 403


# ---------- HTTP: POST signature ----------


@pytest.mark.asyncio
async def test_http_post_valid_hmac(client: AsyncClient, monkeypatch):
    secret = "test-app-secret"
    monkeypatch.setenv("WHATSAPP_APP_SECRET", secret)
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "true")

    async def _noop_background(_payload):
        return None

    monkeypatch.setattr(
        "routers.whatsapp_webhook._process_inbound_background",
        _noop_background,
    )
    body = json.dumps(SAMPLE_MESSAGE_PAYLOAD, separators=(",", ":")).encode("utf-8")
    response = await client.post(
        "/api/v1/whatsapp/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body, secret),
        },
    )
    assert response.status_code == 200
    assert response.json().get("ok") is True


@pytest.mark.asyncio
async def test_http_post_invalid_hmac(client: AsyncClient, monkeypatch):
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "test-app-secret")
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "true")
    body = b'{"object":"whatsapp_business_account","entry":[]}'
    response = await client.post(
        "/api/v1/whatsapp/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=" + ("00" * 32),
        },
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_http_post_missing_hmac(client: AsyncClient, monkeypatch):
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "test-app-secret")
    body = b'{"object":"whatsapp_business_account"}'
    response = await client.post(
        "/api/v1/whatsapp/webhook",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_http_post_unknown_type_acked(client: AsyncClient, monkeypatch):
    secret = "test-app-secret"
    monkeypatch.setenv("WHATSAPP_APP_SECRET", secret)
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "true")

    async def _noop_background(_payload):
        return None

    monkeypatch.setattr(
        "routers.whatsapp_webhook._process_inbound_background",
        _noop_background,
    )
    payload = {"object": "unknown_object", "entry": [{"id": "x", "changes": []}]}
    body = json.dumps(payload).encode("utf-8")
    response = await client.post(
        "/api/v1/whatsapp/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body, secret),
        },
    )
    assert response.status_code == 200
    assert response.json().get("ok") is True


@pytest.mark.asyncio
async def test_http_post_disabled_bot_still_acks_after_signature(client: AsyncClient, monkeypatch):
    secret = "test-app-secret"
    monkeypatch.setenv("WHATSAPP_APP_SECRET", secret)
    monkeypatch.setenv("WHATSAPP_BOT_ENABLED", "false")
    body = json.dumps(SAMPLE_MESSAGE_PAYLOAD).encode("utf-8")
    response = await client.post(
        "/api/v1/whatsapp/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body, secret),
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("ok") is True
    assert data.get("enabled") is False


def test_config_defaults_disabled(monkeypatch):
    monkeypatch.delenv("WHATSAPP_BOT_ENABLED", raising=False)
    from services.whatsapp_ai_bot.config import get_whatsapp_config

    cfg = get_whatsapp_config()
    assert cfg.enabled is False
