"""Run on SQLite and, when configured, an isolated PostgreSQL schema.

DAM_TEST_POSTGRES_URL must point to a test/staging database. No existing
tables are touched: PostgreSQL tests use a random, exclusive search_path.
"""
import os
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.auth import User
from models.food_orders import Food_orders
from models.food_restaurants import Food_restaurants
from models.logistics import CourierProfile
from models.module_settings import ModuleSettings  # register before create_all
from models.taxi import TaxiSettings  # availability guard queries this table
from models.partner_auth import PartnerCredentials
from routers.food_business import router as business_router
from routers.food_operations import router as operations_router
from routers.logistics import router as logistics_router

URL = '/api/v1/dam-alem/business/staff/couriers'


@pytest.fixture(params=['sqlite', 'postgresql'])
async def registration(request, tmp_path):
    schema = None
    if request.param == 'postgresql':
        url = os.getenv('DAM_TEST_POSTGRES_URL')
        if not url:
            pytest.skip('DAM_TEST_POSTGRES_URL is not configured')
        schema = 'test_courier_' + uuid4().hex
        engine = create_async_engine(url, connect_args={'server_settings': {'search_path': schema}})
        async with engine.begin() as conn:
            await conn.execute(text(f'CREATE SCHEMA "{schema}"'))
    else:
        engine = create_async_engine('sqlite+aiosqlite:///' + (tmp_path / 'registration.db').as_posix())
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as db:
            db.add(PartnerCredentials(id=1, partner_type='dam_alem', email='owner@test.invalid',
                password_hash='unused', display_name='Test Owner', is_active=True, access_role='owner'))
            db.add(Food_restaurants(id=1, name='DAM ALEM 2.0'))
            await db.commit()
        app = FastAPI()
        for router in (business_router, operations_router, logistics_router):
            app.include_router(router)

        async def dependency():
            async with maker() as db:
                yield db

        app.dependency_overrides[get_db] = dependency
        token = create_access_token({'role':'partner', 'type':'partner_session',
            'partner_type':'dam_alem', 'partner_id':1, 'sub':'owner'})
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            yield client, maker, {'Authorization': 'Bearer ' + token}
    finally:
        if schema:
            # Only this fixture's UUID-named schema, never public or an input name.
            async with engine.begin() as conn:
                await conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize('stored,entered', [
    ('+77004444444', '+77004444444'),
    ('+77004444444', '87004444444'),
    ('8 (700) 444-44-44', '+7 (700) 444-44-44'),
    ('7004444444', '+77004444444'),
])
async def test_existing_customer_confirmation_attach_login_and_reload(registration, stored, entered):
    client, maker, owner = registration
    async with maker() as db:
        db.add(User(id='customer', name='Original', phone=stored, role='user', password_hash='unchanged'))
        await db.commit()
    payload = {'name':'Courier label', 'phone':entered, 'pin':'8271'}
    response = await client.post(URL, headers=owner, json=payload)
    assert response.status_code == 409, response.text
    assert 'Добавить ему доступ курьера' in response.json()['detail']
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == 1
        assert await db.get(CourierProfile, 'customer') is None
    response = await client.post(URL, headers=owner, json={**payload, 'attach_existing':True})
    assert response.status_code == 200, response.text
    assert response.json()['id'] == 'customer'
    for _ in range(2):
        rows = (await client.get(URL, headers=owner)).json()
        assert len(rows) == 1 and rows[0]['id'] == 'customer' and rows[0]['pin_set']
    async with maker() as db:
        user = await db.get(User, 'customer')
        assert (user.name, user.role, user.password_hash, user.phone) == ('Original', 'user', 'unchanged', stored)
    logged = await client.post('/api/v1/logistics/courier/pin-login', json={'pin':'8271'})
    assert logged.status_code == 200, logged.text
    for body in (payload, {**payload, 'attach_existing':True}):
        duplicate = await client.post(URL, headers=owner, json=body)
        assert duplicate.status_code == 409 and 'настройки доступа' in duplicate.text
    assert 'pin_hash' not in str(rows) and '8271' not in str(rows)


@pytest.mark.asyncio
async def test_new_courier_persists_and_pin_authenticates(registration):
    client, maker, owner = registration
    response = await client.post(URL, headers=owner, json={'name':'New Courier', 'phone':'87006665544', 'pin':'7148'})
    assert response.status_code == 200, response.text
    async with maker() as db:
        user = await db.get(User, response.json()['id'])
        assert user.phone == '+77006665544' and user.role == 'courier'
        assert (await db.get(CourierProfile, user.id)).is_verified
    assert (await client.post('/api/v1/logistics/courier/pin-login', json={'pin':'7148'})).status_code == 200
    assert len((await client.get(URL, headers=owner)).json()) == 1


@pytest.mark.asyncio
async def test_ambiguous_legacy_accounts_are_not_attached_arbitrarily(registration):
    client, maker, owner = registration
    async with maker() as db:
        db.add_all([User(id='a', phone='+77004444444'), User(id='b', phone='87004444444')])
        await db.commit()
    response = await client.post(URL, headers=owner, json={
        'name':'Courier', 'phone':'+77004444444', 'pin':'8271', 'attach_existing':True})
    assert response.status_code == 409 and 'несколько аккаунтов' in response.text
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(CourierProfile)) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize('role,active', [('admin', True), ('user', False)])
async def test_service_or_disabled_customer_cannot_be_attached(registration, role, active):
    client, maker, owner = registration
    async with maker() as db:
        db.add(User(id='protected', phone='+77004444444', role=role, is_active=active))
        await db.commit()
    response = await client.post(URL, headers=owner, json={
        'name':'Courier', 'phone':'+77004444444', 'pin':'8271', 'attach_existing':True})
    assert response.status_code == 409 and 'служебный аккаунт' in response.text
    async with maker() as db:
        assert await db.get(CourierProfile, 'protected') is None


@pytest.mark.asyncio
async def test_operator_customer_history_uses_same_phone_matching(registration):
    client, maker, owner = registration
    async with maker() as db:
        db.add(Food_orders(id=1, restaurant_id=1, restaurant_name='DAM ALEM 2.0',
            customer_name='Known customer', customer_phone='8 (700) 444-44-44',
            delivery_method='delivery', delivery_address='Test street 1', status='new', total_amount=1000))
        await db.commit()
    response = await client.get('/api/v1/dam-alem/operations/customer', params={'phone':'+77004444444'}, headers=owner)
    assert response.status_code == 200, response.text
    assert response.json()['name'] == 'Known customer'
    assert response.json()['addresses'] == ['Test street 1']
    assert [row['id'] for row in response.json()['recent_orders']] == [1]


@pytest.mark.asyncio
async def test_customer_signup_race_returns_conflict_without_partial_courier(registration, monkeypatch):
    client, maker, owner = registration
    original_flush = AsyncSession.flush
    raced = False

    async def racing_flush(session, *args, **kwargs):
        nonlocal raced
        if not raced and any(isinstance(row, User) and row.name == 'Race courier' for row in session.new):
            raced = True
            async with maker() as other:
                other.add(User(id='signup', name='Customer', phone='+77007776655'))
                await other.commit()
        return await original_flush(session, *args, **kwargs)

    monkeypatch.setattr(AsyncSession, 'flush', racing_flush)
    response = await client.post(URL, headers=owner, json={
        'name':'Race courier', 'phone':'+77007776655', 'pin':'7148'})
    assert raced and response.status_code == 409, response.text
    assert 'Обновите список' in response.text and '7148' not in response.text
    async with maker() as db:
        assert await db.scalar(select(func.count()).select_from(User)) == 1
        assert await db.scalar(select(func.count()).select_from(CourierProfile)) == 0
