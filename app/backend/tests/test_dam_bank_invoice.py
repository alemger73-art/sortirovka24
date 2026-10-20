"""Kaspi/Halyk without a bank API: customer gives the invoice number, the operator
issues the invoice by hand, marks it sent, then confirms the money."""
import json
from uuid import uuid4
import pytest
from sqlalchemy import select
from unittest.mock import AsyncMock
from models.food_payment import FoodPayment
from models.user_notifications import UserNotification
from tests.test_dam_order_workflow import env, BASE
from tests.test_google_checkout_history import login


async def checkout(env, method='kaspi_qr', **extra):
    client, maker, _, patch = env
    patch.delenv('PAYMENT_TEST_SECRET', raising=False)
    uid, headers = await login(maker)
    body = {'legal_version': '2026-10-09', 'legal_accepted': True, 'request_key': str(uuid4()), 'restaurant_id': 1,
            'customer_name': 'Kaspi client', 'customer_phone': '+77003334455', 'delivery_method': 'pickup',
            'payment_method': method, 'order_items': json.dumps([{'id': 2, 'quantity': 2}]), 'total_amount': 600, **extra}
    return uid, headers, await client.post('/api/v1/entities/food_orders', headers=headers, json=body)


@pytest.mark.asyncio
@pytest.mark.parametrize('method', ['kaspi_qr', 'halyk_qr'])
async def test_customer_bank_order_flow(env, method):
    client, maker, operator, patch = env
    whatsapp = AsyncMock()
    patch.setattr('services.customer_payment_notice._whatsapp', whatsapp)
    uid, headers, made = await checkout(env, method, payment_phone='8 701 555 66 77')
    assert made.status_code == 201, made.text
    oid = made.json()['id']
    async with maker() as db:
        pay = await db.scalar(select(FoodPayment).where(FoodPayment.order_id == oid))
        assert pay.metadata_json['invoice_phone'] == '+77015556677'
    detail = (await client.get(BASE + f'/orders/{oid}', headers=operator)).json()['order']
    assert detail['invoice_phone'] == '+77015556677' and not detail['invoice_sent_at']
    assert detail['workflow_state'] == 'WAITING_PAYMENT' and detail['manual_payment_confirmation'] is True
    mine = (await client.get(f'/api/v1/account/orders/food/{oid}', headers=headers)).json()
    assert mine['invoice_phone'] == '+77015556677' and mine['invoice_sent_at'] is None

    sent = await client.post(BASE + f'/orders/{oid}/invoice-sent', headers=operator)
    assert sent.status_code == 200, sent.text
    whatsapp.assert_awaited_once()
    assert whatsapp.await_args.args[0] == '+77015556677'
    assert whatsapp.await_args.args[1].startswith('🔔 Сортировка 24')
    async with maker() as db:
        note = await db.scalar(select(UserNotification).where(UserNotification.user_id == uid,
                               UserNotification.event_key.like(f'food:invoice:{oid}:%')))
        assert note and '600 ₸' in note.title
    mine = (await client.get(f'/api/v1/account/orders/food/{oid}', headers=headers)).json()
    assert mine['invoice_sent_at'] and mine['payment_status'] == 'pending'

    o = (await client.get(BASE + f'/orders/{oid}', headers=operator)).json()['order']
    assert (await client.patch(BASE + f'/orders/{oid}', headers=operator,
            json={'expected_version': o['version'], 'status': 'preparing'})).status_code == 409
    paid = await client.patch(BASE + f'/orders/{oid}', headers=operator,
                              json={'expected_version': o['version'], 'payment_status': 'paid'})
    assert paid.status_code == 200, paid.text and paid.json()['payment_status'] == 'paid'
    again = await client.post(BASE + f'/orders/{oid}/invoice-sent', headers=operator)
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_invoice_number_defaults_to_contact_phone_and_rejects_garbage(env):
    _, _, made = await checkout(env)
    assert made.status_code == 201, made.text
    _, _, bad = await checkout(env, payment_phone='123')
    assert bad.status_code == 422 and 'счёт' in bad.text


@pytest.mark.asyncio
async def test_bank_payment_can_be_switched_off(env):
    env[3].setenv('DAM_BANK_INVOICE', 'off')
    _, _, made = await checkout(env)
    assert made.status_code == 503


@pytest.mark.asyncio
async def test_cash_order_has_no_invoice(env):
    client, _, operator, _ = env
    _, _, made = await checkout(env, 'cash')
    assert made.status_code == 201, made.text
    r = await client.post(BASE + f"/orders/{made.json()['id']}/invoice-sent", headers=operator)
    assert r.status_code == 409
