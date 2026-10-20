import json
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.auth import create_access_token
from core.database import Base, get_db
from models.site_analytics import SiteError, SiteEvent
from routers import site_analytics as router_module
from services import site_analytics as sa

ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0'


@pytest.fixture
async def env(tmp_path, monkeypatch):
    import models, importlib, pkgutil
    for _, name, _ in pkgutil.iter_modules(models.__path__):
        importlib.import_module(f'models.{name}')
    engine = create_async_engine('sqlite+aiosqlite:///' + (tmp_path / 'sa.db').as_posix())
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(router_module.router)
    async def database():
        async with maker() as db:
            yield db
    app.dependency_overrides[get_db] = database
    alerts = []
    async def fake_alert(row):
        alerts.append(row.message)
    monkeypatch.setattr(sa, 'alert_new_error', fake_alert)
    from utils.rate_limit import _RATE_BUCKETS
    _RATE_BUCKETS.clear()
    admin = {'Authorization': 'Bearer ' + create_access_token({'sub': 'admin', 'role': 'admin', 'username': 'admin'})}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, maker, admin, alerts
    await engine.dispose()


async def send(client, visitor, events, ua=ANDROID, **extra):
    return await client.post('/api/v1/site-analytics/collect', headers={'User-Agent': ua},
                             json={'visitor': visitor, 'session': visitor + '-s1', 'events': events, **extra})


@pytest.mark.asyncio
async def test_visits_funnel_searches_and_privacy(env):
    client, maker, admin, _ = env
    r = await send(client, 'visitor-aaaa1', [
        {'kind': 'page_view', 'path': '/food?tab=menu&token=SECRET', 'referrer': 'https://l.instagram.com/x'},
        {'kind': 'food_view', 'path': '/food'},
        {'kind': 'search', 'props': {'area': 'меню', 'q': 'Шаурма', 'results': 0}},
        {'kind': 'dish_view', 'props': {'name': 'Пепперони'}},
        {'kind': 'add_to_cart', 'props': {'name': 'Пепперони', 'phone': '+7 701 123 45 67'}},
        {'kind': 'checkout_open'}, {'kind': 'checkout_step2'}, {'kind': 'checkout_step3'},
        {'kind': 'order_placed', 'props': {'total': 3700, 'payment': 'kaspi_qr', 'method': 'delivery'}},
        {'kind': 'BAD KIND'},
    ])
    assert r.status_code == 202 and r.json()['accepted'] == 9
    await send(client, 'visitor-bbbb2', [{'kind': 'page_view', 'path': '/news'}, {'kind': 'food_view', 'path': '/food'}], ua=IG, standalone=True)
    assert (await client.post('/api/v1/site-analytics/collect', json={'visitor': 'x', 'session': 'y', 'events': []})).json()['accepted'] == 0

    async with maker() as db:
        rows = (await db.scalars(select(SiteEvent))).all()
        assert all('SECRET' not in (e.path or '') for e in rows)
        assert all('701' not in (e.props or '') for e in rows)
        assert {e.browser for e in rows} == {'chrome', 'instagram'}

    assert (await client.get('/api/v1/site-analytics/summary')).status_code == 401
    s = (await client.get('/api/v1/site-analytics/summary?days=7', headers=admin)).json()
    assert s['visitors'] == 2 and s['new_visitors'] == 2 and s['pageviews'] == 2 and s['app_users'] == 1
    assert {x['name'] for x in s['sources']} == {'instagram.com', 'Напрямую / закладка'}
    assert [x['visitors'] for x in s['funnel']] == [2, 1, 1, 1, 1, 1]
    assert s['searches_without_results'] == [{'name': 'меню: шаурма', 'count': 1}]
    assert s['orders'] == {'count': 1, 'sum': 3700, 'payment': {'kaspi_qr': 1}, 'method': {'delivery': 1}}
    assert s['dishes_added'][0]['name'] == 'Пепперони'
    text = sa.report_text(s)
    assert 'Искали и не нашли: меню: шаурма' in text and 'Посетителей: <b>2</b>' in text


@pytest.mark.asyncio
async def test_errors_group_alert_once_and_return_after_fix(env):
    client, maker, admin, alerts = env
    body = {'message': 'TypeError: addresses.map is not a function', 'stack': 'at SavedAddressBar (index-AbC12345.js:10:20)',
            'path': '/food', 'release': 'abc', 'visitor': 'visitor-aaaa1'}
    for visitor in ('visitor-aaaa1', 'visitor-aaaa1', 'visitor-cccc3'):
        assert (await client.post('/api/v1/site-analytics/error', json={**body, 'visitor': visitor})).status_code == 202
    assert alerts == ['TypeError: addresses.map is not a function']
    items = (await client.get('/api/v1/site-analytics/errors', headers=admin)).json()['items']
    assert len(items) == 1 and items[0]['count'] == 3 and items[0]['visitors'] == 2
    eid = items[0]['id']
    assert (await client.patch(f'/api/v1/site-analytics/errors/{eid}', headers=admin, json={'status': 'fixed', 'note': 'исправлено'})).status_code == 200
    assert (await client.get('/api/v1/site-analytics/errors', headers=admin)).json()['items'] == []
    await client.post('/api/v1/site-analytics/error', json=body)
    again = (await client.get('/api/v1/site-analytics/errors', headers=admin)).json()['items']
    assert again[0]['status'] == 'new' and len(alerts) == 2  # came back after the fix → alert again
    # Same bug in a newer build (different hash in the file name) is the same error.
    await client.post('/api/v1/site-analytics/error', json={**body, 'stack': 'at SavedAddressBar (index-ZZZ99999.js:11:5)'})
    assert len((await client.get('/api/v1/site-analytics/errors', headers=admin)).json()['items']) == 1


@pytest.mark.asyncio
async def test_server_error_is_recorded(env):
    _, maker, _, alerts = env
    async with maker() as db:
        row, new = await sa.record_error(db, source='server', message='ZeroDivisionError: division by zero',
                                         stack='File "x.py", line 3', path='GET /api/v1/x/5')
    assert new and row.source == 'server'


@pytest.mark.asyncio
async def test_beacon_text_plain_is_accepted(env):
    client, maker, _, _ = env
    import json as _j
    body = _j.dumps({'visitor': 'visitor-dddd4', 'session': 'visitor-dddd4-s', 'events': [{'kind': 'food_view', 'path': '/food'}]})
    r = await client.post('/api/v1/site-analytics/collect', content=body, headers={'Content-Type': 'text/plain;charset=UTF-8', 'User-Agent': ANDROID})
    assert r.status_code == 202 and r.json()['accepted'] == 1
    assert (await client.post('/api/v1/site-analytics/collect', content='nonsense', headers={'Content-Type': 'text/plain'})).status_code == 422
