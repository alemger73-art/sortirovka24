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
FOOD_ORDER_BONUS_PERCENT = float(os.getenv("FOOD_ORDER_BONUS_PERCENT", "0"))  # 0 = fixed only


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


async def link_food_order_to_user(
    db: AsyncSession,
    *,
    customer_phone: str | None,
    food_order_id: int,
    total_amount: float | None,
    restaurant_name: str | None,
    status: str | None,
) -> None:
    """Link food order to registered user: cabinet history + optional bonus."""
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

    points = _calc_food_bonus(total_amount)
    if points > 0:
        db.add(
            Bonus(
                user_id=str(user.id),
                points=points,
                reason=f"Бонус за заказ еды #{food_order_id}",
            )
        )
        user.bonus_balance = float(user.bonus_balance or 0) + points
        db.add(
            UserAction(
                user_id=str(user.id),
                action="bonus_food_order",
                entity="food_orders",
                entity_id=str(food_order_id),
                payload=json.dumps({"points": points, "amount": total_amount}, ensure_ascii=False),
            )
        )

    await db.commit()
    if points > 0:
        logger.info("[Bonus] Awarded %s points to user %s for food order #%s", points, user.id, food_order_id)
    else:
        logger.info("[Bonus] Linked food order #%s to user %s (no bonus points)", food_order_id, user.id)


# Backward-compatible alias
reward_food_order = link_food_order_to_user
