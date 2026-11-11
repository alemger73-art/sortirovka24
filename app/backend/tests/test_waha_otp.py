"""WhatsApp through our own WAHA: offered for sign-in only while the session is connected, and never sends a code."""
import os
from unittest.mock import patch

import httpx
import pytest

from services import sms, wa_guard

REAL_CLIENT = httpx.AsyncClient


def client_with(handler):
    def factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return REAL_CLIENT(*args, transport=httpx.MockTransport(handler), **kwargs)
    return factory


@pytest.fixture(autouse=True)
def env():
    sms._waha_state.update(working=False, checked=0.0)
    wa_guard.reset()
    with patch.dict(os.environ, {"WAHA_URL": "http://waha:3000", "WAHA_API_KEY": "k", "EXTERNAL_SIDE_EFFECTS": "",
                                 "NEWS_TELEGRAM_BOT_TOKEN": "", "WHATSAPP_ACCESS_TOKEN": ""}):
        yield
    wa_guard.reset()


def waha(status="WORKING"):
    seen = []

    def handler(request):
        seen.append(request)
        assert request.headers["X-Api-Key"] == "k"
        if request.url.path == "/api/sessions/default":
            return httpx.Response(200, json={"name": "default", "status": status})
        return httpx.Response(201, json={})
    return seen, handler


async def test_offered_for_sign_in_only_and_never_sends_a_code():
    seen, handler = waha()
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)):
        assert await sms.refresh_waha_status(force=True)
        assert "whatsapp" in sms.available_channels(include_whatsapp=True)
        assert "whatsapp" not in sms.available_channels()  # phone linking, deletion: Telegram/SMS only
        with pytest.raises(sms.SMSDeliveryError, match="Telegram"):
            await sms.send_verification_code("+77011234567", "654321", "whatsapp")
    assert [r.url.path for r in seen] == ["/api/sessions/default"]


async def test_hidden_until_qr_scanned():
    _, handler = waha(status="SCAN_QR_CODE")
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)):
        assert not await sms.refresh_waha_status(force=True)
    assert "whatsapp" not in sms.available_channels(include_whatsapp=True)
