"""Order audit and durable Telegram delivery. No credentials in public settings."""
import asyncio
import base64
import hashlib
import json
import logging
import os
import re
import time
from datetime import datetime, timezone

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select, update, or_, and_
from core.auth import _get_jwt_secret_key
from core.database import db_manager
from models.food_operations import FoodOperationsSettings, FoodOrderEvent
from models.food_orders import Food_orders
from models.food_restaurants import Food_restaurants

class RedactBotToken(logging.Filter):
    def filter(self, record):
        record.msg = re.sub(r'bot\d+:[A-Za-z0-9_-]+', 'bot[REDACTED]', record.getMessage())
        record.args = ()
        return True

logging.getLogger('httpx').addFilter(RedactBotToken())
logging.getLogger('httpcore.http11').addFilter(RedactBotToken())
log = logging.getLogger(__name__)
LABELS = {'new': 'Новый', 'confirmed': 'Принят', 'preparing': 'Готовится', 'ready': 'Готов к выдаче', 'in_progress': 'В доставке', 'done': 'Завершён', 'cancelled': 'Отменён'}

def now():
    return datetime.now(timezone.utc).isoformat()

def cipher():
    material = os.environ.get('FOOD_SECRETS_KEY') or _get_jwt_secret_key()
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(('food-operations:' + material).encode()).digest()))

def brand(name):
    return re.sub(r'[\s-]|2\.0', '', (name or '').lower()) in {'damalem', 'дамалем', 'алемфуд', 'alemfood'}

async def scope(db):
    restaurants = (await db.execute(select(Food_restaurants.id, Food_restaurants.name))).all()
    ids = [r.id for r in restaurants if brand(r.name)]
    # Only legacy orders without a restaurant id may be identified by stored name.
    names = ['DAM ALEM', 'DAM ALEM 2.0', 'Алем Фуд', 'Алем-Фуд', 'Alem Food', 'ДАМ АЛЕМ']
    return or_(Food_orders.restaurant_id.in_(ids), and_(Food_orders.restaurant_id.is_(None), Food_orders.restaurant_name.in_(names)))

async def is_dam_order(db, order):
    return bool(await db.scalar(select(Food_orders.id).where(Food_orders.id == order.id, await scope(db))))

def add_event(db, order, message, actor='Система', notify=True):
    event = FoodOrderEvent(order_id=order.id, actor=actor[:200], message=message, created_at=now(), notification='pending' if notify else 'none')
    db.add(event)
    return event

async def credentials(db):
    cfg = await db.get(FoodOperationsSettings, 1)
    if cfg is not None:
        if not cfg.enabled:
            return None
        try:
            return cipher().decrypt(cfg.token_cipher.encode()).decode(), cfg.chat_id
        except Exception:
            raise ValueError('Не удалось прочитать ключ бота. Сохраните токен заново.')
    return None

async def telegram_call(token, method, payload):
    # Do not propagate httpx URLs/exceptions: the URL contains the bot secret.
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(f'https://api.telegram.org/bot{token}/{method}', json=payload)
        data = response.json()
        if response.is_success and data.get('ok'):
            return data['result']
        code = data.get('error_code', response.status_code)
        if code == 429:
            raise ValueError('Telegram ограничил частоту запросов. Повторим позже.')
        if code in (400, 401, 403):
            raise ValueError('Проверьте токен, ID канала и право бота отправлять сообщения.')
        raise TimeoutError('Telegram не подтвердил результат. Проверьте канал перед повтором.')
    except ValueError:
        raise
    except Exception:
        raise TimeoutError('Результат отправки неизвестен. Проверьте канал перед повтором.') from None

async def check_connection(token, chat):
    me = await telegram_call(token, 'getMe', {})
    room = await telegram_call(token, 'getChat', {'chat_id': chat})
    member = await telegram_call(token, 'getChatMember', {'chat_id': chat, 'user_id': me['id']})
    if room.get('type') not in ('channel', 'supergroup', 'group'):
        raise ValueError('Укажите канал или группу операторов.')
    if member.get('status') in ('left', 'kicked', 'restricted') or (room.get('type') == 'channel' and not (member.get('status') == 'creator' or member.get('can_post_messages'))):
        raise ValueError('Добавьте бота в канал администратором с правом публикации.')
    return {'bot': me.get('username'), 'chat': room.get('title', ''), 'chat_id': str(room['id'])}

def notification_text(order, event):
    # Deliberately exclude free-text fields and personal/customer/order-content data.
    kind = 'Новый заказ' if event.message == 'Заказ создан' else 'Заказ обновлён'
    return f'DAM ALEM 2.0 · Заказ №{order.id}\n{kind}\nСтатус: {LABELS.get(order.status, "Уточните в кабинете")}\nОткройте кабинет для просмотра деталей.'

async def deliver_one(db, event_id):
    try:
        config = await credentials(db)
    except ValueError as exc:
        await db.execute(update(FoodOrderEvent).where(FoodOrderEvent.id == event_id, FoodOrderEvent.notification == 'pending').values(notification='failed', error=str(exc)))
        await db.commit()
        return
    if not config:
        return
    token, chat = config
    cfg = await db.get(FoodOperationsSettings, 1)
    event = await db.get(FoodOrderEvent, event_id)
    if not event or event.notification != 'pending' or event.retry_at > time.time():
        return
    if cfg and not cfg.status_updates and event.message != 'Заказ создан':
        event.notification = 'none'
        await db.commit()
        return
    claimed = await db.execute(update(FoodOrderEvent).where(FoodOrderEvent.id == event_id, FoodOrderEvent.notification == 'pending').values(notification='sending', claimed_at=time.time(), attempts=FoodOrderEvent.attempts + 1))
    await db.commit()
    if not claimed.rowcount:
        return
    await db.refresh(event)
    order = await db.get(Food_orders, event.order_id)
    if not order:
        event.notification, event.error = 'failed', 'Заказ не найден'
        await db.commit()
        return
    payload = {'chat_id': chat, 'text': notification_text(order, event)}
    base = (os.environ.get('PUBLIC_FRONTEND_URL') or os.environ.get('FRONTEND_URL') or '').rstrip('/')
    if base.startswith('https://'):
        payload['reply_markup'] = {'inline_keyboard': [[{'text': 'Открыть заказ в кабинете', 'url': f'{base}/partner/dam-alem?section=orders&order={order.id}'}]]}
    try:
        result = await telegram_call(token, 'sendMessage', payload)
        event.notification, event.error = 'sent', None
        event.telegram_message_id = result['message_id']
    except ValueError as exc:
        event.notification = 'failed' if event.attempts >= 5 else 'pending'
        event.retry_at = time.time() + min(3600, 60 * 2 ** event.attempts)
        event.error = str(exc)
    except TimeoutError as exc:
        # Sending is not idempotent in Telegram: don't blindly duplicate after a timeout.
        event.notification, event.error = 'unknown', str(exc)
    await db.commit()

async def notification_worker():
    while True:
        try:
            if db_manager._initialized and db_manager.async_session_maker:
                async with db_manager.async_session_maker() as db:
                    await db.execute(update(FoodOrderEvent).where(FoodOrderEvent.notification == 'sending', FoodOrderEvent.claimed_at < time.time() - 120).values(notification='unknown', error='Отправка прервалась. Проверьте канал перед повтором.'))
                    await db.commit()
                    ids = (await db.scalars(select(FoodOrderEvent.id).where(FoodOrderEvent.notification == 'pending', FoodOrderEvent.retry_at <= time.time()).order_by(FoodOrderEvent.id).limit(10))).all()
                    for event_id in ids:
                        await deliver_one(db, event_id)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.warning('Food notification worker cycle failed; will resume')
        await asyncio.sleep(10)
