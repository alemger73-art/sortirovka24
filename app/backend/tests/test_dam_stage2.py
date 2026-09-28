"""Real routes/services on disposable DBs; external channels are stubbed."""
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock
import pytest
from sqlalchemy import select, func
from tests.test_dam_order_workflow import env, BASE, owner_headers
from models.food_orders import Food_orders
from models.food_settings import Food_settings
from models.food_shifts import FoodShift, FoodShiftProcurement
from models.food_operations import FoodOrderEvent, FoodOperationsSettings
from models.logistics import LogisticsTask
from services import food_preorders

SHIFTS = '/api/v1/dam-alem/shifts'
NO_PURCHASE = {'not_required': True, 'reason': 'Остатков достаточно', 'items': []}
PURCHASE = {'items': [{'name': 'Филе', 'quantity': 5, 'unit': 'кг', 'comment': 'Охлаждённое'}], 'comment': 'На утро'}


async def finish_seed(maker):
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.status = 'done'
        await db.commit()


async def manual(client, headers, fulfillment='pickup', **extra):
    body = dict(request_key='stage-two-unique-order', customer_name='Client', customer_phone='+77003333333',
                delivery_address='Street 1' if fulfillment == 'delivery' else '', delivery_method=fulfillment,
                payment_method='cash', delivery_fee=0, items=[{'id':2,'quantity':3}], **extra)
    quote = await client.post(BASE+'/manual/quote', headers=headers, json=body)
    assert quote.status_code == 200, quote.text
    created = await client.post(BASE+'/manual', headers=headers, json={**body,'quoted_total':quote.json()['total_amount']})
    assert created.status_code == 201, created.text
    return created.json()


@pytest.mark.asyncio
@pytest.mark.parametrize('status', ['new','confirmed','preparing','ready','in_progress'])
async def test_each_active_status_blocks_closing(env, status):
    client, maker, headers, _ = env
    async with maker() as db:
        order = await db.get(Food_orders,1); order.status = status; await db.commit()
    response = await client.post(SHIFTS+'/close',headers=headers,json={'pin':'2222','procurement':PURCHASE})
    assert response.status_code == 409, response.text
    assert response.json()['detail']['orders'][0]['id'] == 1
    assert (await client.get(SHIFTS+'/me',headers=headers)).json()['shift']['active']
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(FoodShiftProcurement)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize('report',[None,{}, {'not_required':True,'reason':''}, {'items':[{'name':' ', 'quantity':1, 'unit':'шт'}]}, {'items':[{'name':'Test','quantity':0,'unit':'кг'}]}])
async def test_empty_or_invalid_procurement_cannot_close(env, report):
    client,maker,headers,_ = env
    await finish_seed(maker)
    response=await client.post(SHIFTS+'/close',headers=headers,json={'pin':'2222','procurement':report})
    assert response.status_code==422, response.text
    assert (await client.get(SHIFTS+'/me',headers=headers)).json()['shift']


@pytest.mark.asyncio
@pytest.mark.parametrize('report',[PURCHASE,NO_PURCHASE])
async def test_report_close_idempotent_and_telegram_retry(env, report):
    client,maker,headers,monkeypatch=env
    await finish_seed(maker)
    sid=(await client.get(SHIFTS+'/me',headers=headers)).json()['shift']['id']
    body={'shift_id':sid,'pin':'2222','procurement':report}
    for _ in range(2):
        response=await client.post(SHIFTS+'/close',headers=headers,json=body)
        assert response.status_code==200,response.text
        assert response.json()['shift']['closed_at']
    view=(await client.get(SHIFTS+f'/{sid}/procurement',headers=owner_headers())).json()['report']
    assert view['shift_id']==sid and view['telegram_status']=='pending'
    assert view['items']==report['items'] and view['staff_name']=='Operator'
    assert (await client.get(SHIFTS+f'/{sid}/procurement',headers=headers)).status_code==403
    from services.food_operations import deliver_one
    monkeypatch.setattr('services.food_operations.credentials',AsyncMock(return_value=('test-secret','test-channel')))
    send=AsyncMock(side_effect=ValueError('Temporary unavailable'))
    monkeypatch.setattr('services.food_operations.telegram_call',send)
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(FoodShiftProcurement))==1
        event=await db.scalar(select(FoodOrderEvent).where(FoodOrderEvent.shift_id==sid))
        db.add(FoodOperationsSettings(id=1,enabled=True,status_updates=False));await db.commit()
        await deliver_one(db,event.id)
        await db.refresh(event)
        assert event.notification=='pending' and event.attempts==1 and event.retry_at>0
        assert await db.get(FoodShiftProcurement,sid)
        assert (await db.get(FoodShift,sid)).closed_at
        event.retry_at=0;await db.commit()
        send.side_effect=None;send.return_value={'message_id':42}
        await deliver_one(db,event.id);await db.refresh(event)
        assert event.notification=='sent'
        assert 'ЗАКУП' in send.call_args.args[2]['text']
        assert 'Остатков достаточно' in send.call_args.args[2]['text'] if report is NO_PURCHASE else '5 кг' in send.call_args.args[2]['text']


@pytest.mark.asyncio
@pytest.mark.parametrize('source',['app','operator'])
@pytest.mark.parametrize('fulfillment',['delivery','pickup','dine_in'])
async def test_preorder_full_lifecycle_and_shift_window(env,source,fulfillment):
    client,maker,headers,monkeypatch=env
    await finish_seed(maker)
    scheduled=(datetime.now(timezone.utc)+timedelta(days=1)).replace(minute=0, second=0, microsecond=0)
    if source=='operator':
        order=await manual(client,headers,fulfillment,scheduled_for=scheduled.isoformat())
    else:
        response=await client.post('/api/v1/entities/food_orders',json={
            'restaurant_id':1,'customer_name':'Client','customer_phone':'+77003333333',
            'delivery_method':fulfillment,'delivery_address':'Street 1' if fulfillment=='delivery' else '',
            'order_items':json.dumps([{'id':2,'quantity':3,'price':300}]),'payment_method':'cash',
            'total_amount':900,'scheduled_for':scheduled.isoformat()})
        assert response.status_code==201,response.text
        order=response.json()
    oid=order['id']
    assert food_preorders.parse_schedule(order['scheduled_for'])==scheduled
    assert (await client.get(BASE+'/orders?status=active',headers=headers)).json()['total']==0
    queued=(await client.get(BASE+'/orders?status=preorders',headers=headers)).json()['items']
    assert queued[0]['id']==oid and queued[0]['is_future_preorder']
    response=await client.patch(BASE+f'/orders/{oid}',headers=headers,json={'expected_version':0,'status':'confirmed'})
    assert response.status_code==200,response.text
    assert (await client.get(SHIFTS+'/close-preview',headers=headers)).json()['can_close']
    early=await client.patch(BASE+f'/orders/{oid}',headers=headers,json={'expected_version':1,'status':'preparing'})
    assert early.status_code==409
    monkeypatch.setattr(food_preorders,'utcnow',lambda:scheduled-timedelta(minutes=29))
    assert (await client.get(BASE+'/orders?status=active',headers=headers)).json()['total']==1
    assert not (await client.get(SHIFTS+'/close-preview',headers=headers)).json()['can_close']
    for version,status in [(1,'preparing'),(2,'ready')]:
        response=await client.patch(BASE+f'/orders/{oid}',headers=headers,json={'expected_version':version,'status':status})
        assert response.status_code==200,response.text
    if fulfillment=='delivery':
        response=await client.post(BASE+f'/orders/{oid}/assign-courier',headers=headers,json={'courier_id':'courier'})
        assert response.status_code==200,response.text
        token=(await client.post('/api/v1/logistics/courier/pin-login',json={'pin':'2954'})).json()['token']
        from tests.test_dam_courier_workflow import arrive
        task_id=response.json()['task_id'];auth={'Authorization':'Bearer '+token}
        await arrive(client,task_id,auth)
        response=await client.post(f"/api/v1/logistics/tasks/{task_id}/status",headers=auth,json={'status':'delivered','cash_received':False})
    else:
        response=await client.patch(BASE+f'/orders/{oid}',headers=headers,json={'expected_version':3,'status':'done'})
    assert response.status_code==200,response.text
    assert not (await client.get(SHIFTS+'/close-preview',headers=headers)).json()['can_close']  # terminal unpaid now blocks closing
    detail=(await client.get(BASE+f'/orders/{oid}',headers=owner_headers())).json()['order']
    assert detail['status']=='done' and detail['order_source']==source and detail['delivery_method']==fulfillment
    assert detail['payment_status']!='paid'


@pytest.mark.asyncio
async def test_early_start_reschedule_audit_and_future_shift_close(env):
    client,maker,headers,_=env
    await finish_seed(maker)
    future=(datetime.now(timezone.utc)+timedelta(days=1)).replace(minute=0,second=0,microsecond=0).isoformat()
    order=await manual(client,headers,scheduled_for=future)
    url=BASE+f"/orders/{order['id']}"
    changed=await client.patch(url,headers=headers,json={'expected_version':0,'schedule_reason':'Клиент попросил перенос','scheduled_for':(datetime.now(timezone.utc)+timedelta(days=2)).replace(minute=0,second=0,microsecond=0).isoformat()})
    assert changed.status_code==200,changed.text
    events=(await client.get(url,headers=headers)).json()['events']
    assert any('перенесён' in e['message'] for e in events)
    assert (await client.post(SHIFTS+'/close',headers=headers,json={'pin':'2222','procurement':NO_PURCHASE})).status_code==200
    assert (await client.post(SHIFTS+'/open',headers=headers,json={'pin':'2222'})).status_code==200
    assert (await client.patch(url,headers=headers,json={'expected_version':1,'status':'confirmed'})).status_code==200
    assert (await client.patch(url,headers=headers,json={'expected_version':2,'status':'preparing','start_early':True})).status_code==200
    assert not (await client.get(SHIFTS+'/close-preview',headers=headers)).json()['can_close']
    assert (await client.patch(url,headers=headers,json={'expected_version':3,'scheduled_for':future})).status_code==409


@pytest.mark.asyncio
@pytest.mark.parametrize('value',['2020-01-01T12:00:00+05:00','invalid','2030-01-01T12:00:00'])
async def test_invalid_preorder_rejected(env,value):
    client,_,headers,_=env
    response=await client.post(BASE+'/manual/quote',headers=headers,json={'request_key':'invalid-schedule-order','customer_name':'Client','delivery_method':'dine_in','items':[{'id':2,'quantity':1}],'scheduled_for':value})
    assert response.status_code==422,response.text


@pytest.mark.asyncio
async def test_schedule_obeys_hours_and_configured_lead(env):
    client,maker,headers,monkeypatch=env
    async with maker() as db:
        db.add_all([Food_settings(setting_key='working_hours',setting_value='10:00-22:00'),Food_settings(setting_key='preorder_lead_minutes',setting_value='90')]);await db.commit()
    future=(datetime.now(timezone(timedelta(hours=5)))+timedelta(days=1)).replace(hour=2,minute=0,second=0,microsecond=0)
    body={'request_key':'preorder-hours-test','customer_name':'Client','delivery_method':'dine_in','items':[{'id':2,'quantity':1}],'scheduled_for':future.isoformat()}
    assert (await client.post(BASE+'/manual/quote',headers=headers,json=body)).status_code==400
    future=future.replace(hour=13)
    order=await manual(client,headers,scheduled_for=future.isoformat())
    monkeypatch.setattr(food_preorders,'utcnow',lambda:future.astimezone(timezone.utc)-timedelta(minutes=89))
    assert any(o['id']==order['id'] for o in (await client.get(BASE+'/orders?status=active',headers=headers)).json()['items'])


@pytest.mark.asyncio
async def test_three_deliveries_independent_no_duplicate(env):
    client,maker,headers,_=env
    ids=[]
    for index in range(3):
        body={'request_key':f'multi-delivery-order-{index}','customer_name':'Client','customer_phone':'+77003333333','delivery_address':'Street 1','delivery_method':'delivery','delivery_fee':0,'items':[{'id':2,'quantity':1}]}
        quote=await client.post(BASE+'/manual/quote',headers=headers,json=body)
        order=(await client.post(BASE+'/manual',headers=headers,json={**body,'quoted_total':quote.json()['total_amount']})).json()
        oid=order['id'];ids.append(oid)
        for version,status in enumerate(['confirmed','preparing','ready']):
            assert (await client.patch(BASE+f'/orders/{oid}',headers=headers,json={'expected_version':version,'status':status})).status_code==200
        choices=(await client.get(BASE+'/couriers',headers=headers)).json()['items']
        courier=next(c for c in choices if c['id']=='courier')
        assert courier['assignable'] and courier['active_deliveries']==index
        assigned=await client.post(BASE+f'/orders/{oid}/assign-courier',headers=headers,json={'courier_id':'courier'})
        assert assigned.status_code==200,assigned.text
        assert (await client.post(BASE+f'/orders/{oid}/assign-courier',headers=headers,json={'courier_id':'courier'})).status_code==409
    token=(await client.post('/api/v1/logistics/courier/pin-login',json={'pin':'2954'})).json()['token']
    courier={'Authorization':'Bearer '+token}
    tasks=(await client.get('/api/v1/logistics/courier/cabinet',headers=courier)).json()['active_tasks']
    assert {t['source_id'] for t in tasks}==set(ids)
    assert all(t['payment_method']=='cash' and t['amount_due']==300 for t in tasks)
    from tests.test_dam_courier_workflow import arrive
    await arrive(client,tasks[0]['id'],courier)
    assert (await client.post(f"/api/v1/logistics/tasks/{tasks[0]['id']}/status",headers=courier,json={'status':'delivered','cash_received':False})).status_code==200
    remaining=(await client.get('/api/v1/logistics/courier/cabinet',headers=courier)).json()['active_tasks']
    assert len(remaining)==2 and all(t['status']=='assigned' for t in remaining)
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(LogisticsTask).where(LogisticsTask.source_id.in_(ids)))==3


@pytest.mark.asyncio
@pytest.mark.parametrize('rule,code,success',[
    ({'type':'fixed','value':100},'TEST',True),({'type':'percent','value':10},'TEST',True),
    ({'type':'free_delivery'},'TEST',True),({'active':False},'TEST',False),
    ({'valid_until':'2020-01-01'},'TEST',False),({'min_order':1000},'TEST',False),
    ({'valid_from':'2099-01-01'},'TEST',False),({},'WRONG',False),
])
async def test_manual_promo_uses_shared_quote_and_snapshot(env,rule,code,success):
    client,maker,headers,_=env
    async with maker() as db:
        db.add(Food_settings(setting_key='promo_codes',setting_value=json.dumps([{'code':'TEST','active':True,'type':'fixed','value':100,**rule}])));await db.commit()
    body={'request_key':'promo-stage-two-order','customer_name':'Client','delivery_method':'dine_in','items':[{'id':2,'quantity':3}],'promo_code':code}
    quote=await client.post(BASE+'/manual/quote',headers=headers,json=body)
    if not success:
        assert quote.status_code==400,quote.text
        return
    assert quote.status_code==200,quote.text
    expected=800 if rule['type']=='fixed' else 810 if rule['type']=='percent' else 900
    assert quote.json()['total_amount']==expected
    tampered=await client.post(BASE+'/manual',headers=headers,json={**body,'quoted_total':1})
    assert tampered.status_code==409
    created=await client.post(BASE+'/manual',headers=headers,json={**body,'quoted_total':expected})
    assert created.status_code==201,created.text
    owner=(await client.get(BASE+f"/orders/{created.json()['id']}",headers=owner_headers())).json()['order']
    snapshot=json.loads(owner['pricing_snapshot'])
    assert snapshot['promo_code']=='TEST' and snapshot['breakdown']['discount']==900-expected
    assert owner['order_source']=='operator' and owner['delivery_method']=='dine_in'


@pytest.mark.asyncio
async def test_promo_requoted_when_composition_changes(env):
    client,maker,headers,_=env
    async with maker() as db:
        db.add(Food_settings(setting_key='promo_codes',setting_value=json.dumps([{'code':'TEST','type':'fixed','value':100,'min_order':700}])));await db.commit()
    order=await manual(client,headers,promo_code='TEST')
    body={'expected_version':0,'reason':'Меньше напитков','items':[{'line_index':0,'quantity':2}]}
    quote=await client.post(BASE+f"/orders/{order['id']}/receipt/quote",headers=headers,json=body)
    assert quote.status_code==200,quote.text
    assert quote.json()['total_amount']==600 and quote.json()['promo_discount_amount']==0
    saved=await client.post(BASE+f"/orders/{order['id']}/receipt",headers=headers,json={**body,'quoted_total':600})
    assert saved.status_code==200 and saved.json()['promo_discount_amount']==0


@pytest.mark.asyncio
async def test_stop_list_categories_and_only_availability_changes(env):
    from models.food_categories import Food_categories
    from models.food_items import Food_items
    client,maker,operator,_=env
    async with maker() as db:
        db.add(Food_categories(id=5,restaurant_id=1,name='Напитки',is_active=True))
        item=await db.get(Food_items,2)
        item.category_id=5
        await db.commit()
    base='/api/v1/dam-alem/business'
    response=await client.get(base+'/availability',headers=operator)
    assert response.status_code==200,response.text
    items=response.json()
    drink=next(i for i in items if i['id']==2)
    assert drink['category_id']==5 and drink['category_name']=='Напитки'
    assert all(i['id']!=3 for i in items)
    for available in [False,True]:
        saved=await client.patch(base+'/availability/2',headers=operator,json={'available':available,'price':1,'category_id':99})
        assert saved.status_code==200,saved.text
        async with maker() as db:
            item=await db.get(Food_items,2)
            assert item.available is available and item.price==300 and item.category_id==5
    assert (await client.patch(base+'/availability/3',headers=operator,json={'available':False})).status_code==404
