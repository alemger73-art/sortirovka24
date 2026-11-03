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


async def test_shops_shipped_with_code_are_seeded_once(env):
    client, maker, _ = env
    from services.partner_shop_seed import seed_partner_shops
    async with maker() as db:
        await seed_partner_shops(db)
    shop = (await client.get('/api/v1/shops/magazin-cvetok')).json()
    assert len(shop['products']) == 73 and shop['delivery'][0] == {'name': 'Сортировка', 'price': 'бесплатно'}
    async with maker() as db:
        await db.execute(text("UPDATE partner_shop_products SET price = 1 WHERE shop = 'magazin-cvetok' AND sku = '10001'"))
        await db.commit()
        await seed_partner_shops(db)  # the next start keeps the partner's later changes
    assert {p['sku']: p['price'] for p in (await client.get('/api/v1/shops/magazin-cvetok')).json()['products']}['10001'] == 1


async def cabinet_token(client, maker, fake, chat_id=555):
    """The partner presses «🛠 Кабинет магазина» in the bot and opens the one-time link."""
    await link(maker, fake, chat_id)
    async with maker() as db:
        assert await svc.handle_callback(db, None, 'sh:k', chat_id, {}, {}) == 'Ссылка на кабинет — ниже'
    url = fake.calls[-1][1]['reply_markup']['inline_keyboard'][0][0]['url']
    assert url.startswith('https://www.sortirovka24.kz/shop/cvety/cabinet#code=')
    r = await client.post('/api/v1/shops/cvety/cabinet/login', json={'code': url.split('code=')[1]})
    assert r.status_code == 200, r.text
    assert (await client.post('/api/v1/shops/cvety/cabinet/login', json={'code': url.split('code=')[1]})).status_code == 401  # one use
    return {'Authorization': 'Shop ' + r.json()['token']}


async def test_cabinet_sign_in_only_through_linked_telegram(env):
    client, maker, fake = env
    async with maker() as db:  # a stranger writes «Кабинет»: not ours, the other bot features handle it
        assert not await svc.handle_message(db, None, {'chat': {'id': 1, 'type': 'private'}, 'from': {}, 'text': 'Кабинет'})
    assert (await client.get('/api/v1/shops/cvety/cabinet')).status_code == 401
    assert (await client.get('/api/v1/shops/cvety/cabinet', headers={'Authorization': 'Shop forged.token'})).status_code == 401
    auth = await cabinet_token(client, maker, fake)
    data = (await client.get('/api/v1/shops/cvety/cabinet', headers=auth)).json()
    assert data['name'] == 'Цветы' and len(data['products']) == 2 and data['telegram'][0]['name'] == 'Айгуль'
    async with maker() as db:  # the chat is unlinked: its token stops working at once
        await db.execute(text('DELETE FROM partner_shop_telegram'))
        await db.commit()
    assert (await client.get('/api/v1/shops/cvety/cabinet', headers=auth)).status_code == 401


async def test_cabinet_prices_stock_and_orders(env):
    client, maker, fake = env
    auth = await cabinet_token(client, maker, fake)
    assert (await client.get('/api/v1/shops/other-shop/cabinet', headers=auth)).status_code == 401  # this shop only
    r = await client.patch('/api/v1/shops/cvety/cabinet/products/40001', headers=auth, json={'price': 2100, 'description': 'Колючий'})
    assert r.json()['price'] == 2100
    await client.patch('/api/v1/shops/cvety/cabinet/products/10001', headers=auth, json={'active': False})
    shop = (await client.get('/api/v1/shops/cvety')).json()
    assert [(p['sku'], p['price'], p['description']) for p in shop['products']] == [('40001', 2100, 'Колючий')]
    assert (await client.patch('/api/v1/shops/cvety/cabinet/products/40001', headers=auth, json={'price': 0})).status_code == 422

    oid = (await client.post('/api/v1/shops/cvety/orders', json=order(items=[{'sku': '40001', 'qty': 2}]))).json()['id']
    data = (await client.get('/api/v1/shops/cvety/cabinet', headers=auth)).json()
    assert data['stats'] == {'new': 1, 'month_orders': 1, 'month_total': 4200}
    assert data['orders'][0]['phone'] == '+77070000000' and data['orders'][0]['status'] == 'new'
    r = await client.post(f'/api/v1/shops/cvety/cabinet/orders/{oid}/status', headers=auth, json={'status': 'accepted'})
    assert r.json()['accepted_by'] == 'Айгуль'
    r = await client.post(f'/api/v1/shops/cvety/cabinet/orders/{oid}/status', headers=auth, json={'status': 'done'})
    assert r.json()['status'] == 'done'
    assert (await client.post('/api/v1/shops/cvety/cabinet/orders/999/status', headers=auth, json={'status': 'done'})).status_code == 404
    invite = (await client.post('/api/v1/shops/cvety/cabinet/telegram-link', headers=auth)).json()
    assert invite['url'].startswith('https://t.me/shop_bot?start=shop_') and invite['linked'] == 1


async def test_public_list_summarises_open_shops(env):
    client, _, _ = env
    assert (await client.get('/api/v1/shops')).json()['items'] == [{
        'slug': 'cvety', 'name': 'Цветы', 'headline': '', 'logo': '', 'accent': '#2f5a34', 'free_zones': ['Сортировка'],
        'products': 2, 'from_price': 1800, 'photos': ['/p/10001.webp']}]


async def test_shop_link_preview(env):
    _, maker, _ = env
    from unittest.mock import patch
    from core.database import db_manager
    from services.seo_renderer import build_seo_page
    with patch.object(db_manager, 'async_session_maker', maker):
        page = await build_seo_page('/shop/cvety')
        assert page.status_code == 200 and page.title.startswith('Цветы — заказать') and page.image.endswith('/p/10001.webp')
        assert 'Орхидея — 4900 ₸' in page.body
        assert (await build_seo_page('/shop/nope')).status_code == 404
        cabinet = await build_seo_page('/shop/cvety/cabinet')
        assert cabinet.status_code == 200 and cabinet.robots == 'noindex, nofollow'


async def test_resident_order_reaches_personal_cabinet(env):
    _, maker, _ = env
    async with maker() as db:
        mine = await svc.place_order(db, 'cvety', order(), user_id='user-7')
        await svc.place_order(db, 'cvety', order(phone='8 701 111 11 11'))  # a guest order stays out of anyone's history
        history = await svc.orders_of_user(db, 'user-7')
    assert [h['order_number'] for h in history] == [mine['id']]
    assert history[0]['store_label'] == 'Цветы' and history[0]['store_path'] == '/shop/cvety' and history[0]['amount'] == 11600
    assert json.loads(history[0]['order_items'])[0] == {'name': 'Орхидея', 'quantity': 2, 'price': 4900}
