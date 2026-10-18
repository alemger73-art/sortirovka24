"""Release 1.2: cash a courier collected stays on the courier until a confirmed handover."""
import pytest, uuid
from sqlalchemy import select
from tests.test_dam_order_workflow import env  # noqa
from tests.test_dam_courier_workflow import assigned, login, COURIER, BASE
from models.food_orders import Food_orders
from models.food_cashbox import FoodCashEntry
from models.courier_workflow import CourierLedger


async def _deliver_unpaid(env):
    client, maker, operator, _ = env
    async with maker() as db:
        db.add(FoodCashEntry(id=str(uuid.uuid4()), entry_key='opening', kind='opening', amount=0, recipient='', reason='count', actor='Owner', actor_id='2'))
        await db.commit()
    tid = await assigned(env)
    auth = await login(client)
    r = await client.post(f'/api/v1/logistics/tasks/{tid}/status', headers=auth, json={'status': 'delivered'})
    assert r.status_code == 200, r.text
    async with maker() as db:
        o = await db.get(Food_orders, 1)
        assert o.status == 'done' and o.payment_status != 'paid'
        return auth, o.version


@pytest.mark.asyncio
async def test_operator_marks_cash_at_courier_then_handover_moves_it_to_cashbox(env):
    client, maker, operator, _ = env
    auth, version = await _deliver_unpaid(env)
    r = await client.patch(BASE + '/orders/1', headers=operator,
                           json={'expected_version': version, 'payment_status': 'paid', 'cash_location': 'courier'})
    assert r.status_code == 200, r.text
    async with maker() as db:
        o = await db.get(Food_orders, 1)
        assert o.payment_status == 'paid'
        kinds = [c.kind for c in (await db.scalars(select(FoodCashEntry))).all()]
        assert kinds == ['opening']  # drawer untouched while the courier holds the money
        ledger = [(l.event_type, float(l.amount)) for l in (await db.scalars(select(CourierLedger))).all()]
        assert ('cash_collected', 1200.0) in ledger
    money = (await client.get(COURIER + '/cabinet', headers=auth)).json()['money']
    assert money['cash_balance'] == 1200
    h = await client.post(COURIER + '/cash-handover', headers=auth)
    assert h.status_code == 200, h.text
    hid = h.json()['id']
    c = await client.post(f'{BASE}/cash-handovers/{hid}/confirm', headers=operator)
    assert c.status_code == 200, c.text
    async with maker() as db:
        kinds = sorted(c.kind for c in (await db.scalars(select(FoodCashEntry))).all())
        assert kinds == ['handover', 'opening']
    money = (await client.get(COURIER + '/cabinet', headers=auth)).json()['money']
    assert money['cash_balance'] == 0


@pytest.mark.asyncio
async def test_cash_at_courier_is_refused_for_pickup_or_unassigned(env):
    client, maker, operator, _ = env
    r = await client.patch(BASE + '/orders/1', headers=operator, json={'expected_version': 0, 'cash_location': 'courier'})
    assert r.status_code == 422
