"""DAM ALEM WhatsApp sales bot: AI only quotes; the customer's «да» creates the order; staff takeover; no AI fallback."""
import json

import httpx
import pytest
from sqlalchemy import select

from models.food_orders import Food_orders
from services import dam_wa_bot as B
from tests.test_dam_order_workflow import env  # real order/pricing DB


def msg(body, *, chat="77015556677@c.us", from_me=False, mid=None):
    return {"event": "message.any", "session": "default", "payload": {
        "id": mid or f"id-{body}-{from_me}", "from": "77470304096@c.us" if from_me else chat,
        "to": chat if from_me else "77470304096@c.us", "fromMe": from_me, "body": body, "_data": {"pushName": "Айгерим"}}}


@pytest.fixture
def bot(env, monkeypatch):
    _, maker, _, _ = env
    B._chats.clear(); B._seen.clear(); B._menu_cache.update(at=0.0, text=""); B._TABLE_READY = False
    monkeypatch.setenv("DAM_WA_ENABLED", "1"); monkeypatch.setenv("WAHA_API_KEY", "k")
    monkeypatch.setenv("NEWS_TELEGRAM_BOT_TOKEN", "1:t"); monkeypatch.setenv("NEWS_TELEGRAM_CHAT_ID", "555")
    monkeypatch.delenv("WHISPER_URL", raising=False)
    from core.database import db_manager
    monkeypatch.setattr(db_manager, "async_session_maker", maker)
    return maker


def transport(log, script):
    """script: list of Anthropic responses (content lists) returned in order."""
    def handler(request):
        url = str(request.url)
        body = json.loads(request.content) if request.content else {}
        log.append((url, body))
        if "anthropic" in url:
            return httpx.Response(200, json={"content": script.pop(0)})
        if url.endswith("/sendText") or url.endswith("/sendSeen") or "telegram" in url:
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})
        return httpx.Response(404)
    return httpx.MockTransport(handler)


def sent(log):
    return [b["text"] for u, b in log if u.endswith("/sendText")]


async def test_quote_then_customer_yes_creates_whatsapp_order(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    order = {"items": [{"id": 2, "quantity": 2}], "customer_name": "Айгерим", "delivery_method": "pickup", "payment_method": "cash"}
    script = [
        [{"type": "tool_use", "id": "t1", "name": "get_menu", "input": {}}],
        [{"type": "tool_use", "id": "t2", "name": "quote_order", "input": order}],
        [{"type": "text", "text": "Итого 600 ₸. Чтобы оформить, ответьте: Да"}],
    ]
    log = []
    async with httpx.AsyncClient(transport=transport(log, script)) as client:
        out = await B.handle_event(msg("хочу 2 штуки самовывозом, наличными, Айгерим"), client)
        assert out.action == "replied" and "Да" in out.reply
        ai_calls = [b for u, b in log if "anthropic" in u]
        assert ai_calls[0]["tools"][0]["name"] == "get_menu" and "DAM ALEM" in ai_calls[0]["system"]
        assert "допредложение" in ai_calls[0]["system"] and "промокод" in ai_calls[0]["system"]
        menu_result = ai_calls[1]["messages"][-1]["content"][0]["content"]
        assert "#2" in menu_result and "₸" in menu_result
        assert B._chats["77015556677@c.us"].pending
        async with bot() as db:
            assert (await db.scalars(select(Food_orders).where(Food_orders.order_source == "whatsapp"))).all() == []
        # The customer's own «Да» creates the order; no AI call is needed for that.
        out = await B.handle_event(msg("Да"), client)
        assert out.action == "order_created" and "оформлен" in out.reply and "600" in out.reply
        assert sum("anthropic" in u for u, _ in log) == 3
    async with bot() as db:
        rows = (await db.scalars(select(Food_orders).where(Food_orders.order_source == "whatsapp"))).all()
        assert len(rows) == 1 and rows[0].customer_phone.endswith("7015556677") and rows[0].status == "new"


async def test_yes_without_quote_does_not_order_and_staff_reply_mutes_bot(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    log = []
    script = [[{"type": "text", "text": "Что хотите заказать?"}]]
    async with httpx.AsyncClient(transport=transport(log, script)) as client:
        out = await B.handle_event(msg("да"), client)
        assert out.action == "replied"
        # Bot's own reply echoes back as fromMe: ignored (by text, and by WAHA source=api even if the text differs).
        assert (await B.handle_event(msg(sent(log)[-1], from_me=True, mid="echo"), client)).action == "ignored"
        echo = msg("Что хотите  заказать? (изменённый текст)", from_me=True, mid="echo2"); echo["payload"]["source"] = "api"
        assert (await B.handle_event(echo, client)).action == "ignored"
        # A DAM ALEM employee writes from the phone → the bot is silent in this chat.
        assert (await B.handle_event(msg("Здравствуйте, это администратор", from_me=True), client)).action == "muted"
        assert (await B.handle_event(msg("хочу пиццу"), client)).action == "muted"
    async with bot() as db:
        assert (await db.scalars(select(Food_orders).where(Food_orders.order_source == "whatsapp"))).all() == []


async def test_without_ai_key_sends_menu_link_and_calls_staff(bot, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    log = []
    async with httpx.AsyncClient(transport=transport(log, [])) as client:
        out = await B.handle_event(msg("здравствуйте, что есть?"), client)
        assert out.action == "replied" and "/food" in out.reply
        assert any("telegram" in u for u, _ in log)


async def test_disabled_and_groups_are_ignored(bot, monkeypatch):
    log = []
    async with httpx.AsyncClient(transport=transport(log, [])) as client:
        assert (await B.handle_event(msg("привет", chat="12345@g.us"), client)).action == "ignored"
        monkeypatch.setenv("DAM_WA_ENABLED", "0")
        assert (await B.handle_event(msg("привет"), client)).action == "ignored"
    assert log == []


async def test_memory_survives_restart_and_keeps_tool_calls(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    script = [
        [{"type": "tool_use", "id": "m1", "name": "get_menu", "input": {}}],
        [{"type": "text", "text": "Советую пиццу 🍕 На сколько человек?"}],
        [{"type": "text", "text": "Отлично, на двоих — Пепперони 👌"}],
    ]
    log = []
    async with httpx.AsyncClient(transport=transport(log, script)) as client:
        await B.handle_event(msg("хочу пиццу"), client)
        B._chats.clear()  # server restart: memory comes back from the DB
        await B.handle_event(msg("на двоих"), client)
    last = [b for u, b in log if "anthropic" in u][-1]
    texts = json.dumps(last["messages"], ensure_ascii=False)
    assert "хочу пиццу" in texts and "На сколько человек" in texts and "tool_use" in texts
    assert last["messages"][-1] == {"role": "user", "content": "на двоих"}
    assert "Память о клиенте" in last["system"]


async def test_last_order_never_claims_payment_without_staff(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    order = {"items": [{"id": 2, "quantity": 2}], "customer_name": "Айгерим", "delivery_method": "pickup", "payment_method": "kaspi_qr"}
    script = [
        [{"type": "tool_use", "id": "q", "name": "quote_order", "input": order}],
        [{"type": "text", "text": "Итого 600 ₸. Ответьте Да"}],
        [{"type": "tool_use", "id": "s", "name": "get_my_last_order", "input": {}}],
        [{"type": "text", "text": "Ждём оплату"}],
    ]
    log = []
    async with httpx.AsyncClient(transport=transport(log, script)) as client:
        await B.handle_event(msg("2 штуки, самовывоз, каспи"), client)
        out = await B.handle_event(msg("да"), client)
        assert out.action == "order_created" and "Kaspi" in out.reply
        await B.handle_event(msg("я оплатил"), client)
    status = [b for u, b in log if "anthropic" in u][-1]["messages"][-1]["content"][0]["content"]
    assert "ЕЩЁ НЕ ОПЛАЧЕН" in status


async def test_thinking_is_not_stored_and_bad_memory_is_retried(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    calls = []

    def handler(request):
        url = str(request.url)
        body = json.loads(request.content) if request.content else {}
        if "anthropic" in url:
            calls.append(body)
            if len(calls) == 2:  # the API rejects the request with memory → bot retries with plain text memory
                return httpx.Response(400, json={"error": {"message": "bad history"}})
            return httpx.Response(200, json={"stop_reason": "end_turn", "content": [
                {"type": "thinking", "thinking": "думаю…", "signature": "s"}, {"type": "text", "text": f"Ответ {len(calls)} 🍕"}]})
        return httpx.Response(200, json={"ok": True, "result": {"message_id": 1}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert (await B.handle_event(msg("привет"), client)).reply == "Ответ 1 🍕"
        assert (await B.handle_event(msg("пиццу на пятерых"), client)).reply == "Ответ 3 🍕"
    stored = json.dumps(B._chats["77015556677@c.us"].history, ensure_ascii=False)
    assert "thinking" not in stored and calls[0]["max_tokens"] >= 3000
    assert calls[2]["messages"][:2] == [{"role": "user", "content": "привет"}, {"role": "assistant", "content": "Ответ 1 🍕"}]
