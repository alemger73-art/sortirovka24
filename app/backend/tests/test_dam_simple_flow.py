"""The simple DÄM ALEM flow, the production default: Принять → Готовится → Готово → В пути / Готов к выдаче →
Доставлен / Выдан. No couriers, no Kaspi/Halyk invoices, no separate «деньги получены» step: the money is taken
with «Доставлен» / «Выдан», and bonuses come with it. Every test name says «simple_flow» (see conftest)."""
import json
from uuid import uuid4
import pytest
from sqlalchemy import select, func
from models.food_orders import Food_orders
from models.food_settings import Food_settings
from models.logistics import LogisticsTask
from models.user_management import Bonus
from models.auth import User
from services.food_orders import couriers_enabled, operator_runs_delivery
from services.operator_console import facts, card_keyboard, target_label
from tests.test_dam_order_workflow import env, BASE, owner_headers  # noqa: F401


async def walk(client, headers, oid, statuses):
    for status in statuses:
        order = (await client.get(BASE + f'/orders/{oid}', headers=headers)).json()['order']
        result = await client.patch(BASE + f'/orders/{oid}', headers=headers, json={'expected_version': order['version'], 'status': status})
        assert result.status_code == 200, (status, result.text)
    return result.json()


async def unpaid(maker, method='cash', delivery='delivery'):
    async with maker() as db:
        row = await db.get(Food_orders, 1)
        row.payment_method, row.payment_status, row.paid_amount, row.delivery_method = method, 'pending', 0, delivery
        await db.commit()


def test_simple_flow_switches_default_off(monkeypatch):
    monkeypatch.delenv('DAM_COURIERS', raising=False)
    assert not couriers_enabled({}) and operator_runs_delivery({})
    assert couriers_enabled({'couriers_enabled': '1'}) and not operator_runs_delivery({'couriers_enabled': '1'})
    monkeypatch.setenv('DAM_COURIERS', 'on')
    assert couriers_enabled({}) and not couriers_enabled({'couriers_enabled': '0'})


@pytest.mark.asyncio
async def test_simple_flow_delivery_without_courier_or_payment_step(env):
    client, maker, headers, _ = env
    await unpaid(maker)
    detail = (await client.get(BASE + '/orders/1', headers=headers)).json()['order']
    assert detail['couriers_enabled'] is False and detail['operator_runs_delivery'] is True and detail['payment_steps'] is False
    await walk(client, headers, 1, ['preparing'])
    assert (await client.get(BASE + '/orders/1', headers=headers)).json()['order']['status'] == 'preparing'
    on_way = await walk(client, headers, 1, ['in_progress'])  # «Готово» sends it on its way, no «ready» stop
    assert on_way['status'] == 'in_progress' and on_way['payment_status'] == 'pending'
    done = await walk(client, headers, 1, ['done'])
    assert (done['status'], done['payment_status'], done['paid_amount']) == ('done', 'paid', 1200)
    async with maker() as db:
        assert not await db.scalar(select(func.count()).select_from(LogisticsTask))  # nothing for couriers


@pytest.mark.asyncio
async def test_simple_flow_pickup_is_handed_out_and_paid(env):
    client, maker, headers, _ = env
    await unpaid(maker, 'kaspi_transfer', 'pickup')
    done = await walk(client, headers, 1, ['preparing', 'ready', 'done'])
    assert (done['status'], done['payment_status']) == ('done', 'paid')


@pytest.mark.asyncio
async def test_simple_flow_unpaid_old_kaspi_invoice_order_is_accepted(env):
    client, maker, headers, _ = env
    await unpaid(maker, 'kaspi_qr')
    detail = (await client.get(BASE + '/orders/1', headers=headers)).json()['order']
    assert detail['workflow_state'] == 'READY_FOR_OPERATOR'
    assert (await walk(client, headers, 1, ['preparing']))['status'] == 'preparing'
    assert (await client.post(BASE + '/orders/1/invoice-sent', headers=headers)).status_code == 409


@pytest.mark.asyncio
async def test_simple_flow_couriers_are_off(env):
    client, maker, headers, _ = env
    await walk(client, headers, 1, ['preparing'])
    assigned = await client.post(BASE + '/orders/1/assign-courier', headers=headers, json={'courier_id': 'courier'})
    assert assigned.status_code == 409 and 'Курьеры временно отключены' in assigned.json()['detail']
    me = (await client.get('/api/v1/dam-alem/business/me', headers=headers)).json()
    assert me['couriers_enabled'] is False
    async with maker() as db:
        db.add(Food_settings(setting_key='couriers_enabled', setting_value='1', is_active=True))
        await db.commit()
    again = await client.post(BASE + '/orders/1/assign-courier', headers=headers, json={'courier_id': 'courier'})
    assert again.status_code == 200, again.text  # the owner can switch couriers back on


@pytest.mark.asyncio
async def test_simple_flow_bonuses_come_with_delivered(env):
    client, maker, _, _ = env
    headers = owner_headers()
    async with maker() as db:
        from services import loyalty as L, crm
        u = User(id='customer', phone='+77000000000', bonus_balance=0, phone_verified_at=L.now()); db.add(u); await db.flush()
        await crm.for_account(db, u)
        order = await db.get(Food_orders, 1)
        order.loyalty_snapshot = await L.price_snapshot(db, food=1000, promo=0, delivery=200, service=0, user=u)
        order.payment_method, order.payment_status, order.paid_amount = 'cash', 'pending', 0
        await db.commit()
    await walk(client, headers, 1, ['preparing', 'in_progress', 'done'])
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(Bonus).where(Bonus.kind == 'EARN')) == 1


@pytest.mark.asyncio
async def test_simple_flow_checkout_offers_cash_or_kaspi_transfer(env):
    client, maker, _, patch = env
    patch.delenv('PAYMENT_TEST_SECRET', raising=False)
    from tests.test_google_checkout_history import login
    _, headers = await login(maker)

    async def checkout(method):
        body = {'legal_version': '2026-10-09', 'legal_accepted': True, 'request_key': str(uuid4()), 'restaurant_id': 1,
                'customer_name': 'Client', 'customer_phone': '+77003334455', 'delivery_method': 'pickup',
                'payment_method': method, 'order_items': json.dumps([{'id': 2, 'quantity': 2}]), 'total_amount': 600}
        return await client.post('/api/v1/entities/food_orders', headers=headers, json=body)

    made = await checkout('kaspi_transfer')
    assert made.status_code == 201, made.text
    assert (made.json()['payment_method'], made.json()['status']) == ('kaspi_transfer', 'new')
    for bank in ('kaspi_qr', 'halyk_qr'):
        refused = await checkout(bank)
        assert refused.status_code == 400 and 'Kaspi переводом при получении' in refused.json()['detail']


def test_simple_flow_telegram_console_buttons():
    base = {'id': 7, 'delivery_method': 'delivery', 'total_amount': 1000, 'payment_method': 'cash', 'payment_status': 'pending',
            'operator_runs_delivery': True, 'couriers_enabled': False, 'payment_steps': False, 'workflow_state': 'READY_FOR_OPERATOR'}
    steps = {'new': ('preparing', '✅ Принять'), 'preparing': ('in_progress', '✅ Готово'), 'in_progress': ('done', '📦 Доставлен')}
    for status, (target, label) in steps.items():
        f = facts({**base, 'status': status})
        assert (f['target'], target_label(f)) == (target, label)
        texts = [b['text'] for row in card_keyboard({'order': {**base, 'status': status}})['inline_keyboard'] for b in row]
        assert texts[0] == label
        assert not any('курьер' in t.lower() or 'Оплата получена' in t or 'Счёт' in t for t in texts), texts
    pickup = facts({**base, 'delivery_method': 'pickup', 'status': 'ready'})
    assert (pickup['target'], target_label(pickup)) == ('done', '📦 Выдан')
