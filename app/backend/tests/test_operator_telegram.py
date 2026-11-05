"""DÄM ALEM operator in Telegram: a one-time link ties a private chat; a new order arrives as a full card with the
customer's contacts; later order events arrive as lines only after their change is committed."""
import asyncio

import pytest

from models.food_orders import Food_orders
from services import operator_telegram as ot
from tests.test_courier_telegram import FakeTelegram
from tests.test_dam_order_workflow import BASE, env  # noqa: F401  (the shared DAM workflow fixture)


@pytest.fixture
async def tg(env, monkeypatch):  # noqa: F811
    client, maker, headers, _ = env
    fake = FakeTelegram()
    import services.news_agent as news
    from core.database import db_manager
    from services import courier_telegram
    monkeypatch.setattr(news, 'tg', fake)
    monkeypatch.setenv('NEWS_TELEGRAM_BOT_TOKEN', 'test-token')
    monkeypatch.setattr(db_manager, 'async_session_maker', maker)
    # the shared fixture switches every outside service off; only this bot is let through (faked above)
    monkeypatch.setattr(ot, 'enabled', lambda: bool(news.bot_token()))
    ot._ready.clear(); courier_telegram._bot_name.clear()
    yield client, maker, headers, fake


async def drain():
    while ot._background:
        await asyncio.gather(*list(ot._background))


def sent(fake):
    return [p['text'] for m, p in fake.calls if m == 'sendMessage' and str(p['chat_id']) == '777']


async def link(maker, fake):
    async with maker() as db:
        links = await ot.new_links(db, 2)
        assert links['available'] and len(links['links']) == 2 and links['linked'] == 0
        code = links['links'][0].split('start=')[1]
        assert links['links'][0].startswith('https://t.me/dam_test_bot?start=op_')
        chat = {'id': 777, 'type': 'private', 'first_name': 'Оператор'}
        assert await ot.handle_message(db, None, {'chat': chat, 'text': f'/start {code}'})
        assert 'подключён к заказам DÄM ALEM' in fake.last('sendMessage')['text']
        assert await ot.handle_message(db, None, {'chat': {'id': 778, 'type': 'private'}, 'text': f'/start {code}'})
        assert 'устарела' in fake.last('sendMessage')['text']  # a link works once
        assert not await ot.handle_message(db, None, {'chat': {'id': -100, 'type': 'group'}, 'text': f'/start {links["links"][1].split("start=")[1]}'})
        assert await ot.chats(db) == ['777']


async def test_new_order_card_has_the_contacts_and_money(tg):
    _, maker, _, fake = tg
    await link(maker, fake)
    async with maker() as db:
        order = await db.get(Food_orders, 1)
        order.comment = 'Домофон не работает'
        ot.notify_new_order(order)
    await drain()
    card = sent(fake)[-1]
    for part in ('НОВЫЙ ЗАКАЗ №1', 'Client', '+77000000000', 'Test street 1', 'Pizza × 1 — 1 000 ₸', 'Итого: 1 200 ₸',
                 'Домофон не работает', 'оплачено', '/partner/dam-alem/operator'):
        assert part in card, part


async def test_order_events_arrive_after_commit_and_never_after_rollback(tg):
    client, maker, headers, fake = tg
    await link(maker, fake)
    before = len(sent(fake))
    assert (await client.patch(BASE + '/orders/1', headers=headers, json={'expected_version': 0, 'status': 'confirmed'})).status_code == 200
    await drain()
    lines = sent(fake)[before:]
    assert len(lines) == 1 and 'Заказ №1' in lines[0] and 'Принят' in lines[0]

    async with maker() as db:
        from services.food_operations import add_event
        add_event(db, await db.get(Food_orders, 1), 'Это изменение откатится')
        await db.rollback()
    await drain()
    assert not any('откатится' in x for x in sent(fake))


async def test_stop_unlinks_and_nothing_is_sent_without_the_bot(tg, monkeypatch):
    _, maker, _, fake = tg
    await link(maker, fake)
    async with maker() as db:
        assert await ot.handle_message(db, None, {'chat': {'id': 777, 'type': 'private'}, 'text': '/stop_orders'})
        assert await ot.chats(db) == []
        monkeypatch.delenv('NEWS_TELEGRAM_BOT_TOKEN')
        ot.notify_new_order(await db.get(Food_orders, 1))
    assert not ot._background
