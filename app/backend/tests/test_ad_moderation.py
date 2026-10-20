"""Announcements: one-tap Telegram moderation, author notices, limits, visitor reports."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import httpx
import pytest
from models.announcements import Announcements
from services import ad_moderation
from tests.test_security_stage1 import security_env

BASE = '/api/v1/entities/announcements'
BODY = {'title': 'Велосипед', 'description': 'Рабочий велосипед, 26 колёса', 'phone': '+77001234567', 'ann_type': 'sell',
        'gallery_images': 'https://res.cloudinary.com/x/a.jpg'}


@pytest.fixture
def bot(monkeypatch):
    calls = []
    async def tg(client, method, payload, timeout=20):
        calls.append((method, payload))
        return {'ok': True, 'result': {}}
    monkeypatch.setattr('services.news_agent.tg', tg)
    monkeypatch.setattr('services.news_agent.bot_token', lambda: 'token')
    monkeypatch.setattr('services.news_agent.approval_chat', lambda: '42')
    wa = AsyncMock()
    monkeypatch.setattr('services.customer_payment_notice._whatsapp', wa)
    return calls, wa


async def test_new_ad_goes_to_owner_with_photo_and_buttons_then_one_tap_publishes(security_env, bot):
    client, maker, headers = security_env
    calls, wa = bot
    r = await client.post(BASE, headers=headers['alice'], json=BODY)
    assert r.status_code == 201, r.text
    ad_id = r.json()['id']
    method, payload = calls[-1]
    assert method == 'sendPhoto' and payload['photo'].endswith('a.jpg') and 'Велосипед' in payload['caption']
    buttons = [b['callback_data'] for row in payload['reply_markup']['inline_keyboard'] for b in row]
    assert f'ad:p:{ad_id}' in buttons and f'ad:r:{ad_id}:banned' in buttons
    async with maker() as db, httpx.AsyncClient() as http:
        answer = await ad_moderation.handle_callback(db, http, f'ad:p:{ad_id}', '42', {'message_id': 7})
    assert answer == 'Опубликовано на сайте'
    assert calls[-1][0] == 'editMessageReplyMarkup'
    assert wa.await_args.args[0] == '+77001234567' and 'опубликовано' in wa.await_args.args[1]
    assert (await client.get(BASE)).json()['total'] == 1
    row = (await client.get(f'{BASE}/{ad_id}')).json()
    assert datetime.fromisoformat(row['expires_at']) > datetime.now(timezone.utc)
    async with maker() as db, httpx.AsyncClient() as http:
        assert await ad_moderation.handle_callback(db, http, f'ad:p:{ad_id}', '42', {'message_id': 7}) == 'Уже опубликовано'


async def test_reject_with_reason_tells_author_and_hides(security_env, bot):
    client, maker, headers = security_env
    calls, wa = bot
    ad_id = (await client.post(BASE, headers=headers['alice'], json={**BODY, 'gallery_images': ''})).json()['id']
    assert calls[-1][0] == 'sendMessage'  # no photo → text card
    async with maker() as db, httpx.AsyncClient() as http:
        answer = await ad_moderation.handle_callback(db, http, f'ad:r:{ad_id}:banned', '42', {'message_id': 8})
    assert answer.startswith('Отклонено: товар или услуга запрещены')
    assert 'не прошло проверку' in wa.await_args.args[1]
    assert (await client.get(BASE)).json()['total'] == 0


async def test_daily_limit_and_report(security_env, bot, monkeypatch):
    client, maker, headers = security_env
    calls, _ = bot
    monkeypatch.setattr(ad_moderation, 'MAX_PER_DAY', 2)
    ids = [(await client.post(BASE, headers=headers['alice'], json=BODY)).json()['id'] for _ in range(2)]
    third = await client.post(BASE, headers=headers['alice'], json=BODY)
    assert third.status_code == 429 and 'в сутки' in third.text
    assert (await client.post(f'{BASE}/{ids[0]}/report', json={'reason': 'мошенник'})).status_code == 404  # not public yet
    async with maker() as db, httpx.AsyncClient() as http:
        await ad_moderation.handle_callback(db, http, f'ad:p:{ids[0]}', '42', {'message_id': 1})
    r = await client.post(f'{BASE}/{ids[0]}/report', json={'reason': 'Просит предоплату, мошенник'})
    assert r.status_code == 202
    assert 'Жалоба на объявление' in calls[-1][1]['text'] and calls[-1][1]['reply_markup']['inline_keyboard'][0][0]['callback_data'] == f'ad:r:{ids[0]}:other'
    async with maker() as db, httpx.AsyncClient() as http:
        assert (await ad_moderation.handle_callback(db, http, f'ad:r:{ids[0]}:other', '42', {'message_id': 2})).startswith('Отклонено')
    assert (await client.get(BASE)).json()['total'] == 0
