"""Requests from a partner page: saved and sent to every linked Telegram chat, «✅ Связался» marks one once,
the form only accepts the company's own options, a phone cannot flood the company, and a stranger's chat
can neither link without a code nor take a request."""
import json
import os
from pathlib import Path

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.module_settings import ModuleSettings  # noqa: F401
from models.partner_profiles import PartnerShowcase  # noqa: F401
from models.food_shifts import FoodShift  # noqa: F401
from models.logistics import LogisticsTask, CourierProfile  # noqa: F401
from routers.partner_profiles import router
from services import showcase_leads as svc
from services.partner_profiles_seed import seed_partner_profiles

pytestmark = pytest.mark.skipif(not os.getenv('NB_TEST_PG'), reason='requests use Postgres features')
SLUG = 'lider-avtoschool'
PATH = f'/api/v1/partners/{SLUG}/leads'


class FakeTelegram:
    def __init__(self):
        self.calls = []

    async def __call__(self, client, method, payload, timeout=20):
        self.calls.append((method, payload))
        return {'ok': True, 'result': {'username': 'sort_bot'}}

    def sent(self, method='sendMessage'):
        return [p for m, p in self.calls if m == method]


@pytest.fixture
async def env(monkeypatch):
    monkeypatch.setattr('core.auth._get_jwt_secret_key', lambda: 'isolated-leads-test-secret-not-production')
    engine = create_async_engine(os.environ['NB_TEST_PG'])
    async with engine.begin() as conn:
        await conn.execute(text('DROP SCHEMA public CASCADE'))
        await conn.execute(text('CREATE SCHEMA public'))
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    svc._ready.clear()
    fake = FakeTelegram()
    import services.news_agent as news
    from services import courier_telegram
    monkeypatch.setattr(news, 'tg', fake)
    monkeypatch.setenv('NEWS_TELEGRAM_BOT_TOKEN', 'test-token')
    courier_telegram._bot_name.clear()
    async with maker() as db:
        await seed_partner_profiles(db)

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = database
    admin = {'Authorization': 'Bearer ' + create_access_token({'role': 'admin', 'username': 'test-admin'})}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, maker, fake, admin
    await engine.dispose()


async def link_chat(maker, client, admin, chat_id):
    url = (await client.get(f'/api/v1/partners/admin/{SLUG}/telegram-link', headers=admin)).json()['url']
    code = url.split('start=')[1]
    message = {'chat': {'id': chat_id, 'type': 'private'}, 'from': {'first_name': 'Айгерим'}, 'text': f'/start {code}'}
    async with maker() as db:
        assert await svc.handle_message(db, None, message)


async def test_seeded_page_shows_prices_and_the_form(env):
    client, *_ = env
    page = (await client.get(f'/api/v1/partners/{SLUG}')).json()
    assert page['lead']['enabled'] and page['lead']['options']
    assert [p['title'] for p in page['prices']][:1] == ['Теория в группе']
    seed = json.loads((Path(__file__).parents[1] / 'services/partner_profiles_seed.json').read_text(encoding='utf-8'))
    assert {p['slug'] for p in seed} >= {'krovlya-365', SLUG}


async def test_request_reaches_every_linked_chat_and_is_taken_once(env):
    client, maker, fake, admin = env
    await link_chat(maker, client, admin, 501)
    await link_chat(maker, client, admin, 502)
    response = await client.post(PATH, json={'name': 'Данияр', 'phone': '8 701 111 22 33',
                                             'choice': 'Теория в группе', 'comment': 'Можно вечером?'})
    assert response.status_code == 201, response.text
    assert response.json()['notified'] == 2
    cards = [p for p in fake.sent() if 'Новая заявка' in p['text']]
    assert {c['chat_id'] for c in cards} == {'501', '502'}
    assert '+77011112233' in cards[0]['text'] and 'Теория в группе' in cards[0]['text']
    lead_id = response.json()['id']
    async with maker() as db:
        answer = await svc.handle_callback(db, None, f'ld:a:{lead_id}', '501', {'first_name': 'Айгерим'}, {'message_id': 1})
        assert answer == 'Отмечено: связались'
        await svc.handle_callback(db, None, f'ld:a:{lead_id}', '502', {'first_name': 'Бауыржан'}, {'message_id': 2})
        row = (await db.execute(text('SELECT status, accepted_by FROM showcase_leads WHERE id = :i'), {'i': lead_id})).first()
    assert tuple(row) == ('accepted', 'Айгерим')
    leads = (await client.get(f'/api/v1/partners/admin/{SLUG}/leads', headers=admin)).json()['items']
    assert leads[0]['phone'] == '+77011112233'


async def test_form_rejects_bad_input_and_flooding(env):
    client, *_ = env
    for body in ({'name': 'Д', 'phone': '87011112233'}, {'name': 'Данияр', 'phone': '123'},
                 {'name': 'Данияр', 'phone': '87011112233', 'choice': 'Права на самолёт'}):
        assert (await client.post(PATH, json=body)).status_code == 422
    body = {'name': 'Данияр', 'phone': '87011112233'}
    assert [(await client.post(PATH, json=body)).status_code for _ in range(4)] == [201, 201, 201, 429]


async def test_hidden_page_or_closed_form_takes_no_requests(env):
    client, maker, _, admin = env
    page = (await client.get(f'/api/v1/partners/{SLUG}')).json()
    closed = {**page, 'lead': {**page['lead'], 'enabled': False}}
    assert (await client.put(f'/api/v1/partners/admin/{SLUG}', json=closed, headers=admin)).status_code == 200
    assert (await client.post(PATH, json={'name': 'Данияр', 'phone': '87011112233'})).status_code == 404
    hidden = {**page, 'published': False}
    assert (await client.put(f'/api/v1/partners/admin/{SLUG}', json=hidden, headers=admin)).status_code == 200
    assert (await client.post(PATH, json={'name': 'Данияр', 'phone': '87011112233'})).status_code == 404


async def test_strangers_cannot_link_or_take_requests(env):
    client, maker, fake, admin = env
    assert (await client.get(f'/api/v1/partners/admin/{SLUG}/telegram-link')).status_code == 401
    async with maker() as db:
        message = {'chat': {'id': 900, 'type': 'private'}, 'from': {}, 'text': '/start lead_not-a-code'}
        assert await svc.handle_message(db, None, message)
    assert 'устарела' in fake.sent()[-1]['text']
    lead_id = (await client.post(PATH, json={'name': 'Данияр', 'phone': '87011112233'})).json()['id']
    async with maker() as db:
        answer = await svc.handle_callback(db, None, f'ld:a:{lead_id}', '900', {'first_name': 'Чужой'}, {'message_id': 3})
    assert answer == 'Этот чат не подключён к заявкам'
