"""WhatsApp login codes through our own WAHA: shown only when the session is connected; plain message; no-WhatsApp numbers."""
import json
import os
from unittest.mock import patch

import httpx
import pytest

from services import sms

REAL_CLIENT = httpx.AsyncClient


def client_with(handler):
    def factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return REAL_CLIENT(*args, transport=httpx.MockTransport(handler), **kwargs)
    return factory


@pytest.fixture(autouse=True)
def env():
    sms._waha_state.update(working=False, checked=0.0)
    with patch.dict(os.environ, {"WAHA_URL": "http://waha:3000", "WAHA_API_KEY": "k", "EXTERNAL_SIDE_EFFECTS": "",
                                 "WAZZUP_API_KEY": "", "WHATSAPP_ACCESS_TOKEN": ""}):
        yield


def waha(status="WORKING", exists=True, send_status=201):
    seen = []

    def handler(request):
        seen.append(request)
        assert request.headers["X-Api-Key"] == "k"
        if request.url.path == "/api/sessions/default":
            return httpx.Response(200, json={"name": "default", "status": status})
        if request.url.path == "/api/contacts/check-exists":
            return httpx.Response(200, json={"numberExists": exists, "chatId": "77011234567@c.us" if exists else None})
        return httpx.Response(send_status, json={"id": {"_serialized": "true_77011234567@c.us_ABC"}})
    return seen, handler


async def test_sends_when_connected():
    seen, handler = waha()
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)):
        assert await sms.refresh_waha_status(force=True)
        assert "whatsapp" in sms.available_channels()
        result = await sms.send_verification_code("+77011234567", "654321", "whatsapp")
    assert result.delivered and result.provider_message == "whatsapp"
    body = json.loads(seen[-1].content)
    assert body["chatId"] == "77011234567@c.us" and "654321" in body["text"] and body["session"] == "default"


async def test_hidden_until_qr_scanned():
    _, handler = waha(status="SCAN_QR_CODE")
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)):
        assert not await sms.refresh_waha_status(force=True)
    assert "whatsapp" not in sms.available_channels()


async def test_number_without_whatsapp():
    _, handler = waha(exists=False)
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)), pytest.raises(sms.SMSDeliveryError, match="нет WhatsApp"):
        await sms.refresh_waha_status(force=True)
        await sms.send_verification_code("+77011234567", "654321", "whatsapp")
