"""Compatibility adapters to the single business-scoped loyalty engine."""
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession
from models.auth import User
from services.account_session import resolve_account_user

async def resolve_optional_account_user(
    request: Request,
    db: AsyncSession,
) -> User | None:
    return await resolve_account_user(db, request.headers.get("authorization"))


async def spend_bonuses_for_order(db, *, user, food_order_id, points, discount):
    from services.loyalty import spend
    from models.food_orders import Food_orders
    await spend(db, user, await db.get(Food_orders, food_order_id))


async def refund_bonuses_for_order(db, *, user, food_order_id, points):
    from services.loyalty import policy, account, restore_spend
    from models.food_orders import Food_orders
    await policy(db, lock=True)
    await restore_spend(db, await account(db, user.id), await db.get(Food_orders, food_order_id))


def _phones_match(a, b):
    from services.crm import normalize_phone
    from fastapi import HTTPException
    try:return normalize_phone(a)==normalize_phone(b)
    except HTTPException:return False
