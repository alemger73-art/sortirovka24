"""«Оператор ведёт доставку сам»: without couriers the operator moves a delivery to «Выехал» and «Доставлено»
and takes the cash in on delivery; with the switch off the courier flow is unchanged."""
import json
import pytest
from models.food_settings import Food_settings
from services.food_orders import Food_ordersService, operator_runs_delivery
from tests.test_dam_order_workflow import env, BASE


def test_switch_reads_the_owner_setting():
    assert operator_runs_delivery({'operator_runs_delivery': '1'})
    assert not operator_runs_delivery({'operator_runs_delivery': '0'})
    assert not operator_runs_delivery({})


async def _ready_cash_delivery(client, maker, operator):
    async with maker() as db:
        order = await Food_ordersService(db).create(dict(restaurant_id=1, restaurant_name='DAM ALEM 2.0', customer_name='Test Client',
            customer_phone='+77003333333', delivery_address='Test street 1', delivery_method='delivery', payment_method='cash',
            payment_status='pending', order_items=json.dumps([{'id': 2, 'quantity': 2, 'price': 300}]), total_amount=600))
        oid = order.id
    for version, status in enumerate(['confirmed', 'preparing', 'ready']):
        result = await client.patch(BASE + f'/orders/{oid}', headers=operator, json={'expected_version': version, 'status': status})
        assert result.status_code == 200, result.text
    return oid


@pytest.mark.asyncio
async def test_operator_marks_departed_and_delivered_with_cash(env):
    client, maker, operator, _ = env
    async with maker() as db:
        db.add(Food_settings(setting_key='operator_runs_delivery', setting_value='1', is_active=True))
        await db.commit()
    oid = await _ready_cash_delivery(client, maker, operator)
    detail = (await client.get(BASE + f'/orders/{oid}', headers=operator)).json()['order']
    assert detail['operator_runs_delivery'] is True
    left = await client.patch(BASE + f'/orders/{oid}', headers=operator, json={'expected_version': 3, 'status': 'in_progress'})
    assert left.status_code == 200, left.text
    assert left.json()['status'] == 'in_progress'
    done = await client.patch(BASE + f'/orders/{oid}', headers=operator, json={'expected_version': 4, 'status': 'done', 'payment_status': 'paid'})
    assert done.status_code == 200, done.text
    assert (done.json()['status'], done.json()['payment_status']) == ('done', 'paid')


@pytest.mark.asyncio
async def test_without_the_switch_a_courier_is_still_required(env):
    client, maker, operator, _ = env
    oid = await _ready_cash_delivery(client, maker, operator)
    left = await client.patch(BASE + f'/orders/{oid}', headers=operator, json={'expected_version': 3, 'status': 'in_progress'})
    assert left.status_code == 409
    assert 'курьер' in left.json()['detail']
