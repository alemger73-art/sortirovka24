"""Paid services: admin list, dates, Telegram reminders 7/3/1/0 days and overdue, «Оплачено» moves the date once."""
from datetime import date, datetime, timedelta, timezone

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
from models.module_settings import ModuleSettings  # noqa: F401
from routers import admin_auth, paid_services
from services import paid_services as svc

B = '/api/v1/paid-services'


class FakeTelegram:
    def __init__(self):
        self.calls = []

    async def __call__(self, client, method, payload, timeout=20):
        self.calls.append((method, payload))
        return {'ok': True, 'result': {}}

    def texts(self):
        return [p['text'] for m, p in self.calls if m == 'sendMessage']


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
        db.add_all([User(id='mod', name='Mod', phone='+77000000001', role='moderator', status='active', is_active=True),
                    AdminCredentials(username='owner', password_hash='x', is_active=True)])
        await db.flush()
        db.add(UserSession(user_id='mod', token_jti='mod-s', is_active=True, expires_at=datetime.now(timezone.utc) + timedelta(hours=1)))
        await db.commit()

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(paid_services.router)
    app.dependency_overrides[get_db] = database
    svc._ready.clear()
    fake = FakeTelegram()
    import services.news_agent as news
    monkeypatch.setattr(news, 'tg', fake)
    monkeypatch.setattr(svc, 'cert_days', lambda host: _days(60))
    monkeypatch.setenv('NEWS_TELEGRAM_BOT_TOKEN', 'test-token')
    monkeypatch.setenv('NEWS_TELEGRAM_CHAT_ID', '111')
    h = {'owner': {'Authorization': 'Bearer ' + admin_auth._create_admin_jwt('owner')},
         'mod': {'Authorization': 'Bearer ' + create_access_token({'sub': 'mod', 'role': 'moderator', 'jti': 'mod-s'})}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        yield client, h, maker, fake
    await engine.dispose()


async def _days(n):
    return n


def test_dates_and_money():
    assert svc.add_period(date(2026, 1, 31), 'month') == date(2026, 2, 28)
    assert svc.add_period(date(2026, 11, 15), 'quarter') == date(2027, 2, 15)
    assert svc.add_period(date(2028, 2, 29), 'year') == date(2029, 2, 28)
    # paid late, several periods behind: the next date is the first one in the future
    assert svc.next_due(date(2026, 7, 5), 'month', date(2026, 10, 31)) == date(2026, 11, 5)
    assert svc.next_due(date(2026, 11, 5), 'month', date(2026, 10, 31)) == date(2026, 12, 5)
    assert svc.money(9600, 'KZT') == '9 600 ₸' and svc.money(100, 'USD') == '$100' and svc.money(0, 'USD') == ''
    assert svc.when_text(-2) == '🔴 Просрочено на 2 дня' and svc.when_text(5).endswith('5 дней')


async def test_admin_only_and_seed(env):
    client, h, _, _ = env
    assert (await client.get(B)).status_code == 403
    assert (await client.get(B, headers=h['mod'])).status_code == 403  # money settings: not for moderators
    data = (await client.get(B, headers=h['owner'])).json()
    names = [it['name'] for it in data['items']]
    assert any('Hoster.kz' in n for n in names) and all(not it['due_date'] for it in data['items'])
    assert '9 600 ₸' in [it['price'] for it in data['items']]
    bad = await client.post(B, headers=h['owner'], json={'name': 'X', 'pay_url': 'http://evil'})
    assert bad.status_code == 400
    bad = await client.post(B, headers=h['owner'], json={'name': 'X', 'due_date': '31.10.2026'})
    assert bad.status_code == 400


async def test_reminders_and_paid_button(env):
    client, h, maker, fake = env
    now = date(2026, 10, 31)
    items = (await client.get(B, headers=h['owner'])).json()['items']
    for it in items:  # clear the seed, keep the test readable
        await client.delete(f"{B}/{it['id']}", headers=h['owner'])
    plan = {'In 7': 7, 'In 3': 3, 'Tomorrow': 1, 'Today': 0, 'Late': -2, 'In 5': 5, 'Long ago': -30}
    for name, d in plan.items():
        r = await client.post(B, headers=h['owner'], json={'name': name, 'amount': 3100, 'currency': 'KZT', 'period': 'month',
                                                           'due_date': (now + timedelta(days=d)).isoformat(),
                                                           'pay_url': 'https://hoster.kz/pay'})
        assert r.status_code == 200
    await client.post(B, headers=h['owner'], json={'name': 'Off', 'due_date': now.isoformat(), 'active': False})
    async with maker() as db:
        sent = await svc.daily_check(db, None, now)
    texts = fake.texts()
    assert sent == 5 and len(texts) == 5
    for name in ('In 7', 'In 3', 'Tomorrow', 'Today', 'Late'):
        assert any(f'<b>{name}</b>' in t for t in texts), name
    assert not any(x in t for t in texts for x in ('In 5', 'Long ago', 'Off'))
    late = next(p for m, p in fake.calls if 'Late' in p.get('text', ''))
    assert late['chat_id'] == '111'  # no payments group yet → the owner's private chat
    paid_btn, pay_btn = late['reply_markup']['inline_keyboard'][0][1], late['reply_markup']['inline_keyboard'][0][0]
    assert pay_btn['url'] == 'https://hoster.kz/pay' and paid_btn['callback_data'].startswith('ps:p:')

    # «Оплачено» from a stranger in another chat is refused; from the owner it moves the date one month on, once
    async with maker() as db:
        refused = await svc.handle_callback(db, None, paid_btn['callback_data'], '999', {'id': 5}, {'message_id': 1})
        assert refused == 'Нет доступа'
        answer = await svc.handle_callback(db, None, paid_btn['callback_data'], '111', {'id': 111, 'first_name': 'Алем'}, {'message_id': 1})
        assert 'Следующая оплата 29 ноября' in answer
        again = await svc.handle_callback(db, None, paid_btn['callback_data'], '111', {'id': 111}, {'message_id': 1})
        assert again == 'Уже отмечено'
    data = (await client.get(B, headers=h['owner'])).json()
    assert next(it for it in data['items'] if it['name'] == 'Late')['due_date'] == '2026-11-29'
    assert data['log'][0]['name'] == 'Late' and data['log'][0]['paid_by'] == 'Алем'


async def test_payments_group(env):
    client, h, maker, fake = env
    member = {'chat': {'id': -100500, 'type': 'supergroup', 'title': 'Оплаты сервисов'}, 'from': {'id': 111},
              'new_chat_member': {'status': 'member'}}
    other = {**member, 'chat': {'id': -100600, 'type': 'supergroup', 'title': 'Работа'}}
    stranger = {**member, 'from': {'id': 42}}
    async with maker() as db:
        assert not await svc.handle_member(db, None, other)       # an ordinary group stays the news workspace
        assert not await svc.handle_member(db, None, stranger)    # only the owner binds it
        assert await svc.handle_member(db, None, member)
        assert await svc.target(db) == '-100500'
        assert any('Готово: напоминания' in t for t in fake.texts())
        # /payments in the group lists the services; the group becoming a supergroup keeps the binding
        fake.calls.clear()
        assert await svc.handle_message(db, None, {'chat': {'id': -100500, 'type': 'supergroup'}, 'from': {'id': 7}, 'text': '/payments@s24bot'})
        assert 'Платные сервисы' in fake.texts()[0] and 'не указана дата' in fake.texts()[0]
        await svc.handle_message(db, None, {'chat': {'id': -100500, 'type': 'group'}, 'migrate_to_chat_id': -100777})
        assert await svc.target(db) == '-100777'
        # a group member presses «Оплачено» there
        sid = (await svc.list_services(db))['items'][0]['id']
        answer = await svc.handle_callback(db, None, f'ps:p:{sid}:', '-100777', {'id': 9, 'username': 'acc'}, {'message_id': 3})
        assert 'оплачено' in answer
        # the bot is removed from the group → reminders go back to the owner
        assert await svc.handle_member(db, None, {**member, 'chat': {**member['chat'], 'id': -100777}, 'new_chat_member': {'status': 'left'}})
        assert await svc.target(db) == '111'
    r = await client.post(f'{B}/test', headers=h['owner'])
    assert r.status_code == 200
