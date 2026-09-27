"""Printing reads the authorized FoodOrder snapshot, never settings or secrets."""
import json
import pytest
from tests.test_dam_order_workflow import env
from tests.test_dam_courier_workflow import assigned, login
from models.food_orders import Food_orders
from models.logistics import LogisticsTask

@pytest.mark.asyncio
async def test_courier_receipt_is_current_scoped_and_has_no_pricing_config(env):
    client, maker, _, _ = env
    tid = await assigned(env)
    auth = await login(client)
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.created_at = '2026-09-28T10:15:00Z'
        order.paid_amount = 200
        order.pricing_snapshot = json.dumps({'breakdown': {'subtotal': 1000, 'delivery_fee': 200},
            'promo_code': 'USED_PROMO', 'settings': {'promo_codes': 'PRIVATE_CONFIG'}})
        await db.commit()
    response = await client.get(f'/api/v1/logistics/tasks/{tid}', headers=auth)
    assert response.status_code == 200, response.text
    receipt = response.json()['receipt']
    assert receipt['created_at'] == '2026-09-28T10:15:00Z'
    assert receipt['paid_amount'] == 200 and receipt['amount_due'] == 1000
    assert json.loads(receipt['pricing_snapshot']) == {
        'breakdown': {'subtotal': 1000, 'delivery_fee': 200}, 'promo_code': 'USED_PROMO'}
    assert 'PRIVATE_CONFIG' not in response.text
    assert (await client.get(f'/api/v1/logistics/tasks/{tid}')).status_code in (401,403)
    async with maker() as db:
        (await db.get(LogisticsTask, tid)).courier_id = None
        await db.commit()
    assert (await client.get(f'/api/v1/logistics/tasks/{tid}', headers=auth)).status_code == 404

@pytest.mark.asyncio
async def test_native_push_registration_uses_pin_identity_and_revocation(env):
    from routers.push_notifications import router
    from models.push_devices import PushDevice
    from models.logistics import CourierProfile
    from sqlalchemy import select
    client, maker, _, _ = env
    client._transport.app.include_router(router)
    auth = await login(client)
    body = {'token': 'synthetic-native-device-token-not-a-real-device', 'platform': 'android'}
    response = await client.post('/api/v1/push/register', headers=auth, json=body)
    assert response.status_code == 200, response.text
    async with maker() as db:
        device = await db.scalar(select(PushDevice))
        assert device.user_id == 'courier' and device.platform == 'android'
        (await db.get(CourierProfile, 'courier')).is_verified = False
        await db.commit()
    assert (await client.post('/api/v1/push/register', headers=auth, json=body)).status_code in (401,403)
