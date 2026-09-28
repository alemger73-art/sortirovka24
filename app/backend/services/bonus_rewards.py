"""Bonus rewards for registered users (orders, etc.)."""

import logging

from models.auth import User
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

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
    # Only a verified canonical identity can receive personal notifications.
    from models.crm import CustomerIdentity, Customer
    return await db.scalar(select(User).join(Customer, Customer.user_id == User.id)
        .join(CustomerIdentity, CustomerIdentity.customer_id == Customer.id)
        .where(CustomerIdentity.normalized_phone == '+'+target, Customer.verified_at.is_not(None),
               User.phone_verified_at.is_not(None), User.is_active.is_(True)))



async def link_food_order_to_user(
    db: AsyncSession,
    *,
    customer_phone: str | None,
    food_order_id: int,
    total_amount: float | None,
    restaurant_name: str | None,
    status: str | None,
) -> None:
    """Compatibility hook; the cabinet now reads Food_orders via Customer.

    Do not mirror food orders into the unrelated legacy Order table. Existing
    history is preserved; new records have one source of truth.
    """
    return None


async def settle_food_order_bonus(db, order):
    from services.loyalty import settle
    await settle(db, order)


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
