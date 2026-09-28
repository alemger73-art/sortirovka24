import re
import hashlib
import json
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
from services.food_shifts import require_partner_shift, record_action
from services.food_preorders import schedule_settings, schedule_view, future_condition, current_condition, lock_dam_operations

router = APIRouter(prefix='/api/v1/dam-alem/operations', tags=['DAM ALEM operations'], dependencies=[Depends(food_staff)])

class ManualDelivery(BaseModel):
    model_config = {'extra': 'forbid'}
    expected_version: int = Field(ge=0)
    reason: Literal['courier', 'customer', 'other']
    cash_received: bool | None = None
    amount: float | None = Field(None, ge=0, allow_inf_nan=False)
    comment: str = Field('', max_length=1000)


@router.post('/orders/{order_id}/manual-delivery')
async def manual_delivery(order_id: int, body: ManualDelivery, request: Request, db: AsyncSession = Depends(get_db)):
    await lock_dam_operations(db)
    claims = await food_staff(request, db)
    await require_partner_shift(db, claims)
    order = await order_for_panel(db, order_id)
    from services.dam_order_workflow import task_for, money, paid
    from models.auth import User
    from services.logistics_service import advance_task_status
    task = await task_for(db, order)
    if not task or not task.courier_id or order.delivery_method not in ('delivery', 'доставка'):
        raise HTTPException(409, 'Заказ не передан курьеру')
    if task.status == 'delivered' and order.status == 'done':
        return serialize(order)  # never collect money a second time on retry
    if (order.version or 0) != body.expected_version:
        raise HTTPException(409, 'Заказ изменён. Обновите карточку')
    outstanding = max(money(0), money(order.total_amount)-paid(order))
    if order.payment_method == 'cash' and outstanding > 0 and body.cash_received is None:
        raise HTTPException(422, 'Укажите, получены ли деньги')
    if order.payment_method != 'cash' and (body.cash_received is not None or body.amount is not None):
        raise HTTPException(422, 'Онлайн-оплату подтверждает только провайдер')
    amount = outstanding if body.amount is None else money(body.amount)
    unusual = body.reason == 'other' or (outstanding > 0 and body.cash_received is False) or (body.cash_received and amount != outstanding)
    if unusual and len(body.comment.strip()) < 3:
        raise HTTPException(422, 'Для нестандартного завершения укажите комментарий')
    courier = await db.get(User, task.courier_id)
    try:
        await advance_task_status(db, task, courier, 'delivered', cash_received=body.cash_received,
            manual_claims=claims, manual_reason=body.reason, manual_comment=body.comment.strip(),
            cash_amount=amount if body.cash_received else None)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(409, str(exc)) from None
    return serialize(order)

@router.get('/courier-work')
async def courier_work(db:AsyncSession=Depends(get_db)):
    from models.courier_workflow import CourierCashHandover, CourierDeliveryIssue
    from models.auth import User
    transfers=(await db.execute(select(CourierCashHandover,User.name).join(User,User.id==CourierCashHandover.courier_id).where(CourierCashHandover.status=='pending'))).all()
    issues=(await db.execute(select(CourierDeliveryIssue,User.name).join(User,User.id==CourierDeliveryIssue.courier_id).where(CourierDeliveryIssue.status=='open'))).all()
    return {'handovers':[{'id':r.id,'courier_id':r.courier_id,'name':name,'amount':float(r.amount)} for r,name in transfers],
        'issues':[{'id':r.id,'task_id':r.task_id,'order_id':r.order_id,'name':name,'reason':r.reason,'comment':r.comment,'created_at':r.created_at} for r,name in issues]}

@router.post('/cash-handovers/{handover_id}/confirm')
async def confirm_cash_handover(handover_id:int,request:Request,db:AsyncSession=Depends(get_db)):
    claims=await food_staff(request,db)
    await require_partner_shift(db,claims)
    from services.courier_money import confirm_handover
    row=await confirm_handover(db,handover_id,claims)
    await db.commit()
    return {'id':row.id,'status':row.status,'amount':float(row.amount)}

class IssueResolution(BaseModel):
    resolution:str=Field(min_length=1,max_length=1000)

class CourierReassignment(BaseModel):
    model_config={'extra':'forbid'}
    courier_id:str=Field(min_length=1,max_length=255)
    expected_version:int=Field(ge=0)
    reason:str=Field(min_length=1,max_length=1000)

@router.post('/delivery-issues/{issue_id}/resolve')
async def resolve_delivery_issue(issue_id:int,body:IssueResolution,request:Request,db:AsyncSession=Depends(get_db)):
    from models.courier_workflow import CourierDeliveryIssue
    from services.courier_issues import resolve_issue
    await lock_dam_operations(db)
    claims=await food_staff(request,db);await require_partner_shift(db,claims)
    issue=await db.get(CourierDeliveryIssue,issue_id)
    if not issue:raise HTTPException(404,'Проблема не найдена')
    await order_for_panel(db,issue.order_id)
    await resolve_issue(db,issue,body.resolution,claims)
    await db.commit()
    from services.courier_notifications import notify_courier_task
    from models.logistics import LogisticsTask
    task=await db.get(LogisticsTask,issue.task_id)
    await notify_courier_task(db,task,'issue_resolved',version=issue.id)
    return {'ok':True}

@router.post('/orders/{order_id}/reassign-courier')
async def reassign_courier(order_id:int,body:CourierReassignment,request:Request,db:AsyncSession=Depends(get_db)):
    await lock_dam_operations(db)
    claims=await food_staff(request,db);await require_partner_shift(db,claims)
    if not body.reason.strip():raise HTTPException(422,'Укажите причину переназначения')
    from services.courier_issues import reassign
    task=await reassign(db,await order_for_panel(db,order_id),body,claims)
    return {'id':task.id,'courier_id':task.courier_id,'status':task.status}

def serialize(row):
    data = {c.name: getattr(row, c.name) for c in row.__table__.columns}
    if isinstance(row, Food_orders):
        data['order_source'] = data.get('order_source') or 'app'
        from services.dam_payment_flow import workflow_state, payment_state
        data['workflow_state'] = workflow_state(row)
        data['payment_state'] = payment_state(row)
    return data

async def order_for_panel(db, order_id):
    obj = await db.scalar(select(Food_orders).where(Food_orders.id == order_id, await scope(db)))
    if not obj:
        raise HTTPException(404, 'Заказ DAM ALEM не найден')
    return obj

@router.get('/orders')
async def orders(q: str = Query('', max_length=100), status: str = '', source: str = '', skip: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    settings = await schedule_settings(db)
    conditions = [await scope(db)]
    if status == 'preorders':
        conditions.append(future_condition(settings))
    elif status and status not in ('done', 'cancelled'):
        conditions.append(current_condition(settings))
    if status == 'active':
        conditions.append(Food_orders.status.notin_(['done', 'cancelled']))
    elif status == 'working':
        conditions.append(Food_orders.status.in_(['confirmed', 'preparing']))
    elif status == 'courier':
        conditions.extend([Food_orders.status == 'ready', Food_orders.delivery_method.in_(['delivery', 'доставка'])])
    elif status == 'ready_all':
        conditions.append(Food_orders.status == 'ready')
    elif status == 'ready':
        # The operator board separates pickup orders from deliveries waiting
        # for a courier, even though both use the same persisted order status.
        conditions.extend([
            Food_orders.status == 'ready',
            or_(Food_orders.delivery_method.is_(None), Food_orders.delivery_method.notin_(['delivery', 'доставка'])),
        ])
    elif status and status != 'preorders':
        conditions.append(Food_orders.status == status)
    if source:
        if source not in ('app', 'operator', 'whatsapp', 'instagram'):
            raise HTTPException(422, 'Неизвестный источник заказа')
        conditions.append(func.coalesce(Food_orders.order_source, 'app') == source)
    if q.strip():
        needle = '%' + q.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
        terms = [c.ilike(needle, escape='\\') for c in (Food_orders.customer_name, Food_orders.customer_phone, Food_orders.delivery_address)]
        if q.strip().isdigit():
            terms.append(Food_orders.id == int(q.strip()))
        conditions.append(or_(*terms))
    total = await db.scalar(select(func.count()).select_from(Food_orders).where(*conditions))
    ordering = (Food_orders.scheduled_for.asc(), Food_orders.id.asc()) if status == 'preorders' else (Food_orders.id.desc(),)
    rows = (await db.scalars(select(Food_orders).where(*conditions).order_by(*ordering).offset(skip).limit(limit))).all()
    return {'items': [{**serialize(r), **schedule_view(r, settings)} for r in rows], 'total': total}

@router.get('/order-counts')
async def order_counts(db: AsyncSession = Depends(get_db)):
    """Exact counters for the operator queue tabs."""
    settings = await schedule_settings(db)
    rows = (await db.execute(
        select(Food_orders.status, Food_orders.delivery_method, func.count())
        .where(await scope(db), current_condition(settings))
        .group_by(Food_orders.status, Food_orders.delivery_method)
    )).all()
    result = {'all': 0, 'new': 0, 'working': 0, 'ready': 0, 'courier': 0, 'in_progress': 0, 'done': 0, 'cancelled': 0, 'confirmed': 0, 'preparing': 0, 'ready_all': 0}
    for order_status, method, amount in rows:
        count = int(amount or 0)
        result['all'] += count
        if order_status == 'new':
            result['new'] += count
        elif order_status in ('confirmed', 'preparing'):
            result['working'] += count
            result[order_status] += count
        elif order_status == 'ready':
            result['ready_all'] += count
            result['courier' if method in ('delivery', 'доставка') else 'ready'] += count
        elif order_status in ('in_progress', 'done', 'cancelled'):
            result[order_status] += count

    from models.logistics import LogisticsTask
    assigned = await db.scalar(
        select(func.count()).select_from(LogisticsTask)
        .join(Food_orders, (LogisticsTask.source_type == 'food_orders') & (LogisticsTask.source_id == Food_orders.id))
        .where(await scope(db), Food_orders.status == 'ready', LogisticsTask.status == 'assigned')
    )
    result['preorders'] = int(await db.scalar(select(func.count()).select_from(Food_orders).where(await scope(db), future_condition(settings))))
    result['all'] += result['preorders']
    result['courier_assigned'] = int(assigned or 0)
    return result

@router.get('/deliveries')
async def deliveries(db: AsyncSession = Depends(get_db)):
    """Active restaurant deliveries, including orders not yet sent to dispatch."""
    from models.logistics import LogisticsTask, CourierProfile
    from models.auth import User
    rows = (await db.execute(
        select(Food_orders, LogisticsTask, User, CourierProfile)
        .outerjoin(LogisticsTask, (LogisticsTask.source_type == 'food_orders') & (LogisticsTask.source_id == Food_orders.id))
        .outerjoin(User, User.id == LogisticsTask.courier_id)
        .outerjoin(CourierProfile, CourierProfile.user_id == LogisticsTask.courier_id)
        .where(await scope(db), Food_orders.delivery_method.in_(['delivery', 'доставка']), Food_orders.status.notin_(['done', 'cancelled']))
        .order_by(Food_orders.id.asc())
    )).all()
    return {'items': [{
        'order_id': order.id, 'status': order.status,
        'delivery_status': task.status if task else 'pending',
        'address': order.delivery_address, 'customer_name': order.customer_name,
        'total_amount': order.total_amount,
        'amount_due': max(0, float(order.total_amount or 0) - float(order.paid_amount if order.paid_amount is not None else order.total_amount if order.payment_status == 'paid' else 0)),
        'customer_delivery_fee': (task.customer_delivery_fee if task and task.customer_delivery_fee is not None else task.delivery_fee if task else 0),
        'courier_payout': (task.courier_payout if task and task.courier_payout is not None else task.delivery_fee if task else 0),
        'courier_name': courier.name if courier else None,
        'courier_phone': (profile.phone or courier.phone) if profile and courier else courier.phone if courier else None,
    } for order, task, courier, profile in rows]}

@router.get('/customer')
async def customer(phone: str = Query(min_length=10, max_length=32), db: AsyncSession = Depends(get_db)):
    from services import crm
    from models.crm import Customer, BusinessCustomer
    normalized=crm.normalize_phone(phone)
    matched=await db.scalar(select(Customer).join(BusinessCustomer,BusinessCustomer.customer_id==Customer.id).where(
        BusinessCustomer.business_id==crm.DAM, Customer.normalized_phone==normalized))
    if not matched: return {'loyalty':None,'name':'','addresses':[],'recent_orders':[]}
    info=await crm.overview(db,crm.DAM,matched.id,include_internal=True)
    await db.commit()
    return {**info, 'recent_orders':[{'id':r['id'],'amount':r['total_amount'],'status':r['status']} for r in info['recent']]}

@router.get('/orders/{order_id}')
async def detail(order_id: int, db: AsyncSession = Depends(get_db)):
    obj = await order_for_panel(db, order_id)
    events = (await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id == order_id).order_by(FoodOrderEvent.id.desc()))).all()
    from models.logistics import LogisticsTask, CourierProfile
    from models.auth import User
    delivery = (await db.execute(
        select(LogisticsTask, User, CourierProfile)
        .outerjoin(User, User.id == LogisticsTask.courier_id)
        .outerjoin(CourierProfile, CourierProfile.user_id == LogisticsTask.courier_id)
        .where(LogisticsTask.source_type == 'food_orders', LogisticsTask.source_id == order_id)
        .order_by(LogisticsTask.id.desc()).limit(1)
    )).first()
    delivery_data = None
    if delivery:
        task, courier, profile = delivery
        delivery_data = {
            'id': task.id,
            'status': task.status,
            'courier_name': courier.name if courier else None,
            'courier_phone': (profile.phone or courier.phone) if profile and courier else courier.phone if courier else None,
            'handed_at': task.handed_at, 'departed_at': task.departed_at, 'arrived_at': task.arrived_at,
            'picked_up_at': task.picked_up_at,
            'delivered_at': task.delivered_at,
        }
    from services.dam_payment_flow import current_payment, payment_state, workflow_state
    payment = await current_payment(db, obj)
    payment_view = {'payment_state':payment_state(obj, payment),
        'workflow_state':workflow_state(obj, delivery_data['status'] if delivery_data else None)}
    if payment:
        payment_view['payment_id'] = payment.id
    return {'order': {**serialize(obj), **payment_view, **schedule_view(obj, await schedule_settings(db))}, 'events': [serialize(e) for e in events], 'delivery': delivery_data}

class OrderChange(BaseModel):
    schedule_reason: str | None = Field(None, min_length=3, max_length=500)
    scheduled_for: str | None = Field(None, min_length=10, max_length=40)
    start_early: bool = False
    expected_version: int = Field(ge=0)
    status: Literal['new', 'confirmed', 'preparing', 'ready', 'in_progress', 'done', 'cancelled'] | None = None
    operator_note: str | None = Field(None, max_length=2000)
    cancellation_reason: str | None = Field(None, max_length=500)
    delivery_address: str | None = Field(None, max_length=1000)
    payment_status: Literal['pending', 'paid'] | None = None

class CourierAssignment(BaseModel):
    courier_id: str = Field(min_length=1, max_length=255)

@router.get('/couriers')
async def couriers(db: AsyncSession = Depends(get_db)):
    """Verified couriers available for explicit operator assignment."""
    from models.logistics import CourierProfile, LogisticsTask
    from models.auth import User
    rows = (await db.execute(
        select(User, CourierProfile)
        .join(CourierProfile, CourierProfile.user_id == User.id)
        .where(CourierProfile.is_verified.is_(True))
        .order_by(User.name, User.id)
    )).all()
    from services.food_shifts import active_shift
    items = []
    for user, profile in rows:
        on_shift = bool(await active_shift(db, 'courier', user.id))
        active = int(await db.scalar(select(func.count()).select_from(LogisticsTask).where(
            LogisticsTask.courier_id == str(user.id),
            LogisticsTask.status.in_(['assigned', 'picked_up', 'on_the_way', 'arrived'])
        )))
        enabled = bool(user.is_active and user.status == 'active')
        items.append({
            'id': str(user.id), 'name': user.name or profile.phone or user.phone or 'Курьер',
            'phone': profile.phone or user.phone or '', 'online': bool(profile.is_online),
            'on_shift': on_shift, 'active_delivery': bool(active), 'active_deliveries': active,
            'assignable': enabled and on_shift,
        })
    return {'items': items}

@router.post('/orders/{order_id}/assign-courier')
async def assign_courier(order_id: int, body: CourierAssignment, request: Request, db: AsyncSession = Depends(get_db)):
    await lock_dam_operations(db)
    order = await order_for_panel(db, order_id)
    if order.delivery_method not in ('delivery', 'доставка') or order.status != 'ready':
        raise HTTPException(409, 'Сначала отметьте заказ как готовый')
    actor = await food_staff(request, db)
    shift = await require_partner_shift(db, actor)
    from models.auth import User
    from models.logistics import CourierProfile
    from services.dam_order_workflow import task_for, sync_task
    from services.logistics_service import assign_dam_delivery
    courier = await db.get(User, body.courier_id)
    profile = await db.get(CourierProfile, body.courier_id)
    if not courier or not profile or not profile.is_verified:
        raise HTTPException(404, 'Курьер не найден или не подтверждён')
    task = await task_for(db, order)
    if not task:
        await sync_task(db, order)
        await db.flush()
        task = await task_for(db, order)
    if not task:
        raise HTTPException(409, 'Не удалось подготовить доставку')
    record_action(db, shift, 'courier_assigned', claims=actor, entity_type='order', entity_id=order_id,
        details={'courier_id': body.courier_id, 'courier_name': courier.name or profile.phone})
    try:
        task = await assign_dam_delivery(db, task, courier)
    except ValueError as exc:
        await db.rollback()
        raise HTTPException(409, str(exc)) from None
    return {'ok': True, 'task_id': task.id, 'status': task.status, 'courier_name': courier.name or profile.phone}

@router.patch('/orders/{order_id}')
async def change(order_id: int, body: OrderChange, request: Request, db: AsyncSession = Depends(get_db)):
    await lock_dam_operations(db)
    order = await order_for_panel(db, order_id)
    actor = await food_staff(request, db)
    values = body.model_dump(exclude_none=True, exclude_unset=True)
    if actor['access_role'] == 'operator' and order.status in ('done', 'cancelled') and not (order.status == 'done' and order.payment_method == 'cash' and set(values) <= {'expected_version', 'payment_status'} and body.payment_status == 'paid'):
        raise HTTPException(409, 'Завершённый заказ доступен оператору только для просмотра')
    shift = await require_partner_shift(db, actor)
    version = values.pop('expected_version')
    record_action(db, shift, 'order_updated', claims=actor, entity_type='order', entity_id=order_id, details={'source':'operator','before':{k:getattr(order,k,None) for k in values},'after':values})
    result = await Food_ordersService(db).update(order_id, values, expected_version=version, actor=str(actor.get('display_name') or actor.get('username') or actor.get('sub') or actor.get('partner_type') or 'Оператор'))
    return serialize(result)

@router.post('/orders/{order_id}/notifications/{event_id}/retry')
async def retry(order_id: int, event_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    order = await order_for_panel(db, order_id)
    actor = await food_staff(request, db)
    if actor['access_role'] == 'operator' and order.status in ('done', 'cancelled'):
        raise HTTPException(409, 'Завершённый заказ доступен оператору только для просмотра')
    shift = await require_partner_shift(db, actor)
    result = await db.execute(update(FoodOrderEvent).where(FoodOrderEvent.id == event_id, FoodOrderEvent.order_id == order_id, FoodOrderEvent.notification.in_(['failed', 'unknown', 'pending'])).values(notification='pending', retry_at=0, attempts=0, error=None))
    if not result.rowcount:
        await db.rollback()
        raise HTTPException(409, 'Уведомление уже отправлено или отправляется')
    record_action(db, shift, 'notification_retried', claims=actor, entity_type='order', entity_id=order_id, details={'event_id':event_id})
    await db.commit()
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

# Server-priced manual orders and versioned receipt changes.
class ReceiptLine(BaseModel):
    line_index: int | None = Field(None, ge=0)
    id: int | None = Field(None, gt=0)
    quantity: int = Field(ge=1, le=99)
    modifiers: list[dict] = Field(default_factory=list, max_length=30)
    choices: list[dict] = Field(default_factory=list, max_length=30)

class ReceiptChange(BaseModel):
    selected_gift_id: str | None = Field(None, max_length=100)
    expected_version: int = Field(ge=0)
    items: list[ReceiptLine] = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=3, max_length=500)
    quoted_total: float | None = Field(None, ge=0, allow_inf_nan=False)

class ManualOrder(BaseModel):
    bonus_points_to_use: float = Field(0, ge=0, le=100000000, allow_inf_nan=False)
    scheduled_for: str | None = Field(None, max_length=40)
    promo_code: str = Field('', max_length=80)
    selected_gift_id: str | None = Field(None, max_length=100)
    request_key: str = Field(min_length=16, max_length=64, pattern=r'^[a-zA-Z0-9-]+$')
    customer_name: str = Field(min_length=1, max_length=150)
    customer_phone: str = Field('', max_length=32)
    delivery_address: str = Field('', max_length=1000)
    delivery_method: Literal['pickup', 'delivery', 'dine_in'] = 'delivery'
    delivery_fee: float | None = Field(None, ge=0, le=50_000, allow_inf_nan=False)
    cash_given_amount: float | None = Field(None, ge=0, le=100000000, allow_inf_nan=False)
    payment_method: Literal['cash', 'kaspi_qr', 'halyk_qr'] = 'cash'
    comment: str = Field('', max_length=1000)
    items: list[ReceiptLine] = Field(min_length=1, max_length=100)
    quoted_total: float | None = Field(None, ge=0, allow_inf_nan=False)

@router.get('/catalog')
async def operator_catalog(db: AsyncSession = Depends(get_db)):
    from models.food_items import Food_items
    from models.food_categories import Food_categories
    from models.food_restaurants import Food_restaurants
    from models.modifier_groups import Modifier_groups
    from models.modifier_options import Modifier_options
    from models.item_modifier_groups import Item_modifier_groups
    from services.food_operations import brand
    from services.food_settings import Food_settingsService
    from services.gastronom_delivery import parse_delivery_zones
    restaurants = (await db.scalars(select(Food_restaurants))).all()
    ids = [r.id for r in restaurants if brand(r.name, r.merchant_key)]
    products = (await db.scalars(select(Food_items).where(or_(Food_items.restaurant_id.in_(ids), Food_items.restaurant_id.is_(None)), Food_items.is_active.is_not(False), Food_items.available.is_not(False), Food_items.price > 0).order_by(Food_items.sort_order, Food_items.id))).all()
    groups = (await db.scalars(select(Modifier_groups).where(Modifier_groups.is_active.is_not(False)))).all()
    options = (await db.scalars(select(Modifier_options).where(Modifier_options.is_active.is_not(False)).order_by(Modifier_options.sort_order, Modifier_options.id))).all()
    links = (await db.scalars(select(Item_modifier_groups))).all()
    categories = (await db.scalars(select(Food_categories).where(or_(Food_categories.restaurant_id.in_(ids), Food_categories.restaurant_id.is_(None)), Food_categories.is_active.is_not(False)).order_by(Food_categories.sort_order, Food_categories.id))).all()
    settings = await Food_settingsService(db).get_all_as_dict()
    configured = []
    for zone in parse_delivery_zones(settings):
        price = float(zone['price'])
        if not any(abs(option['price'] - price) < 0.01 for option in configured):
            configured.append({'id': zone['id'], 'name': zone['name'], 'price': price})
    try:
        fallback = float(settings.get('delivery_price') or settings.get('delivery_fee') or 0)
    except (TypeError, ValueError):
        fallback = 0.0
    if fallback > 0 and not any(abs(option['price'] - fallback) < 0.01 for option in configured):
        configured.append({'id': 'standard', 'name': 'Стандартная доставка', 'price': fallback})
    quick_prices = [0.0, 600.0, 800.0, 1200.0]
    for price in quick_prices:
        if not any(abs(option['price'] - price) < 0.01 for option in configured):
            configured.append({'id': f'quick-{int(price)}', 'name': 'Бесплатно' if price == 0 else f'Доставка {int(price)} ₸', 'price': price})
    from services.menu_configuration import catalog
    current = await catalog(db)
    # Compatibility with legacy test/unscoped restaurant fixtures. Real migrated
    # restaurants carry business_id and use the common scoped catalog.
    if current['restaurant_id'] is not None:
        return {**current, 'products': [p for p in current['products'] if p['sellable']], 'delivery_options': configured}
    return {'categories': [serialize(x) for x in categories], 'products': [serialize(x) for x in products], 'groups': [serialize(x) for x in groups], 'options': [serialize(x) for x in options], 'links': [serialize(x) for x in links], 'delivery_options': configured}

@router.post('/manual/quote')
async def quote_manual(body: ManualOrder, db: AsyncSession = Depends(get_db)):
    from services.dam_order_workflow import manual_quote
    _, quote = await manual_quote(db, body)
    return quote

@router.post('/manual', status_code=201)
async def create_manual(body: ManualOrder, request: Request, db: AsyncSession = Depends(get_db)):
    from models.food_operations import FoodOrderRequest
    from services.dam_order_workflow import manual_quote, money
    from sqlalchemy.exc import IntegrityError
    await lock_dam_operations(db)
    actor = await food_staff(request, db)
    shift = await require_partner_shift(db, actor)
    key = str(actor.get('staff_id') or 'admin') + ':' + body.request_key
    request_hash = hashlib.sha256(json.dumps(body.model_dump(exclude={'request_key'}), sort_keys=True).encode()).hexdigest()
    previous = await db.get(FoodOrderRequest, key)
    if previous:
        if previous.payload_hash and previous.payload_hash != request_hash:
            raise HTTPException(409, 'Этот запрос уже оформлен с другим составом')
        return serialize(await order_for_panel(db, previous.order_id))
    data, quote = await manual_quote(db, body)
    if quote['gift_required']:
        raise HTTPException(409, 'Выберите подарок для клиента')
    if body.quoted_total is None or money(body.quoted_total) != money(quote['total_amount']):
        raise HTTPException(409, 'Расчёт изменился. Рассчитайте заказ заново.')
    action_entry = record_action(db, shift, 'order_created', claims=actor, entity_type='order_request', entity_id=body.request_key, details={'source':'operator','total':quote['total_amount']})
    try:
        order = await Food_ordersService(db).create(data, request_key=key, request_hash=request_hash,
            actor=str(actor.get('display_name') or 'Оператор'), staff_action=action_entry)
    except IntegrityError:
        await db.rollback()
        previous = await db.get(FoodOrderRequest, key)
        if not previous:
            raise
        if previous.payload_hash and previous.payload_hash != request_hash:
            raise HTTPException(409, 'Этот запрос уже оформлен с другим составом')
        order = await order_for_panel(db, previous.order_id)
    return serialize(order)

@router.post('/orders/{order_id}/receipt/quote')
async def quote_receipt(order_id: int, body: ReceiptChange, db: AsyncSession = Depends(get_db)):
    from services.dam_order_workflow import quote_change
    return await quote_change(db, await order_for_panel(db, order_id), body)

@router.post('/orders/{order_id}/receipt')
async def change_receipt(order_id: int, body: ReceiptChange, request: Request, db: AsyncSession = Depends(get_db)):
    from services.dam_order_workflow import amend
    if len(body.reason.strip()) < 3:
        raise HTTPException(422, 'Укажите причину изменения')
    actor = await food_staff(request, db)
    shift = await require_partner_shift(db, actor)
    record_action(db, shift, 'order_receipt_changed', claims=actor, entity_type='order', entity_id=order_id, details={'reason':body.reason.strip()})
    try:
        result = await amend(db, await order_for_panel(db, order_id), body, str(actor.get('display_name') or 'Оператор'))
        return serialize(result)
    except Exception:
        await db.rollback()
        raise
