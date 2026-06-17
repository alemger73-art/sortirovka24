"""Shared account_v2 authentication helpers for domain routers."""

from datetime import datetime, timezone

from core.auth import decode_access_token
from fastapi import HTTPException
from models.auth import User
from models.user_management import UserSession
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.timeutils import as_aware_utc


async def get_account_user(db: AsyncSession, authorization: str | None) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = str(payload.get("sub") or "")
    jti = str(payload.get("jti") or "")
    if not user_id or not jti:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    session = (
        await db.execute(
            select(UserSession).where(
                and_(UserSession.user_id == user_id, UserSession.token_jti == jti, UserSession.is_active == True)
            )
        )
    ).scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Session is not active")
    session_expiry = as_aware_utc(session.expires_at)
    if session_expiry and session_expiry < datetime.now(timezone.utc):
        session.is_active = False
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def assert_admin(user: User) -> None:
    if user.role not in {"moderator", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Admin access required")


def assert_driver(user: User) -> None:
    if user.role not in {"driver", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Driver role required")
