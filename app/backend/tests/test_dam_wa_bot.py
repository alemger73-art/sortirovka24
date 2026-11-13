"""DAM ALEM WhatsApp sales bot: AI only quotes; the customer's «да» creates the order; staff takeover; no AI fallback."""
import json
import time

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
    B._chats.clear(); B._seen.clear(); B._menu_cache.update(at=0.0, text=""); B._TABLE_READY = False; B._auto_texts.clear()
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
        # A DAM ALEM employee writes from the phone (minutes later) → the bot is silent in this chat.
        staff = msg("Здравствуйте, это администратор", from_me=True); staff["payload"]["timestamp"] = time.time() + 120
        assert (await B.handle_event(staff, client)).action == "staff_seen"
        later = msg("хочу пиццу"); later["payload"]["timestamp"] = time.time() + 300
        assert (await B.handle_event(later, client)).action == "muted"
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


async def test_whatsapp_location_is_used_for_delivery(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    captured = {}
    from services import business_channel as C
    real_tool = C.tool

    async def spy(db, ctx, name, args, **kw):
        if name == "quote":
            captured.update(args)
        return await real_tool(db, ctx, name, args, **kw)
    monkeypatch.setattr(C, "tool", spy)
    order = {"items": [{"id": 2, "quantity": 2}], "customer_name": "Айгерим", "delivery_method": "delivery",
             "delivery_address": "ул. Уранова 10, кв 5", "payment_method": "cash"}
    script = [[{"type": "tool_use", "id": "q", "name": "quote_order", "input": order}], [{"type": "text", "text": "Пересчитал 👌"}]]
    log = []
    event = msg("", mid="loc1")
    event["payload"].update(hasMedia=False, location={"latitude": 49.8301, "longitude": 73.0812, "description": ""})
    async with httpx.AsyncClient(transport=transport(log, script)) as client:
        out = await B.handle_event(event, client)
    assert out.action == "replied"
    first = [b for u, b in log if "anthropic" in u][0]
    assert "геолокацию" in first["messages"][-1]["content"]
    assert captured["delivery_lat"] == 49.8301 and captured["delivery_lng"] == 73.0812


async def test_business_app_greeting_does_not_silence_the_bot(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    log = []
    script = [[{"type": "text", "text": "Здравствуйте! Что хотите заказать? 🍕"}], [{"type": "text", "text": "Отлично 👌"}]]
    now = time.time()
    greet = msg("Здравствуйте! Мы снова с вами — кухня возобновила работу!", from_me=True, mid="g1"); greet["payload"]["timestamp"] = now + 1
    hello = msg("можно заказать?", mid="h1"); hello["payload"]["timestamp"] = now
    async with httpx.AsyncClient(transport=transport(log, script)) as client:
        # The greeting webhook may even arrive before the customer's message.
        assert (await B.handle_event(greet, client)).action == "staff_seen"
        assert (await B.handle_event(hello, client)).action == "replied"
        # Learned: the same greeting in another chat is ignored right away.
        other = msg("Здравствуйте! Мы снова с вами — кухня возобновила работу!", from_me=True, mid="g2", chat="77019990000@c.us")
        assert (await B.handle_event(other, client)).action == "ignored"
        nxt = msg("пиццу", mid="h2"); nxt["payload"]["timestamp"] = now + 30
        assert (await B.handle_event(nxt, client)).action == "replied"


async def test_bots_never_talk_to_each_other_and_loop_guard(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    from services import support_bot
    support_bot._chats.clear(); support_bot._seen_ids.clear()
    log = []
    async with httpx.AsyncClient(transport=transport(log, [])) as client:
        # Support number writes to DAM (even as a hidden @lid id) → DAM bot ignores it.
        e = msg("привет", chat="99887766@lid"); e["payload"]["_data"] = {"Info": {"SenderAlt": "77004280280:3@s.whatsapp.net"}}
        assert (await B.handle_event(e, client)).action == "ignored"
        # DAM number writes to the support bot → ignored too.
        s = {"event": "message.any", "payload": {"id": "x1", "from": "55443322@lid", "to": "77004280280@c.us", "fromMe": False,
             "body": "Здравствуйте! Это DAM ALEM", "_data": {"Info": {"SenderAlt": "77470304096@s.whatsapp.net"}}}}
        assert (await support_bot.handle_event(s, client, {"food": True})).action == "ignored"
    assert log == []
    # Loop guard: a chat that already got 4 bot replies within a minute is stopped.
    chat = B._chat("77015556677@c.us"); chat.replies_at = [time.time()] * 6
    async with httpx.AsyncClient(transport=transport(log, [])) as client:
        assert (await B.handle_event(msg("ещё"), client)).action == "loop_stopped"


def test_is_yes_last_line():
    from services.dam_wa_bot import is_yes
    assert is_yes("Да")
    assert is_yes("Всё верно, проверила.\n\nДа")
    assert not is_yes("Да, но уберите лагман")
    assert not is_yes("нет")


async def test_bot_knows_portions_bonuses_and_pay_on_delivery(bot):
    """What the AI is taught: portion size next to the dish, live bonus rules, payment only on delivery."""
    from models.food_items import Food_items
    async with bot() as db:
        item = (await db.execute(select(Food_items).where(Food_items.is_active.is_not(False)).limit(1))).scalar_one()
        item.weight = "5 шт"
        await db.commit()
        B._menu_cache.update(at=0.0, text="")
        menu = await B.menu_text(db)
        facts = await B.store_facts(db)
    assert f"{item.name} (5 шт)" in menu
    assert "Бонусы DAM ALEM" in facts and "%" in facts
    prompt = B.system_prompt(facts, "Айгерим", menu=menu)
    assert "наличными при получении" in prompt and "kaspi_phone" in prompt
    assert "ОПЛАЧЕН" not in prompt


async def test_customer_photo_is_shown_to_the_ai_but_not_kept_in_memory(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    log, script = [], [[{"type": "text", "text": "Похоже на наши *Манты жареные* 🥟 Добавить?"}]]
    base = transport(log, script)

    def handler(request):
        if "/api/files/" in str(request.url):
            return httpx.Response(200, content=b"\xff\xd8\xff photo")
        return base.handle_request(request)
    event = msg("", mid="photo-1")
    event["payload"].update(hasMedia=True, media={"url": "http://localhost:3000/api/files/default/p.jpg", "mimetype": "image/jpeg"})
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        out = await B.handle_event(event, client)
    assert out.action == "replied" and "Манты" in out.reply
    first = next(b for u, b in log if "anthropic" in u)["messages"][-1]["content"]
    assert first[0]["type"] == "image" and first[0]["source"]["media_type"] == "image/jpeg"
    assert "прислал фото" in first[1]["text"]
    stored = B._chats["77015556677@c.us"].history[-1][0]["content"]
    assert isinstance(stored, str) and "прислал фото" in stored


def test_sales_manner_full_menu_occasion_and_birthday():
    prompt = B.system_prompt("Кухня открыта", "Айгерим", menu="#1 Пепперони (30 см) — 3 200 ₸")
    assert "присылай ВСЁ меню" in prompt and "повод" in prompt
    assert "BIRTHDAY" in prompt and "удостоверения" in prompt and "ИИН" in prompt
    assert "2–4 строки" in prompt


def test_whatsapp_only_promo_is_refused_at_site_checkout():
    from fastapi import HTTPException
    from services.food_order_validation import _resolve_promo
    cfg = {"promo_codes": json.dumps([{"code": "BIRTHDAY", "type": "percent", "value": 10, "active": True, "site": False}])}
    assert _resolve_promo("BIRTHDAY", 5000, cfg) == (500, False)  # WhatsApp / staff pricing
    with pytest.raises(HTTPException) as err:
        _resolve_promo("birthday", 5000, cfg, public_checkout=True)
    assert "WhatsApp" in err.value.detail


async def test_kaspi_needs_a_number_and_the_confirmation_lists_everything(bot, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "x")
    base = {"items": [{"id": 2, "quantity": 2}], "customer_name": "Айгерим", "delivery_method": "pickup", "payment_method": "kaspi_transfer"}
    script = [
        [{"type": "tool_use", "id": "a", "name": "quote_order", "input": base}],
        [{"type": "tool_use", "id": "b", "name": "quote_order", "input": {**base, "kaspi_phone": "+77015556677"}}],
        [{"type": "text", "text": "Итого 600 ₸. Ответьте Да"}],
    ]
    log = []
    async with httpx.AsyncClient(transport=transport(log, script)) as client:
        await B.handle_event(msg("2 штуки, самовывоз, каспи"), client)
        refused = [b for u, b in log if "anthropic" in u][1]["messages"][-1]["content"][0]["content"]
        assert "kaspi_phone" in refused
        out = await B.handle_event(msg("да"), client)
    assert out.action == "order_created"
    assert "Drink × 2" in out.reply and "Самовывоз" in out.reply and "600" in out.reply
    assert "счёт выставим на номер +77015556677" in out.reply
    async with bot() as db:
        row = (await db.scalars(select(Food_orders).where(Food_orders.order_source == "whatsapp"))).one()
        assert "+77015556677" in (row.comment or "")
    chat = B._chats[next(iter(B._chats))]
    block = B.order_block(chat)
    assert f"Заказ №{row.id}" in block and "итого 600 ₸" in block and "Kaspi счёт на +77015556677" in block


def test_hand_off_shows_the_waiting_calculation_total():
    chat = B.Chat(pending={"id": "c1", "at": 0, "kaspi_phone": "",
                           "quote": {"total_amount": 12900, "payment_method": "cash", "delivery_method": "delivery",
                                     "delivery_address": "Серова 74а"}})
    block = B.order_block(chat)
    assert "итого 12 900 ₸" in block and "наличные" in block and "Серова 74а" in block
    assert B.order_block(B.Chat()) == ""
