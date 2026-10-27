"""«Шақыру»: build → preview by the owner only → pay request → owner marks paid → guests answer → host sees the list."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.admin_auth import AdminCredentials
from models.auth import User
from models.user_management import UserSession
from models.logistics import LogisticsTask, CourierProfile  # noqa: F401
from models.food_shifts import FoodShift  # noqa: F401
from routers import admin_auth, toy_invites
from services import toy_invites as svc

BASE = '/api/v1/toy'
DAY = (datetime.now(timezone.utc) + timedelta(days=40)).date().isoformat()
DATA = {'kind': 'wedding', 'theme': 'night', 'name1': 'Айбек', 'name2': 'Аружан', 'date': DAY, 'time': '18:00',
        'place': '«Мерей»', 'address': 'Сортировка', 'map_url': 'javascript:alert(1)', 'hosts': 'Нұрлан – Гүлнар',
        'program': [{'time': '18:00', 'kz': 'Той басталады', 'ru': 'Начало'}, {'time': '99:00', 'kz': 'x', 'ru': 'x'}]}


@pytest.fixture
async def env(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([User(id='alice', name='Alice', phone='+77001234567', role='user', status='active', is_active=True),
                    User(id='bob', name='Bob', phone='+77005550000', role='user', status='active', is_active=True),
                    AdminCredentials(username='stage-admin', password_hash='x', is_active=True)])
        await db.flush()
        for uid in ('alice', 'bob'):
            db.add(UserSession(user_id=uid, token_jti=uid + '-s', is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(toy_invites.router)
    app.dependency_overrides[get_db] = database
    sent = []

    async def fake_wa(phone, body):
        sent.append((phone, body))
        return True
    monkeypatch.setattr(svc, '_whatsapp', fake_wa)
    monkeypatch.setattr(svc, '_cabinet', AsyncMock())
    monkeypatch.setattr('services.news_agent.bot_token', lambda: '')
    svc._ready.clear()
    h = {u: {'Authorization': 'Bearer ' + create_access_token({'sub': u, 'role': 'user', 'jti': u + '-s'})} for u in ('alice', 'bob')}
    h['panel'] = {'Authorization': 'Bearer ' + admin_auth._create_admin_jwt('stage-admin')}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, h, sent
    await engine.dispose()


async def test_full_invitation_flow(env):
    client, h, sent = env
    assert (await client.post(BASE + '/invites', json={'data': DATA})).status_code == 401
    r = await client.post(BASE + '/invites', json={'data': DATA}, headers=h['alice'])
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv['status'] == 'draft' and inv['slug'].startswith('aibek-aruzhan-')
    assert inv['data']['map_url'] == '' and len(inv['data']['program']) == 1
    slug = inv['slug']

    # Draft: only the owner sees a preview, guests get 404 and cannot answer.
    assert (await client.get(f'{BASE}/public/{slug}')).status_code == 404
    assert (await client.get(f'{BASE}/public/{slug}', headers=h['bob'])).status_code == 404
    own = (await client.get(f'{BASE}/public/{slug}', headers=h['alice'])).json()
    assert own['preview'] is True and own['owner'] is True
    assert (await client.post(f'{BASE}/public/{slug}/rsvp', json={'name': 'Ерлан'})).status_code == 404
    assert (await client.put(f"{BASE}/invites/{inv['id']}", json={'data': DATA}, headers=h['bob'])).status_code == 404

    # Price and Kaspi link from the admin; the person gets them in WhatsApp.
    await client.put(BASE + '/admin/settings', json={'price': 5990, 'kaspi_link': 'https://pay.kaspi.kz/pay/toy'}, headers=h['panel'])
    assert (await client.get(BASE + '/config')).json()['price'] == 5990
    r = await client.post(f"{BASE}/invites/{inv['id']}/publish", headers=h['alice'])
    assert r.json()['status'] == 'pending' and r.json()['price'] == 5990
    assert sent[-1][0] == '+77001234567' and '5 990 тг' in sent[-1][1] and 'https://pay.kaspi.kz/pay/toy' in sent[-1][1]

    # Owner marks it paid → open for guests.
    r = await client.post(f"{BASE}/admin/invites/{inv['id']}", json={'action': 'paid'}, headers=h['panel'])
    assert r.json()['item']['status'] == 'published' and slug in sent[-1][1]
    pub = (await client.get(f'{BASE}/public/{slug}')).json()
    assert pub['preview'] is False and pub['data']['name2'] == 'Аружан'

    # Guests answer; the same browser changes its answer instead of adding a second line.
    assert (await client.post(f'{BASE}/public/{slug}/rsvp', json={'visitor': 'guestbrowser01', 'name': 'Ерлан', 'guests': 3})).status_code == 200
    await client.post(f'{BASE}/public/{slug}/rsvp', json={'visitor': 'guestbrowser01', 'name': 'Ерлан', 'guests': 2, 'wish': 'Бақытты болыңдар!'})
    await client.post(f'{BASE}/public/{slug}/rsvp', json={'visitor': 'guestbrowser02', 'name': 'Сауле', 'coming': False})
    assert (await client.post(f'{BASE}/public/{slug}/rsvp', json={'name': ' '})).status_code == 400
    g = (await client.get(f"{BASE}/invites/{inv['id']}/guests", headers=h['alice'])).json()
    assert (g['coming'], g['people'], g['declined']) == (1, 2, 1)
    assert (await client.get(f"{BASE}/invites/{inv['id']}/guests", headers=h['bob'])).status_code == 404
    mine = (await client.get(BASE + '/invites/mine', headers=h['alice'])).json()['items']
    assert mine[0]['guests'] == {'coming': 1, 'people': 2, 'declined': 1} and mine[0]['views'] >= 1


async def test_validation_messages(env):
    client, h, _ = env
    bad = dict(DATA, name2='')
    assert (await client.post(BASE + '/invites', json={'data': bad}, headers=h['alice'])).json()['detail'] == 'Напишите имя невесты'
    assert (await client.post(BASE + '/invites', json={'data': dict(DATA, date='2020-01-01')}, headers=h['alice'])).status_code == 400
    assert (await client.post(BASE + '/invites', json={'data': dict(DATA, time='25:00')}, headers=h['alice'])).status_code == 400
    one = dict(DATA, kind='sundet', name1='Әлихан', name2='')
    r = await client.post(BASE + '/invites', json={'data': one}, headers=h['alice'])
    assert r.status_code == 201 and r.json()['slug'].startswith('alihan-')
