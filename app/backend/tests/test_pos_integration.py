"""The Dam Alem till and the site's bonuses, on a real database: one account, the site's rules, nothing counted twice."""
import re
import time
from decimal import Decimal

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select, text

import routers.pos_integration as pos
from models.auth import User
from models.loyalty import BonusMember
from models.user_management import Bonus
from models.user_notifications import UserNotification
from services import crm, loyalty as L, pos_bonus
from tests.test_loyalty import store  # noqa: F401  (the real-database fixture)

pytestmark = pytest.mark.asyncio
KEY = "k" * 40
PHONE = "8 701 555 44 33"


@pytest.fixture
def sent(monkeypatch):
    """WhatsApp messages the clients would get."""
    out = []

    async def send(phone, message):
        out.append((pos_bonus._digits(phone), message))
        return True
    monkeypatch.setattr(pos_bonus, "send", send)
    return out


@pytest.fixture
async def till(store, monkeypatch, sent):  # noqa: F811
    monkeypatch.setenv("POS_INTEGRATION_KEY", KEY)
    app = FastAPI()
    app.include_router(pos.router)

    async def db():
        async with store() as session:
            yield session
    app.dependency_overrides[pos.get_db] = db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t", headers={"X-Api-Key": KEY}) as c:
        c.store = store
        yield c


async def _earn(till, ref="r1", eligible=10000, phone=PHONE, number=1001):
    return await till.post("/api/v1/integrations/pos/earn", json={"phone": phone, "name": "Айгерим", "pos_ref": ref, "number": number, "eligible": eligible})


async def test_needs_the_key(till):
    r = await till.post("/api/v1/integrations/pos/bonus", json={"phone": PHONE}, headers={"X-Api-Key": "wrong"})
    assert r.status_code == 401


async def test_unknown_phone_shows_the_rules_and_nothing_else(till):
    r = (await till.post("/api/v1/integrations/pos/bonus", json={"phone": PHONE})).json()
    assert r == {"known": False, "balance": 0, "expires": [], "rate": 3.0, "max_percent": 20.0, "spending": True}


async def test_a_new_client_gets_cashback_and_one_whatsapp(till, sent):
    resp = await _earn(till)
    assert resp.status_code == 200, resp.text
    r = resp.json()
    assert (r["earned"], r["balance"], r["told"]) == (300, 300, True)       # 3% of 10 000 under the default rules
    again = (await _earn(till)).json()                                      # the till retries: nothing twice
    assert (again["earned"], again["balance"], again["told"]) == (300, 300, False)
    assert len(sent) == 1 and sent[0][0] == "77015554433"
    assert "начислено 300 бонусов за заказ № 1001 (3% от суммы)" in sent[0][1] and "СТОП" in sent[0][1]
    state = (await till.post("/api/v1/integrations/pos/bonus", json={"phone": "+77015554433"})).json()
    assert state["known"] and state["balance"] == 300 and state["expires"][0]["amount"] == 300
    async with till.store() as db:
        entry = await db.scalar(select(Bonus).where(Bonus.idempotency_key == "pos-earn:r1"))
        assert (entry.kind, entry.points, entry.reason) == ("EARN", Decimal("300.00"), "Кешбэк за заказ в кафе № 1001")


async def test_half_a_tenge_rounds_up_and_nothing_for_zero(till):
    assert (await _earn(till, "r2", eligible=1650)).json()["earned"] == 50      # 49,5 → 50
    r = (await _earn(till, "r3", eligible=0)).json()
    assert r["earned"] == 0 and r["told"] is False


async def test_a_registered_client_also_sees_it_in_the_app(till):
    async with till.store() as db:
        db.add(User(id="u9", phone="+77015554433", name="Айгерим", bonus_balance=0, phone_verified_at=L.now()))
        await db.flush()
        await crm.for_account(db, await db.get(User, "u9"), business_id=crm.DAM)
        await db.commit()
    await _earn(till)
    async with till.store() as db:
        notes = (await db.scalars(select(UserNotification).where(UserNotification.user_id == "u9"))).all()
        assert any("Начислено 300 бонусов" in n.body for n in notes)


async def test_stop_ends_the_messages_but_not_the_bonuses(till, sent):
    assert pos_bonus.stop_word(" Стоп! ") is True and pos_bonus.stop_word("старт") is False and pos_bonus.stop_word("стоп-лист") is None
    async with till.store() as db:
        assert "больше не придут" in await pos_bonus.answer_stop(db, "87015554433", True)
    r = (await _earn(till)).json()
    assert r["earned"] == 300 and r["told"] is False and not sent
    async with till.store() as db:
        await pos_bonus.answer_stop(db, "87015554433", False)
    assert (await _earn(till, "r2")).json()["told"] is True


async def test_the_daily_limit_holds(till):
    async with till.store() as db:
        await L.configure(db, {"customer_daily_order_limit": 2}, {"id": "owner", "role": "owner"})
        await db.commit()
    assert [(await _earn(till, f"d{i}", 1000)).json()["earned"] for i in range(3)] == [30, 30, 0]


async def _code(sent):
    return re.search(r"— (\d{4})\.", sent[-1][1]).group(1)


async def test_paying_with_bonuses_needs_the_clients_code(till, sent):
    await _earn(till, eligible=100000)                                       # 3 000 bonuses
    start = "/api/v1/integrations/pos/spend/start"
    too_much = await till.post(start, json={"phone": PHONE, "amount": 1000, "food": 4000, "pos_ref": "s1"})
    assert too_much.status_code == 422 and "не более 800" in too_much.text   # 20% of 4 000
    r = (await till.post(start, json={"phone": PHONE, "amount": 800, "food": 4000, "pos_ref": "s1"})).json()
    code = await _code(sent)
    assert "Будет списано 800 бонусов" in sent[-1][1]
    confirm = "/api/v1/integrations/pos/spend/confirm"
    wrong = await till.post(confirm, json={"spend_id": r["spend_id"], "code": "0000" if code != "0000" else "1111", "pos_ref": "s1", "number": 1002})
    assert wrong.status_code == 422 and "осталось попыток: 4" in wrong.text
    other = await till.post(confirm, json={"spend_id": r["spend_id"], "code": code, "pos_ref": "s9", "number": 1002})
    assert other.status_code == 404                                         # a code works only for its own order
    ok = (await till.post(confirm, json={"spend_id": r["spend_id"], "code": code, "pos_ref": "s1", "number": 1002})).json()
    assert ok == {"spent": 800, "balance": 2200}
    assert "оплачено бонусами 800 ₸ в заказе № 1002. Осталось 2200" in sent[-1][1]
    again = (await till.post(confirm, json={"spend_id": r["spend_id"], "code": code, "pos_ref": "s1", "number": 1002})).json()
    assert again == {"spent": 800, "balance": 2200}                          # a repeated tap takes nothing more
    second = await till.post(start, json={"phone": PHONE, "amount": 100, "food": 4000, "pos_ref": "s1"})
    assert second.status_code == 409


async def test_a_cancelled_order_gives_the_bonuses_back_once(till, sent):
    await _earn(till, eligible=100000)
    r = (await till.post("/api/v1/integrations/pos/spend/start", json={"phone": PHONE, "amount": 500, "food": 5000, "pos_ref": "c1"})).json()
    await till.post("/api/v1/integrations/pos/spend/confirm", json={"spend_id": r["spend_id"], "code": await _code(sent), "pos_ref": "c1", "number": 7})
    back = (await till.post("/api/v1/integrations/pos/restore", json={"pos_ref": "c1", "number": 7})).json()
    assert back == {"restored": 500, "balance": 3000}
    assert (await till.post("/api/v1/integrations/pos/restore", json={"pos_ref": "c1", "number": 7})).json() == {"restored": 500, "balance": 3000}
    assert (await till.post("/api/v1/integrations/pos/restore", json={"pos_ref": "nothing", "number": 8})).json() == {"restored": 0}
    async with till.store() as db:
        account = await db.scalar(select(BonusMember))
        lots = await db.scalar(text("SELECT SUM(remaining) FROM bonus_lots WHERE account_id = :a"), {"a": account.id})
        assert Decimal(str(lots)) == account.bonus_balance == Decimal("3000.00")   # the lots and the balance agree


async def test_codes_expire_and_wrong_guesses_run_out(till, sent):
    await _earn(till, eligible=100000)
    start = "/api/v1/integrations/pos/spend/start"
    r = (await till.post(start, json={"phone": PHONE, "amount": 100, "food": 4000, "pos_ref": "e1"})).json()
    async with till.store() as db:
        await db.execute(text("UPDATE pos_bonus_codes SET expires_at = :t WHERE id = :id"), {"t": int(time.time()) - 1, "id": r["spend_id"]})
        await db.commit()
    late = await till.post("/api/v1/integrations/pos/spend/confirm", json={"spend_id": r["spend_id"], "code": await _code(sent), "pos_ref": "e1", "number": 1})
    assert late.status_code == 410
    r = (await till.post(start, json={"phone": PHONE, "amount": 100, "food": 4000, "pos_ref": "e2"})).json()
    code = await _code(sent)
    bad = "0000" if code != "0000" else "1111"
    for _ in range(5):
        await till.post("/api/v1/integrations/pos/spend/confirm", json={"spend_id": r["spend_id"], "code": bad, "pos_ref": "e2", "number": 1})
    locked = await till.post("/api/v1/integrations/pos/spend/confirm", json={"spend_id": r["spend_id"], "code": code, "pos_ref": "e2", "number": 1})
    assert locked.status_code == 429


async def test_no_bonuses_no_code(till, sent):
    r = await till.post("/api/v1/integrations/pos/spend/start", json={"phone": PHONE, "amount": 100, "food": 4000, "pos_ref": "n1"})
    assert r.status_code == 409 and not sent


async def test_whatsapp_down_means_no_code_and_nothing_taken(till, sent, monkeypatch):
    await _earn(till, eligible=100000)

    async def down(phone, message):
        return False
    monkeypatch.setattr(pos_bonus, "send", down)
    r = await till.post("/api/v1/integrations/pos/spend/start", json={"phone": PHONE, "amount": 100, "food": 4000, "pos_ref": "w1"})
    assert r.status_code == 503 and "WhatsApp" in r.text
    assert (await till.post("/api/v1/integrations/pos/bonus", json={"phone": PHONE})).json()["balance"] == 3000


async def test_stop_in_whatsapp_is_answered_by_the_number_not_the_ai(monkeypatch):
    from services import support_bot

    said, stopped = [], []

    async def send_text(client, chat_id, text_):
        said.append((chat_id, text_))
        return True

    async def answer_stop(db, phone, out):
        stopped.append((phone, out))
        return "ok-stop" if out else "ok-start"

    async def no_ai(*a, **k):
        raise AssertionError("the AI must not answer СТОП")

    class Session:
        async def __aenter__(self):
            return None

        async def __aexit__(self, *a):
            return False

    import core.database as cd
    monkeypatch.setattr(cd.db_manager, "async_session_maker", lambda: Session(), raising=False)
    monkeypatch.setattr(support_bot, "send_text", send_text)
    monkeypatch.setattr(support_bot, "ask_ai", no_ai)
    monkeypatch.setattr(pos_bonus, "answer_stop", answer_stop)
    event = {"event": "message", "payload": {"id": "m-stop-1", "from": "77015554433@c.us", "body": "СТОП"}}
    out = await support_bot.handle_event(event, client=None)
    assert out.action == "stop" and said == [("77015554433@c.us", "ok-stop")] and stopped == [("+77015554433", True)]
