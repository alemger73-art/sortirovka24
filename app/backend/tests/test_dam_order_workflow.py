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
        await accept_task(db,tid,user)
    # Assigned courier keeps the job but cannot collect until kitchen reconfirms readiness.
    body=edit_body(4)
    response=await client.post(BASE+'/orders/1/receipt',headers=headers,json=body)
    assert response.status_code==200,response.text
    async with maker() as db:
        user=await db.get(User,'courier');task=await db.get(LogisticsTask,tid)
        assert task.status=='assigned' and task.order_status=='preparing'
        with pytest.raises(ValueError): await advance_task_status(db,task,user,'picked_up')
    response=await client.patch(BASE+'/orders/1',headers=headers,json={'expected_version':5,'status':'ready'})
    assert response.status_code==200,response.text
    async with maker() as db:
        user=await db.get(User,'courier');task=await db.get(LogisticsTask,tid)
        for status in ['picked_up','on_the_way','delivered']:
            await advance_task_status(db,task,user,status)
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
