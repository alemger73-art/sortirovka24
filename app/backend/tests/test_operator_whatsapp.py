"""New DAM ALEM orders also go to WhatsApp: the Telegram card in WhatsApp formatting, to DAM_ORDER_WA_TO only."""
import asyncio
from types import SimpleNamespace

import pytest

from services import operator_whatsapp as ow


def order(**kw):
    base = dict(id=58, customer_name='Алия <VIP>', customer_phone='+77011234567', delivery_method='delivery',
                delivery_address='Уранова 10, кв 5', scheduled_for=None, comment='', order_items='[{"name": "Манты жареные", "quantity": 2, "price": 2400}]',
                pricing_snapshot='{}', promo_discount_amount=0, total_amount=4800, bonus_points_used=0, payment_method='cash',
                payment_status='pending', cash_given_amount=None, change_amount=None, order_source='app')
    base.update(kw)
    return SimpleNamespace(**base)


def test_numbers_are_read_in_any_local_form(monkeypatch):
    monkeypatch.setenv('DAM_ORDER_WA_TO', '+7 747 030 40 96, 87001234567, 123, 77470304096')
    assert ow.recipients() == ['77470304096@c.us', '77001234567@c.us']
    monkeypatch.delenv('DAM_ORDER_WA_TO')
    assert ow.recipients() == [] and not ow.enabled()


def test_the_card_reads_well_in_whatsapp():
    from services.operator_telegram import card
    text = ow.whatsapp_text(card(order()))
    assert '*НОВЫЙ ЗАКАЗ №58*' in text and 'Алия <VIP>' in text and 'Уранова 10, кв 5' in text
    assert '*Итого:' in text
    assert '<b>' not in text and '<a' not in text and 'Открыть кабинет оператора: http' in text


@pytest.mark.asyncio
async def test_a_new_order_is_sent_to_each_number(monkeypatch):
    monkeypatch.setenv('DAM_ORDER_WA_TO', '87470304096')
    sent = []

    async def fake_send(client, chat_id, text):
        sent.append((chat_id, text))
        return True
    monkeypatch.setattr('services.support_bot.send_text', fake_send)
    ow.notify_new_order(order())
    await asyncio.gather(*ow._background)
    assert len(sent) == 1 and sent[0][0] == '77470304096@c.us' and 'НОВЫЙ ЗАКАЗ №58' in sent[0][1]


# ---------------- an operator's replies move the order through the cabinet's own rules ----------------
from models.food_orders import Food_orders  # noqa: E402
from tests.test_operator_console import accounting_switched_on, tg  # noqa: E402,F401  (cabinet API on a test database)
from tests.test_dam_order_workflow import env  # noqa: E402,F401

OPERATOR = '+7 747 030 40 96'


async def wa(maker, words, quoted='НОВЫЙ ЗАКАЗ №1 · DÄM ALEM'):
    async with maker() as db:
        return await ow.handle_message(db, OPERATOR, words, quoted)


async def status(maker):
    async with maker() as db:
        return (await db.get(Food_orders, 1, populate_existing=True)).status


async def test_only_listed_numbers_are_heard_and_they_sign_in_with_the_pin(tg, monkeypatch):
    _, maker, _ = tg
    monkeypatch.setenv('DAM_ORDER_WA_TO', '87470304096')
    assert ow.is_operator('+77470304096') and not ow.is_operator('+77011112233')
    assert 'PIN' in await wa(maker, '1')
    assert await status(maker) == 'new'  # nothing happens before the PIN
    assert 'Неверный PIN' in await wa(maker, 'PIN 1111')
    assert 'вы вошли' in await wa(maker, 'PIN 2222')


async def test_digits_walk_the_order_and_cancel_needs_a_reason(tg, monkeypatch):
    _, maker, _ = tg
    monkeypatch.setenv('DAM_ORDER_WA_TO', '87470304096')
    await wa(maker, '2222')
    reply = await wa(maker, '1')
    assert await status(maker) == 'preparing' and '*Заказ №1*' in reply and 'Готовится' in reply
    assert 'Не понял, какой заказ' in await wa(maker, '2', quoted='')
    assert 'причину' in await wa(maker, '1 0', quoted='')  # «1 0» = order №1, cancel — without a reason
    assert await status(maker) == 'preparing'
    assert 'Как управлять' in await wa(maker, 'спасибо')
    assert 'отменён' in await wa(maker, '0 клиент отказался')
    assert await status(maker) == 'cancelled'
    assert 'уже отменён' in await wa(maker, '3')


async def test_the_support_number_hands_operator_replies_to_the_order_handler(tg, monkeypatch):
    _, maker, _ = tg
    from core.database import db_manager
    from services import support_bot as sb
    monkeypatch.setenv('DAM_ORDER_WA_TO', '87470304096')
    monkeypatch.setattr(sb, 'enabled', lambda: True)
    monkeypatch.setattr(db_manager, 'async_session_maker', maker)
    sent = []

    async def fake_send(client, chat_id, text):
        sent.append(text)
        return True
    monkeypatch.setattr(sb, 'send_text', fake_send)
    event = {'event': 'message', 'payload': {'id': 'w1', 'from': '77470304096@c.us', 'body': 'PIN 2222'}}
    out = await sb.handle_event(event, None)
    assert out.action == 'operator' and 'вы вошли' in sent[-1]
    event = {'event': 'message', 'payload': {'id': 'w2', 'from': '77470304096@c.us', 'body': '1',
                                             'replyTo': {'body': '🍽 *НОВЫЙ ЗАКАЗ №1* · DÄM ALEM'}}}
    assert (await sb.handle_event(event, None)).action == 'operator'
    assert await status(maker) == 'preparing'
