"""Structured closing report; delivery uses the existing Telegram event queue."""
from datetime import timedelta, timezone
from fastapi import HTTPException
from pydantic import BaseModel, Field, ConfigDict, model_validator
from sqlalchemy import select
from models.food_orders import Food_orders
from models.food_shifts import FoodShift, FoodShiftProcurement
from models.food_operations import FoodOrderEvent
from models.logistics import LogisticsTask
from models.auth import User
from services.food_operations import scope, now, LABELS
from services.food_preorders import ACTIVE_STATUSES, current_condition, schedule_settings


class ProcurementItem(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=120)
    quantity: float = Field(gt=0, le=100000, allow_inf_nan=False)
    unit: str = Field(min_length=1, max_length=20)
    comment: str = Field('', max_length=250)


class ProcurementReport(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    items: list[ProcurementItem] = Field(default_factory=list, max_length=50)
    not_required: bool = False
    reason: str = Field('', max_length=500)
    comment: str = Field('', max_length=1000)

    @model_validator(mode='after')
    def complete(self):
        if self.not_required:
            if self.items or len(self.reason) < 3:
                raise ValueError('Укажите причину, почему закуп не требуется; удалите позиции')
        elif not self.items:
            raise ValueError('Добавьте позиции закупа или отметьте «Закуп не требуется» и причину')
        size = len(self.reason)+len(self.comment)+sum(len(i.name)+len(i.unit)+len(i.comment)+40 for i in self.items)
        if size > 3400:
            raise ValueError('Отчёт слишком длинный для Telegram: сократите комментарии или разделите позиции')
        return self


async def close_blockers(db):
    settings = await schedule_settings(db)
    current = (await db.scalars(select(Food_orders).where(
        await scope(db), Food_orders.status.in_(ACTIVE_STATUSES), current_condition(settings)))).all()
    # Also surface inconsistent unfinished deliveries of already terminal orders.
    deliveries = (await db.execute(select(LogisticsTask, Food_orders, User)
        .join(Food_orders, (LogisticsTask.source_type == 'food_orders') & (LogisticsTask.source_id == Food_orders.id))
        .outerjoin(User, User.id == LogisticsTask.courier_id)
        .where(await scope(db), LogisticsTask.status.notin_(('delivered', 'cancelled')),
               current_condition(settings)))).all()
    items = {o.id: {'id': o.id, 'status': o.status, 'label': LABELS.get(o.status, o.status), 'courier': None} for o in current}
    for task, order, courier in deliveries:
        item = items.setdefault(order.id, {'id': order.id, 'status': 'in_progress', 'label': 'Незавершённая доставка', 'courier': None})
        item['courier'] = courier.name if courier else None
        item['delivery_status'] = task.status
    counts = {}
    for item in items.values():
        counts[item['status']] = counts.get(item['status'], 0) + 1
    return {'can_close': not items, 'orders': list(items.values()), 'counts': counts}


async def assert_can_close(db):
    result = await close_blockers(db)
    if not result['can_close']:
        raise HTTPException(409, {'code': 'active_orders', 'message': 'Смену пока нельзя закрыть', **result})


def enqueue_report(db, shift, report):
    row = FoodShiftProcurement(shift_id=shift.id, **report.model_dump())
    db.add(row)
    # Always durable, even with integration disabled. Worker waits for configuration.
    db.add(FoodOrderEvent(shift_id=shift.id, order_id=None, actor=shift.staff_name,
        message='Закуп после закрытия смены', created_at=now(), notification='pending'))
    return row


async def report_view(db, shift_id):
    report = await db.get(FoodShiftProcurement, shift_id)
    if not report:
        return None
    shift = await db.get(FoodShift, shift_id)
    event = await db.scalar(select(FoodOrderEvent).where(FoodOrderEvent.shift_id == shift_id))
    return {'shift_id': shift_id, 'staff_name': shift.staff_name, 'created_at': report.created_at,
            'opened_at': shift.opened_at, 'closed_at': shift.closed_at,
            'items': report.items, 'not_required': report.not_required, 'reason': report.reason,
            'comment': report.comment, 'telegram_status': event.notification if event else 'pending',
            'telegram_error': event.error if event else None}


async def report_text(db, shift_id):
    report = await report_view(db, shift_id)
    if not report:
        raise ValueError('Закупной отчёт не найден')
    def local(value):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone(timedelta(hours=5)))
    text = f"DÄM ALEM\nЗАКУП\n\nДата: {local(report['closed_at']):%d.%m.%Y}\nОператор: {report['staff_name']}\nСмена №{shift_id}: {local(report['opened_at']):%H:%M}–{local(report['closed_at']):%H:%M}\n"
    if report['not_required']:
        text += '\nЗакуп не требуется.\nПричина: ' + report['reason']
    else:
        for i, item in enumerate(report['items'], 1):
            text += f"\n{i}. {item['name']} — {item['quantity']:g} {item['unit']}"
            if item['comment']:
                text += f" ({item['comment']})"
    if report['comment']:
        text += '\n\nКомментарий: ' + report['comment']
    return text
