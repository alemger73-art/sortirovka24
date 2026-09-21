import pytest
from sqlalchemy import select
from tests.test_dam_order_workflow import env, BASE
from models.food_orders import Food_orders
from models.food_settings import Food_settings
from models.logistics import LogisticsTask


@pytest.mark.asyncio
async def test_operator_delivery_preserves_payout_and_rejects_replay(env):
    client, maker, headers, _ = env
    async with maker() as db:
        db.add(Food_settings(setting_key='courier_payout', setting_value='800'))
        await db.commit()
    for version, status in enumerate(['confirmed', 'preparing', 'ready', 'in_progress', 'done']):
        body = {'expected_version': version, 'status': status}
        if status == 'in_progress':
            skipped = await client.patch(BASE+'/orders/1', headers=headers,
                json={'expected_version': version, 'status': 'done'})
            assert skipped.status_code == 409
        result = await client.patch(BASE+'/orders/1', headers=headers, json=body)
        assert result.status_code == 200, result.text
        assert (await client.patch(BASE+'/orders/1', headers=headers, json=body)).status_code == 409
    async with maker() as db:
        task = await db.scalar(select(LogisticsTask))
        order = await db.get(Food_orders, 1)
        assert task.customer_delivery_fee == 0 and task.courier_payout == 800
        assert task.status == 'delivered' and task.picked_up_at and task.delivered_at
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
async def test_courier_portal_and_mutations_are_paused(env):
    from fastapi import FastAPI
    from httpx import AsyncClient, ASGITransport
    from core.database import get_db
    from routers.logistics import router
    _, maker, _, _ = env
    app = FastAPI()
    app.include_router(router)
    async def db_session():
        async with maker() as db:
            yield db
    app.dependency_overrides[get_db] = db_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        for method, path in [('GET','courier/access'),('GET','courier/cabinet'),('POST','courier/application'),('PUT','courier/online'),('PUT','courier/location'),('POST','tasks/1/accept'),('POST','tasks/1/status')]:
            response = await client.request(method, '/api/v1/logistics/'+path, json={})
            assert response.status_code == 404, (path, response.text)
