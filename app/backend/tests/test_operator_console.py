"""DÄM ALEM operator console in Telegram: PIN binds a linked chat to the employee; every button goes through the
cabinet's own API on their behalf, offers only what the cabinet would offer, and refuses stale presses."""
import asyncio
import json

import pytest

from models.food_orders import Food_orders
from services import operator_console as oc
from services import operator_telegram as ot
from tests.test_courier_telegram import FakeTelegram
from tests.test_dam_order_workflow import env  # noqa: F401  (the shared DAM workflow fixture: operator PIN 2222, shift open)

CHAT = 901


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
    monkeypatch.setattr(ot, 'enabled', lambda: bool(news.bot_token()))
    monkeypatch.setattr(oc, '_app', client._transport.app)  # the cabinet's routers with the test database
    ot._ready.clear(); courier_telegram._bot_name.clear()
    yield client, maker, fake


def text_of(fake, method='sendMessage'):
    return fake.last(method)['text']


def buttons(fake, method='sendMessage'):
    return [b for row in fake.last(method).get('reply_markup', {}).get('inline_keyboard', []) for b in row]


def press(fake, label, method='sendMessage'):
    return next(b['callback_data'] for b in buttons(fake, method) if label in b['text'])


async def say(maker, words, chat=CHAT):
    async with maker() as db:
        return await ot.handle_message(db, None, {'chat': {'id': chat, 'type': 'private', 'first_name': 'Оператор'},
                                                  'text': words, 'message_id': 5})


async def click(maker, data, chat=CHAT):
    async with maker() as db:
        return await oc.handle_callback(db, None, data, chat, {'message_id': 77})


async def order(maker, oid=1):
    async with maker() as db:
        return await db.get(Food_orders, oid, populate_existing=True)


async def linked(maker, fake):
    async with maker() as db:
        code = (await ot.new_links(db))['links'][0].split('start=')[1]
    assert await say(maker, f'/start {code}')
    assert 'PIN оператора' in text_of(fake)


async def test_pin_binds_the_chat_and_only_a_linked_chat(tg):
    _, maker, fake = tg
    assert not await say(maker, '/pin', chat=555)  # a stranger cannot even try a PIN
    await linked(maker, fake)
    assert await say(maker, '1111')
    assert 'Неверный PIN' in text_of(fake)
    assert await say(maker, '2222')
    assert 'вы вошли' in text_of(fake) and 'keyboard' in fake.last('sendMessage')['reply_markup']
    assert ('deleteMessage', {'chat_id': CHAT, 'message_id': 5}) in fake.calls  # the PIN does not stay in the chat


async def test_buttons_drive_the_order_through_the_cabinet_rules(tg):
    _, maker, fake = tg
    await linked(maker, fake)
    await say(maker, '2222')
    assert await say(maker, '🆕 Новые')
    assert '№1' in text_of(fake)
    assert await click(maker, press(fake, '№1')) == 'Открыт заказ №1'
    card = text_of(fake)
    assert 'Заказ №1' in card and '+77000000000' in card and 'Test street 1' in card
    to_kitchen = press(fake, 'Передать на кухню')
    assert await click(maker, to_kitchen) == '👨‍🍳 Готовится'
    assert (await order(maker)).status == 'preparing'
    assert 'Заказ уже изменён' in await click(maker, to_kitchen)  # a stale button never acts twice
    assert (await order(maker)).status == 'preparing'

    await click(maker, press(fake, 'Готово', 'editMessageText'))
    assert (await order(maker)).status == 'ready'
    await click(maker, f'{oc.CB}c:1')
    courier = press(fake, 'Courier', 'editMessageText')
    assert await click(maker, courier) == 'Заказ передан курьеру'
    assert (await order(maker)).status == 'in_progress'

    await click(maker, f'{oc.CB}m:1')
    assert await click(maker, press(fake, 'Да, заказ доставлен', 'editMessageText')) == 'Доставка завершена'
    assert (await order(maker)).status == 'done'


async def test_cancel_asks_for_a_reason_and_the_server_still_decides(tg):
    _, maker, fake = tg
    await linked(maker, fake)
    await say(maker, '2222')
    assert await click(maker, f'{oc.CB}x:1') == 'Напишите причину отмены'
    assert await say(maker, '/cancel')
    assert (await order(maker)).status == 'new'
    await click(maker, f'{oc.CB}x:1')
    async with maker() as db:  # someone changed the order in the cabinet meanwhile
        row = await db.get(Food_orders, 1)
        row.version = (row.version or 0) + 1
        await db.commit()
    await say(maker, 'Клиент передумал')
    assert 'изменён' in text_of(fake).lower() and (await order(maker)).status == 'new'
    await click(maker, f'{oc.CB}x:1')
    await say(maker, 'Клиент передумал')
    row = await order(maker)
    assert row.status == 'cancelled' and row.cancellation_reason == 'Клиент передумал'


async def test_shift_and_unbound_chat(tg):
    _, maker, fake = tg
    await linked(maker, fake)
    assert await click(maker, f'{oc.CB}r:1') == 'Сначала пришлите PIN оператора'
    await say(maker, '2222')
    assert await say(maker, oc.SHIFT_BUTTON)
    assert 'смена открыта' in text_of(fake)
    async with maker() as db:
        staff = await oc.staff_of(db, CHAT)
        assert staff.staff_id == 1 and json.loads(staff.awaiting or 'null') is None


async def test_new_order_arrives_as_a_card_with_buttons_in_a_console_chat(tg):
    _, maker, fake = tg
    await linked(maker, fake)
    await say(maker, '2222')
    ot.notify_new_order(await order(maker))
    while ot._background:
        await asyncio.gather(*list(ot._background))
    assert 'НОВЫЙ ЗАКАЗ №1' in text_of(fake) and press(fake, 'Передать на кухню')


async def test_payment_needs_a_second_tap_and_online_unpaid_waits_for_money(tg):
    _, maker, fake = tg
    await linked(maker, fake)
    await say(maker, '2222')
    async with maker() as db:
        row = await db.get(Food_orders, 1)
        row.payment_method, row.payment_status = 'kaspi_qr', 'pending'
        await db.commit()
    await click(maker, f'{oc.CB}o:1')
    assert 'На кухню — после оплаты' in text_of(fake)
    assert not any('Передать на кухню' in b['text'] for b in buttons(fake))  # the cabinet would not offer it either
    async with maker() as db:
        row = await db.get(Food_orders, 1)
        row.payment_method = 'cash'
        await db.commit()
    await click(maker, f'{oc.CB}o:1')
    await click(maker, press(fake, 'Оплата получена'))
    assert 'наличные фактически получены' in text_of(fake, 'editMessageText')
    assert (await order(maker)).payment_status != 'paid'  # one tap only asks
    assert await click(maker, press(fake, 'Да, деньги получены', 'editMessageText')) == 'Оплата отмечена'
    assert (await order(maker)).payment_status == 'paid'


async def test_a_telegram_linked_courier_gets_the_order_without_a_pin_shift(tg):
    """Owner's rule: a courier who linked Telegram is reachable — the assignment opens their shift."""
    _, maker, fake = tg
    from sqlalchemy import delete, select, text
    from models.food_shifts import FoodShift
    from services import courier_telegram as ct
    async with maker() as db:
        await db.execute(delete(FoodShift).where(FoodShift.staff_type == 'courier'))
        row = await db.get(Food_orders, 1)
        row.status, row.version = 'ready', 3
        await db.commit()
    await linked(maker, fake)
    await say(maker, '2222')
    await click(maker, f'{oc.CB}c:1')
    assert not any('Courier' in b['text'] for b in buttons(fake, 'editMessageText'))  # no shift, no Telegram: not offered
    async with maker() as db:
        await ct.ensure_tables(db)
        await db.execute(text("INSERT INTO courier_telegram (user_id, chat_id) VALUES ('courier', '555')"))
        await db.commit()
    await click(maker, f'{oc.CB}c:1')
    assert await click(maker, press(fake, 'через Telegram', 'editMessageText')) == 'Заказ передан курьеру'
    async with maker() as db:
        shift = await db.scalar(select(FoodShift).where(FoodShift.staff_type == 'courier', FoodShift.closed_at.is_(None)))
        assert shift and shift.opened_by == 'Назначение заказа (Telegram)'
    assert (await order(maker)).status == 'in_progress'
