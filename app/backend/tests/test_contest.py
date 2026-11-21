"""«Новогодняя Сортировка»: apply with photos → owner publishes → one vote per nomination → owner marks winners."""
import base64
import io
from datetime import datetime, timedelta, timezone

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
from routers import admin_auth, contest
from services import contest as svc

BASE = '/api/v1/contest'
USERS = ('alice', 'bob', 'carol')


def _day(offset: int) -> str:
    return (datetime.now(svc.KZ).date() + timedelta(days=offset)).isoformat()


APPLY_NOW = {'apply_from': _day(-1), 'apply_to': _day(1), 'vote_from': _day(2), 'vote_to': _day(5)}
VOTE_NOW = {'apply_from': _day(-6), 'apply_to': _day(-3), 'vote_from': _day(-1), 'vote_to': _day(2)}


def _photo() -> str:
    from PIL import Image
    buf = io.BytesIO()
    Image.effect_noise((120, 90), 60).convert('RGB').save(buf, 'JPEG', quality=90)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


@pytest.fixture
async def env():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([User(id=u, name=u.title(), phone=f'+7700000000{i}', role='user', status='active', is_active=True)
                    for i, u in enumerate(USERS)] + [AdminCredentials(username='stage-admin', password_hash='x', is_active=True)])
        await db.flush()
        for uid in USERS:
            db.add(UserSession(user_id=uid, token_jti=uid + '-s', is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(contest.router)
    app.dependency_overrides[get_db] = database
    svc._ready.clear()
    h = {u: {'Authorization': 'Bearer ' + create_access_token({'sub': u, 'role': 'user', 'jti': u + '-s'})} for u in USERS}
    h['panel'] = {'Authorization': 'Bearer ' + admin_auth._create_admin_jwt('stage-admin')}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, h
    await engine.dispose()


async def _settings(client, h, dates):
    r = await client.put(f'{BASE}/admin/settings', json={'settings': dates}, headers=h['panel'])
    assert r.status_code == 200, r.text


async def _apply(client, h, user, nomination='yard', title='Двор на Уранова'):
    key = (await client.post(f'{BASE}/photos', json={'image': _photo()}, headers=h[user])).json()['key']
    r = await client.post(f'{BASE}/entries', json={'nomination': nomination, 'title': title, 'street': 'ул. Уранова',
                                                   'about': 'Вся ёлка своими руками', 'photos': [key]}, headers=h[user])
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_full_contest_flow(env):
    client, h = env
    await _settings(client, h, APPLY_NOW)
    entry = await _apply(client, h, 'alice')
    assert entry['status'] == 'pending'

    page = (await client.get(BASE)).json()
    assert page['phase'] == 'apply' and page['entries'] == []  # not shown before the owner checks it

    admin = (await client.get(f'{BASE}/admin', headers=h['panel'])).json()
    assert admin['entries'][0]['user_phone'] == '+77000000000'
    assert (await client.post(f'{BASE}/admin/entries/{entry["id"]}', json={'status': 'published'}, headers=h['panel'])).status_code == 200

    page = (await client.get(BASE)).json()
    assert len(page['entries']) == 1 and page['entries'][0]['votes'] is None
    assert 'user_id' not in page['entries'][0] and 'user_phone' not in page['entries'][0]

    await _settings(client, h, VOTE_NOW)
    assert (await client.post(f'{BASE}/vote', json={'entry_id': entry['id']}, headers=h['alice'])).status_code == 400  # own entry
    assert (await client.post(f'{BASE}/vote', json={'entry_id': entry['id']}, headers=h['bob'])).status_code == 200
    again = await client.post(f'{BASE}/vote', json={'entry_id': entry['id']}, headers=h['bob'])
    assert again.status_code == 400 and 'уже' in again.json()['detail']
    assert (await client.post(f'{BASE}/vote', json={'entry_id': entry['id']})).status_code == 401

    page = (await client.get(BASE, headers=h['bob'])).json()
    assert page['phase'] == 'vote' and page['entries'][0]['votes'] == 1 and page['mine']['votes'] == {'yard': entry['id']}

    await client.post(f'{BASE}/admin/entries/{entry["id"]}', json={'place': 1}, headers=h['panel'])
    assert (await client.get(BASE)).json()['entries'][0]['place'] == 1


@pytest.mark.asyncio
async def test_closed_phases_and_bad_input(env):
    client, h = env
    await _settings(client, h, VOTE_NOW)
    key = (await client.post(f'{BASE}/photos', json={'image': _photo()}, headers=h['alice'])).json()['key']
    r = await client.post(f'{BASE}/entries', json={'nomination': 'yard', 'title': 'Двор', 'street': 'Уранова', 'photos': [key]},
                          headers=h['alice'])
    assert r.status_code == 400 and 'закрыт' in r.json()['detail']

    await _settings(client, h, APPLY_NOW)
    stolen = await client.post(f'{BASE}/entries', json={'nomination': 'house', 'title': 'Дом', 'street': 'Уранова', 'photos': [key]},
                               headers=h['bob'])
    assert stolen.status_code == 400  # someone else's photo key does not count
    assert (await client.post(f'{BASE}/photos', json={'image': 'data:text/html;base64,PGI+'}, headers=h['bob'])).status_code == 400
    bad_order = await client.put(f'{BASE}/admin/settings', json={'settings': {'vote_from': _day(-30)}}, headers=h['panel'])
    assert bad_order.status_code == 400


@pytest.mark.asyncio
async def test_admin_needs_owner(env):
    client, h = env
    assert (await client.get(f'{BASE}/admin', headers=h['alice'])).status_code == 403
    assert (await client.put(f'{BASE}/admin/settings', json={'settings': {}})).status_code == 403


def test_phase_order():
    s = svc.clean_settings({'apply_from': '2026-12-01', 'apply_to': '2026-12-20', 'vote_from': '2026-12-21', 'vote_to': '2026-12-27'})
    assert [svc.phase(s, d) for d in ('2026-11-30', '2026-12-05', '2026-12-21', '2026-12-28')] == ['soon', 'apply', 'vote', 'results']
    assert svc.phase({**s, 'enabled': False}, '2026-12-05') == 'off'
