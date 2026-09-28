"""A schedule is independent of order source, fulfillment and persisted status."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import and_, or_, select, text, cast, String
from models.food_orders import Food_orders
from models.food_settings import Food_settings

DEFAULT_LEAD_MINUTES = 30
ACTIVE_STATUSES = ('new', 'confirmed', 'preparing', 'ready', 'in_progress')


def utcnow():
    return datetime.now(timezone.utc)


def parse_schedule(value):
    if not value:
        return None
    try:
        result = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        if result.tzinfo is None:
            raise ValueError()
        return result.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError):
        raise HTTPException(422, 'Укажите корректную дату и время предзаказа с часовым поясом') from None


LOCAL_TZ = timezone(timedelta(hours=5))


def preorder_policy(settings):
    def integer(key, default, lo, hi):
        try:
            return max(lo, min(hi, int(settings.get(key, default))))
        except (ValueError, TypeError):
            return default
    return {'enabled': str(settings.get('preorders_enabled', '1')).lower() in ('1','true','on'),
        'min_minutes': integer('preorder_min_minutes', 30, 0, 1440),
        'advance_days': integer('preorder_advance_days', 7, 1, 30),
        'step_minutes': integer('preorder_step_minutes', 30, 5, 120),
        'prepare_minutes': lead_minutes(settings)}


def validate_schedule(value, settings, current=None):
    scheduled = parse_schedule(value)
    if scheduled is None:
        return None
    p, current = preorder_policy(settings), current or utcnow()
    if not p['enabled']:
        raise HTTPException(422, 'Предзаказы временно отключены')
    if scheduled <= current or scheduled < current + timedelta(minutes=p['min_minutes']):
        raise HTTPException(422, f"Выберите время минимум через {p['min_minutes']} минут")
    local = scheduled.astimezone(LOCAL_TZ)
    if local.date() > current.astimezone(LOCAL_TZ).date() + timedelta(days=p['advance_days']):
        raise HTTPException(422, 'Дата вне доступного периода предзаказа')
    if local.second or local.microsecond or (local.hour*60+local.minute) % p['step_minutes']:
        raise HTTPException(422, 'Выберите доступный интервал времени')
    import json
    try:
        closed_dates=json.loads(settings.get('preorder_closed_dates','[]'))
    except (ValueError,TypeError):
        raise HTTPException(409,'Расписание временно недоступно. Обратитесь к оператору') from None
    if local.date().isoformat() in closed_dates:
        raise HTTPException(422,'В этот день предзаказы не принимаются')
    from services.food_order_validation import assert_kitchen_open
    assert_kitchen_open(settings, scheduled)
    return scheduled.isoformat(timespec='seconds')


def available_slots(settings, current=None):
    from datetime import time
    current, p = current or utcnow(), preorder_policy(settings)
    import json
    try: p['closed_dates']=json.loads(settings.get('preorder_closed_dates','[]'))
    except (ValueError,TypeError): p['closed_dates']=[]
    days = []
    if p['enabled']:
        for offset in range(p['advance_days']+1):
            day = current.astimezone(LOCAL_TZ).date()+timedelta(days=offset)
            slots = []
            for minute in range(0, 1440, p['step_minutes']):
                local = datetime.combine(day, time(minute//60, minute%60), tzinfo=LOCAL_TZ)
                try:
                    value = validate_schedule(local.isoformat(), settings, current)
                    slots.append({'value': value, 'label': local.strftime('%H:%M')})
                except HTTPException:
                    continue
            if slots:
                days.append({'date': day.isoformat(), 'slots': slots})
    return {'timezone': 'Asia/Almaty', 'policy': p, 'days': days, 'server_time': current.isoformat()}


def pickup_view(settings):
    import json
    try:
        data = json.loads(settings.get('pickup_location', '{}'))
    except (TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    return {'display_name': 'DÄM ALEM 2.0', 'address': 'Парк Железнодорожников',
        'instructions': 'Ориентир: бывший фонтан', 'photo': '', 'latitude': None, 'longitude': None, **data}


def lead_minutes(settings):
    try:
        return max(0, min(1440, int(settings.get('preorder_lead_minutes', DEFAULT_LEAD_MINUTES))))
    except (ValueError, TypeError):
        return DEFAULT_LEAD_MINUTES


async def schedule_settings(db):
    return {r.setting_key: r.setting_value for r in (await db.scalars(select(Food_settings))).all()}


def future_condition(settings, current=None):
    cutoff = ((current or utcnow()) + timedelta(minutes=lead_minutes(settings))).isoformat(timespec='seconds')
    return and_(Food_orders.scheduled_for.is_not(None), Food_orders.scheduled_for > cutoff,
                Food_orders.status.in_(('new', 'confirmed')))


def current_condition(settings):
    # Explicit NULL handling keeps ordinary legacy orders in the queue.
    cutoff = (utcnow() + timedelta(minutes=lead_minutes(settings))).isoformat(timespec='seconds')
    return or_(Food_orders.scheduled_for.is_(None), Food_orders.scheduled_for <= cutoff,
               Food_orders.status.notin_(('new', 'confirmed')))


def schedule_view(order, settings):
    when = parse_schedule(order.scheduled_for)
    future = bool(when and order.status in ('new', 'confirmed') and when > utcnow() + timedelta(minutes=lead_minutes(settings)))
    local_day = utcnow().astimezone(timezone(timedelta(hours=5))).date()
    days = (when.astimezone(timezone(timedelta(hours=5))).date() - local_day).days if when else 0
    return {'preorder_bucket': 'Сегодня' if days <= 0 else 'Завтра' if days == 1 else 'Позже', 'scheduled_for': order.scheduled_for, 'is_future_preorder': future,
            'preparation_due_at': (when - timedelta(minutes=lead_minutes(settings))).isoformat() if when else None}


async def lock_dam_operations(db):
    # Serialize creation/rescheduling and shift closing on PostgreSQL, including
    # phantom new orders that cannot be covered by row locks on existing orders.
    if db.bind.dialect.name == 'postgresql':
        await db.execute(text('SELECT pg_advisory_xact_lock(24002701)'))


async def due_reminders(db):
    """Existing worker, durable event key; never auto-send an order to kitchen."""
    from sqlalchemy import exists
    from models.food_operations import FoodOrderEvent
    from services.food_operations import scope
    from services.dam_payment_flow import emit
    settings = await schedule_settings(db)
    rows = (await db.scalars(select(Food_orders).where(await scope(db), Food_orders.scheduled_for.is_not(None),
        current_condition(settings), Food_orders.status.in_(('new','confirmed')),
        ~exists(select(FoodOrderEvent.id).where(FoodOrderEvent.event_key == ('preorder-due:' + cast(Food_orders.id, String) + ':' + Food_orders.scheduled_for)))).order_by(Food_orders.scheduled_for).limit(200))).all()
    for order in rows:
        key = f'preorder-due:{order.id}:{order.scheduled_for}'
        if not await db.scalar(select(FoodOrderEvent.id).where(FoodOrderEvent.event_key == key)):
            emit(db, order, 'PREORDER_DUE', 'Система', key=key, scheduled_for=order.scheduled_for)
    await db.commit()
