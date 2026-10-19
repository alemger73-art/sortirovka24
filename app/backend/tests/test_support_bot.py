"""WhatsApp support bot: answers, hands off to the owner, stays silent after the owner writes, ignores groups."""
import json
import os
from unittest.mock import patch

import httpx
import pytest

from services import support_bot

MODULES = {"food": True, "news": True, "transport": True, "directory": True, "business": True, "inspectors": True, "jobs": False}


def msg(body, *, chat="77011234567@c.us", from_me=False, mid=None, **extra):
    payload = {"id": mid or f"id-{body}-{from_me}", "from": "77004280280@c.us" if from_me else chat,
               "to": chat if from_me else "77004280280@c.us", "fromMe": from_me, "body": body,
               "_data": {"pushName": "Асия"}, **extra}
    return {"event": "message.any", "session": "default", "payload": payload}


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    support_bot._chats.clear(); support_bot._seen_ids.clear()
    monkeypatch.setenv("WAHA_URL", "http://waha:3000"); monkeypatch.setenv("WAHA_API_KEY", "k")
    monkeypatch.setenv("NEWS_TELEGRAM_BOT_TOKEN", "1:t"); monkeypatch.setenv("NEWS_TELEGRAM_CHAT_ID", "555")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False); monkeypatch.delenv("WHISPER_URL", raising=False)


def transport(log, ai_text="Заказать еду можно здесь: https://www.sortirovka24.kz/food"):
    def handler(request):
        url = str(request.url)
        body = json.loads(request.content) if request.content and request.headers.get("content-type", "").startswith("application/json") else {}
        log.append((url, body))
        if "anthropic" in url:
            return httpx.Response(200, json={"content": [{"type": "text", "text": ai_text}]})
        if url.endswith("/sendText") or url.endswith("/sendSeen") or "telegram" in url:
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})
        return httpx.Response(404)
    return httpx.MockTransport(handler)


async def test_ai_answer_and_owner_takeover(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    log = []
    async with httpx.AsyncClient(transport=transport(log)) as client:
        out = await support_bot.handle_event(msg("как заказать еду?"), client, MODULES)
        assert out.action == "replied"
        ai = next(b for u, b in log if "anthropic" in u)
        assert ai["model"] == "claude-haiku-5-5" and "DÄM ALEM" in ai["system"] and "Работа" not in ai["system"]
        sent = [b for u, b in log if u.endswith("/sendText")][-1]
        assert sent["chatId"] == "77011234567@c.us" and "/food" in sent["text"]
        # The bot's own reply echoes back as fromMe — must not mute the chat.
        assert (await support_bot.handle_event(msg(sent["text"], from_me=True, mid="echo"), client, MODULES)).action == "ignored"
        # The owner types from the phone → bot stays silent in this chat.
        assert (await support_bot.handle_event(msg("Здравствуйте, это Алемгер", from_me=True), client, MODULES)).action == "muted"
        assert (await support_bot.handle_event(msg("спасибо"), client, MODULES)).action == "muted"
        # Other chats are unaffected.
        assert (await support_bot.handle_event(msg("привет", chat="77019998877@c.us"), client, MODULES)).action == "replied"


async def test_handoff_notifies_owner_once(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    log = []
    async with httpx.AsyncClient(transport=transport(log, "Передал ваш вопрос оператору, он скоро ответит. [ОПЕРАТОР]")) as client:
        out = await support_bot.handle_event(msg("мой заказ не приехал"), client, MODULES)
        assert out.action == "handed_off" and "[ОПЕРАТОР]" not in out.reply
        tg = [b for u, b in log if "telegram" in u]
        assert len(tg) == 1 and "нужен оператор" in tg[0]["text"] and "+77011234567" in tg[0]["text"]
        await support_bot.handle_event(msg("ну что там?"), client, MODULES)
        assert len([b for u, b in log if "telegram" in u]) == 1  # not spammed


async def test_without_ai_key_greets_and_hands_off():
    log = []
    async with httpx.AsyncClient(transport=transport(log)) as client:
        hi = await support_bot.handle_event(msg("Здравствуйте"), client, MODULES)
        assert hi.action == "replied" and "/food" in hi.reply
        q = await support_bot.handle_event(msg("сколько стоит доставка?"), client, MODULES)
        assert q.action == "handed_off"


async def test_groups_status_duplicates_and_codes_ignored():
    log = []
    async with httpx.AsyncClient(transport=transport(log)) as client:
        assert (await support_bot.handle_event(msg("всем привет", chat="123-456@g.us"), client, MODULES)).action == "ignored"
        assert (await support_bot.handle_event(msg("x", chat="status@broadcast"), client, MODULES)).action == "ignored"
        assert (await support_bot.handle_event(msg("Ваш код для входа на «Сортировка 24»: 123456", from_me=True), client, MODULES)).action == "ignored"
        e = msg("привет", mid="same")
        assert (await support_bot.handle_event(e, client, MODULES)).action == "replied"
        assert (await support_bot.handle_event(e, client, MODULES)).action == "ignored"


async def test_voice_without_whisper_asks_for_text():
    log = []
    async with httpx.AsyncClient(transport=transport(log)) as client:
        out = await support_bot.handle_event(msg("", hasMedia=True, media={"url": "http://localhost:3000/api/files/a.oga", "mimetype": "audio/ogg; codecs=opus"}), client, MODULES)
        assert out.action == "replied" and "текстом" in out.reply


async def test_webhook_requires_key(monkeypatch):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from routers.support_bot import router
    monkeypatch.setenv("SUPPORT_BOT_HOOK_KEY", "secret")
    app = FastAPI(); app.include_router(router)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        assert (await c.post("/api/v1/support-bot/waha?key=wrong", json={})).status_code == 403
        with patch.object(support_bot, "handle_event") as h:
            assert (await c.post("/api/v1/support-bot/waha?key=secret", json={"event": "session.status"})).status_code == 200
