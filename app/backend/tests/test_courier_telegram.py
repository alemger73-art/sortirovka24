"""DÄM ALEM courier in Telegram: link from the cabinet, the delivery card arrives with the right money,
buttons run the cabinet's own status machine, strangers and other couriers can't press them."""
import asyncio
import importlib

import pytest
from sqlalchemy import select

from models.food_orders import Food_orders
from models.logistics import LogisticsTask
from services import courier_telegram as ct
from tests.test_dam_order_workflow import BASE, env  # noqa: F401  (the shared DAM workflow fixture)


class FakeTelegram:
    def __init__(self):
        self.calls = []

    async def __call__(self, client, method, payload, timeout=20):
        self.calls.append((method, payload))
        return {'ok': True, 'result': {'username': 'dam_test_bot'}}

    def last(self, method):
        return next(p for m, p in reversed(self.calls) if m == method)


@pytest.fixture
async def tg(env, monkeypatch):  # noqa: F811
    client, maker, headers, _ = env
    fake = FakeTelegram()
    import services.news_agent as news
    from core.database import db_manager
    monkeypatch.setattr(news, 'tg', fake)
    monkeypatch.setenv('NEWS_TELEGRAM_BOT_TOKEN', 'test-token')
    monkeypatch.setattr(db_manager, 'async_session_maker', maker)
    ct._ready.clear(); ct._bot_name.clear()
    import services.courier_notifications as cn
    importlib.reload(cn)  # the shared fixture mocks it; here the real hook must run
    yield client, maker, headers, fake


async def drain():
    await asyncio.gather(*list(ct._background))


async def ready_and_assign(client, headers):
    for version, status in enumerate(['confirmed', 'preparing', 'ready']):
        assert (await client.patch(BASE + '/orders/1', headers=headers, json={'expected_version': version, 'status': status})).status_code == 200
    assigned = await client.post(BASE + '/orders/1/assign-courier', headers=headers, json={'courier_id': 'courier'})
    assert assigned.status_code == 200, assigned.text


async def link(maker, fake, chat_id=555):
    async with maker() as db:
        st = await ct.status(db, 'courier')
        assert st['linked'] is False and st['url'].startswith('https://t.me/dam_test_bot?start=cr_')
        code = st['url'].split('start=')[1]
        assert await ct.handle_message(db, None, {'chat': {'id': chat_id, 'type': 'private'}, 'from': {'id': chat_id, 'first_name': 'Ержан'}, 'text': f'/start {code}'})
        assert 'Телеграм подключён' in fake.last('sendMessage')['text']
        assert (await ct.status(db, 'courier'))['linked'] is True
        # the one-time code can't be reused by someone else
        assert await ct.handle_message(db, None, {'chat': {'id': 777, 'type': 'private'}, 'from': {'id': 777}, 'text': f'/start {code}'})
        assert 'устарела' in fake.last('sendMessage')['text']


async def test_delivery_card_and_buttons(tg):
    client, maker, headers, fake = tg
    async with maker() as db:  # a cash order: the courier must see how much to collect
        order = await db.get(Food_orders, 1)
        order.payment_method, order.payment_status, order.paid_amount = 'cash', 'pending', 0
        order.cash_given_amount, order.change_amount = 2000, 800
        await db.commit()
    await link(maker, fake)
    await ready_and_assign(client, headers)
    await drain()
    card = fake.last('sendMessage')
    assert card['chat_id'] == '555'
    assert 'Новая доставка' in card['text'] and 'заказ №1' in card['text']
    assert 'Test street 1' in card['text'] and '+77000000000' in card['text'] and 'Pizza × 1' in card['text']
    assert 'Взять наличными: 1 200 ₸' in card['text'] and 'сдача 800 ₸' in card['text']
    buttons = [b['callback_data'] for row in card['reply_markup']['inline_keyboard'] for b in row]
    async with maker() as db:
        task = await db.scalar(select(LogisticsTask))
    assert buttons == [f'cr:picked_up:{task.id}', f'cr:r:{task.id}']

    # a stranger's chat can't move the delivery
    async with maker() as db:
        assert await ct.handle_callback(db, None, f'cr:picked_up:{task.id}', 999, {'message_id': 1}) == 'Телеграм не подключён к кабинету курьера'
    # the courier walks it through: the same state machine as the cabinet
    for step, answer, nxt in (('picked_up', 'забрал', ['on_the_way']), ('on_the_way', 'еду', ['arrived', 'delivered']),
                              ('arrived', 'на месте', ['delivered'])):
        async with maker() as db:
            assert answer in (await ct.handle_callback(db, None, f'cr:{step}:{task.id}', 555, {'message_id': 9})).lower()
        edited = fake.last('editMessageText')
        assert edited['message_id'] == 9
        assert [b['callback_data'].split(':')[1] for row in edited['reply_markup']['inline_keyboard'] for b in row][:-1] == nxt
    # a skipped step is refused by the shared rules, not by the bot
    async with maker() as db:
        assert 'Нельзя перейти' in await ct.handle_callback(db, None, f'cr:picked_up:{task.id}', 555, {'message_id': 9})
    async with maker() as db:
        assert 'Доставлено' in await ct.handle_callback(db, None, f'cr:delivered:{task.id}', 555, {'message_id': 9})
        task = await db.get(LogisticsTask, task.id)
        order = await db.get(Food_orders, 1)
        assert task.status == 'delivered' and order.status == 'done'
        assert order.payment_status != 'paid'  # cash is confirmed by the operator, never from Telegram
    assert 'reply_markup' not in fake.last('editMessageText')


async def test_shift_required_unlink_and_cancel(tg):
    client, maker, headers, fake = tg
    await link(maker, fake)
    await ready_and_assign(client, headers)
    await drain()
    async with maker() as db:
        task = await db.scalar(select(LogisticsTask))
        from services.food_shifts import active_shift
        shift = await active_shift(db, 'courier', 'courier')
        shift.active_key = None  # shift closed
        await db.commit()
        assert 'смену' in await ct.handle_callback(db, None, f'cr:picked_up:{task.id}', 555, {'message_id': 3})
        assert (await db.get(LogisticsTask, task.id)).status == 'assigned'
    # the operator cancels: the courier is told not to go
    from services.courier_notifications import notify_courier_task
    async with maker() as db:
        await notify_courier_task(db, await db.get(LogisticsTask, task.id), 'cancelled')
    await drain()
    assert 'Заказ отменён' in fake.last('sendMessage')['text'] and 'reply_markup' not in fake.last('sendMessage')
    # /stop unlinks; nothing is sent afterwards
    async with maker() as db:
        assert await ct.handle_message(db, None, {'chat': {'id': 555, 'type': 'private'}, 'from': {'id': 555}, 'text': '/stop'})
        assert (await ct.status(db, 'courier'))['linked'] is False
    sent = len(fake.calls)
    async with maker() as db:
        await notify_courier_task(db, await db.get(LogisticsTask, task.id), 'assigned')
    await drain()
    assert len(fake.calls) == sent
