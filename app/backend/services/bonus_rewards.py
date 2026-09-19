"""Bonus rewards for registered users (orders, etc.)."""

import json
import logging
import os

from models.auth import User
from models.user_management import Bonus, Order, UserAction
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

FOOD_ORDER_BONUS_POINTS = float(os.getenv("FOOD_ORDER_BONUS_POINTS", "50"))
FOOD_ORDER_BONUS_PERCENT = float(os.getenv("FOOD_ORDER_BONUS_PERCENT", "0"))
FOOD_BONUS_AWARD_STATUS = os.getenv("FOOD_BONUS_AWARD_STATUS", "done").strip() or "done"


def phone_digits(phone: str | None) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 10:
        digits = "7" + digits
    return digits


async def find_user_by_phone(db: AsyncSession, phone: str | None) -> User | None:
    target = phone_digits(phone)
    if not target:
        return None
    users = (await db.execute(select(User).where(User.is_active == True))).scalars().all()
    for user in users:
        if phone_digits(user.phone) == target:
            return user
    return None


def _calc_food_bonus(total_amount: float | None) -> float:
    fixed = FOOD_ORDER_BONUS_POINTS
    if FOOD_ORDER_BONUS_PERCENT > 0 and total_amount:
        percent_bonus = round(float(total_amount) * FOOD_ORDER_BONUS_PERCENT / 100, 2)
        return max(fixed, percent_bonus)
    return fixed


async def _bonus_already_awarded(db: AsyncSession, user_id: str, food_order_id: int) -> bool:
    row = (
        await db.execute(
            select(UserAction).where(
                UserAction.user_id == user_id,
                UserAction.action == "bonus_food_order",
                UserAction.entity == "food_orders",
                UserAction.entity_id == str(food_order_id),
            )
        )
    ).scalar_one_or_none()
    return row is not None


async def link_food_order_to_user(
    db: AsyncSession,
    *,
    customer_phone: str | None,
    food_order_id: int,
    total_amount: float | None,
    restaurant_name: str | None,
    status: str | None,
) -> None:
    """Link food order to registered user cabinet history (no bonus yet)."""
    user = await find_user_by_phone(db, customer_phone)
    if not user:
        return

    details = f"Заказ еды #{food_order_id}"
    if restaurant_name:
        details = f"{restaurant_name} — заказ #{food_order_id}"

    db.add(
        Order(
            user_id=str(user.id),
            order_type="food",
            status=status or "new",
            amount=float(total_amount or 0),
            details=details,
        )
    )
    await db.commit()
    logger.info("[Bonus] Linked food order #%s to user %s", food_order_id, user.id)


async def settle_food_order_bonus(db, order):
    """Run before the order/payment transaction commits, including late payment."""
    from services.bonus_ledger import record_bonus
    from services.bonus_spending import refund_bonuses_for_order
    refund = order.status == 'cancelled' and float(order.bonus_points_used or 0) > 0
    award = order.status == FOOD_BONUS_AWARD_STATUS and order.payment_status == 'paid'
    if not (refund or award):
        return
    user = await find_user_by_phone(db, order.customer_phone)
    if not user:
        return
    if refund:
        await refund_bonuses_for_order(db, user=user, food_order_id=order.id,
            points=float(order.bonus_points_used or 0))
    elif order.status == FOOD_BONUS_AWARD_STATUS and order.payment_status == 'paid':
        points = _calc_food_bonus(order.total_amount)
        if points > 0:
            await record_bonus(db, user=user, order_id=order.id,
                action='bonus_food_order', points=points,
                reason=f'Бонус за заказ еды #{order.id}')


async def award_food_order_bonus(db, *, customer_phone, food_order_id, total_amount):
    from models.food_orders import Food_orders
    order = await db.get(Food_orders, food_order_id)
    if order:
        await settle_food_order_bonus(db, order)
        await db.commit()


async def handle_food_order_status_bonus(db, *, customer_phone, food_order_id,
        total_amount, old_status, new_status, bonus_points_used=None):
    # Compatibility for older callers; the entry is idempotent under the user lock.
    await award_food_order_bonus(db, customer_phone=customer_phone,
        food_order_id=food_order_id, total_amount=total_amount)


reward_food_order = link_food_order_to_user
