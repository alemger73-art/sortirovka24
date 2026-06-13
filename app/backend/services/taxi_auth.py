"""Taxi authentication — portal admin JWT + account_v2 user sessions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from core.auth import AccessTokenError, decode_access_token
from fastapi import HTTPException
from models.auth import User
from models.user_management import UserSession
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class TaxiAdminAuth:
    """Admin caller — system portal and/or account admin user."""

    is_portal_admin: bool
    portal_username: str = ""
    user: Optional[User] = None

    @property
    def label(self) -> str:
        if self.user:
            return self.user.name or self.user.phone or str(self.user.id)
        return self.portal_username or "admin"


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    return authorization.split(" ", 1)[1].strip()


def _decode_payload(token: str) -> dict:
    try:
        return decode_access_token(token)
    except AccessTokenError as e:
        raise HTTPException(status_code=401, detail=e.message)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


def _is_portal_admin_payload(payload: dict) -> bool:
    return payload.get("role") == "admin" and (
        payload.get("type") == "admin_session" or str(payload.get("sub", "")).startswith("admin:")
    )


async def _load_account_user(db: AsyncSession, payload: dict) -> User:
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
    if session.expires_at and session.expires_at < datetime.now(timezone.utc):
        session.is_active = False
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_taxi_user(db: AsyncSession, authorization: str | None) -> User:
    """Account_v2 user (passenger / driver) — requires active session."""
    token = _extract_bearer(authorization)
    payload = _decode_payload(token)
    if _is_portal_admin_payload(payload):
        raise HTTPException(status_code=403, detail="Use passenger/driver account, not admin portal token")
    return await _load_account_user(db, payload)


async def require_taxi_admin(db: AsyncSession, authorization: str | None) -> TaxiAdminAuth:
    """System portal admin JWT OR account user with admin/moderator role."""
    token = _extract_bearer(authorization)
    payload = _decode_payload(token)

    if _is_portal_admin_payload(payload):
        return TaxiAdminAuth(
            is_portal_admin=True,
            portal_username=str(payload.get("username") or payload.get("sub") or "admin"),
        )

    user = await _load_account_user(db, payload)
    if user.role not in {"moderator", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Admin access required")
    return TaxiAdminAuth(is_portal_admin=False, user=user, portal_username=str(user.id))


def assert_driver_user(user: User) -> None:
    if user.role not in {"driver", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Driver role required")
