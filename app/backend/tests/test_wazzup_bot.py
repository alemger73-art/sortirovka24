"""Wazzup AI bot: webhook auth, Claude tool loop, explicit confirmation, orders."""
import json
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select

from models.crm import ChannelConfirmation
from models.food_orders import Food_orders
from services.wazzup_bot import agent as A
from services.wazzup_bot.config import WazzupBotConfig
from services.wazzup_bot.ingress import parse_messages
from services.wazzup_bot.sessions import get_store, reset_store_for_tests
from tests.test_dam_order_workflow import env  # noqa: F401  (fixture)

CFG = WazzupBotConfig(
    enabled=True, api_key="wz", api_base_url="https://wazzup.test", webhook_token="secret-token",
    channel_ids=frozenset({"chan-1"}), public_base_url="https://api.test", anthropic_api_key="ak",
    anthropic_model="test-model", anthropic_base_url="https://anthropic.test", human_pause_minutes=30,
    session_ttl_seconds=3600, max_tool_rounds=6,
)


class FakeWazzup:
    def __init__(self):
        self.sent = []
        self.n = 0

    async def send_text(self, *, channel_id, chat_type, chat_id, text):
        self.n += 1
        self.sent.append({"chat_type": chat_type, "chat_id": chat_id, "text": text})
        return [f"out-{self.n}"]


class ScriptedClaude:
    """Returns queued responses; records what the model was shown."""

    def __init__(self, *responses):
        self.queue = list(responses)
        self.calls = []

    async def create(self, *, system, messages, tools, max_tokens=1200):
        self.calls.append({"system": system, "messages": json.loads(json.dumps(messages, default=str))})
        return self.queue.pop(0)


def tool(name, args, tid="t1", text=""):
    content = [{"type": "text", "text": text}] if text else []
    return {"content": content + [{"type": "tool_use", "id": tid, "name": name, "input": args}]}


def say(text):
    return {"content": [{"type": "text", "text": text}]}


def message(text, *, mid, chat_type="whatsapp", chat_id="77003334455", echo=False, channel="chan-1", **extra):
    raw = {"messageId": mid, "channelId": channel, "chatType": chat_type, "chatId": chat_id, "type": "text",
           "status": "sent" if echo else "inbound", "isEcho": echo, "text": text, "contact": {"name": "Айдос"}, **extra}
    return parse_messages({"messages": [raw]})[0]


ORDER = {"items": [{"id": 2, "quantity": 2}], "customer_name": "Айдос", "delivery_method": "pickup", "payment_method": "cash"}


@pytest.fixture(autouse=True)
def fresh_sessions():
    reset_store_for_tests()
    yield
    reset_store_for_tests()


async def run(db, msg, llm, wz):
    await A.handle_message(db, msg, config=CFG, wazzup=wz, llm=llm)


@pytest.mark.asyncio
async def test_whatsapp_menu_quote_confirm_creates_order(env):
    _, maker, _, _ = env
    wz = FakeWazzup()
    llm = ScriptedClaude(
        tool("menu_items", {"query": "drink"}),
        tool("prepare_order", ORDER, tid="t2"),
    )
    async with maker() as db:
        await run(db, message("2 напитка, заберу сам, наличными", mid="m1"), llm, wz)
    # Model saw real menu data with ids and prices.
    tool_result = llm.calls[1]["messages"][-1]["content"][0]["content"]
    assert '"id": 2' in tool_result and '"price": 300.0' in tool_result
    summary = wz.sent[-1]["text"]
    assert "Drink" in summary and "600 ₸" in summary and "ДА" in summary

    async with maker() as db:
        await run(db, message("Да!", mid="m2"), ScriptedClaude(), wz)
        order = await db.scalar(select(Food_orders).where(Food_orders.order_source == "whatsapp"))
        assert order is not None and order.status == "new" and order.total_amount == 600
        assert order.customer_phone == "+77003334455" and order.delivery_method == "pickup"
        row = await db.scalar(select(ChannelConfirmation).where(ChannelConfirmation.order_id == order.id))
        assert row.payload["reply_to"] == {"channel_id": "chan-1", "chat_type": "whatsapp", "chat_id": "77003334455"}
    assert f"№{order.id}" in wz.sent[-1]["text"]

    # Redelivered webhook for the same "ДА" does nothing.
    async with maker() as db:
        await run(db, message("Да!", mid="m2"), ScriptedClaude(), wz)
        count = len((await db.scalars(select(Food_orders).where(Food_orders.order_source == "whatsapp"))).all())
    assert count == 1


@pytest.mark.asyncio
async def test_yes_to_another_question_never_places_old_quote(env):
    _, maker, _, _ = env
    wz = FakeWazzup()
    async with maker() as db:
        await run(db, message("2 напитка самовывоз наличные", mid="a1"), ScriptedClaude(tool("prepare_order", ORDER)), wz)
        await run(db, message("а пицца есть?", mid="a2"), ScriptedClaude(say("Есть Pizza за 1500 ₸. Добавить?")), wz)
        # "да" now answers the pizza question, not the summary -> goes to the model, no order.
        llm = ScriptedClaude(say("Добавил бы, уточните способ получения."))
        await run(db, message("да", mid="a3"), llm, wz)
        assert llm.calls, "reply must be handled by the model"
        assert await db.scalar(select(Food_orders).where(Food_orders.order_source == "whatsapp")) is None


@pytest.mark.asyncio
async def test_operator_echo_pauses_bot(env):
    _, maker, _, _ = env
    wz = FakeWazzup()
    async with maker() as db:
        await run(db, message("привет", mid="b1"), ScriptedClaude(say("Здравствуйте!")), wz)
        # Echo of the bot's own message does not pause.
        await run(db, message("Здравствуйте!", mid="out-1", echo=True), ScriptedClaude(), wz)
        assert not get_store().get(("chan-1", "whatsapp", "77003334455")).paused
        # Operator typed in Wazzup -> bot goes silent.
        await run(db, message("Добрый вечер, это оператор", mid="op-1", echo=True), ScriptedClaude(), wz)
        llm = ScriptedClaude()
        await run(db, message("хочу пиццу", mid="b2"), llm, wz)
    assert not llm.calls and len(wz.sent) == 1


@pytest.mark.asyncio
async def test_instagram_requires_phone_and_cannot_spend_bonuses(env):
    _, maker, _, _ = env
    wz = FakeWazzup()
    async with maker() as db:
        llm = ScriptedClaude(tool("prepare_order", ORDER), say("Подскажите номер телефона?"))
        await run(db, message("2 напитка", mid="i1", chat_type="instagram", chat_id="aidos.krg"), llm, wz)
        assert "телефон" in llm.calls[1]["messages"][-1]["content"][0]["content"]
        assert wz.sent[-1]["text"] == "Подскажите номер телефона?"

        llm = ScriptedClaude(
            tool("remember_customer", {"phone": "8 700 999 88 77"}),
            tool("my_bonuses", {}, tid="t2"),
            tool("prepare_order", {**ORDER, "bonus_points_to_use": 500}, tid="t3"),
        )
        await run(db, message("87009998877", mid="i2", chat_type="instagram", chat_id="aidos.krg"), llm, wz)
        assert "WhatsApp" in llm.calls[2]["messages"][-1]["content"][0]["content"]  # bonuses refused
        await run(db, message("да", mid="i3", chat_type="instagram", chat_id="aidos.krg"), ScriptedClaude(), wz)
        order = await db.scalar(select(Food_orders).where(Food_orders.order_source == "instagram"))
        assert order is not None and order.customer_phone == "+77009998877"
        assert not order.bonus_points_used
    assert wz.sent[-1]["chat_id"] == "aidos.krg"


@pytest.mark.asyncio
async def test_handoff_notifies_and_pauses(env, monkeypatch):
    _, maker, _, _ = env
    wz = FakeWazzup()
    calls = []

    async def fake_notify(msg, reason, session):
        calls.append(reason)

    monkeypatch.setattr(A, "notify_operator", fake_notify)
    async with maker() as db:
        await run(db, message("курьер нагрубил!", mid="h1"), ScriptedClaude(tool("call_operator", {"reason": "жалоба"})), wz)
    assert calls and "оператор" in wz.sent[-1]["text"].lower()
    assert get_store().get(("chan-1", "whatsapp", "77003334455")).paused_until > time.time()


@pytest.mark.asyncio
async def test_foreign_channel_ignored(env):
    _, maker, _, _ = env
    wz = FakeWazzup()
    llm = ScriptedClaude()
    async with maker() as db:
        await run(db, message("привет", mid="f1", channel="other-chan"), llm, wz)
    assert not llm.calls and not wz.sent


def test_webhook_token_and_test_ping(monkeypatch):
    monkeypatch.setenv("WAZZUP_WEBHOOK_TOKEN", "secret-token")
    from routers.wazzup_webhook import router

    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    assert client.post("/api/v1/wazzup/webhook", json={"test": True}).status_code == 403
    assert client.post("/api/v1/wazzup/webhook?token=wrong", json={"test": True}).status_code == 403
    assert client.post("/api/v1/wazzup/webhook?token=secret-token", json={"test": True}).status_code == 200


def test_quote_summary_and_yes_parsing():
    text = A.quote_summary({"order_items": json.dumps([{"name": "Шаурма", "quantity": 2, "sum": 2400}]),
                            "total_amount": 2900, "delivery_method": "delivery", "payment_method": "kaspi_qr"})
    assert "Доставка и сбор: 500 ₸" in text and "Итого: 2 900 ₸" in text and "Kaspi QR" in text
    assert A.is_explicit_yes("Да, подтверждаю") and A.is_explicit_yes("ок")
    assert not A.is_explicit_yes("да, но без лука") and not A.is_explicit_yes("нет")
