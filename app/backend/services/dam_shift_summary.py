"""An immutable closing snapshot, using the existing order and payment journal."""
import json
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from models.food_orders import Food_orders
from models.food_operations import FoodOrderEvent
from models.food_shifts import FoodStaffAction
from services.food_operations import scope
from services.dam_order_workflow import money


def utc(value):
    dt = datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


async def summary(db, shift):
    # Scope is deliberately explicit: orders handled by this employee in this
    # shift; receipts cover business money events during the same time interval.
    actions = (await db.scalars(select(FoodStaffAction).where(FoodStaffAction.shift_id == shift.id,
        FoodStaffAction.entity_type == 'order'))).all()
    ids = {int(a.entity_id) for a in actions if str(a.entity_id).isdigit()}
    orders = (await db.scalars(select(Food_orders).where(await scope(db), Food_orders.id.in_(ids)))).all()
    start = utc(shift.opened_at)
    end = utc(shift.closed_at) if shift.closed_at else datetime.now(timezone.utc)
    # Legacy journal dates may carry +05:00 or have no suffix. Text ordering
    # alone gives wrong boundaries. Prefilter days, then compare actual instants.
    conditions = [await scope(db),
        FoodOrderEvent.created_at >= (start-timedelta(days=1)).date().isoformat(),
        FoodOrderEvent.created_at < (end+timedelta(days=2)).date().isoformat()]
    events = (await db.scalars(select(FoodOrderEvent).join(Food_orders, Food_orders.id == FoodOrderEvent.order_id)
        .where(*conditions))).all()
    methods = {'kaspi_qr':money(0),'halyk_qr':money(0),'cash':money(0)}
    refunds = money(0)
    for event in events:
        try:
            if not start <= utc(event.created_at) <= end:
                continue
            data = json.loads(event.public_data or '{}')
        except (ValueError, TypeError, AttributeError):
            continue
        if data.get('kind') != 'cash_movement':
            continue
        amount = money(data.get('amount'))
        if amount < 0:
            refunds -= amount
        else:
            method = data.get('method') if data.get('method') in methods else 'unknown'
            methods[method] = methods.get(method, money(0)) + amount
    return {'orders':len(orders), 'delivered':sum(o.status == 'done' for o in orders),
        'cancelled':sum(o.status == 'cancelled' for o in orders),
        'sales':float(sum((money(o.total_amount) for o in orders if o.status == 'done'), money(0))),
        'receipts':float(sum(methods.values())), 'refunds':float(refunds),
        'payment_methods':{k:float(v) for k,v in methods.items()},
        'orders_scope':'Заказы, с которыми сотрудник работал в этой смене',
        'money_scope':'Поступления бизнеса за время смены; наличные включают деньги у курьеров',
        'unresolved':0}
