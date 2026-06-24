"""Link store orders to account users when Authorization header is present."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from models.auth import User
from services.account_session import resolve_account_user


async def optional_account_user(
    db: AsyncSession,
    authorization: str | None,
) -> User | None:
    return await resolve_account_user(db, authorization)


def user_id_for_order(user: User | None) -> str | None:
    if not user:
        return None
    return str(user.id)
