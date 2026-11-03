"""Partner shops: the catalog shows only active items in the partner's category order, an order is priced from
the database (never from the browser), reaches every linked Telegram chat, «✅ Принял» marks it once,
and a stranger's chat can neither link without a code nor accept an order."""
import json
import os

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from core.database import Base, get_db
from models.module_settings import ModuleSettings  # noqa: F401
from models.food_shifts import FoodShift  # noqa: F401
from models.logistics import LogisticsTask, CourierProfile  # noqa: F401
from routers import partner_shop as router_module
from services import partner_shop as svc

pytestmark = pytest.mark.skipif(not os.getenv('NB_TEST_PG'), reason='partner shops use Postgres features')
SETTINGS = {
    'name': 'Цветы', 'accent': '#2f5a34', 'hours': '10:00–19:00', 'categories': ['Цветущие', 'Кактусы'],
    'delivery': [{'name': 'Сортировка', 'price': 'бесплатно'}, {'name': 'Город', 'price': 'inDrive за счёт покупателя'}],
}
PRODUCTS = [
    {'sku': '40001', 'category': 'Кактусы', 'name': 'Кактус', 'kind': None, 'height_cm': 7, 'pot_cm': 5, 'price': 1800, 'image': None},
    {'sku': '10001', 'category': 'Цветущие', 'name': 'Орхидея', 'kind': None, 'height_cm': 37, 'pot_cm': 8, 'price': 4900, 'image': '/p/10001.webp'},
]


class FakeTelegram:
    def __init__(self):
        self.calls = []

    async def __call__(self, client, method, payload, timeout=20):
        self.calls.append((method, payload))
        return {'ok': True, 'result': {'username': 'shop_bot'}}


@pytest.fixture
async def env(monkeypatch):
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
        await svc.save_settings(db, 'cvety', True, SETTINGS)
        await svc.replace_products(db, 'cvety', PRODUCTS)

    async def database():
        async with maker() as db:
            yield db
    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[get_db] = database
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://t') as client:
        yield client, maker, fake
    await engine.dispose()


async def link(maker, fake, chat_id=555):
    async with maker() as db:
        url = (await svc.link_url(db, 'cvety'))['url']
        code = url.split('start=')[1]
        assert await svc.handle_message(db, None, {'chat': {'id': chat_id, 'type': 'private'}, 'from': {'first_name': 'Айгуль'},
                                                   'text': f'/start {code}'})
    assert 'Готово' in fake.calls[-1][1]['text']


def order(**over):
    return {'name': 'Айгерим', 'phone': '8 707 000 00 00', 'address': 'Ерубаева 12', 'zone': 'Сортировка',
            'wanted': 'завтра', 'comment': 'на подарок', 'items': [{'sku': '10001', 'qty': 2}, {'sku': '40001', 'qty': 1}], **over}


async def test_storefront_in_partner_order(env):
    client, _, _ = env
    shop = (await client.get('/api/v1/shops/cvety')).json()
    assert shop['categories'] == ['Цветущие', 'Кактусы']
    assert [p['sku'] for p in shop['products']] == ['40001', '10001']
    assert (await client.get('/api/v1/shops')).json()['items'] == ['cvety']
    assert (await client.get('/api/v1/shops/nope')).status_code == 404


async def test_order_priced_by_server_and_sent_to_partner(env):
    client, maker, fake = env
    await link(maker, fake)
    await link(maker, fake, chat_id=777)  # two people at the shop receive orders
    r = await client.post('/api/v1/shops/cvety/orders', json=order(items=[{'sku': '10001', 'qty': 2, 'price': 1}, {'sku': '40001', 'qty': 1}]))
    assert r.status_code == 201, r.text
    assert r.json()['total'] == 2 * 4900 + 1800 and r.json()['notified'] == 2
    cards = [p for m, p in fake.calls if m == 'sendMessage' and 'Новый заказ' in p['text']]
    assert {c['chat_id'] for c in cards} == {'555', '777'}
    text_ = cards[0]['text']
    assert 'Орхидея × 2 — 9 800 ₸' in text_ and 'Итого: 11 600 ₸' in text_ and '+77070000000' in text_
    assert 'Сортировка' in text_ and 'бесплатно' in text_ and 'на подарок' in text_


async def test_order_validation(env):
    client, _, _ = env
    bad = [order(phone='123'), order(zone='Луна'), order(items=[]), order(items=[{'sku': '10001', 'qty': 0}]),
           order(items=[{'sku': '99999', 'qty': 1}]), order(name=' ')]
    codes = [(await client.post('/api/v1/shops/cvety/orders', json=b)).status_code for b in bad]
    assert codes == [422, 422, 422, 422, 409, 422]


async def test_hidden_item_cannot_be_ordered(env):
    client, maker, _ = env
    async with maker() as db:
        await svc.replace_products(db, 'cvety', PRODUCTS[:1])  # the orchid sold out
    assert [p['sku'] for p in (await client.get('/api/v1/shops/cvety')).json()['products']] == ['40001']
    assert (await client.post('/api/v1/shops/cvety/orders', json=order())).status_code == 409


async def test_accept_button(env):
    client, maker, fake = env
    await link(maker, fake)
    oid = (await client.post('/api/v1/shops/cvety/orders', json=order())).json()['id']
    async with maker() as db:
        assert await svc.handle_callback(db, None, f'sh:a:{oid}', 999, {'first_name': 'Чужой'}, {'message_id': 1}) == 'Этот чат не подключён к магазину'
        assert await svc.handle_callback(db, None, f'sh:a:{oid}', 555, {'first_name': 'Айгуль'}, {'message_id': 1}) == 'Заказ принят'
        await svc.handle_callback(db, None, f'sh:a:{oid}', 555, {'first_name': 'Другая'}, {'message_id': 1})
        row = (await db.execute(text('SELECT status, accepted_by FROM partner_shop_orders WHERE id = :i'), {'i': oid})).first()
    assert tuple(row) == ('accepted', 'Айгуль')  # the first press wins
    assert '✅ Принял: Айгуль' in [p for m, p in fake.calls if m == 'editMessageText'][-1]['text']


async def test_stale_link_and_rate_limit(env):
    client, maker, fake = env
    async with maker() as db:
        assert await svc.handle_message(db, None, {'chat': {'id': 1, 'type': 'private'}, 'from': {}, 'text': '/start shop_wrong'})
        assert 'устарела' in fake.calls[-1][1]['text']
        assert not await svc.handle_message(db, None, {'chat': {'id': 1, 'type': 'group'}, 'from': {}, 'text': '/start shop_x'})
    for _ in range(svc.ORDERS_PER_PHONE_HOUR):
        assert (await client.post('/api/v1/shops/cvety/orders', json=order())).status_code == 201
    assert (await client.post('/api/v1/shops/cvety/orders', json=order())).status_code == 429
    async with maker() as db:
        stored = json.loads((await db.execute(text('SELECT items FROM partner_shop_orders LIMIT 1'))).scalar())
    assert stored[0] == {'sku': '10001', 'name': 'Орхидея', 'price': 4900, 'qty': 2}
