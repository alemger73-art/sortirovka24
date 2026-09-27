"""A schedule is independent of order source, fulfillment and persisted status."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import and_, or_, select, text
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


def validate_schedule(value, settings):
    scheduled = parse_schedule(value)
    if scheduled is None:
        return None
    if scheduled <= utcnow():
        raise HTTPException(422, 'Время предзаказа должно быть в будущем')
    from services.food_order_validation import assert_kitchen_open
    assert_kitchen_open(settings, scheduled)
    return scheduled.isoformat(timespec='seconds')


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
