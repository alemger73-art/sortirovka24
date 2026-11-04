"""Paid «Поднять»: a Kaspi invoice through ApiPay; the ad goes up only after ApiPay's signed webhook says «paid».
ApiPay itself is faked: no request leaves the test."""
import hashlib
import hmac
import json
import os
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import get_db
from models.announcements import Announcements
from routers import payments_apipay
from services import apipay, paid_boost

pytestmark = pytest.mark.skipif(not os.getenv('NB_TEST_PG'), reason='uses Postgres')
SECRET = 'whsec-test'
OWNER = SimpleNamespace(id='u1', phone='+77001112233')


@pytest.fixture
async def env(monkeypatch):
    engine = create_async_engine(os.environ['NB_TEST_PG'])
    async with engine.begin() as conn:
        await conn.execute(text('DROP TABLE IF EXISTS ad_boost_payments'))
        await conn.run_sync(lambda c: Announcements.__table__.drop(c, checkfirst=True))
        await conn.run_sync(lambda c: Announcements.__table__.create(c))
    paid_boost._ready = False
    monkeypatch.setenv('APIPAY_API_KEY', 'key')
    monkeypatch.setenv('APIPAY_WEBHOOK_SECRET', SECRET)
    invoices, notices = [], []

    async def fake_invoice(**kw):
        invoices.append(kw)
        return {'id': 900 + len(invoices), 'status': 'processing'}

    async def fake_notify(db, **kw):
        notices.append(kw)
    monkeypatch.setattr(apipay, 'create_invoice', fake_invoice)
    import services.user_notifications as un
    monkeypatch.setattr(un, 'notify_user_by_id', fake_notify)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    async with maker() as db:
        db.add(Announcements(id=7, title='Диван', status='approved', active=True, user_id='u1'))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(payments_apipay.router)
    app.dependency_overrides[get_db] = database
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://t') as client:
        yield client, maker, invoices, notices
    await engine.dispose()


def hook(order_id, status, amount='500.00', **extra):
    body = json.dumps({'event': 'invoice.status_changed', 'is_sandbox': False,
                       'invoice': {'id': 901, 'external_order_id': order_id, 'amount': amount, 'status': status, **extra}}).encode()
    return body, {'X-Webhook-Signature': 'sha256=' + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest(),
                  'Content-Type': 'application/json'}


async def test_price_says_whether_lifting_is_paid(env, monkeypatch):
    client, *_ = env
    assert (await client.get('/api/v1/payments/boost-price')).json() == {'paid': True, 'price': 500, 'days': 7}
    monkeypatch.delenv('APIPAY_API_KEY')
    assert (await client.get('/api/v1/payments/boost-price')).json()['paid'] is False  # free until keys are set


async def test_invoice_then_paid_webhook_lifts_the_ad_once(env):
    client, maker, invoices, notices = env
    async with maker() as db:
        sent = await paid_boost.request(db, 'announcement', 7, OWNER)
        again = await paid_boost.request(db, 'announcement', 7, OWNER)  # second tap: no second invoice
    assert sent == {'status': 'sent', 'amount': 500, 'phone': '+77001112233', 'again': False} and again['again'] is True
    assert len(invoices) == 1 and invoices[0]['order_id'] == 'boost-1' and invoices[0]['amount'] == 500
    assert len(invoices[0]['description']) <= 60
    async with maker() as db:
        assert (await db.get(Announcements, 7)).promotion_tier is None  # nothing before payment

    body, headers = hook('boost-1', 'paid')
    assert (await client.post('/api/v1/payments/apipay/webhook', content=body, headers=headers)).json()['result'] == 'lifted'
    assert (await client.post('/api/v1/payments/apipay/webhook', content=body, headers=headers)).json()['result'] == 'already paid'
    async with maker() as db:
        row = await db.get(Announcements, 7)
        assert row.promotion_tier == 'boost' and row.promoted_until
    assert [n['title'] for n in notices] == ['Оплата получена — объявление поднято']


async def test_forged_short_and_failed_payments_lift_nothing(env):
    client, maker, _, notices = env
    async with maker() as db:
        await paid_boost.request(db, 'announcement', 7, OWNER)
    body, headers = hook('boost-1', 'paid')
    assert (await client.post('/api/v1/payments/apipay/webhook', content=body,
                              headers={**headers, 'X-Webhook-Signature': 'sha256=forged'})).status_code == 401
    assert (await client.post('/api/v1/payments/apipay/webhook', content=body, headers={'Content-Type': 'application/json'})).status_code == 401
    body, headers = hook('boost-1', 'paid', amount='5.00')
    assert (await client.post('/api/v1/payments/apipay/webhook', content=body, headers=headers)).json()['result'] == 'amount mismatch'
    body, headers = hook('boost-1', 'error', error_message='Этот номер телефона не зарегистрирован в Kaspi.')
    assert (await client.post('/api/v1/payments/apipay/webhook', content=body, headers=headers)).json()['result'] == 'error'
    body, headers = hook('food-55', 'paid')
    assert (await client.post('/api/v1/payments/apipay/webhook', content=body, headers=headers)).json()['result'] == 'not ours'
    async with maker() as db:
        assert (await db.get(Announcements, 7)).promotion_tier is None
        sent = await paid_boost.request(db, 'announcement', 7, OWNER)  # a failed invoice can be asked for again
    assert sent['again'] is False
    assert notices[0]['title'] == 'Счёт Kaspi не оплачен' and 'не зарегистрирован в Kaspi' in notices[0]['body']


async def test_sandbox_payments_are_ignored_on_the_live_server(env):
    client, maker, *_ = env
    async with maker() as db:
        await paid_boost.request(db, 'announcement', 7, OWNER)
    payload = json.loads(hook('boost-1', 'paid')[0])
    body = json.dumps({**payload, 'is_sandbox': True}).encode()
    signature = 'sha256=' + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()
    r = await client.post('/api/v1/payments/apipay/webhook', content=body, headers={'X-Webhook-Signature': signature})
    assert r.json()['result'] == 'sandbox ignored'
