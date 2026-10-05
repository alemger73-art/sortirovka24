import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.food_payment import FoodPayment
from models.module_settings import ModuleSettings
from models.food_restaurants import Food_restaurants
from services.food_orders import Food_ordersService
from routers import account_v2
from tests.test_dam_order_workflow import env, BASE  # noqa: F401

CUSTOMER = '/api/v1/account/orders/food/1/receipt'


async def customer_order(maker, monkeypatch, **values):
    user = SimpleNamespace(id='client', phone='+77000000000', phone_verified_at=datetime.now(timezone.utc))
    monkeypatch.setattr(account_v2, '_current_user', AsyncMock(return_value=user))
    async with maker() as db:
        row = await db.get(Food_orders, 1)
        row.customer_id = None
        row.user_id = 'client'
        row.payment_method = 'cash'
        row.payment_status = 'pending'
        row.paid_amount = 0
        row.pricing_snapshot = json.dumps({'service_rate': .1, 'base_delivery_fee': 100,
            'settings': {'promo_codes': 'private'}, 'breakdown': {'subtotal': 1000, 'service_fee': 100, 'delivery_fee': 100, 'discount': 0}})
        for key, value in values.items():
            setattr(row, key, value)
        await db.commit()
    return {'expected_version': 0, 'reason': 'Изменил планы', 'items': [{'line_index': 0, 'quantity': 2}]}


@pytest.mark.asyncio
async def test_customer_edit_saves_full_versions_and_stale_retry_is_atomic(env):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch)
    detail = await client.get('/api/v1/account/orders/food/1')
    assert detail.json()['can_edit_receipt'] is True
    quote = await client.post(CUSTOMER + '/quote', json=body)
    assert quote.status_code == 200, quote.text
    data = quote.json()
    assert data['total_amount'] == 2300
    assert 'pricing_snapshot' not in data and 'private' not in quote.text
    body['quoted_total'] = data['total_amount']
    saved = await client.post(CUSTOMER, json=body)
    assert saved.status_code == 200, saved.text
    change = saved.json()['receipt_changes'][0]
    assert change['actor_role'] == 'customer'
    assert change['before']['receipt'] == {'subtotal': 1000, 'service_fee': 100, 'delivery_fee': 100, 'discount': 0}
    assert change['after']['receipt']['subtotal'] == 2000
    assert change['before']['items'][0]['quantity'] == 1
    assert change['after']['items'][0]['quantity'] == 2
    assert saved.json()['version'] == 1 and saved.json()['receipt_revision'] == 1
    assert (await client.post(CUSTOMER, json=body)).status_code == 409
    async with maker() as db:
        events = (await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.public_data.isnot(None)))).all()
        assert len(events) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('values', [
    {'status': 'confirmed'}, {'status': 'preparing'}, {'status': 'done'},
    {'paid_amount': 100}, {'payment_status': 'paid'}, {'payment_method': 'kaspi_qr'},
])
async def test_customer_cannot_overwrite_accepted_or_paid_order(env, values):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch, **values)
    body['quoted_total'] = 2300
    rejected = await client.post(CUSTOMER, json=body)
    assert rejected.status_code == 409, rejected.text
    async with maker() as db:
        row = await db.get(Food_orders, 1)
        assert row.version == 0 and row.total_amount == 1200


@pytest.mark.asyncio
async def test_online_payment_row_blocks_even_if_method_changed_to_cash(env):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch)
    async with maker() as db:
        db.add(FoodPayment(id='bank-lock', order_id=1, provider='KASPI', amount=1200, currency='KZT', status='WAITING', created_at='2026-10-05'))
        await db.commit()
    body['quoted_total'] = 2300
    assert (await client.post(CUSTOMER, json=body)).status_code == 409


@pytest.mark.asyncio
async def test_recorded_cash_payment_blocks_inconsistent_unpaid_order(env):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch)
    async with maker() as db:
        db.add(FoodPayment(id='cash-paid', order_id=1, provider='CASH', amount=1200, currency='KZT', status='PAID', created_at='2026-10-05'))
        await db.commit()
    body['quoted_total'] = 2300
    assert (await client.post(CUSTOMER, json=body)).status_code == 409


@pytest.mark.asyncio
async def test_request_visible_to_operator_and_does_not_change_receipt_or_payment(env):
    client, maker, staff, monkeypatch = env
    body = await customer_order(maker, monkeypatch, status='confirmed', payment_method='kaspi_qr', paid_amount=1200, payment_status='paid')
    body['quoted_total'] = 2300
    result = await client.post(CUSTOMER + '/request', json=body)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data['amount'] == 1200 and data['paid_amount'] == 1200 and data['receipt_revision'] == 0
    assert data['receipt_changes'][0]['kind'] == 'receipt_change_requested'
    assert data['receipt_changes'][0]['after']['total_amount'] == 2300
    panel = await client.get(BASE + '/orders/1', headers=staff)
    assert panel.status_code == 200, panel.text
    assert any('Клиент просит изменить' in event['message'] for event in panel.json()['events'])
    assert (await client.post(CUSTOMER + '/request', json=body)).status_code == 409


@pytest.mark.asyncio
async def test_foreign_customer_and_disabled_module_cannot_quote_or_edit(env):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch)
    monkeypatch.setattr(account_v2, '_current_user', AsyncMock(return_value=SimpleNamespace(id='foreign', phone='+77019999999', phone_verified_at=datetime.now(timezone.utc))))
    for path in ['/quote', '', '/request']:
        assert (await client.post(CUSTOMER + path, json=body)).status_code == 404
    assert (await client.get(CUSTOMER + '/catalog')).status_code == 404


@pytest.mark.asyncio
async def test_wrong_total_and_client_price_injection_do_not_mutate(env):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch)
    body['quoted_total'] = 1
    assert (await client.post(CUSTOMER, json=body)).status_code == 409
    body['items'][0]['price'] = 1
    assert (await client.post(CUSTOMER + '/quote', json=body)).status_code == 422
    async with maker() as db:
        row = await db.get(Food_orders, 1)
        assert row.version == 0 and row.total_amount == 1200


@pytest.mark.asyncio
async def test_operator_accepting_after_quote_prevents_client_save(env):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch)
    quote = await client.post(CUSTOMER + '/quote', json=body)
    assert quote.status_code == 200
    body['quoted_total'] = quote.json()['total_amount']
    async with maker() as db:
        row = await db.get(Food_orders, 1)
        row.status, row.version = 'confirmed', 1
        await db.commit()
    assert (await client.post(CUSTOMER, json=body)).status_code == 409
    async with maker() as db:
        assert (await db.get(Food_orders, 1)).total_amount == 1200


@pytest.mark.asyncio
async def test_customer_minimum_and_disabled_module(env):
    client, maker, _, monkeypatch = env
    body = await customer_order(maker, monkeypatch)
    async with maker() as db:
        restaurant = await db.get(Food_restaurants, 1)
        restaurant.min_order = 3000
        await db.commit()
    body['quoted_total'] = 2300
    assert (await client.post(CUSTOMER, json=body)).status_code == 422
    async with maker() as db:
        assert (await db.get(Food_orders, 1)).version == 0
        db.add(ModuleSettings(key='food', value='false'))
        await db.commit()
    assert (await client.post(CUSTOMER + '/quote', json=body)).status_code == 404


@pytest.mark.asyncio
async def test_receipt_actions_require_customer_authentication(env):
    client, _, _, _ = env
    body = {'expected_version':0,'reason':'Изменить заказ','items':[{'line_index':0,'quantity':1}]}
    for path in ['', '/quote', '/request']:
        assert (await client.post(CUSTOMER + path, json=body)).status_code == 401
    assert (await client.get(CUSTOMER + '/catalog')).status_code == 401


@pytest.mark.asyncio
async def test_initial_receipt_survives_later_order_changes(env):
    _, maker, _, monkeypatch = env
    await customer_order(maker, monkeypatch)
    async with maker() as db:
        original = await db.get(Food_orders, 1)
        created = await Food_ordersService(db).create({'restaurant_id':1, 'restaurant_name':'DAM ALEM 2.0',
            'customer_name':'Клиент', 'customer_phone':'+77001234567', 'delivery_method':'pickup',
            'payment_method':'cash', 'payment_status':'pending', 'total_amount':1200,
            'order_items':original.order_items, 'pricing_snapshot':original.pricing_snapshot})
        event = await db.scalar(select(FoodOrderEvent).where(FoodOrderEvent.order_id == created.id, FoodOrderEvent.public_data.isnot(None)))
        baseline = json.loads(event.public_data)
        assert baseline['kind'] == 'receipt_created'
        assert baseline['after']['receipt']['subtotal'] == 1000
        created.order_items = '[{"name":"Другой состав","quantity":9}]'
        created.total_amount = 9999
        await db.commit()
        await db.refresh(event)
        unchanged = json.loads(event.public_data)
        assert unchanged == baseline
        assert unchanged['after']['total_amount'] == 1200
        assert unchanged['after']['items'][0]['quantity'] == 1
