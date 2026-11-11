"""Limits and the safety fuse for the «Сортировка 24» WhatsApp number."""
import json
import os
import time
from unittest.mock import patch

import httpx
import pytest

from services import sms, support_bot, wa_guard

REAL_CLIENT = httpx.AsyncClient


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    wa_guard.reset()
    support_bot._chats.clear(); support_bot._seen_ids.clear(); support_bot._aliases.clear()
    sms._waha_state.update(working=False, checked=0.0)
    monkeypatch.setattr(support_bot, "REPLY_GRACE_SECONDS", 0)
    monkeypatch.setattr(support_bot, "_directory_cache", (float("inf"), []))
    monkeypatch.setattr(support_bot, "_menu_cache", (float("inf"), []))
    for key in ("WA_MAX_SENDS_PER_HOUR", "WA_MAX_SENDS_PER_DAY", "WA_MAX_NEW_CHATS_PER_DAY", "WA_FUSE_FAILURES", "WA_FUSE_COOLDOWN_MINUTES"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("WAHA_URL", "http://waha:3000"); monkeypatch.setenv("WAHA_API_KEY", "k")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    monkeypatch.setenv("NEWS_TELEGRAM_BOT_TOKEN", "1:t"); monkeypatch.setenv("NEWS_TELEGRAM_CHAT_ID", "555")
    yield
    wa_guard.reset()
    sms._waha_state.update(working=False, checked=0.0)


def recorder(log, *, status="WORKING", send_status=200):
    def handler(request):
        url = str(request.url)
        log.append((url, json.loads(request.content) if request.content else {}))
        if url.endswith("/api/sessions/default"):
            return httpx.Response(200, json={"status": status})
        if "anthropic" in url:
            return httpx.Response(200, json={"content": [{"type": "text", "text": "Здравствуйте!"}]})
        if url.endswith("/sendText"):
            return httpx.Response(send_status, json={})
        return httpx.Response(200, json={"ok": True, "result": {}})
    return httpx.MockTransport(handler)


def patched_httpx(transport):
    def factory(*args, **kwargs):
        kwargs.pop("transport", None)
        return REAL_CLIENT(*args, transport=transport, **kwargs)
    return patch.object(httpx, "AsyncClient", factory)


def msg(body, chat):
    return {"event": "message", "payload": {"id": f"{chat}-{body}", "from": chat, "to": "77004280280@c.us",
                                            "fromMe": False, "body": body, "_data": {}}}


def test_defaults():
    assert (wa_guard.max_per_hour(), wa_guard.max_per_day(), wa_guard.max_new_chats_per_day()) == (60, 300, 80)


async def test_hourly_limit_silences_the_bot_and_hides_whatsapp_login(monkeypatch):
    monkeypatch.setenv("WA_MAX_SENDS_PER_HOUR", "2")
    sms._waha_state.update(working=True, checked=time.monotonic())
    log = []
    async with REAL_CLIENT(transport=recorder(log)) as client:
        for i in range(2):
            assert (await support_bot.handle_event(msg(f"вопрос {i}", f"7701000000{i}@c.us"), client, {})).action == "replied"
        assert "whatsapp" not in sms.available_channels(include_whatsapp=True)
        calls = len(log)
        assert (await support_bot.handle_event(msg("ещё", "77010000009@c.us"), client, {})).action == "limited"
        assert len(log) == calls  # no AI call, nothing sent
        assert await support_bot.send_text(client, "77010000000@c.us", "x") is False


async def test_daily_limit(monkeypatch):
    monkeypatch.setenv("WA_MAX_SENDS_PER_DAY", "1")
    async with REAL_CLIENT(transport=recorder([])) as client:
        assert await support_bot.send_text(client, "77010000000@c.us", "a")
        assert not await support_bot.send_text(client, "77010000000@c.us", "b")
    wa_guard._sent[:] = [time.time() - 25 * 3600]  # the window passes
    assert wa_guard.allow("77010000000@c.us")


async def test_new_chats_per_day(monkeypatch):
    monkeypatch.setenv("WA_MAX_NEW_CHATS_PER_DAY", "1")
    sms._waha_state.update(working=True, checked=time.monotonic())
    async with REAL_CLIENT(transport=recorder([])) as client:
        assert await support_bot.send_text(client, "77010000000@c.us", "a")
        assert not await support_bot.send_text(client, "77019999999@c.us", "new chat")
        assert await support_bot.send_text(client, "77010000000@c.us", "same chat is fine")
    assert "whatsapp" not in sms.available_channels(include_whatsapp=True)


async def test_fuse_on_session_down_notifies_once_and_recovers_after_cooldown(monkeypatch):
    log = []
    with patched_httpx(recorder(log, status="STOPPED")):
        assert not await sms.refresh_waha_status(force=True)
        assert not await sms.refresh_waha_status(force=True)
    notices = [b for u, b in log if "api.telegram.org" in u]
    assert len(notices) == 1 and "WhatsApp отключён — вход только через Telegram" in notices[0]["text"]
    assert wa_guard.fuse_down()

    with patched_httpx(recorder(log)):
        assert await sms.refresh_waha_status(force=True)  # WORKING, but the cooldown has not passed
        assert "whatsapp" not in sms.available_channels(include_whatsapp=True)
        wa_guard._fuse["since"] = time.time() - wa_guard.fuse_cooldown() - 1
        assert await sms.refresh_waha_status(force=True)
    assert not wa_guard.fuse_down()
    assert "whatsapp" in sms.available_channels(include_whatsapp=True)


async def test_fuse_on_failed_sends(monkeypatch):
    sms._waha_state.update(working=True, checked=time.monotonic())
    log = []
    with patched_httpx(recorder(log, send_status=500)):
        async with httpx.AsyncClient() as client:
            for _ in range(3):
                with pytest.raises(httpx.HTTPStatusError):
                    await support_bot.send_text(client, "77010000000@c.us", "x")
    assert wa_guard.fuse_down()
    assert "whatsapp" not in sms.available_channels(include_whatsapp=True)
    assert len([u for u, _ in log if "api.telegram.org" in u]) == 1


def test_only_the_support_and_dam_bots_send_whatsapp_messages():
    """Regression guard: no other code may call WAHA sendText (site-initiated messages got the number restricted)."""
    root = os.path.join(os.path.dirname(__file__), "..")
    found = []
    for folder in ("services", "routers", "core", "utils"):
        for dirpath, _, files in os.walk(os.path.join(root, folder)):
            for name in files:
                if name.endswith(".py") and "/api/sendText" in open(os.path.join(dirpath, name), encoding="utf-8").read():
                    found.append(name)
    assert sorted(found) == ["dam_wa_bot.py", "support_bot.py"]
