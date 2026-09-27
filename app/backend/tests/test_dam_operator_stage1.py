"""Real API/service regression tests; isolated SQLite, no external messages."""
import json
import pytest
from sqlalchemy import select
from models.auth import User
from models.food_orders import Food_orders
from models.food_shifts import FoodShift
from models.logistics import CourierProfile, LogisticsTask
from services.food_orders import Food_ordersService
from tests.test_dam_order_workflow import env, BASE, owner_headers


@pytest.mark.asyncio
@pytest.mark.parametrize('source', ['app', 'operator', 'whatsapp'])
@pytest.mark.parametrize('fulfillment', ['delivery', 'pickup', 'dine_in'])
async def test_source_and_fulfillment_are_independent(env, source, fulfillment):
    client, maker, operator, _ = env
    body = dict(restaurant_id=1, restaurant_name='DAM ALEM 2.0', customer_name='Test',
        customer_phone='+77003333333', delivery_address='Test street 1' if fulfillment == 'delivery' else '',
        delivery_method=fulfillment, payment_method='cash', payment_status='pending',
        order_items=json.dumps([{'id':2,'quantity':2,'price':300}]), total_amount=600)
    if source == 'app':
        result = await client.post('/api/v1/entities/food_orders', json=body)
        assert result.status_code == 201, result.text
        order = result.json()
    elif source == 'operator':
        manual = {**body, 'request_key': f'operator-stage-one-{fulfillment.replace(chr(95), chr(45))}',
                  'items':[{'id':2,'quantity':2}], 'delivery_fee':0}
        quote = await client.post(BASE+'/manual/quote', headers=operator, json=manual)
        assert quote.status_code == 200, quote.text
        result = await client.post(BASE+'/manual', headers=operator,
            json={**manual, 'quoted_total':quote.json()['total_amount']})
        assert result.status_code == 201, result.text
        order = result.json()
    else:
        # Current WhatsApp bot has no order-creation adapter. Test its supported
        # stored source through the shared service, not a fictional live webhook.
        async with maker() as db:
            created = await Food_ordersService(db).create({**body, 'order_source':'whatsapp'})
            order = {'id':created.id, 'status':created.status}
    oid = order['id']
    assert order['status'] == 'new'
    async def owner_sees(status):
        overview = (await client.get('/api/v1/dam-alem/business/overview', headers=owner_headers())).json()
        projection = next(o for o in overview['recent_orders'] if o['id'] == oid)
        assert (projection['status'], projection['source'], projection['delivery_method']) == (status, source, fulfillment)
        summary = (await client.get('/api/v1/dam-alem/business/today', headers=owner_headers())).json()
        assert summary['counts'][status] >= 1
        detail = (await client.get(BASE+f'/orders/{oid}', headers=owner_headers())).json()['order']
        assert detail['status'] == status
    await owner_sees('new')
    queue = (await client.get(BASE+f'/orders?status=new&source={source}', headers=operator)).json()
    assert oid in [o['id'] for o in queue['items']]
    skipped = await client.patch(BASE+f'/orders/{oid}', headers=operator,
        json={'expected_version':0,'status':'preparing'})
    assert skipped.status_code == 409
    for version, status in enumerate(['confirmed','preparing','ready']):
        result = await client.patch(BASE+f'/orders/{oid}', headers=operator,
            json={'expected_version':version,'status':status})
        assert result.status_code == 200, result.text
        assert result.json()['status'] == status
        assert result.json()['order_source'] == source
        assert result.json()['delivery_method'] == fulfillment
        await owner_sees(status)
    if fulfillment == 'delivery':
        result = await client.post(BASE+f'/orders/{oid}/assign-courier', headers=operator,
            json={'courier_id':'courier'})
        assert result.status_code == 200, result.text
        await owner_sees('in_progress')
        login = await client.post('/api/v1/logistics/courier/pin-login', json={'pin':'2954'})
        assert login.status_code == 200, login.text
        courier = {'Authorization':'Bearer '+login.json()['token']}
        cabinet = await client.get('/api/v1/logistics/courier/cabinet', headers=courier)
        assert cabinet.status_code == 200, cabinet.text
        task = cabinet.json()['active_task']
        assert task['source_id'] == oid
        delivered = await client.post(f"/api/v1/logistics/tasks/{task['id']}/status",
            headers=courier, json={'status':'delivered'})
        assert delivered.status_code == 200, delivered.text
    else:
        assign = await client.post(BASE+f'/orders/{oid}/assign-courier', headers=operator,
            json={'courier_id':'courier'})
        assert assign.status_code == 409
        result = await client.patch(BASE+f'/orders/{oid}', headers=operator,
            json={'expected_version':3,'status':'done'})
        assert result.status_code == 200, result.text
        async with maker() as db:
            assert await db.scalar(select(LogisticsTask).where(LogisticsTask.source_id==oid)) is None
    detail = (await client.get(BASE+f'/orders/{oid}', headers=owner_headers())).json()['order']
    assert detail['status'] == 'done'
    await owner_sees('done')
    assert detail['payment_status'] == 'pending'  # Fulfillment never collects cash.
    assert float(detail['paid_amount'] or 0) == 0
    for values in [{'payment_status':'paid'}, {'operator_note':'change history'}]:
        response = await client.patch(BASE+f'/orders/{oid}', headers=operator,
            json={'expected_version':detail['version'], **values})
        assert response.status_code == 409
    paid = await client.patch(BASE+f'/orders/{oid}', headers=owner_headers(),
        json={'expected_version':detail['version'],'payment_status':'paid'})
    assert paid.status_code == 200, paid.text
    assert paid.json()['payment_status'] == 'paid'


@pytest.mark.asyncio
@pytest.mark.parametrize('unavailable', ['shift','offline','busy','blocked','unverified'])
async def test_assignment_rechecks_courier_readiness(env, unavailable):
    client, maker, headers, _ = env
    for version, status in enumerate(['confirmed','preparing','ready']):
        assert (await client.patch(BASE+'/orders/1', headers=headers,
            json={'expected_version':version,'status':status})).status_code == 200
    async with maker() as db:
        profile = await db.get(CourierProfile,'courier')
        if unavailable == 'shift':
            shift = await db.scalar(select(FoodShift).where(FoodShift.active_key=='courier:courier'))
            shift.active_key = None
        elif unavailable == 'offline': profile.is_online = False
        elif unavailable == 'unverified': profile.is_verified = False
        elif unavailable == 'blocked':
            user = await db.get(User,'courier'); user.is_active = False
        else:
            db.add(LogisticsTask(source_type='food_orders',source_id=999,vertical='food',
                pickup_address='A',dropoff_address='B',status='on_the_way',courier_id='courier'))
        await db.commit()
    choices = (await client.get(BASE+'/couriers',headers=headers)).json()['items']
    allowed = unavailable in ('offline','busy')  # Stage 2: explicit dispatch needs verified + active + on shift.
    assert any(c['id']=='courier' and c['assignable'] for c in choices) == allowed
    response = await client.post(BASE+'/orders/1/assign-courier',headers=headers,json={'courier_id':'courier'})
    assert response.status_code == 200 if allowed else response.status_code in (404,409), response.text
    detail = (await client.get(BASE+'/orders/1',headers=headers)).json()['order']
    assert detail['status']==('in_progress' if allowed else 'ready')


@pytest.mark.asyncio
async def test_operator_stop_list_but_no_owner_endpoints(env):
    client, maker, operator, _ = env
    base='/api/v1/dam-alem/business'
    for path in ['/report','/staff','/overview']:
        response=await client.get(base+path,headers=operator)
        assert response.status_code==403, response.text
    assert (await client.patch(base+'/availability/1',headers=operator,json={'available':False})).status_code==200
    async with maker() as db:
        from models.food_items import Food_items
        item=await db.get(Food_items,1)
        assert item.available is False and item.price==1500


@pytest.mark.asyncio
async def test_restoring_shift_does_not_open_or_close_it(env):
    client, maker, operator, _ = env
    url='/api/v1/dam-alem/shifts'
    first=(await client.get(url+'/me',headers=operator)).json()['shift']
    second=(await client.get(url+'/me',headers=operator)).json()['shift']
    assert first['id']==second['id'] and first['opened_at']==second['opened_at']
    assert (await client.post(url+'/close',headers=operator,json={'pin':'0000'})).status_code==401
    # Stage 2 requires finishing active orders and an explicit procurement report.
    assert (await client.post(url+'/close',headers=operator,json={'pin':'2222'})).status_code==409
    async with maker() as db:
        order=await db.get(Food_orders,1);order.status='done';await db.commit()
    assert (await client.post(url+'/close',headers=operator,json={'pin':'2222','procurement':{'not_required':True,'reason':'Остатков достаточно'}})).status_code==200
    assert (await client.get(url+'/me',headers=operator)).json()['shift'] is None
    response=await client.patch(BASE+'/orders/1',headers=operator,json={'expected_version':0,'status':'confirmed'})
    assert response.status_code==409


@pytest.mark.asyncio
@pytest.mark.parametrize('fulfillment,title', [('delivery','Ваш заказ доставлен'),('pickup','Ваш заказ выдан'),('dine_in','Ваш заказ выдан')])
async def test_customer_message_matches_fulfillment(monkeypatch, fulfillment, title):
    from types import SimpleNamespace
    from unittest.mock import AsyncMock
    from services.user_notifications import notify_food_order_status
    send=AsyncMock()
    monkeypatch.setattr('services.user_notifications.notify_user_by_phone',send)
    order=SimpleNamespace(id=1,restaurant_name='DAM ALEM',customer_phone='+77000000000',delivery_method=fulfillment,order_source='app')
    await notify_food_order_status(None,order,'ready','done')
    assert send.await_args.kwargs['title']==title
