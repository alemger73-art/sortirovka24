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
    app=FastAPI();app.include_router(router);app.include_router(account_v2.router)
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
        assert len(events)==1
        data=json.loads(events[0].public_data)
        assert data['before']['total_amount']==1200 and data['after']['total_amount']==1800

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
        assert await db.scalar(select(func.count()).select_from(FoodOrderEvent).where(FoodOrderEvent.public_data.isnot(None)))==1

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

