"""Shared account JWT session resolution for account_v2 and entity routers."""

from __future__ import annotations

from datetime import datetime, timezone

from core.auth import decode_access_token
from models.auth import User
from models.user_management import UserSession
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.timeutils import as_aware_utc


async def resolve_account_user(db: AsyncSession, authorization: str | None) -> User | None:
    """Return authenticated user or None when token is missing/invalid."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except Exception:
        return None
    user_id = str(payload.get("sub") or "")
    jti = str(payload.get("jti") or "")
    if not user_id or not jti:
        return None
    session = (
        await db.execute(
            select(UserSession).where(
                and_(UserSession.user_id == user_id, UserSession.token_jti == jti, UserSession.is_active == True)
            )
        )
    ).scalar_one_or_none()
    if not session:
        return None
    session_expiry = as_aware_utc(session.expires_at)
    if session_expiry and session_expiry < datetime.now(timezone.utc):
        session.is_active = False
        await db.commit()
        return None
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or user.status == "blocked" or user.status == "deleted":
        return None
    return user
