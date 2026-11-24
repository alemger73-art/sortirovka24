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
    assert '*Итого: 4 800 ₸*' in text.replace(' ', ' ') or 'Итого' in text
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
