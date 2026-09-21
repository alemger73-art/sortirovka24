import pytest
from sqlalchemy import select
from tests.test_dam_order_workflow import env, BASE
from models.food_orders import Food_orders
from models.food_settings import Food_settings
from models.logistics import LogisticsTask
from models.auth import User
from services.logistics_service import advance_task_status


@pytest.mark.asyncio
async def test_operator_delivery_preserves_payout_and_rejects_replay(env):
    client, maker, headers, _ = env
    async with maker() as db:
        db.add(Food_settings(setting_key='courier_payout', setting_value='800'))
        await db.commit()
    for version, status in enumerate(['confirmed', 'preparing', 'ready']):
        body = {'expected_version': version, 'status': status}
        result = await client.patch(BASE+'/orders/1', headers=headers, json=body)
        assert result.status_code == 200, result.text
        assert (await client.patch(BASE+'/orders/1', headers=headers, json=body)).status_code == 409
    skipped = await client.patch(BASE+'/orders/1', headers=headers,
        json={'expected_version': 3, 'status': 'in_progress'})
    assert skipped.status_code == 409
    assigned = await client.post(BASE+'/orders/1/assign-courier', headers=headers, json={'courier_id':'courier'})
    assert assigned.status_code == 200, assigned.text
    assert (await client.post(BASE+'/orders/1/assign-courier', headers=headers, json={'courier_id':'courier'})).status_code == 409
    async with maker() as db:
        task = await db.scalar(select(LogisticsTask))
        order = await db.get(Food_orders, 1)
        assert task.customer_delivery_fee == 0 and task.courier_payout == 800
        assert task.status == 'on_the_way' and task.picked_up_at
        assert order.status == 'in_progress'
        assert (await client.patch(BASE+'/orders/1', headers=headers,
            json={'expected_version': order.version, 'status':'done'})).status_code == 409
        courier = await db.get(User, 'courier')
        task = await advance_task_status(db, task, courier, 'delivered')
        await db.refresh(order)
        assert task.status == 'delivered' and task.delivered_at
        assert order.status == 'done' and order.completed_at
    assert (await client.patch(BASE+'/orders/1', headers=headers,
        json={'expected_version': 5, 'status': 'new'})).status_code == 409


@pytest.mark.asyncio
async def test_pickup_never_requires_delivery(env):
    client, maker, headers, _ = env
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.delivery_method = 'pickup'
        await db.commit()
    for version, status in enumerate(['confirmed', 'preparing', 'ready', 'done']):
        if status == 'done':
            result = await client.patch(BASE+'/orders/1', headers=headers,
                json={'expected_version': version, 'status':'in_progress'})
            assert result.status_code == 422
        result = await client.patch(BASE+'/orders/1', headers=headers,
            json={'expected_version': version, 'status':status})
        assert result.status_code == 200, result.text
    async with maker() as db:
        assert await db.scalar(select(LogisticsTask)) is None


@pytest.mark.asyncio
async def test_courier_portal_requires_auth_and_approved_courier_can_open_it(env):
    from datetime import datetime, timedelta, timezone
    from fastapi import FastAPI
    from httpx import AsyncClient, ASGITransport
    from core.database import get_db
    from routers.logistics import router
    from core.auth import create_access_token
    from models.user_management import UserSession
    _, maker, _, _ = env
    app = FastAPI()
    app.include_router(router)
    async def db_session():
        async with maker() as db:
            yield db
    app.dependency_overrides[get_db] = db_session
    async with maker() as db:
        db.add(UserSession(user_id='courier', token_jti='courier-session', is_active=True,
            expires_at=datetime.now(timezone.utc)+timedelta(hours=1)))
        await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        assert (await client.get('/api/v1/logistics/courier/access')).status_code in (401, 403)
        token = create_access_token({'sub':'courier','role':'courier','type':'account','jti':'courier-session'})
        auth = {'Authorization':f'Bearer {token}'}
        access = await client.get('/api/v1/logistics/courier/access', headers=auth)
        assert access.status_code == 200 and access.json()['can_access_cabinet'] is True
        cabinet = await client.get('/api/v1/logistics/courier/cabinet', headers=auth)
        assert cabinet.status_code == 200
