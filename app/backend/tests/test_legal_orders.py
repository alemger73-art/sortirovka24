import json
import pytest
from sqlalchemy import select, func
from core.legal import LEGAL_VERSION
from models.food_orders import Food_orders
from models.user_management import UserAction
from tests.test_dam_order_workflow import env  # isolated DB and mocked providers


@pytest.mark.asyncio
async def test_order_and_consent_commit_together_and_retry_does_not_duplicate(env):
    client, maker, _, _ = env
    body = {'request_key':'legal-order-retry-20261009', 'restaurant_id':1, 'customer_name':'Тест Тестов',
            'customer_phone':'+77003333333', 'delivery_method':'pickup', 'payment_method':'cash',
            'order_items':json.dumps([{'id':2,'quantity':2,'price':300}]), 'total_amount':600,
            'legal_version':LEGAL_VERSION, 'legal_accepted':True, 'legal_language':'kz'}
    first = await client.post('/api/v1/entities/food_orders', json=body)
    assert first.status_code == 201, first.text
    repeated = await client.post('/api/v1/entities/food_orders', json=body)
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()['id'] == first.json()['id']
    async with maker() as db:
        receipt = (await db.execute(select(UserAction).where(UserAction.action == 'legal_acceptance',
                   UserAction.entity == 'food_orders', UserAction.entity_id == str(first.json()['id'])))).scalar_one()
        assert await db.get(Food_orders, first.json()['id']) is not None
        data = json.loads(receipt.payload)
        assert data['subject_name'] == 'Тест Тестов'
        assert data['version'] == LEGAL_VERSION
        assert set(data['documents']) == {'food-terms','consent','privacy'}


@pytest.mark.asyncio
async def test_current_order_without_active_consent_is_rejected_before_creation(env):
    client, maker, _, _ = env
    async with maker() as db:
        count = await db.scalar(select(func.count()).select_from(Food_orders))
    response = await client.post('/api/v1/entities/food_orders', json={
        'customer_name':'Тест Тестов','customer_phone':'+77003333333',
        'legal_version':LEGAL_VERSION,'legal_accepted':False})
    assert response.status_code == 400, response.text
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(Food_orders)) == count
