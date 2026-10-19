"""WhatsApp login codes through Wazzup: picks the portal's channel, sends a plain message, maps errors."""
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
    sms._wazzup_channel["id"] = None
    with patch.dict(os.environ, {"WAZZUP_API_KEY": "k", "WAZZUP_PHONE": "+7 700 428 02 80", "EXTERNAL_SIDE_EFFECTS": ""}):
        yield


async def test_sends_from_portal_number():
    seen = []

    def handler(request):
        seen.append(request)
        if request.url.path == "/v3/channels":
            return httpx.Response(200, json=[
                {"channelId": "other", "transport": "whatsapp", "plainId": "77001112233", "state": "active"},
                {"channelId": "s24", "transport": "whatsapp", "plainId": "77004280280", "state": "active"}])
        return httpx.Response(201, json={"messageId": "m1", "chatId": "77011234567"})
    assert "whatsapp" in sms.available_channels()
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)):
        result = await sms.send_verification_code("+77011234567", "123456", "whatsapp")
    assert result.delivered and result.provider_message == "whatsapp"
    body = json.loads(seen[-1].content)
    assert body["channelId"] == "s24" and body["chatId"] == "77011234567" and "123456" in body["text"]
    assert seen[-1].headers["Authorization"] == "Bearer k"


async def test_number_without_whatsapp():
    def handler(request):
        if request.url.path == "/v3/channels":
            return httpx.Response(200, json=[{"channelId": "s24", "transport": "whatsapp", "plainId": "77004280280", "state": "active"}])
        return httpx.Response(400, json={"error": "BAD_CONTACT"})
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)), pytest.raises(sms.SMSDeliveryError, match="нет WhatsApp"):
        await sms.send_verification_code("+77011234567", "123456", "whatsapp")


async def test_channel_offline():
    def handler(request):
        return httpx.Response(200, json=[{"channelId": "s24", "transport": "whatsapp", "plainId": "77004280280", "state": "qr"}])
    with patch.object(sms.httpx, "AsyncClient", client_with(handler)), pytest.raises(sms.SMSDeliveryError, match="недоступен"):
        await sms.send_verification_code("+77011234567", "123456", "whatsapp")
