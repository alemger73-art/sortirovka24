"""Audit 2026-10-18: who holds cash after a courier delivers an unpaid cash order (see docs/audits)."""
import pytest, uuid
from sqlalchemy import select, func
from tests.test_dam_order_workflow import env  # noqa
from tests.test_dam_courier_workflow import assigned, login, COURIER, BASE
from models.food_orders import Food_orders
from models.food_cashbox import FoodCashEntry
from models.courier_workflow import CourierLedger

@pytest.mark.asyncio
@pytest.mark.xfail(strict=True, reason='Audit 2026-10-18 #1: cash is booked into the cashbox while the courier still holds it')
async def test_cash_stays_with_courier_until_handover(env):
    client, maker, operator, _ = env
    async with maker() as db:
        db.add(FoodCashEntry(id=str(uuid.uuid4()), entry_key='opening', kind='opening', amount=0, recipient='', reason='count', actor='Owner', actor_id='2'))
        await db.commit()
    tid = await assigned(env)
    auth = await login(client)
    r = await client.post(f'/api/v1/logistics/tasks/{tid}/status', headers=auth, json={'status': 'delivered'})
    print('courier delivered:', r.status_code, r.text[:200])
    async with maker() as db:
        o = await db.get(Food_orders, 1)
        print('order after delivery:', o.status, o.payment_status, o.paid_amount, 'version', o.version)
        version = o.version
    r = await client.patch(BASE + '/orders/1', headers=operator, json={'expected_version': version, 'payment_status': 'paid'})
    print('operator mark paid:', r.status_code, r.text[:300])
    async with maker() as db:
        o = await db.get(Food_orders, 1)
        cash = (await db.scalars(select(FoodCashEntry))).all()
        ledger = (await db.scalars(select(CourierLedger))).all()
        print('order:', o.status, o.payment_status, o.paid_amount)
        print('cashbox entries:', [(c.kind, float(c.amount)) for c in cash])
        print('courier ledger:', [(l.event_type, float(l.amount)) for l in ledger])
    m = (await client.get(COURIER + '/cabinet', headers=auth)).json()['money']
    print('courier money:', {k: m[k] for k in ('cash_balance', 'earned', 'payout_due')})
    h = await client.post(COURIER + '/cash-handover', headers=auth)
    print('courier handover:', h.status_code, h.text[:200])
    # Desired: the courier holds the money until a confirmed handover; the drawer is untouched.
    assert m['cash_balance'] == 1200
    assert [c.kind for c in cash] == ['opening']
