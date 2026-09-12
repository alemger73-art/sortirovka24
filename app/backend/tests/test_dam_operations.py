import json
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI, HTTPException
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
from core.database import Base, get_db
from core.auth import create_access_token
from models.food_orders import Food_orders
from models.partner_auth import PartnerCredentials
from models.food_restaurants import Food_restaurants
from models.food_operations import FoodOperationsSettings, FoodOrderEvent
from routers.food_operations import router
from services.food_orders import Food_ordersService
from services import food_operations as ops

@pytest.fixture
async def setup(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[PartnerCredentials.__table__, Food_orders.__table__, Food_restaurants.__table__, FoodOperationsSettings.__table__, FoodOrderEvent.__table__]))
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add(PartnerCredentials(id=10,partner_type='dam_alem',email='owner@example.test',password_hash='unused',display_name='test-operator',is_active=True,access_role='owner'))
        db.add_all([Food_restaurants(id=1, name='DAM ALEM 2.0'), Food_restaurants(id=2, name='Другой ресторан')])
        db.add_all([Food_orders(id=1, restaurant_id=1, status='new', version=0, delivery_method='pickup', customer_name='Тест', customer_phone='+77000000000', total_amount=1000, order_items='[]'), Food_orders(id=2, restaurant_id=2, restaurant_name='DAM ALEM 2.0', status='new', version=0)])
        await db.commit()
    app = FastAPI(); app.include_router(router)
    async def dependency():
        async with maker() as db:
            yield db
    app.dependency_overrides[get_db] = dependency
    monkeypatch.setattr('services.food_orders.notify_telegram_order_status', AsyncMock())
    monkeypatch.setattr('services.bonus_rewards.handle_food_order_status_bonus', AsyncMock())
    monkeypatch.setattr('services.user_notifications.notify_food_order_status', AsyncMock())
    token = create_access_token({'role': 'partner', 'type': 'partner_session', 'partner_type': 'dam_alem', 'partner_id':10, 'sub': 'test-operator'})
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, maker, {'Authorization': f'Bearer {token}'}
    await engine.dispose()

@pytest.mark.asyncio
async def test_scope_permissions_and_search(setup):
    client, maker, headers = setup
    base='/api/v1/dam-alem/operations'
    assert (await client.get(base+'/orders')).status_code == 403
    assert (await client.get(base+'/telegram')).status_code == 403
    rows=(await client.get(base+'/orders',headers=headers)).json()
    assert rows['total']==1 and rows['items'][0]['id']==1
    assert (await client.get(base+'/orders/2',headers=headers)).status_code==404
    assert (await client.patch(base+'/orders/2',headers=headers,json={'expected_version':0,'status':'confirmed'})).status_code==404
    assert (await client.get(base+'/orders?q=doesnotexist',headers=headers)).json()['total']==0

@pytest.mark.asyncio
async def test_status_version_and_journal(setup):
    client,maker,headers=setup
    url='/api/v1/dam-alem/operations/orders/1'
    async def change(**body): return await client.patch(url,headers=headers,json=body)
    assert (await change(expected_version=0,status='done')).status_code==409
    assert (await change(expected_version=0,status='cancelled')).status_code==422
    assert (await change(expected_version=0,status='confirmed')).status_code==200
    assert (await change(expected_version=0,status='preparing')).status_code==409
    assert (await change(expected_version=1,status='in_progress')).status_code==422
    assert (await change(expected_version=1,status='preparing')).status_code==200
    assert (await change(expected_version=2,status='ready')).status_code==200
    assert (await change(expected_version=3,payment_status='paid')).status_code==200
    assert (await change(expected_version=4,status='done')).status_code==200
    assert (await change(expected_version=5,status='new')).status_code==409
    detail=(await client.get(url,headers=headers)).json()
    assert len(detail['events'])==5
    assert detail['events'][0]['actor']=='test-operator'
    assert detail['order']['payment_status']=='paid'

@pytest.mark.asyncio
async def test_telegram_secret_disabled_by_default_and_delivery(setup,monkeypatch):
    client,maker,headers=setup
    token='123456789:'+('x'*35)
    url='/api/v1/dam-alem/operations/telegram'
    monkeypatch.setattr('routers.food_operations.check_connection',AsyncMock(return_value={'chat_id':'-100123456','chat':'Test','bot':'TestBot'}))
    response=await client.put(url,headers=headers,json={'token':token,'chat_id':'-100123456','enabled':False})
    assert response.status_code==200
    assert token not in response.text
    async with maker() as db:
        cfg=await db.get(FoodOperationsSettings,1)
        assert cfg.token_cipher!=token and ops.cipher().decrypt(cfg.token_cipher.encode()).decode()==token
        assert await ops.credentials(db) is None
        order=await db.get(Food_orders,1)
        event=ops.add_event(db,order,'Заказ создан'); await db.commit(); eid=event.id
        send=AsyncMock(return_value={'message_id':123})
        monkeypatch.setattr(ops,'telegram_call',send)
        await ops.deliver_one(db,eid); send.assert_not_awaited()
    assert (await client.put(url,headers=headers,json={'chat_id':'-100123456','enabled':True})).status_code==200
    async with maker() as db:
        await ops.deliver_one(db,eid); await ops.deliver_one(db,eid)
        assert send.await_count==1
        text=send.call_args.args[2]['text']
        assert '+77000000000' not in text and 'Тест' not in text
        assert (await db.get(FoodOrderEvent,eid)).notification=='sent'
    retry=f'/api/v1/dam-alem/operations/orders/1/notifications/{eid}/retry'
    assert (await client.post(retry,headers=headers)).status_code==409

@pytest.mark.asyncio
async def test_timeout_is_not_blindly_retried(setup,monkeypatch):
    client,maker,headers=setup
    async with maker() as db:
        db.add(FoodOperationsSettings(id=1,enabled=True,status_updates=True,chat_id='-10012345',token_cipher=ops.cipher().encrypt(b'fake-token').decode()))
        order=await db.get(Food_orders,1); event=ops.add_event(db,order,'Заказ создан'); await db.commit()
        send=AsyncMock(side_effect=TimeoutError('Не подтверждено'))
        monkeypatch.setattr(ops,'telegram_call',send)
        await ops.deliver_one(db,event.id); await ops.deliver_one(db,event.id)
        assert send.await_count==1 and event.notification=='unknown'

@pytest.mark.asyncio
async def test_cancellation_reason_and_fixed_price(setup):
    client,maker,headers=setup
    async with maker() as db:
        with pytest.raises(HTTPException) as exc:
            await Food_ordersService(db).update(1,{'total_amount':1})
        assert exc.value.status_code==422
    response=await client.patch('/api/v1/dam-alem/operations/orders/1',headers=headers,json={'expected_version':0,'status':'cancelled','cancellation_reason':'Клиент попросил отменить'})
    assert response.status_code==200
    assert response.json()['cancellation_reason']=='Клиент попросил отменить'

@pytest.mark.asyncio
async def test_creation_persists_notification_with_order(setup,monkeypatch):
    client,maker,headers=setup
    monkeypatch.setattr('services.food_orders.link_food_order_to_user',AsyncMock())
    monkeypatch.setattr('services.food_orders.push_food_order_to_frontpad',AsyncMock(return_value=None))
    monkeypatch.setattr('services.admin_alerts.alert_new_food_order',AsyncMock())
    monkeypatch.setattr('services.user_notifications.notify_food_order_created',AsyncMock())
    old_send=AsyncMock()
    monkeypatch.setattr('services.food_telegram_flow.notify_operator_new_order',old_send)
    async with maker() as db:
        order=await Food_ordersService(db).create({'restaurant_id':1,'status':'new','delivery_method':'pickup','total_amount':1000})
        event=await db.scalar(select(FoodOrderEvent).where(FoodOrderEvent.order_id==order.id))
        assert event is not None and event.notification=='pending'
        assert order.id and order.version==0
        old_send.assert_not_awaited()

@pytest.mark.asyncio
async def test_definite_telegram_failure_is_durable(setup,monkeypatch):
    client,maker,headers=setup
    async with maker() as db:
        db.add(FoodOperationsSettings(id=1,enabled=True,status_updates=True,chat_id='-10012345',token_cipher=ops.cipher().encrypt(b'fake-token').decode()))
        order=await db.get(Food_orders,1); event=ops.add_event(db,order,'Заказ создан'); await db.commit()
        monkeypatch.setattr(ops,'telegram_call',AsyncMock(side_effect=ValueError('Нет прав публикации')))
        await ops.deliver_one(db,event.id)
        assert event.notification=='pending' and event.attempts==1 and event.retry_at>0
        assert event.error=='Нет прав публикации'
        assert await db.get(Food_orders,1) is not None

