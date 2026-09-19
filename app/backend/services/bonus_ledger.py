"""Serialized, idempotent bonus entries in the caller's transaction."""
import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm.attributes import set_committed_value
from models.auth import User
from models.user_management import Bonus, UserAction


async def record_bonus(db, *, user, order_id, action, points, reason, payload=None):
    try:
        delta = Decimal(str(points))
        if not delta.is_finite():
            raise InvalidOperation()
        delta = delta.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        raise HTTPException(422, 'Некорректное количество бонусов') from None
    # An UPDATE locks the row on PostgreSQL and serializes writers on SQLite.
    # Do not use an ORM balance snapshot: two requests can load it before locking.
    with db.no_autoflush:
        locked = await db.execute(update(User).where(User.id == str(user.id)).values(
            bonus_balance=User.bonus_balance).execution_options(synchronize_session=False))
        if not locked.rowcount:
            raise HTTPException(409, 'Аккаунт недоступен')
        existing = await db.scalar(select(UserAction.id).where(
            UserAction.user_id == str(user.id), UserAction.action == action,
            UserAction.entity == 'food_orders', UserAction.entity_id == str(order_id)).limit(1))
        if existing:
            return False
        changed = await db.execute(update(User).where(
            User.id == str(user.id), User.bonus_balance >= max(0, -float(delta))).values(
            bonus_balance=User.bonus_balance + float(delta)).execution_options(synchronize_session=False))
        if not changed.rowcount:
            raise HTTPException(409, 'Баланс бонусов изменился. Пересчитайте заказ.')
        balance = await db.scalar(select(User.bonus_balance).where(User.id == str(user.id)))
        set_committed_value(user, 'bonus_balance', balance)
    db.add(Bonus(user_id=str(user.id), points=float(delta), reason=reason))
    db.add(UserAction(user_id=str(user.id), action=action, entity='food_orders',
        entity_id=str(order_id), payload=json.dumps(payload or {'points': float(delta)}, ensure_ascii=False)))
    await db.flush()
    return True
