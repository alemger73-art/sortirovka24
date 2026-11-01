"""Money fixes found by the November 2026 DÄM ALEM audit (each test failed before its fix)."""
import uuid

import pytest
from sqlalchemy import select

from models.courier_workflow import CourierLedger
from models.food_cashbox import FoodCashEntry
from models.food_orders import Food_orders
from tests.test_dam_courier_workflow import BASE, COURIER, assigned, login
from tests.test_dam_order_workflow import env  # noqa: F401


@pytest.mark.asyncio
async def test_cash_paid_in_two_parts_is_all_on_the_courier(env):  # noqa: F811
    """500 ₸ handed at a manual delivery, the remaining 700 ₸ marked «у курьера» later: the courier owes 1200."""
    client, maker, operator, _ = env
    async with maker() as db:
        db.add(FoodCashEntry(id=str(uuid.uuid4()), entry_key='opening', kind='opening', amount=0, recipient='', reason='count', actor='Owner', actor_id='2'))
        await db.commit()
    tid = await assigned(env)
    auth = await login(client)
    assert tid  # the helper hands the order to the courier and brings it to the customer's door
    async with maker() as db:
        version = (await db.get(Food_orders, 1)).version
    r = await client.post(BASE + '/orders/1/manual-delivery', headers=operator,
                          json={'expected_version': version, 'reason': 'courier', 'cash_received': True, 'amount': 500, 'comment': 'частично'})
    assert r.status_code == 200, r.text
    async with maker() as db:
        version = (await db.get(Food_orders, 1)).version
    r = await client.patch(BASE + '/orders/1', headers=operator, json={'expected_version': version, 'payment_status': 'paid', 'cash_location': 'courier'})
    assert r.status_code == 200, r.text
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        parts = sorted(float(e.amount) for e in (await db.scalars(select(CourierLedger).where(CourierLedger.event_type == 'cash_collected'))).all())
    assert order.payment_status == 'paid' and parts == [500.0, float(order.total_amount) - 500]
    money = (await client.get(COURIER + '/cabinet', headers=auth)).json()['money']
    assert money['cash_balance'] == float(order.total_amount)


@pytest.mark.asyncio
async def test_operator_order_gets_free_delivery_like_the_site(env):  # noqa: F811
    """A phone/POS order above «бесплатная доставка от» is free like on the site; the courier still gets the zone pay."""
    import json
    from models.food_settings import Food_settings
    from tests.test_dam_zone_tariffs import BASE as ZBASE, body, configure
    client, maker, headers, _ = env
    await configure(maker)
    async with maker() as db:
        db.add(Food_settings(setting_key='free_delivery_from', setting_value='1000'))
        await db.commit()
    quote = await client.post(ZBASE + '/manual/quote', headers=headers, json=body())
    assert quote.status_code == 200, quote.text
    assert quote.json()['total_amount'] == 1500  # 1500 of food, delivery free
    draft = {**body(), 'quoted_total': 1500}
    saved = await client.post(ZBASE + '/manual', headers=headers, json=draft)
    assert saved.status_code == 201, saved.text
    async with maker() as db:
        snapshot = json.loads((await db.get(Food_orders, saved.json()['id'])).pricing_snapshot)
    assert snapshot['delivery_tariff']['courier_payout'] == 800 and snapshot['staff_delivery_fee'] is False


def test_edit_keeps_a_promo_that_was_valid_on_the_order_day():
    """WEEKEND valid till Sunday: an operator edit on Monday re-prices the Sunday order with the same promo."""
    import json
    from types import SimpleNamespace
    from fastapi import HTTPException
    from services.dam_order_workflow import order_day
    from services.food_order_validation import _resolve_promo
    cfg = {'promo_codes': json.dumps([{'code': 'WEEKEND', 'type': 'percent', 'value': 12, 'min_order': 12000,
                                       'max_discount': 2000, 'active': True, 'valid_until': '2020-11-01'}])}
    with pytest.raises(HTTPException):
        _resolve_promo('WEEKEND', 12000, cfg)  # a new order today: expired
    assert _resolve_promo('WEEKEND', 12000, cfg, on='2020-11-01') == (1440, False)
    # the order day is Almaty time: 20:30 UTC on Oct 31 is already Nov 1 in Karaganda
    assert order_day(SimpleNamespace(created_at='2020-10-31T20:30:00+00:00')) == '2020-11-01'
    assert order_day(SimpleNamespace(created_at=None)) is None


@pytest.mark.asyncio
async def test_payroll_percent_is_taken_after_a_partial_refund(env):  # noqa: F811
    """Pizza 1000 ₸, 300 ₸ returned for a missing dish: the cook's 10 % is from 700, not 1000."""
    from models.food_business import FoodRefund
    from models.food_items import Food_items
    from models.food_payroll import FoodPayrollEmployee, FoodPayrollWork
    from services.food_payroll import calculate
    _, maker, _, _ = env
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.status, order.payment_status, order.paid_amount = 'done', 'paid', 1200
        order.created_at = order.completed_at = order.paid_at = '2026-10-09T10:00:00Z'
        (await db.get(Food_items, 1)).sales_department = 'kitchen'
        db.add(FoodPayrollEmployee(id=81, name='Cook', position='Cook', daily_base=1000, percent=10, basis='kitchen'))
        db.add(FoodPayrollWork(id='cook-81', day='2026-10-09', employee_id=81, daily_base=1000, percent=10, basis='kitchen'))
        await db.commit()
        assert (await calculate(db, '2026-10-09'))['sales']['kitchen'] == 1000
        db.add(FoodRefund(order_id=1, amount=300, day='2026-10-09', actor='Owner', note='нет блюда', created_at='2026-10-09T12:00:00Z'))
        await db.commit()
        salary = await calculate(db, '2026-10-09')
    assert salary['sales']['kitchen'] == 700 and salary['rows'][0]['commission'] == 70.0


@pytest.mark.asyncio
async def test_todays_refund_is_in_the_open_shift(env):  # noqa: F811
    """A 300 ₸ refund made today must show in the open shift's summary, next to the cash it took from the drawer."""
    from uuid import uuid4
    from routers.food_business import city_today
    from services.dam_shift_summary import summary
    from services.food_shifts import active_shift
    from tests.test_dam_order_workflow import owner_headers
    client, maker, _, _ = env
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.status, order.payment_status, order.paid_amount, order.payment_method = 'done', 'paid', 1200, 'cash'
        await db.commit()
    r = await client.post('/api/v1/dam-alem/business/refunds/1', headers=owner_headers(),
                          json={'day': str(city_today()), 'amount': 300, 'note': 'нет одного блюда', 'request_key': str(uuid4())})
    assert r.status_code == 200, r.text
    async with maker() as db:
        shift = await active_shift(db, 'partner', 1)
        assert (await summary(db, shift))['refunds'] == 300
