"""«Полезно знать»: editors publish cards, residents read them, vote once and discuss them in «Вся Сортировка»."""
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
from routers import admin_auth, neighbors, useful
from services import neighbors as nb, useful as svc

B = '/api/v1/useful'
USERS = ('alice', 'bob')
CARD = {
    'title': 'Прогулы в школе сверяют с полицией',
    'summary': 'Новые правила учёта детей и травли в школах',
    'badge': 'с 21 ноября',
    'changes': ['Списки прогульщиков сверяют с полицией до 10-го числа', 'Травлю регистрируют за 1 рабочий день'],
    'actions': ['Сохраняйте справки о пропусках'],
    'phones': [{'number': '111', 'label': 'права детей'}, {'number': '150', 'label': 'телефон доверия'}],
    'source': {'title': 'Приказ Минпросвещения от 02.11.2026', 'url': 'https://www.zakon.kz/'},
    'poll': {'question': 'Как вы относитесь?', 'options': ['Правильно', 'Перебор', 'Не знаю']},
}


@pytest.fixture
async def env():
    import os
    from sqlalchemy import text as sql
    engine = create_async_engine(os.getenv('NB_TEST_PG') or 'sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        if os.getenv('NB_TEST_PG'):
            await conn.execute(sql('DROP SCHEMA public CASCADE'))
            await conn.execute(sql('CREATE SCHEMA public'))
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([User(id=u, name=u.title(), phone=f'+7700{i:07d}', role='user', status='active', is_active=True)
                    for i, u in enumerate(USERS)] + [AdminCredentials(username='stage-admin', password_hash='x', is_active=True)])
        await db.flush()
        for uid in USERS:
            db.add(UserSession(user_id=uid, token_jti=uid + '-s', is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(useful.router)
    app.include_router(neighbors.router)
    app.dependency_overrides[get_db] = database
    svc._ready.clear()
    nb._ready.clear()
    h = {u: {'Authorization': 'Bearer ' + create_access_token({'sub': u, 'role': 'user', 'jti': u + '-s'})} for u in USERS}
    h['panel'] = {'Authorization': 'Bearer ' + admin_auth._create_admin_jwt('stage-admin')}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, h


async def test_only_admins_save_and_drafts_stay_hidden(env):
    c, h = env
    assert (await c.put(f'{B}/admin/skip-school', json={'card': CARD}, headers=h['alice'])).status_code in (401, 403)
    assert (await c.put(f'{B}/admin/Плохой', json={'card': CARD}, headers=h['panel'])).status_code == 422
    saved = (await c.put(f'{B}/admin/skip-school', json={'card': CARD, 'published': False}, headers=h['panel'])).json()
    assert saved['discussion_post_id'] is None
    assert (await c.get(B)).json()['items'] == []
    assert (await c.get(f'{B}/skip-school')).status_code == 404
    assert [x['slug'] for x in (await c.get(f'{B}/admin', headers=h['panel'])).json()['items']] == ['skip-school']


async def test_publication_opens_one_district_discussion(env):
    c, h = env
    first = (await c.put(f'{B}/admin/skip-school', json={'card': CARD, 'published': True}, headers=h['panel'])).json()
    again = (await c.put(f'{B}/admin/skip-school', json={'card': {**CARD, 'summary': 'Исправлено'}, 'published': True},
                         headers=h['panel'])).json()
    assert first['discussion_post_id'] and again['discussion_post_id'] == first['discussion_post_id']
    teaser = (await c.get(B)).json()['items'][0]
    assert teaser['title'] == CARD['title'] and teaser['badge'] == 'с 21 ноября' and 'changes' not in teaser
    card = (await c.get(f'{B}/skip-school')).json()
    assert card['summary'] == 'Исправлено' and card['phones'][0]['number'] == '111'
    # the discussion shows in «Вся Сортировка» from «Сортировка 24», and residents can answer it
    await c.put('/api/v1/neighbors/me', json={'kind': 'flat', 'street': 'ЖКБ', 'house': '135', 'entrance': 3, 'flat': '41', 'consent': True},
                headers=h['alice'])
    feed = (await c.get('/api/v1/neighbors/feed', params={'district': True}, headers=h['alice'])).json()['items']
    post = next(p for p in feed if p['id'] == first['discussion_post_id'])
    assert post['author']['name'] == 'Сортировка 24' and 'skip-school' in post['body']
    reply = await c.post(f"/api/v1/neighbors/posts/{post['id']}/comments", json={'body': 'Правильное решение'}, headers=h['alice'])
    assert reply.status_code in (200, 201)


async def test_residents_vote_once_and_can_change_their_mind(env):
    c, h = env
    await c.put(f'{B}/admin/skip-school', json={'card': CARD, 'published': True}, headers=h['panel'])
    assert (await c.post(f'{B}/skip-school/vote', json={'choice': 0})).status_code == 401
    assert (await c.post(f'{B}/skip-school/vote', json={'choice': 7}, headers=h['alice'])).status_code == 400
    await c.post(f'{B}/skip-school/vote', json={'choice': 0}, headers=h['alice'])
    await c.post(f'{B}/skip-school/vote', json={'choice': 1}, headers=h['bob'])
    res = (await c.post(f'{B}/skip-school/vote', json={'choice': 1}, headers=h['alice'])).json()
    assert res == {'counts': [0, 2, 0], 'total': 2, 'mine': 1}
    anonymous = (await c.get(f'{B}/skip-school')).json()['poll_results']
    assert anonymous == {'counts': [0, 2, 0], 'total': 2, 'mine': None}
