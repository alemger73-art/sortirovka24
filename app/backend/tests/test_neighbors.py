"""«Мой дом»: address → confirmation (receipt or neighbours) → house feed, comments, «У меня тоже», reports, privacy."""
import base64
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
from routers import admin_auth, neighbors
from services import neighbors as svc

B = '/api/v1/neighbors'
USERS = ('alice', 'bob', 'carl', 'dina', 'eve', 'fox')
IMG = 'data:image/jpeg;base64,' + base64.b64encode(b'\xff\xd8' + b'x' * 5000).decode()


def addr(**kw):
    return {'kind': 'flat', 'street': 'ЖКБ', 'house': '135', 'entrance': 3, 'flat': '41', 'display_name': '', 'consent': True} | kw


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
    async with maker() as db:
        db.add_all([User(id=u, name=u.title() + ' Test', phone=f'+7700{i:07d}', role='user', status='active', is_active=True)
                    for i, u in enumerate(USERS)] + [AdminCredentials(username='stage-admin', password_hash='x', is_active=True)])
        await db.flush()
        for uid in USERS:
            db.add(UserSession(user_id=uid, token_jti=uid + '-s', is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(neighbors.router)
    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(svc, '_cabinet', AsyncMock())
    monkeypatch.setattr(svc, '_spawn', lambda coro: coro.close())
    svc._ready.clear()
    h = {u: {'Authorization': 'Bearer ' + create_access_token({'sub': u, 'role': 'user', 'jti': u + '-s'})} for u in USERS}
    h['panel'] = {'Authorization': 'Bearer ' + admin_auth._create_admin_jwt('stage-admin')}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, h


def test_streets_and_houses_are_normalised():
    assert svc.canon_street('ул. Жекебаева') == ('Жекибаева', False)
    assert svc.canon_street('жкб') == ('Жекибаева', False)
    assert svc.canon_street('Маметова') == ('Маншук Маметовой', False)
    assert svc.canon_street('Новая улица')[1] is True
    assert svc.canon_house('133 / 1') == '133/1'
    assert svc.canon_house('139 «а»') == '139А'
    with pytest.raises(ValueError):
        svc.canon_house('сто')


async def test_full_flow(env):
    c, h = env
    # validation
    r = await c.put(B + '/me', json=addr(consent=False), headers=h['alice'])
    assert r.status_code == 400 and 'согласие' in r.json()['detail']
    r = await c.put(B + '/me', json=addr(entrance=''), headers=h['alice'])
    assert r.status_code == 400
    assert (await c.get(B + '/me')).status_code == 401

    # first resident: nobody can confirm → receipt
    r = await c.put(B + '/me', json=addr(), headers=h['alice'])
    body = r.json()
    assert body['member']['status'] == 'pending' and body['member']['title'] == 'ул. Жекибаева, 135'
    assert body['member']['display_name'] == 'Alice' and body['confirm']['needed'] == 0
    assert (await c.post(B + '/posts', json={'kind': 'question', 'body': 'Когда дадут свет?'}, headers=h['alice'])).status_code == 403
    assert (await c.get(B + '/house', headers=h['alice'])).json()['locked'] is True
    r = await c.post(B + '/me/proof', json={'image': 'data:text/html;base64,AAAA'}, headers=h['alice'])
    assert r.status_code == 400
    r = await c.post(B + '/me/proof', json={'image': IMG}, headers=h['alice'])
    assert r.json()['confirm']['proof_waiting'] is True
    ov = (await c.get(B + '/admin', headers=h['panel'])).json()
    assert ov['waiting'][0]['flat'] == '41'
    assert (await c.get(B + '/admin', headers=h['alice'])).status_code == 403
    mid = ov['waiting'][0]['id']
    assert (await c.get(B + f'/admin/proof/{mid}', headers=h['panel'])).json()['image'] == IMG
    assert (await c.post(B + f'/admin/proof/{mid}', json={'approve': True}, headers=h['panel'])).json()['answer'] == 'Житель подтверждён'
    me = (await c.get(B + '/me', headers=h['alice'])).json()
    assert me['member']['status'] == 'confirmed'
    assert (await c.get(B + f'/admin/proof/{mid}', headers=h['panel'])).json()['image'] == ''  # photo deleted

    # second resident: one confirmed neighbour → one confirmation is enough; spelling «Жекебаева» meets in the same house
    r = await c.put(B + '/me', json=addr(street='Жекебаева', entrance=1, flat='5', anonymous=True), headers=h['bob'])
    assert r.json()['confirm'] == {'confirmed_in_house': 1, 'needed': 1, 'got': 0, 'proof_sent': False, 'proof_waiting': False}
    house = (await c.get(B + '/house', headers=h['alice'])).json()
    assert house['waiting'][0]['name'] == 'Сосед из 1 подъезда'
    assert 'flat' not in str(house) and 'bob' not in str(house) and '+7700' not in str(house)  # privacy
    bob_id = house['waiting'][0]['id']
    assert (await c.post(B + f'/confirm/{bob_id}', headers=h['bob'])).status_code == 403  # not confirmed yet
    assert (await c.post(B + f'/confirm/{bob_id}', headers=h['alice'])).json() == {'confirmed': True}

    # third: two confirmed neighbours → needs two
    await c.put(B + '/me', json=addr(flat='77'), headers=h['carl'])
    carl_id = (await c.get(B + '/me', headers=h['carl'])).json()['member']['id']
    assert (await c.post(B + f'/confirm/{carl_id}', headers=h['alice'])).json()['confirmed'] is False
    assert (await c.post(B + f'/confirm/{carl_id}', headers=h['alice'])).json()['got'] == 1  # same voter twice counts once
    assert (await c.post(B + f'/confirm/{carl_id}', headers=h['bob'])).json()['confirmed'] is True
    house = (await c.get(B + '/house', headers=h['carl'])).json()
    assert house['total'] == 3 and house['entrances'] == {'3': 2, '1': 1}

    # another house sees nothing of this one
    await c.put(B + '/me', json=addr(house='137'), headers=h['dina'])

    # feed
    r = await c.post(B + '/posts', json={'kind': 'alarm', 'body': 'В 3 подъезде нет света с утра', 'only_entrance': True}, headers=h['alice'])
    assert r.status_code == 201
    pid = r.json()['id']
    assert r.json()['entrance'] == 3
    await c.post(B + '/posts', json={'kind': 'question', 'body': 'Кто знает, когда починят лифт?'}, headers=h['bob'])
    feed = (await c.get(B + '/feed', headers=h['carl'])).json()['items']
    assert [p['kind'] for p in feed] == ['question', 'alarm']
    assert feed[0]['author']['name'] == 'Сосед из 1 подъезда'
    only_entrance = (await c.get(B + '/feed?entrance=true', headers=h['bob'])).json()['items']
    assert [p['kind'] for p in only_entrance] == ['question']
    assert (await c.get(B + '/feed?kind=alarm', headers=h['carl'])).json()['items'][0]['id'] == pid
    assert (await c.get(B + f'/posts/{pid}', headers=h['dina'])).status_code == 404
    assert (await c.get(B + '/feed', headers=h['dina'])).json()['items'] == []

    # me too, comments
    assert (await c.post(B + f'/posts/{pid}/metoo', headers=h['carl'])).json() == {'me_too': 1, 'i_me_too': True}
    assert (await c.post(B + f'/posts/{pid}/metoo', headers=h['bob'])).json()['me_too'] == 2
    assert (await c.post(B + f'/posts/{pid}/metoo', headers=h['bob'])).json() == {'me_too': 1, 'i_me_too': False}
    d = (await c.post(B + f'/posts/{pid}/comments', json={'body': 'Позвонил в Қарағанды Жарық, обещали к обеду'}, headers=h['carl'])).json()
    assert d['comments'] == 1 and d['thread'][0]['author']['name'] == 'Carl' and d['thread'][0]['mine'] is True
    feed = (await c.get(B + '/feed', headers=h['alice'])).json()['items']
    assert feed[0]['id'] == pid  # a fresh comment lifts the post
    assert (await c.delete(B + f'/posts/{pid}', headers=h['bob'])).status_code == 403

    # reports: three different neighbours hide a comment
    cid = d['thread'][0]['id']
    assert (await c.post(B + '/report', json={'target': 'comment', 'id': cid}, headers=h['carl'])).status_code == 403
    await c.put(B + '/me', json=addr(flat='90'), headers=h['eve'])
    eve_id = (await c.get(B + '/me', headers=h['eve'])).json()['member']['id']
    await c.post(B + f'/confirm/{eve_id}', headers=h['alice'])
    await c.post(B + f'/confirm/{eve_id}', headers=h['bob'])
    for u in ('alice', 'bob'):
        assert (await c.post(B + '/report', json={'target': 'comment', 'id': cid}, headers=h[u])).json()['hidden'] is False
    assert (await c.post(B + '/report', json={'target': 'comment', 'id': cid}, headers=h['eve'])).json()['hidden'] is True
    assert (await c.get(B + f'/posts/{pid}', headers=h['alice'])).json()['comments'] == 0
    ov = (await c.get(B + '/admin', headers=h['panel'])).json()
    assert ov['hidden_comments'][0]['id'] == cid and ov['stats']['neighbours'] == 4
    await c.post(B + '/admin/moderate', json={'target': 'comment', 'id': cid, 'keep': True}, headers=h['panel'])
    assert (await c.get(B + f'/posts/{pid}', headers=h['alice'])).json()['comments'] == 1

    # elder pins
    alice_id = (await c.get(B + '/me', headers=h['alice'])).json()['member']['id']
    assert (await c.post(B + f'/posts/{pid}/pin', headers=h['alice'])).status_code == 403
    await c.post(B + f'/admin/members/{alice_id}/role', json={'role': 'elder'}, headers=h['panel'])
    assert (await c.post(B + f'/posts/{pid}/pin', headers=h['alice'])).json() == {'pinned': True}

    # moving to another house → confirm again; leaving deletes everything
    r = await c.put(B + '/me', json=addr(house='139А'), headers=h['carl'])
    assert r.json()['member']['status'] == 'pending'
    assert (await c.delete(B + '/me', headers=h['alice'])).json() == {'ok': True}
    assert (await c.get(B + '/me', headers=h['alice'])).json()['member'] is None
    assert (await c.get(B + f'/posts/{pid}', headers=h['bob'])).status_code == 404
    stats = (await c.get(B + '/streets')).json()
    assert 'Жекибаева' in stats['streets'] and stats['stats']['neighbours'] == 2


async def test_rate_limit_on_posts(env, monkeypatch):
    c, h = env
    monkeypatch.setattr(svc, 'POSTS_PER_HOUR', 2)
    await c.put(B + '/me', json=addr(), headers=h['alice'])
    mid = (await c.get(B + '/me', headers=h['alice'])).json()['member']['id']
    await c.post(B + f'/admin/proof/{mid}', json={'approve': True}, headers=h['panel'])
    for _ in range(2):
        assert (await c.post(B + '/posts', json={'kind': 'notice', 'body': 'Собрание жильцов в субботу'}, headers=h['alice'])).status_code == 201
    r = await c.post(B + '/posts', json={'kind': 'notice', 'body': 'Ещё одно объявление'}, headers=h['alice'])
    assert r.status_code == 403 and 'Слишком много' in r.json()['detail']
