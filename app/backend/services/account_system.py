import bcrypt
import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, Optional
from uuid import uuid4

from core.auth import create_access_token
from models.account_system import (
    AccountAuditLog,
    AccountBonus,
    AccountFavorite,
    AccountNotification,
    AccountOrderHistory,
    AccountPaymentHistory,
    AccountRideHistory,
    AccountUser,
    DriverProfile,
    FeatureToggle,
    MasterProfile,
    PartnerProfile,
)
from models.announcements import Announcements
from models.complaints import Complaints
from models.news import News
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

LOGIN_ATTEMPTS: Dict[str, list[datetime]] = {}
MAX_LOGIN_ATTEMPTS = 5
LOGIN_WINDOW = timedelta(minutes=15)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_attempts(identifier: str) -> list[datetime]:
    now = datetime.now(timezone.utc)
    attempts = LOGIN_ATTEMPTS.get(identifier, [])
    attempts = [a for a in attempts if now - a <= LOGIN_WINDOW]
    LOGIN_ATTEMPTS[identifier] = attempts
    return attempts


def check_login_rate_limit(identifier: str) -> bool:
    return len(_clean_attempts(identifier)) < MAX_LOGIN_ATTEMPTS


def track_login_failure(identifier: str) -> None:
    attempts = _clean_attempts(identifier)
    attempts.append(datetime.now(timezone.utc))
    LOGIN_ATTEMPTS[identifier] = attempts


async def create_user(
    db: AsyncSession,
    email: Optional[str],
    phone: Optional[str],
    password: str,
    role: str,
    full_name: Optional[str],
    accepted_agreement: bool,
    accepted_privacy: bool,
) -> AccountUser:
    existing = await db.execute(
        select(AccountUser).where(or_(AccountUser.email == email, AccountUser.phone == phone))
    )
    if existing.scalar_one_or_none():
        raise ValueError("User with email or phone already exists")

    user = AccountUser(
        id=str(uuid4()),
        email=email,
        phone=phone,
        password_hash=hash_password(password),
        role=role,
        full_name=full_name,
        is_active=True,
        accepted_agreement=accepted_agreement,
        accepted_privacy=accepted_privacy,
        accepted_at=_now_iso(),
        created_at=_now_iso(),
    )
    db.add(user)
    await db.flush()

    if role == "master":
        db.add(MasterProfile(user_id=user.id, created_at=_now_iso()))
    elif role == "driver":
        db.add(DriverProfile(user_id=user.id, created_at=_now_iso()))
    elif role == "partner":
        db.add(PartnerProfile(user_id=user.id, created_at=_now_iso()))

    await db.commit()
    await db.refresh(user)
    return user


async def login_user(db: AsyncSession, identifier: str, password: str) -> AccountUser:
    if not check_login_rate_limit(identifier):
        raise PermissionError("Too many login attempts. Please try again later")

    result = await db.execute(
        select(AccountUser).where(or_(AccountUser.email == identifier, AccountUser.phone == identifier))
    )
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        track_login_failure(identifier)
        raise ValueError("Invalid credentials")
    if not user.is_active:
        raise PermissionError("Account is disabled")
    user.last_login_at = _now_iso()
    await db.commit()
    return user


def build_token_for_user(user: AccountUser) -> str:
    claims = {
        "sub": user.id,
        "email": user.email or "",
        "phone": user.phone or "",
        "name": user.full_name or "",
        "role": user.role,
        "last_login": user.last_login_at or _now_iso(),
    }
    return create_access_token(claims)


async def write_audit_log(
    db: AsyncSession,
    actor_user_id: Optional[str],
    action: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    meta: Optional[dict] = None,
) -> None:
    db.add(
        AccountAuditLog(
            actor_user_id=actor_user_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            meta=json.dumps(meta or {}, ensure_ascii=False),
            created_at=_now_iso(),
        )
    )
    await db.commit()


def to_generic_rows(items: Iterable, title_field: str, subtitle_field: Optional[str] = None):
    rows = []
    for item in items:
        rows.append(
            {
                "id": str(getattr(item, "id", "")),
                "title": str(getattr(item, title_field, "") or ""),
                "subtitle": str(getattr(item, subtitle_field, "") or "") if subtitle_field else None,
                "status": getattr(item, "status", None),
                "amount": float(getattr(item, "amount", 0) or 0) if hasattr(item, "amount") else None,
            }
        )
    return rows


async def ensure_default_feature_toggles(db: AsyncSession):
    defaults = [
        ("cabinet_enabled", True, "Enable personal cabinets"),
        ("driver_marketplace_enabled", True, "Enable driver order board"),
        ("partner_store_enabled", True, "Enable partner shop module"),
        ("bonus_program_enabled", True, "Enable bonuses and cashback"),
    ]
    for key, enabled, description in defaults:
        row = await db.execute(select(FeatureToggle).where(FeatureToggle.key == key))
        if not row.scalar_one_or_none():
            db.add(
                FeatureToggle(
                    key=key,
                    enabled=enabled,
                    description=description,
                    updated_by="system",
                    updated_at=_now_iso(),
                    created_at=_now_iso(),
                )
            )
    await db.commit()


async def seed_demo_cabinet_rows(db: AsyncSession, user_id: str) -> None:
    # only when user has no rows yet
    existing = await db.execute(select(AccountOrderHistory).where(AccountOrderHistory.user_id == user_id).limit(1))
    if existing.scalar_one_or_none():
        return
    now = _now_iso()
    db.add_all(
        [
            AccountOrderHistory(
                user_id=user_id,
                order_type="food",
                status="completed",
                amount=4500,
                details="Order #FD-1001",
                created_at=now,
            ),
            AccountRideHistory(
                user_id=user_id,
                from_address="Сортировка",
                to_address="Центр",
                status="completed",
                price=2200,
                created_at=now,
            ),
            AccountBonus(user_id=user_id, points=120, reason="Welcome bonus", created_at=now),
            AccountNotification(user_id=user_id, title="Добро пожаловать", body="Кабинет активирован", is_read=False, created_at=now),
            AccountPaymentHistory(user_id=user_id, amount=4500, currency="KZT", status="paid", provider="demo", created_at=now),
            AccountFavorite(user_id=user_id, entity_type="news", entity_id="1", created_at=now),
        ]
    )
    await db.commit()


def is_admin_role(role: str) -> bool:
    return role in {"admin", "superadmin"}


def is_superadmin(role: str) -> bool:
    return role == "superadmin"
