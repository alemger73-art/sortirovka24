"""Опросы за бонусы: one answer per confirmed phone, too-fast and check-question answers earn nothing,
500 bonuses land in DAM ALEM as a 30-day lot, the limit closes the survey, results stay anonymous."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.admin_auth import AdminCredentials
from models.auth import User
from models.food_restaurants import Food_restaurants
from models.food_shifts import FoodShift  # noqa: F401
from models.logistics import LogisticsTask, CourierProfile  # noqa: F401
from models.loyalty import BonusLot, BonusMember
from models.module_settings import ModuleSettings  # noqa: F401
from models.user_management import UserSession
from models.user_notifications import UserNotification  # noqa: F401
from models.crm import Customer  # noqa: F401
from routers import admin_auth, surveys
from services import surveys as svc

B = '/api/v1/surveys'
USERS = ('ann', 'bob', 'cat', 'dan', 'eve')


@pytest.fixture
async def env(monkeypatch):
    import os
    from sqlalchemy import text as sql
    engine = create_async_engine(os.getenv('NB_TEST_PG') or 'sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        if os.getenv('NB_TEST_PG'):  # same checks on real Postgres, like production
            await conn.execute(sql('DROP SCHEMA public CASCADE'))
            await conn.execute(sql('CREATE SCHEMA public'))
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    verified = datetime.now(timezone.utc)
    async with maker() as db:
        db.add(Food_restaurants(id=1, name='DAM ALEM 2.0', merchant_key='dam_alem'))
        db.add_all([User(id=u, name=u.title(), phone=f'+7700{i:07d}', role='user', status='active', is_active=True,
                         bonus_balance=0, phone_verified_at=None if u == 'eve' else verified) for i, u in enumerate(USERS)]
                   + [AdminCredentials(username='owner', password_hash='x', is_active=True)])
        await db.flush()
        for uid in USERS:
            db.add(UserSession(user_id=uid, token_jti=uid + '-s', is_active=True, expires_at=verified + timedelta(hours=1)))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(surveys.router)
    app.dependency_overrides[get_db] = database
    svc._ready.clear()
    clock = {'shift': timedelta(0)}
    real_now = svc.now
    monkeypatch.setattr(svc, 'now', lambda: real_now() + clock['shift'])
    h = {u: {'Authorization': 'Bearer ' + create_access_token({'sub': u, 'role': 'user', 'jti': u + '-s'})} for u in USERS}
    h['owner'] = {'Authorization': 'Bearer ' + admin_auth._create_admin_jwt('owner')}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, h, maker, clock
    await engine.dispose()


def good_answers(questions, **override):
    out = {}
    for q in questions:
        if q['type'] in ('single', 'check'):
            out[q['id']] = {'choices': [1 if q['type'] == 'check' else 0]}
        elif q['type'] == 'multi':
            out[q['id']] = {'choices': [0, 2], 'other': 'Бассейн'}
        elif q['type'] == 'scale':
            out[q['id']] = {'value': 4}
        else:
            out[q['id']] = {'text': 'Отремонтировать дороги'}
    return out | override


async def test_survey_flow(env):
    client, h, maker, clock = env
    assert (await client.get(f'{B}/admin', headers=h['ann'])).status_code == 403
    drafts = (await client.get(f'{B}/admin', headers=h['owner'])).json()['items']
    assert [s['status'] for s in drafts] == ['draft', 'draft'] and (await client.get(B)).json()['items'] == []
    sid = next(s['id'] for s in drafts if s['title'].startswith('Чего не хватает'))
    await client.post(f'{B}/admin/{sid}/status', headers=h['owner'], json={'status': 'active'})

    public = (await client.get(B, headers=h['ann'])).json()['items']
    assert public[0]['reward'] == 500 and public[0]['done'] is False
    assert (await client.get(f'{B}/{sid}')).status_code == 401
    survey = (await client.get(f'{B}/{sid}', headers=h['ann'])).json()
    assert all('answer' not in q for q in survey['questions'])  # the check question's answer never leaves the server
    qs = survey['questions']
    check = next(q['id'] for q in qs if q['type'] == 'check')

    # required question left empty → told which one
    bad = await client.post(f'{B}/{sid}', headers=h['ann'], json={'answers': {}})
    assert bad.status_code == 422 and 'Ответьте на вопрос' in bad.json()['detail']
    # answered in a second → saved apart, no bonus
    fast = (await client.post(f'{B}/{sid}', headers=h['ann'], json={'answers': good_answers(qs)})).json()
    assert fast['valid'] is False and fast['rewarded'] == 0
    assert (await client.post(f'{B}/{sid}', headers=h['ann'], json={'answers': good_answers(qs)})).status_code == 409

    # a phone that isn't confirmed can open but not answer
    await client.get(f'{B}/{sid}', headers=h['eve'])
    assert (await client.post(f'{B}/{sid}', headers=h['eve'], json={'answers': good_answers(qs)})).status_code == 403

    # wrong check question → no bonus; an honest answer → 500 bonuses for 30 days
    for u in ('bob', 'cat'):
        await client.get(f'{B}/{sid}', headers=h[u])
    clock['shift'] = timedelta(seconds=90)
    wrong = (await client.post(f'{B}/{sid}', headers=h['bob'], json={'answers': good_answers(qs, **{check: {'choices': [0]}})})).json()
    assert wrong['valid'] is False and wrong['rewarded'] == 0
    ok = (await client.post(f'{B}/{sid}', headers=h['cat'], json={'answers': good_answers(qs)})).json()
    assert ok['valid'] is True and ok['rewarded'] == 500 and 'DÄM ALEM' in ok['message']
    async with maker() as db:
        member = await db.scalar(select(BonusMember).join(BonusLot, BonusLot.account_id == BonusMember.id))
        lot = await db.scalar(select(BonusLot))
        assert float(member.bonus_balance) == 500 and float(lot.remaining) == 500
        expires = lot.expires_at if lot.expires_at.tzinfo else lot.expires_at.replace(tzinfo=timezone.utc)
        assert 29 <= (expires - datetime.now(timezone.utc)).days <= 30

    # results: only the honest answer counts, nothing identifies the person
    res = (await client.get(f'{B}/admin/{sid}/results', headers=h['owner'])).json()
    assert res['counts'] == {'total': 3, 'valid': 1, 'rewarded': 1}
    assert res['rejected'] == {'too_fast': 1, 'check_failed': 1}
    first = res['questions'][0]
    assert first['options'][0]['count'] == 1 and first['texts'] == ['Бассейн']
    assert 'cat' not in str(res) and '+7700' not in str(res)
    csv = (await client.get(f'{B}/admin/{sid}/results.csv', headers=h['owner'])).text
    assert csv.startswith('﻿№;Дата') and 'Отремонтировать дороги' in csv

    # answered surveys keep their questions and can't be deleted
    s = next(x for x in (await client.get(f'{B}/admin', headers=h['owner'])).json()['items'] if x['id'] == sid)
    assert s['bonus_spent'] == 500
    changed = await client.put(f'{B}/admin/{sid}', headers=h['owner'], json={**s, 'questions': s['questions'][:2]})
    assert changed.status_code == 409
    assert (await client.put(f'{B}/admin/{sid}', headers=h['owner'], json={**s, 'title': 'Новое название'})).status_code == 200
    assert (await client.delete(f'{B}/admin/{sid}', headers=h['owner'])).status_code == 409


async def test_limit_closes_survey_and_validation(env):
    client, h, _, clock = env
    bad = await client.post(f'{B}/admin', headers=h['owner'], json={'title': 'X', 'questions': [{'type': 'single', 'text': 'Да?', 'options': ['Да']}]})
    assert bad.status_code == 400 and 'два варианта' in bad.json()['detail']
    bad = await client.post(f'{B}/admin', headers=h['owner'], json={'title': 'X', 'questions': [{'type': 'check', 'text': 'Отметьте Б', 'options': ['А', 'Б']}]})
    assert bad.status_code == 400 and 'проверочного' in bad.json()['detail']
    items = (await client.post(f'{B}/admin', headers=h['owner'], json={
        'title': 'Короткий', 'reward': 300, 'max_rewards': 1,
        'questions': [{'type': 'scale', 'text': 'Оцените'}, {'type': 'text', 'text': 'Комментарий', 'required': False}]})).json()['items']
    sid = next(s['id'] for s in items if s['title'] == 'Короткий')
    await client.post(f'{B}/admin/{sid}/status', headers=h['owner'], json={'status': 'active'})
    for u in ('ann', 'bob'):
        await client.get(f'{B}/{sid}', headers=h[u])
    clock['shift'] = timedelta(seconds=60)
    first = (await client.post(f'{B}/{sid}', headers=h['ann'], json={'answers': {'q1': {'value': 5}}})).json()
    assert first['rewarded'] == 300
    # the only bonus place is taken → the survey closed itself
    assert (await client.post(f'{B}/{sid}', headers=h['bob'], json={'answers': {'q1': {'value': 3}}})).status_code == 409
    assert all(s['id'] != sid for s in (await client.get(B)).json()['items'])
    # a draft without answers can be deleted
    draft = next(s['id'] for s in (await client.get(f'{B}/admin', headers=h['owner'])).json()['items'] if s['status'] == 'draft')
    assert (await client.delete(f'{B}/admin/{draft}', headers=h['owner'])).status_code == 200
