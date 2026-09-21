import json
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from core.database import Base, get_db
from core.auth import create_access_token
from models.auth import User
from models.module_settings import ModuleSettings
from models.taxi import TaxiSettings
from models.food_categories import Food_categories
from models.modifier_groups import Modifier_groups
from models.modifier_options import Modifier_options
from models.item_modifier_groups import Item_modifier_groups
from models.food_orders import Food_orders
from models.food_items import Food_items
from models.food_restaurants import Food_restaurants
from models.food_settings import Food_settings
from models.food_operations import FoodOrderEvent, FoodOrderRequest
from models.partner_auth import PartnerCredentials
from models.logistics import LogisticsTask, CourierProfile
from routers.food_operations import router
from routers.food_payroll import router as payroll_router
from services.food_orders import Food_ordersService
from services.logistics_service import accept_task, advance_task_status

BASE='/api/v1/dam-alem/operations'

@pytest.fixture
async def env(monkeypatch, tmp_path):
    from routers import account_v2
    engine=create_async_engine('sqlite+aiosqlite:///' + (tmp_path/'workflow.db').as_posix())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker=async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add(PartnerCredentials(id=1,partner_type='dam_alem',email='operator@test.local',password_hash='unused',display_name='Operator',is_active=True,access_role='operator'))
        db.add(PartnerCredentials(id=2,partner_type='dam_alem',email='owner@test.local',password_hash='unused',display_name='Owner',is_active=True,access_role='owner'))
        db.add(Food_restaurants(id=1,name='DAM ALEM 2.0',min_order=0))
        db.add_all([Food_items(id=1,restaurant_id=1,name='Pizza',price=1500,is_active=True,available=True),Food_items(id=2,restaurant_id=1,name='Drink',price=300,is_active=True,available=True),Food_items(id=3,restaurant_id=9,name='Other',price=1,is_active=True)])
        db.add(Food_settings(setting_key='loyalty_enabled',setting_value='0'))
        db.add(Food_settings(setting_key='service_fee_rate',setting_value='0'))
        db.add(Food_orders(id=1,restaurant_id=1,restaurant_name='DAM ALEM 2.0',customer_name='Client',customer_phone='+77000000000',delivery_method='delivery',delivery_address='Test street 1',status='new',version=0,payment_status='paid',total_amount=1200,order_items=json.dumps([{'id':1,'name':'Pizza','price':1000,'quantity':1,'modTotal':0,'sum':1000}])))
        db.add(User(id='courier',name='Courier',phone='+77001111111',role='courier'))
        db.add(CourierProfile(user_id='courier',is_verified=True,is_online=True,deliveries_count=0,balance=0))
        await db.commit()
    for target in ['services.food_orders.link_food_order_to_user','services.food_orders.push_food_order_to_frontpad','services.admin_alerts.alert_new_food_order','services.user_notifications.notify_food_order_created','services.user_notifications.notify_food_order_status','services.user_notifications.notify_logistics_task_status','services.user_notifications.notify_user_by_phone','services.bonus_rewards.handle_food_order_status_bonus']:
        monkeypatch.setattr(target,AsyncMock(return_value=None))
    async def courier_profile(db,user):
        return await db.scalar(select(CourierProfile).where(CourierProfile.user_id==user.id))
    monkeypatch.setattr('services.logistics_service.get_or_create_courier_profile',courier_profile)
    app=FastAPI();app.include_router(router);app.include_router(account_v2.router);app.include_router(payroll_router)
    from routers.food_orders import router as customer_orders
    app.include_router(customer_orders)
    async def dependency():
        async with maker() as db: yield db
    app.dependency_overrides[get_db]=dependency
    token=create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':1,'sub':'operator'})
    async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
        yield client,maker,{'Authorization':f'Bearer {token}'},monkeypatch
    await engine.dispose()

def edit_body(version=0):
    return {'expected_version':version,'items':[{'line_index':0,'quantity':1},{'id':2,'quantity':2}],'reason':'Customer called','quoted_total':1800}

@pytest.mark.asyncio
async def test_revision_preserves_old_price_and_payment_and_rejects_stale(env):
    client,maker,headers,_=env
    body=edit_body()
    quote=await client.post(BASE+'/orders/1/receipt/quote',headers=headers,json=body)
    assert quote.status_code==200,quote.text
    assert quote.json()['total_amount']==1800 and quote.json()['amount_due']==600
    assert quote.json()['items'][0]['price']==1000 # current menu is 1500
    result=await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)
    assert result.status_code==200,result.text
    assert result.json()['paid_amount']==1200 and result.json()['payment_status']=='pending'
    assert result.json()['receipt_revision']==1
    assert (await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)).status_code==409
    async with maker() as db:
        events=(await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.public_data.isnot(None)))).all()
        events=[e for e in events if json.loads(e.public_data).get('kind') == 'receipt_changed']
        assert len(events)==1
        data=json.loads(events[0].public_data)
        assert data['before']['total_amount']==1200 and data['after']['total_amount']==1800


@pytest.mark.asyncio
async def test_revision_recalculates_saved_service_delivery_and_promo(env):
    client,maker,headers,_=env
    async with maker() as db:
        order=await db.get(Food_orders,1)
        order.pricing_snapshot=json.dumps({'version':1,'service_rate':0.05,'base_delivery_fee':600,
            'requested_apartment':False,'promo_code':'TEN','settings':{'free_delivery_from':'1500',
            'promo_codes':json.dumps([{'code':'TEN','active':True,'type':'percent','value':10,'min_order':1500}])}})
        await db.commit()
    result=await client.post(BASE+'/orders/1/receipt/quote',headers=headers,json=edit_body())
    assert result.status_code==200,result.text
    assert result.json()['total_amount']==1520  # 1600 + 5% - 10%, delivery becomes free.
    assert result.json()['promo_discount_amount']==160

@pytest.mark.asyncio
async def test_bad_quote_and_other_restaurant_do_not_mutate(env):
    client,maker,headers,_=env
    body=edit_body();body['quoted_total']=1
    assert (await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)).status_code==409
    body=edit_body();body['items'][1]['id']=3
    assert (await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)).status_code==400
    async with maker() as db:
        order=await db.get(Food_orders,1)
        assert order.total_amount==1200 and order.version==0
    assert (await client.get(BASE+'/catalog')).status_code==403

@pytest.mark.asyncio
async def test_manual_order_idempotency_and_server_prices(env):
    client,maker,headers,_=env
    body={'request_key':'12345678-1234-1234-1234-123456789012','customer_name':'Phone client','customer_phone':'+77002222222','delivery_method':'pickup','items':[{'id':2,'quantity':2}]}
    quote=await client.post(BASE+'/manual/quote',headers=headers,json=body)
    assert quote.status_code==200,quote.text
    body['quoted_total']=quote.json()['total_amount']
    a=await client.post(BASE+'/manual',headers=headers,json=body)
    assert a.status_code==201,a.text
    b=await client.post(BASE+'/manual',headers=headers,json=body)
    assert b.json()['id']==a.json()['id']
    assert a.json()['total_amount']==600 and a.json()['order_source']=='operator'
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(FoodOrderRequest))==1


@pytest.mark.asyncio
async def test_operator_selects_delivery_fee_without_geocoding(env):
    client, maker, headers, monkeypatch = env
    zones = [{'id': 'near', 'name': 'Ближняя зона', 'price': 600, 'polygon': [[49.9, 73.1], [50.0, 73.1], [50.0, 73.3], [49.9, 73.3]]}]
    async with maker() as db:
        db.add(Food_settings(setting_key='delivery_zones', setting_value=json.dumps(zones)))
        await db.commit()
    geocode = AsyncMock(side_effect=AssertionError('manual operator order must not geocode'))
    monkeypatch.setattr('services.food_order_validation.geocode_address', geocode)

    catalog = (await client.get(BASE + '/catalog', headers=headers)).json()
    assert {option['price'] for option in catalog['delivery_options']} >= {0, 600, 800, 1200}

    body = {
        'request_key': '12345678-1234-1234-1234-123456789077',
        'customer_name': 'Delivery client',
        'customer_phone': '+77002222222',
        'delivery_method': 'delivery',
        'delivery_address': 'Локомотивная 13',
        'delivery_fee': 800,
        'items': [{'id': 1, 'quantity': 1}],
    }
    quote = await client.post(BASE + '/manual/quote', headers=headers, json=body)
    assert quote.status_code == 200, quote.text
    assert quote.json()['delivery_fee'] == 800
    assert quote.json()['total_amount'] == 2300
    created = await client.post(BASE + '/manual', headers=headers, json={**body, 'quoted_total': 2300})
    assert created.status_code == 201, created.text
    assert created.json()['delivery_address'] == 'Локомотивная 13'
    assert geocode.await_count == 0


@pytest.mark.asyncio
async def test_customer_retry_returns_same_order_and_changed_payload_is_rejected(env):
    import asyncio
    client,maker,_,_=env
    body={'request_key':'customer-retry-1234567890','restaurant_id':1,'customer_name':'Client',
        'customer_phone':'+77003333333','delivery_method':'pickup','payment_method':'cash',
        'order_items':json.dumps([{'id':2,'quantity':2,'price':300}]),'total_amount':600}
    async def send():
        return await client.post('/api/v1/entities/food_orders',json=body)
    a,b=await asyncio.gather(send(),send())
    assert a.status_code==201,a.text
    assert b.status_code==201,b.text
    assert a.json()['id']==b.json()['id']
    async with maker() as db:
        assert (await db.get(Food_orders, a.json()['id'])).order_source=='app'
    repeated=await send()
    assert repeated.json()['id']==a.json()['id']
    changed=await client.post('/api/v1/entities/food_orders',json={**body,'total_amount':601})
    assert changed.status_code==409


@pytest.mark.asyncio
async def test_late_payment_awards_bonus_once_in_order_transaction(env):
    client,maker,headers,monkeypatch=env
    monkeypatch.setattr('services.bonus_rewards.FOOD_ORDER_BONUS_POINTS',50)
    monkeypatch.setattr('services.bonus_rewards.FOOD_ORDER_BONUS_PERCENT',0)
    async with maker() as db:
        db.add(User(id='customer',phone='+77000000000',bonus_balance=100))
        order=await db.get(Food_orders,1)
        order.status='done';order.payment_status='pending';order.paid_amount=0
        await db.commit()
    for version in [0,1]:
        response=await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':version,'payment_status':'paid'})
        assert response.status_code==200,response.text
    async with maker() as db:
        assert (await db.get(User,'customer')).bonus_balance==150

@pytest.mark.asyncio
async def test_ready_courier_delivery_and_cancellation_are_one_workflow(env):
    client,maker,headers,_=env
    for version,status in enumerate(['confirmed','preparing','ready']):
        r=await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':version,'status':status})
        assert r.status_code==200,r.text
    async with maker() as db:
        task=await db.scalar(select(LogisticsTask));tid=task.id
        assert task.status=='ready' and task.total_amount==1200 and task.paid_amount==1200
        user=await db.get(User,'courier')
        with pytest.raises(ValueError, match='назначает оператор'):
            await accept_task(db,tid,user)
    # The operator may still edit a ready order before assigning the courier.
    body=edit_body(3)
    response=await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)
    assert response.status_code==200,response.text
    async with maker() as db:
        task=await db.get(LogisticsTask,tid)
        assert task.status=='pending' and task.order_status=='preparing'
    response=await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':4,'status':'ready'})
    assert response.status_code==200,response.text
    assigned=await client.post(BASE+'/orders/1/assign-courier',headers=headers,json={'courier_id':'courier'})
    assert assigned.status_code==200,assigned.text
    async with maker() as db:
        user=await db.get(User,'courier');task=await db.get(LogisticsTask,tid)
        assert task.status=='on_the_way'
        await advance_task_status(db,task,user,'delivered')
        food=await db.get(Food_orders,1)
        assert food.status=='done' and food.completed_at
        with pytest.raises(ValueError): await advance_task_status(db,task,user,'delivered')
        profile=await db.scalar(select(CourierProfile))
        assert profile.deliveries_count==1

@pytest.mark.asyncio
async def test_ready_edit_returns_to_kitchen_and_cancel_revokes_delivery(env):
    client,maker,headers,_=env
    for version,status in enumerate(['confirmed','preparing','ready']):
        assert (await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':version,'status':status})).status_code==200
    r=await client.post(BASE+'/orders/1/receipt',headers=headers,json=edit_body(3))
    assert r.status_code==200,r.text
    assert r.json()['status']=='preparing'
    async with maker() as db:
        task=await db.scalar(select(LogisticsTask))
        assert task.status=='pending' and task.ready_at is None
        from services.logistics_dispatch import process_ready_pending
        await process_ready_pending(db)
        assert task.status=='pending'
    r=await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':4,'status':'cancelled','cancellation_reason':'Client cancelled'})
    assert r.status_code==200,r.text
    async with maker() as db:
        assert (await db.scalar(select(LogisticsTask))).status=='cancelled'

@pytest.mark.asyncio
async def test_paid_reduction_shows_refund_and_customer_history_is_private(env):
    client,maker,headers,monkeypatch=env
    body=edit_body();body['items']=[{'id':2,'quantity':1}];body['quoted_total']=500
    r=await client.post(BASE+'/orders/1/receipt/quote',headers=headers,json=body)
    assert r.json()['refund_due']==700
    assert (await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)).status_code==200
    from routers import account_v2
    monkeypatch.setattr(account_v2,'_current_user',AsyncMock(return_value=User(id='customer',phone='+77000000000',role='user')))
    response=await client.get('/api/v1/account/orders/food/1')
    assert response.status_code==200,response.text
    assert response.json()['receipt_changes'][0]['after']['total_amount']==500
    assert 'operator_note' not in response.json() and 'token_cipher' not in response.text
    monkeypatch.setattr(account_v2,'_current_user',AsyncMock(return_value=User(id='outsider',phone='+77009999999',role='user')))
    assert (await client.get('/api/v1/account/orders/food/1')).status_code==404

@pytest.mark.asyncio
async def test_two_simultaneous_receipt_saves_have_one_winner(env):
    import asyncio
    client,maker,headers,_=env
    async def save():
        return await client.post(BASE+'/orders/1/receipt',headers=headers,json=edit_body())
    results=await asyncio.gather(save(),save())
    assert sorted(r.status_code for r in results)==[200,409]
    async with maker() as db:
        assert (await db.get(Food_orders,1)).version==1
        assert await db.scalar(select(func.count()).select_from(FoodOrderEvent).where(FoodOrderEvent.public_data.isnot(None)))==2

@pytest.mark.asyncio
async def test_additive_schema_repair_preserves_existing_order(tmp_path):
    from core.database import DatabaseManager
    from sqlalchemy import text
    engine=create_async_engine('sqlite+aiosqlite:///' + (tmp_path/'legacy.db').as_posix())
    async with engine.begin() as conn:
        await conn.execute(text('CREATE TABLE food_orders (id INTEGER PRIMARY KEY, total_amount FLOAT, order_items VARCHAR)'))
        await conn.execute(text("INSERT INTO food_orders VALUES (1, 1200, '[]')"))
    manager=DatabaseManager();manager.engine=engine
    await manager._repair_table_structure('food_orders')
    async with engine.connect() as conn:
        row=(await conn.execute(text('SELECT total_amount, paid_amount, receipt_revision FROM food_orders WHERE id=1'))).one()
        assert row[0]==1200 and row[1] is None and row[2] is None
    await engine.dispose()


def owner_headers():
    token=create_access_token({'role':'partner','type':'partner_session','partner_type':'dam_alem','partner_id':2,'sub':'owner'})
    return {'Authorization':f'Bearer {token}'}

@pytest.mark.asyncio
async def test_onsite_order_can_omit_phone_and_avoids_delivery(env):
    client,maker,headers,_=env
    body={'request_key':'11111111-1234-1234-1234-123456789012','customer_name':'Гость','delivery_method':'dine_in','items':[{'id':2,'quantity':1}]}
    quote=await client.post(BASE+'/manual/quote',headers=headers,json=body)
    assert quote.status_code==200,quote.text
    body['quoted_total']=300
    response=await client.post(BASE+'/manual',headers=headers,json=body)
    assert response.status_code==201,response.text
    oid=response.json()['id']
    for version,status in enumerate(['confirmed','preparing','ready','done']):
        response=await client.patch(BASE+f'/orders/{oid}',headers=headers,json={'expected_version':version,'status':status})
        assert response.status_code==200,response.text
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(LogisticsTask))==0

@pytest.mark.asyncio
async def test_daily_salary_net_departments_freeze_and_payment_idempotency(env):
    from models.food_payroll import FoodPayrollPayment
    from models.food_business import FoodExpense
    client,maker,operator,_=env;headers=owner_headers();base='/api/v1/dam-alem/payroll'
    assert (await client.get(base+'/employees',headers=operator)).status_code==403
    async with maker() as db:
        order=await db.get(Food_orders,1)
        order.status='done';order.payment_status='paid';order.created_at='2026-09-13T09:00:00Z';order.completed_at='2026-09-13T10:00:00Z';order.paid_at='2026-09-13T10:00:00Z'
        order.total_amount=2300;order.promo_discount_amount=200
        order.order_items=json.dumps([{'id':1,'name':'Kitchen','price':1000,'quantity':1,'department':'kitchen'},{'id':2,'name':'Bar','price':1000,'quantity':1,'department':'bar'}])
        await db.commit()
    staff=[]
    for name,base_pay,percent,basis in [('Cook',1000,10,'kitchen'),('Operator',500,5,'bar')]:
        response=await client.post(base+'/employees',headers=headers,json={'name':name,'position':name,'daily_base':base_pay,'percent':percent,'basis':basis})
        assert response.status_code==200,response.text
        staff.append(response.json())
    for version,employee in enumerate(staff):
        r=await client.put(base+f'/days/2026-09-13/work/{employee["id"]}',headers=headers,json={**employee,'expected_version':version})
        assert r.status_code==200,r.text
    report=(await client.get(base+'/days/2026-09-13',headers=headers)).json()
    assert report['sales']['kitchen']==900 and report['sales']['bar']==900
    assert [r['total'] for r in report['rows']]==[1090,545]
    closed=await client.post(base+'/days/2026-09-13/close',headers=headers,json={'expected_version':report['version'],'fingerprint':report['fingerprint']})
    assert closed.status_code==200,closed.text
    report=closed.json();assert report['closed']
    employee=staff[0];employee['daily_base']=9999
    await client.put(base+f'/employees/{employee["id"]}',headers=headers,json=employee)
    assert (await client.get(base+'/days/2026-09-13',headers=headers)).json()['rows'][0]['total']==1090
    body={'id':'33333333-1234-1234-1234-123456789012','employee_id':employee['id'],'amount':1000,'note':'Cash paid','expected_version':report['version']}
    paid=await client.post(base+'/days/2026-09-13/payments',headers=headers,json=body)
    assert paid.status_code==200,paid.text
    assert paid.json()['rows'][0]['remaining']==90
    assert (await client.post(base+'/days/2026-09-13/payments',headers=headers,json=body)).status_code==200
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(FoodPayrollPayment))==1
        assert await db.scalar(select(func.count()).select_from(FoodExpense))==1
    body['id']='44444444-1234-1234-1234-123456789012';body['expected_version']=paid.json()['version'];body['amount']=100
    assert (await client.post(base+'/days/2026-09-13/payments',headers=headers,json=body)).status_code==422

@pytest.mark.asyncio
async def test_payroll_blocks_unfinished_orders_and_changed_preview(env):
    client,maker,_,_=env;headers=owner_headers();base='/api/v1/dam-alem/payroll'
    async with maker() as db:
        order=await db.get(Food_orders,1);order.created_at='2026-09-13T10:00:00Z';await db.commit()
    employee=(await client.post(base+'/employees',headers=headers,json={'name':'Cook','position':'Cook','daily_base':1000,'percent':5,'basis':'all'})).json()
    report=(await client.put(base+f'/days/2026-09-13/work/{employee["id"]}',headers=headers,json={**employee,'expected_version':0})).json()
    assert report['pending_orders']==1
    close=await client.post(base+'/days/2026-09-13/close',headers=headers,json={'expected_version':report['version'],'fingerprint':report['fingerprint']})
    assert close.status_code==409
    assert not (await client.get(base+'/days/2026-09-13',headers=headers)).json()['closed']


@pytest.mark.asyncio
async def test_delivery_board_scopes_orders_and_shows_courier(env):
    client, maker, headers, _ = env
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.status = 'ready'
        db.add(Food_orders(id=9, restaurant_id=9, restaurant_name='Other', status='ready', delivery_method='delivery', total_amount=500))
        db.add(LogisticsTask(id=11, source_type='food_orders', source_id=1, vertical='food', status='assigned', courier_id='courier', pickup_address='Kitchen', dropoff_address='Test street 1'))
        await db.commit()
    response = await client.get(BASE + '/deliveries', headers=headers)
    assert response.status_code == 200
    items = response.json()['items']
    assert [item['order_id'] for item in items] == [1]
    assert items[0]['courier_name'] == 'Courier'
    assert items[0]['amount_due'] == 0
    assert items[0]['delivery_status'] == 'assigned'
    detail = (await client.get(BASE + '/orders/1', headers=headers)).json()
    assert detail['delivery']['status'] == 'assigned'
    assert detail['delivery']['courier_name'] == 'Courier'
    counts = (await client.get(BASE + '/order-counts', headers=headers)).json()
    assert counts['courier'] == 1 and counts['courier_assigned'] == 1 and counts['ready'] == 0
    assert (await client.get(BASE + '/deliveries')).status_code in (401, 403)
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.status = 'done'
        await db.commit()
    assert (await client.get(BASE + '/deliveries', headers=headers)).json()['items'] == []


@pytest.mark.asyncio
async def test_pos_catalog_lookup_sources_and_transitions(env):
    from models.food_categories import Food_categories
    client,maker,headers,_=env
    async with maker() as db:
        db.add_all([Food_categories(id=1,restaurant_id=1,name='Drinks',sort_order=2,is_active=True),Food_categories(id=2,restaurant_id=1,name='Kitchen',sort_order=1,is_active=True),Food_categories(id=3,restaurant_id=9,name='Private',is_active=True)])
        db.add(Food_orders(id=8,restaurant_id=9,customer_name='Foreign customer',customer_phone='87000000000',delivery_method='delivery',delivery_address='Private address',status='new'))
        db.add(Food_items(id=8,restaurant_id=1,name='No price',price=0,is_active=True,available=True))
        db.add(Food_items(id=9,restaurant_id=1,name='Stop list',price=100,is_active=True,available=False))
        await db.commit()
    catalog=(await client.get(BASE+'/catalog',headers=headers)).json()
    assert [c['id'] for c in catalog['categories']]==[2,1]
    assert {p['id'] for p in catalog['products']}=={1,2}
    assert (await client.get(BASE+'/customer?phone=87000000000')).status_code==403
    assert (await client.get(BASE+'/customer?phone=7000',headers=headers)).status_code==422
    customer=(await client.get(BASE+'/customer?phone=8(700)000-00-00',headers=headers)).json()
    assert customer['name']=='Client' and customer['addresses']==['Test street 1']
    assert [r['id'] for r in customer['recent_orders']]==[1]
    assert not (await client.get(BASE+'/customer?phone=87000000001',headers=headers)).json()['recent_orders']
    body={'request_key':'12345678-1234-1234-1234-123456789099','customer_name':'Phone client','customer_phone':'+77002222222','delivery_method':'pickup','items':[{'id':2,'quantity':2}], 'order_source':'app'}
    quote=(await client.post(BASE+'/manual/quote',headers=headers,json=body)).json()
    assert quote['subtotal']==600 and quote['delivery_fee']==0 and quote['discount']==0 and quote['service_fee']==0
    created=await client.post(BASE+'/manual',headers=headers,json={**body,'quoted_total':600})
    assert created.status_code==201,created.text
    assert created.json()['order_source']=='operator'
    filtered=(await client.get(BASE+'/orders?source=operator',headers=headers)).json()
    assert [r['id'] for r in filtered['items']]==[created.json()['id']]
    assert (await client.get(BASE+'/orders?source=invalid',headers=headers)).status_code==422
    assert (await client.get(BASE+'/orders?source=app',headers=headers)).json()['total']==0
    assert (await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':0,'status':'confirmed'})).status_code==200
    # Manual orders are accepted immediately too, so both are already in work.
    assert (await client.get(BASE+'/orders?status=working',headers=headers)).json()['total']==2
    for target in ['ready','in_progress','done']:
        assert (await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':1,'status':target})).status_code==409
    async with maker() as db:
        o=await db.get(Food_orders,1);o.status='ready'
        staff=await db.get(PartnerCredentials,1);staff.display_name='Курьер'
        await db.commit()
    assert (await client.get(BASE+'/orders?status=courier',headers=headers)).json()['total']==1
    assert (await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':1,'status':'in_progress'})).status_code==409
    assigned = await client.post(BASE+'/orders/1/assign-courier',headers=headers,json={'courier_id':'courier'})
    assert assigned.status_code==200, assigned.text


@pytest.mark.asyncio
async def test_manual_gift_recalculates_threshold_and_stop_list(env):
    client,maker,headers,_=env
    async with maker() as db:
        enabled=await db.scalar(select(Food_settings).where(Food_settings.setting_key=='loyalty_enabled'))
        enabled.setting_value='1'
        db.add_all([Food_items(id=10,restaurant_id=1,name='Dessert A',price=500,is_active=True,available=True),Food_items(id=11,restaurant_id=1,name='Dessert B',price=500,is_active=True,available=True)])
        db.add(Food_settings(setting_key='loyalty_gifts',setting_value=json.dumps([{'id':'a','title':'Dessert A','min_amount':11000,'product_id':10},{'id':'b','title':'Dessert B','min_amount':11000,'product_id':11}])))
        await db.commit()
    body={'request_key':'12345678-1234-1234-1234-123456789088','customer_name':'Phone client','customer_phone':'+77002222222','delivery_method':'pickup','items':[{'id':1,'quantity':8}]}
    response=await client.post(BASE+'/manual/quote',headers=headers,json=body)
    assert response.status_code==200,response.text
    quote=response.json()
    assert quote['total_amount']==12000 and quote['gift_required'] and len(quote['gift_choices'])==2
    assert (await client.post(BASE+'/manual',headers=headers,json={**body,'quoted_total':12000})).status_code==409
    body['selected_gift_id']='a'
    quote=(await client.post(BASE+'/manual/quote',headers=headers,json=body)).json()
    assert not quote['gift_required'] and quote['items'][-1]['gift_id']=='a'
    body['items'][0]['quantity']=7
    reduced=await client.post(BASE+'/manual/quote',headers=headers,json=body)
    assert reduced.status_code==200,reduced.text
    assert reduced.json()['total_amount']==10500 and not reduced.json()['gift_choices']
    assert not any(x.get('is_gift') for x in reduced.json()['items'])
    body['items'][0]['quantity']=8
    async with maker() as db:
        dessert=await db.get(Food_items,10);dessert.available=False;await db.commit()
    quote=(await client.post(BASE+'/manual/quote',headers=headers,json=body)).json()
    assert [g['id'] for g in quote['gift_choices']]==['b'] and quote['items'][-1]['gift_id']=='b'
    created=await client.post(BASE+'/manual',headers=headers,json={**body,'quoted_total':12000})
    assert created.status_code==201,created.text
    assert json.loads(created.json()['order_items'])[-1]['gift_id']=='b'
