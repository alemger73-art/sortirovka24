"""«Sortirovka Official»: request → owner picks a category → WhatsApp with price and Kaspi link → paid → published."""
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
from routers import admin_auth, official_ads
from services import official_ads as svc

BASE = '/api/v1/official-ads'


@pytest.fixture
async def env(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add_all([User(id='alice', name='Alice', phone='+77001234567', role='user', status='active', is_active=True),
                    AdminCredentials(username='stage-admin', password_hash='x', is_active=True)])
        await db.flush()
        db.add(UserSession(user_id='alice', token_jti='alice-s', is_active=True,
                           expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(official_ads.router)
    app.dependency_overrides[get_db] = database
    sent, owner = [], []

    async def fake_wa(phone, body):
        sent.append((phone, body))
        return True

    async def fake_owner(db, req):
        owner.append(req)
        return True
    monkeypatch.setattr(svc, '_whatsapp', fake_wa)
    monkeypatch.setattr(svc, 'send_to_owner', fake_owner)
    monkeypatch.setattr(svc, '_cabinet', AsyncMock())
    svc._ready.clear()
    headers = {'alice': {'Authorization': 'Bearer ' + create_access_token({'sub': 'alice', 'role': 'user', 'jti': 'alice-s'})},
               'panel': {'Authorization': 'Bearer ' + admin_auth._create_admin_jwt('stage-admin')}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, maker, headers, sent, owner
    await engine.dispose()


async def test_config_shows_intro_and_three_prices(env):
    client, *_ = env
    cfg = (await client.get(BASE + '/config')).json()
    assert '30 000' in cfg['intro']
    assert [(c['title'], c['price']) for c in cfg['categories']] == [
        ('Бизнес', 5000), ('Недвижимость и услуги', 3000), ('Вакансии и частные объявления', 1500)]
    assert all('kaspi_link' not in c for c in cfg['categories'])


async def test_full_paid_flow(env):
    client, maker, headers, sent, owner = env
    body = {'body': 'Открылся новый магазин у остановки, скидки 20%', 'photos': ['https://res.cloudinary.com/x.jpg', 'evil'],
            'wish': 'business'}
    assert (await client.post(BASE + '/requests', json=body)).status_code == 401
    r = await client.post(BASE + '/requests', json=body, headers=headers['alice'])
    assert r.status_code == 201, r.text
    req = r.json()
    assert req['status'] == 'new' and req['photos'] == ['https://res.cloudinary.com/x.jpg'] and req['phone'] == '+77001234567'
    assert owner and owner[0]['id'] == req['id']

    async with maker() as db:
        # No Kaspi link yet → nothing is sent, the owner is told what to do.
        answer, _, markup = await svc.decide(db, req['id'], 'c', 'business')
        assert 'ссылку Kaspi' in answer and markup is None and not sent
    cfg = (await client.get(BASE + '/admin/settings', headers=headers['panel'])).json()
    cfg['categories'][0]['kaspi_link'] = 'https://pay.kaspi.kz/pay/test'
    assert (await client.put(BASE + '/admin/settings', json=cfg, headers=headers['alice'])).status_code == 403
    assert (await client.put(BASE + '/admin/settings', json=cfg, headers=headers['panel'])).status_code == 200

    async with maker() as db:
        answer, row, markup = await svc.decide(db, req['id'], 'c', 'business')
    assert row['status'] == 'priced' and row['price'] == 5000
    phone, text = sent[-1]
    assert phone == '+77001234567'
    assert 'категории «Бизнес»' in text and '5 000 тг' in text and 'https://pay.kaspi.kz/pay/test' in text
    mine = (await client.get(BASE + '/requests/mine', headers=headers['alice'])).json()['items']
    assert mine[0]['status'] == 'priced' and mine[0]['pay_link'] == 'https://pay.kaspi.kz/pay/test'

    async with maker() as db:
        assert (await svc.decide(db, req['id'], 'd'))[1]['status'] == 'priced'  # publish before payment: refused
        assert (await svc.decide(db, req['id'], 'p'))[1]['status'] == 'paid'
        assert (await svc.decide(db, req['id'], 'r'))[1]['status'] == 'paid'  # cannot cancel a paid request
        assert (await svc.decide(db, req['id'], 'd'))[1]['status'] == 'published'
    assert 'опубликовано' in sent[-1][1]
    mine = (await client.get(BASE + '/requests/mine', headers=headers['alice'])).json()['items']
    assert mine[0]['status'] == 'published' and mine[0]['pay_link'] is None


async def test_reject_and_bad_phone(env):
    client, maker, headers, sent, _ = env
    r = await client.post(BASE + '/requests', json={'body': 'Продам диван почти новый', 'phone': '123'}, headers=headers['alice'])
    assert r.status_code == 400
    r = await client.post(BASE + '/requests', json={'body': 'Продам диван почти новый', 'phone': '8 701 555 44 33'}, headers=headers['alice'])
    assert r.status_code == 201 and r.json()['phone'] == '+77015554433'
    async with maker() as db:
        answer, row, _ = await svc.decide(db, r.json()['id'], 'r')
    assert row['status'] == 'rejected' and sent[-1][0] == '+77015554433'


async def test_telegram_buttons_parse():
    cfg = svc._clean_settings({})
    kb = svc.keyboard(7, cfg)['inline_keyboard']
    datas = [b['callback_data'] for row in kb for b in row]
    assert datas == ['of:c:7:business', 'of:c:7:services', 'of:c:7:private', 'of:r:7']
    assert all(svc.CALLBACK_RE.match(d) for d in datas)
    assert len(svc.card_text({'id': 1, 'photos': [], 'body': 'x' * 5000, 'phone': '+7'}, cfg)) <= 4000
