"""Bonus spending rules and ledger operations for Sortirovka24."""

from __future__ import annotations

import json
import logging
import math
import os
from typing import Any, Optional

from fastapi import HTTPException, Request
from models.auth import User
from models.user_management import Bonus, UserAction
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import AccessTokenError, decode_access_token
from services.bonus_rewards import find_user_by_phone, phone_digits

logger = logging.getLogger(__name__)

BONUS_TENGE_RATE = float(os.getenv("BONUS_TENGE_RATE", "1"))
BONUS_MAX_ORDER_PERCENT = float(os.getenv("BONUS_MAX_ORDER_PERCENT", "30"))
BONUS_SPENDING_ENABLED = os.getenv("BONUS_SPENDING_ENABLED", "true").strip().lower() not in {
    "0",
    "false",
    "no",
    "off",
}


def bonus_rules_public() -> dict[str, Any]:
    return {
        "enabled": BONUS_SPENDING_ENABLED,
        "tenge_rate": BONUS_TENGE_RATE,
        "max_order_percent": BONUS_MAX_ORDER_PERCENT,
        "modules": ["dam_alem"],
        "earn": {
            "welcome_points": float(os.getenv("WELCOME_BONUS_POINTS", "300")),
            "food_order_points": float(os.getenv("FOOD_ORDER_BONUS_POINTS", "50")),
            "award_on_status": "done",
        },
        "spend": {
            "login_required": True,
            "exclusive_with_promo": True,
            "applies_to": "subtotal",
        },
    }


async def resolve_optional_account_user(
    request: Request,
    db: AsyncSession,
) -> User | None:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except AccessTokenError:
        return None
    if payload.get("role") == "admin" and payload.get("username"):
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    user = (await db.execute(select(User).where(User.id == str(user_id)))).scalar_one_or_none()
    if not user or not user.is_active or user.status == "blocked":
        return None
    return user


def _phones_match(a: str | None, b: str | None) -> bool:
    da, db_ = phone_digits(a), phone_digits(b)
    return bool(da and db_ and da == db_)


def calculate_bonus_discount(
    *,
    user: User,
    subtotal: float,
    total_before_bonus: float,
    bonus_points_requested: float,
    has_promo: bool,
) -> tuple[float, float]:
    """Return (points_to_use, discount_tenge)."""
    if not all(math.isfinite(float(value)) for value in (subtotal, total_before_bonus, bonus_points_requested, BONUS_TENGE_RATE, BONUS_MAX_ORDER_PERCENT)) or BONUS_TENGE_RATE <= 0 or not 0 <= BONUS_MAX_ORDER_PERCENT <= 100:
        raise HTTPException(400, 'Некорректные параметры списания бонусов')
    if not BONUS_SPENDING_ENABLED:
        raise HTTPException(status_code=400, detail="Списание бонусов временно недоступно")
    if has_promo:
        raise HTTPException(status_code=400, detail="Бонусы нельзя использовать вместе с промокодом")
    if bonus_points_requested <= 0:
        return 0.0, 0.0

    balance = float(user.bonus_balance or 0)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="Недостаточно бонусов")

    max_by_percent = round(subtotal * (BONUS_MAX_ORDER_PERCENT / 100.0), 2)
    max_by_total = round(max(0.0, total_before_bonus), 2)
    max_points = min(balance, max_by_percent / max(BONUS_TENGE_RATE, 0.0001), max_by_total / max(BONUS_TENGE_RATE, 0.0001))
    points = min(float(bonus_points_requested), max_points)
    points = math.floor(max(0.0, points) * 100 + 1e-9) / 100
    if points <= 0:
        raise HTTPException(status_code=400, detail="Нельзя списать бонусы для этого заказа")

    discount = round(points * BONUS_TENGE_RATE, 2)
    discount = min(discount, max_by_total)
    if discount <= 0:
        raise HTTPException(status_code=400, detail="Нельзя списать бонусы для этого заказа")
    points = round(discount / max(BONUS_TENGE_RATE, 0.0001), 2)
    return points, discount


async def spend_bonuses_for_order(db, *, user, food_order_id, points, discount):
    if points <= 0 or discount <= 0:
        return
    from services.bonus_ledger import record_bonus
    await record_bonus(db, user=user, order_id=food_order_id,
        action='bonus_spent_food_order', points=-points,
        reason=f'Списано за заказ еды #{food_order_id}',
        payload={'points': points, 'discount': discount})


async def refund_bonuses_for_order(db, *, user, food_order_id, points):
    if points <= 0:
        return
    from services.bonus_ledger import record_bonus
    await record_bonus(db, user=user, order_id=food_order_id,
        action='bonus_refund_food_order', points=points,
        reason=f'Возврат бонусов за отмену заказа #{food_order_id}')
