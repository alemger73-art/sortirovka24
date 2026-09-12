import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.food_staff_guard import food_staff, food_owner
from models.food_orders import Food_orders
from models.food_operations import FoodOperationsSettings, FoodOrderEvent
from services.food_operations import scope, cipher, now, check_connection, telegram_call
from services.food_orders import Food_ordersService

router = APIRouter(prefix='/api/v1/dam-alem/operations', tags=['DAM ALEM operations'], dependencies=[Depends(food_staff)])

def serialize(row):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns}

async def order_for_panel(db, order_id):
    obj = await db.scalar(select(Food_orders).where(Food_orders.id == order_id, await scope(db)))
    if not obj:
        raise HTTPException(404, 'Заказ DAM ALEM не найден')
    return obj

@router.get('/orders')
async def orders(q: str = Query('', max_length=100), status: str = '', skip: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    conditions = [await scope(db)]
    if status == 'active':
        conditions.append(Food_orders.status.notin_(['done', 'cancelled']))
    elif status:
        conditions.append(Food_orders.status == status)
    if q.strip():
        needle = '%' + q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        terms = [c.ilike(needle, escape='\\') for c in (Food_orders.customer_name, Food_orders.customer_phone, Food_orders.delivery_address)]
        if q.strip().isdigit():
            terms.append(Food_orders.id == int(q.strip()))
        conditions.append(or_(*terms))
    total = await db.scalar(select(func.count()).select_from(Food_orders).where(*conditions))
    rows = (await db.scalars(select(Food_orders).where(*conditions).order_by(Food_orders.id.desc()).offset(skip).limit(limit))).all()
    return {'items': [serialize(r) for r in rows], 'total': total}

@router.get('/orders/{order_id}')
async def detail(order_id: int, db: AsyncSession = Depends(get_db)):
    obj = await order_for_panel(db, order_id)
    events = (await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id == order_id).order_by(FoodOrderEvent.id.desc()))).all()
    return {'order': serialize(obj), 'events': [serialize(e) for e in events]}

class OrderChange(BaseModel):
    expected_version: int = Field(ge=0)
    status: Literal['new', 'confirmed', 'preparing', 'ready', 'in_progress', 'done', 'cancelled'] | None = None
    operator_note: str | None = Field(None, max_length=2000)
    cancellation_reason: str | None = Field(None, max_length=500)
    delivery_address: str | None = Field(None, max_length=1000)
    payment_status: Literal['pending', 'paid'] | None = None

@router.patch('/orders/{order_id}')
async def change(order_id: int, body: OrderChange, request: Request, db: AsyncSession = Depends(get_db)):
    await order_for_panel(db, order_id)
    actor = await food_staff(request, db)
    values = body.model_dump(exclude_none=True)
    version = values.pop('expected_version')
    result = await Food_ordersService(db).update(order_id, values, expected_version=version, actor=str(actor.get('display_name') or actor.get('username') or actor.get('sub') or actor.get('partner_type') or 'Оператор'))
    return serialize(result)

@router.post('/orders/{order_id}/notifications/{event_id}/retry')
async def retry(order_id: int, event_id: int, db: AsyncSession = Depends(get_db)):
    await order_for_panel(db, order_id)
    result = await db.execute(update(FoodOrderEvent).where(FoodOrderEvent.id == event_id, FoodOrderEvent.order_id == order_id, FoodOrderEvent.notification.in_(['failed', 'unknown', 'pending'])).values(notification='pending', retry_at=0, attempts=0, error=None))
    await db.commit()
    if not result.rowcount:
        raise HTTPException(409, 'Уведомление уже отправлено или отправляется')
    return {'ok': True}

def config_view(cfg):
    return {'enabled': bool(cfg and cfg.enabled), 'chat_id': cfg.chat_id if cfg else '', 'has_token': bool(cfg and cfg.token_cipher), 'status_updates': cfg.status_updates if cfg else True}

@router.get('/telegram', dependencies=[Depends(food_owner)])
async def get_settings(db: AsyncSession = Depends(get_db)):
    return config_view(await db.get(FoodOperationsSettings, 1))

class TelegramSettings(BaseModel):
    token: str | None = Field(None, max_length=200)
    chat_id: str = Field(max_length=100)
    enabled: bool
    status_updates: bool = True

@router.put('/telegram', dependencies=[Depends(food_owner)])
async def save_settings(body: TelegramSettings, db: AsyncSession = Depends(get_db)):
    cfg = await db.get(FoodOperationsSettings, 1)
    if cfg is None:
        cfg = FoodOperationsSettings(id=1)
        db.add(cfg)
    token = (body.token or '').strip()
    if token and not re.fullmatch(r'\d{5,16}:[A-Za-z0-9_-]{20,150}', token):
        raise HTTPException(422, 'Некорректный формат токена бота')
    chat = body.chat_id.strip()
    if chat and not re.fullmatch(r'-\d{5,25}|@[A-Za-z][A-Za-z0-9_]{4,}', chat):
        raise HTTPException(422, 'Укажите ID канала −100… или @имя_канала')
    if token:
        cfg.token_cipher = cipher().encrypt(token.encode()).decode()
    if body.enabled:
        if not cfg.token_cipher or not chat:
            raise HTTPException(422, 'Введите токен и канал')
        try:
            checked = await check_connection(cipher().decrypt(cfg.token_cipher.encode()).decode(), chat)
            chat = checked['chat_id']
        except Exception:
            raise HTTPException(422, 'Не удалось проверить подключение. Проверьте токен, канал и права бота.') from None
    cfg.chat_id, cfg.enabled, cfg.status_updates, cfg.updated_at = chat, body.enabled, body.status_updates, now()
    await db.commit()
    return config_view(cfg)

@router.post('/telegram/test', dependencies=[Depends(food_owner)])
async def test_message(db: AsyncSession = Depends(get_db)):
    cfg = await db.get(FoodOperationsSettings, 1)
    if not cfg or not cfg.token_cipher or not cfg.chat_id:
        raise HTTPException(422, 'Сначала сохраните токен и канал')
    try:
        token = cipher().decrypt(cfg.token_cipher.encode()).decode()
        checked = await check_connection(token, cfg.chat_id)
        await telegram_call(token, 'sendMessage', {'chat_id': cfg.chat_id, 'text': 'DAM ALEM 2.0: проверка подключения. Это тестовое сообщение, не заказ.'})
        return {'ok': True, **checked}
    except Exception:
        raise HTTPException(422, 'Тест не подтверждён. Проверьте канал и настройки перед повтором.') from None
