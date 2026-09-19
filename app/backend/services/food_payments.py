"""Immutable money movements in the existing order event journal.

Callers hold the order version lock and commit these entries with the order.
paid_amount is the money currently retained, not the revised receipt total.
"""
import json
from decimal import Decimal
from sqlalchemy import select
from models.food_operations import FoodOrderEvent
from models.food_business import FoodRefund
from services.food_operations import add_event, now
from services.dam_order_workflow import money, paid


def movement(event):
    try:
        value = json.loads(event.public_data or '{}')
        return value if isinstance(value, dict) and value.get('kind') == 'cash_movement' else None
    except (ValueError, TypeError):
        return None


def record(db, order, amount, actor, *, at=None, method=None):
    amount = money(amount)
    event = add_event(db, order, f"{'Оплата' if amount >= 0 else 'Возврат'}: {abs(amount)} ₸", actor, notify=False)
    event.created_at = at or now()
    event.public_data = json.dumps({'kind': 'cash_movement', 'amount': str(amount),
        'method': method or order.payment_method or 'unknown'}, ensure_ascii=False)
    return event


async def preserve_legacy_payment(db, order):
    events = (await db.scalars(select(FoodOrderEvent).where(FoodOrderEvent.order_id == order.id))).all()
    if any(movement(e) for e in events):
        return
    received = paid(order)
    if received > 0:
        # Keep missing dates missing rather than inventing historical revenue today.
        record(db, order, received, 'Система', at=order.paid_at or 'undated')
    previous_refund = await db.get(FoodRefund, order.id)
    if previous_refund:
        order.paid_amount = float(max(Decimal(0), received - money(previous_refund.amount)))
    elif received > 0:
        order.paid_amount = float(received)
    await db.flush()


async def receive_outstanding(db, order, actor):
    await preserve_legacy_payment(db, order)
    outstanding = max(Decimal(0), money(order.total_amount) - paid(order))
    if outstanding:
        record(db, order, outstanding, actor)
        order.paid_amount = float(paid(order) + outstanding)
    order.paid_at = order.paid_at or now()
