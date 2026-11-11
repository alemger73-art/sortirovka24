"""Login codes go to Telegram; SMS is only a fallback when configured. WhatsApp sign-in is reverse (tests/test_wa_login.py)."""
import asyncio
import pytest
import services.sms as sms


def _env(monkeypatch, **values):
    for key in ("TELEGRAM_GATEWAY_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_OTP_TEMPLATE", "SMS_PROVIDER", "MOBIZON_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    for key, value in values.items():
        monkeypatch.setenv(key, value)


def test_channels_follow_configuration(monkeypatch):
    _env(monkeypatch)
    assert sms.available_channels() == []
    _env(monkeypatch, TELEGRAM_GATEWAY_TOKEN="t")
    assert sms.available_channels() == ["telegram"]
    # A Cloud API template no longer makes WhatsApp a code channel: the site never writes first.
    _env(monkeypatch, TELEGRAM_GATEWAY_TOKEN="t", WHATSAPP_ACCESS_TOKEN="a", WHATSAPP_PHONE_NUMBER_ID="1", WHATSAPP_OTP_TEMPLATE="login")
    assert sms.available_channels(include_whatsapp=True) == ["telegram"]


def test_unavailable_channel_is_refused(monkeypatch):
    _env(monkeypatch, TELEGRAM_GATEWAY_TOKEN="t")
    with pytest.raises(sms.SMSDeliveryError):
        asyncio.run(sms.send_verification_code("+77001234567", "123456", "whatsapp"))


def test_telegram_request_shape(monkeypatch):
    _env(monkeypatch, TELEGRAM_GATEWAY_TOKEN="secret-token")
    monkeypatch.delenv("EXTERNAL_SIDE_EFFECTS", raising=False)
    sent = {}

    class Resp:
        status_code = 200
        def json(self): return {"ok": True, "result": {"request_id": "r1"}}

    class Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, headers=None, json=None, **k):
            sent.update(url=url, headers=headers, json=json); return Resp()

    monkeypatch.setattr(sms.httpx, "AsyncClient", Client)
    result = asyncio.run(sms.send_verification_code("87001234567", "654321", "telegram"))
    assert result.delivered and result.provider_message == "telegram"
    assert sent["url"].endswith("/sendVerificationMessage")
    assert sent["json"]["phone_number"] == "+77001234567" and sent["json"]["code"] == "654321"
    assert sent["headers"]["Authorization"] == "Bearer secret-token"


def test_an_undelivered_code_is_not_a_gateway_error():
    """Cloudflare swaps any 5xx-gateway answer for its own HTML page; the person must see «Попробуйте Telegram»."""
    from routers.account_v2 import DELIVERY_FAILED
    assert 400 <= DELIVERY_FAILED < 500
