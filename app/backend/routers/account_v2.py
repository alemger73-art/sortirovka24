import bcrypt
import json
import hashlib
import random
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from core.auth import create_access_token, decode_access_token
from core.config import settings
from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from models.announcements import Announcements
from models.auth import User
from models.complaints import Complaints
from models.user_management import Bonus, Order, PhoneVerification, UserAction, UserSession
from schemas.account_v2 import (
    AdminUserUpdateRequest,
    AuthV2Response,
    ConfirmRegistrationRequest,
    DashboardStatsResponse,
    LoginV2Request,
    RequestSmsCodeRequest,
    RequestSmsCodeResponse,
    RegisterV2Request,
    UserV2Response,
    UserV2UpdateRequest,
)
from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/account", tags=["account-v2"])

LOGIN_ATTEMPTS: dict[str, list[datetime]] = {}
LOGIN_WINDOW = timedelta(minutes=15)
MAX_ATTEMPTS = 6
SMS_CODE_TTL_MINUTES = 5
MAX_SMS_VERIFY_ATTEMPTS = 5


def _hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _verify_password(raw: str, password_hash: str) -> bool:
    return bcrypt.checkpw(raw.encode("utf-8"), (password_hash or "").encode("utf-8"))


def _normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("8"):
        digits = "7" + digits[1:]
    if not digits.startswith("7"):
        digits = "7" + digits
    return f"+{digits}"


def _hash_sms_code(phone: str, code: str) -> str:
    return hashlib.sha256(f"{phone}:{code}".encode("utf-8")).hexdigest()


def _clean_attempts(phone: str) -> list[datetime]:
    now = datetime.now(timezone.utc)
    attempts = [a for a in LOGIN_ATTEMPTS.get(phone, []) if now - a <= LOGIN_WINDOW]
    LOGIN_ATTEMPTS[phone] = attempts
    return attempts


def _to_user_response(user: User) -> UserV2Response:
    return UserV2Response(
        id=str(user.id),
        name=user.name or "",
        phone=user.phone or "",
        email=user.email,
        role=user.role,  # type: ignore[arg-type]
        status=user.status or "active",
        avatar=user.avatar_url,
        language=user.language or "ru",
        bonus_balance=float(user.bonus_balance or 0),
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


async def _log_action(
    db: AsyncSession,
    user_id: str | None,
    action: str,
    entity: str | None = None,
    entity_id: str | None = None,
    payload: dict | None = None,
):
    db.add(
        UserAction(
            user_id=user_id,
            action=action,
            entity=entity,
            entity_id=entity_id,
            payload=json.dumps(payload or {}, ensure_ascii=False),
        )
    )
    await db.commit()


async def _current_user(
    db: AsyncSession,
    authorization: str | None,
) -> User:
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
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _assert_admin(user: User):
    if user.role not in {"moderator", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/register", response_model=AuthV2Response)
async def register(
    request: RegisterV2Request,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_phone = _normalize_phone(request.phone)
    existing = (
        await db.execute(
            select(User).where((User.phone == normalized_phone) | (User.email == request.email))
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User with phone/email already exists")
    if not request.agreement_accepted or not request.privacy_accepted:
        raise HTTPException(status_code=400, detail="Agreement and privacy acceptance required")

    user = User(
        id=str(uuid4()),
        name=request.name.strip(),
        phone=normalized_phone,
        email=request.email,
        password_hash=_hash_password(request.password),
        avatar_url=request.avatar,
        language=request.language,
        agreement_accepted=request.agreement_accepted,
        privacy_accepted=request.privacy_accepted,
        role="user",
        status="active",
        is_active=True,
        bonus_balance=0,
        last_login=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await _log_action(db, str(user.id), "register", "users", str(user.id))
    return await login(LoginV2Request(phone=normalized_phone, password=request.password), http_request, db)


@router.post("/register/request-sms", response_model=RequestSmsCodeResponse)
async def register_request_sms(
    request: RequestSmsCodeRequest,
    db: AsyncSession = Depends(get_db),
):
    normalized_phone = _normalize_phone(request.phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone")

    existing = (await db.execute(select(User).where(User.phone == normalized_phone))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User with this phone already exists")

    code = f"{random.randint(1000, 9999)}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SMS_CODE_TTL_MINUTES)
    db.add(
        PhoneVerification(
            phone=normalized_phone,
            code_hash=_hash_sms_code(normalized_phone, code),
            is_verified=False,
            attempts=0,
            expires_at=expires_at,
        )
    )
    await db.commit()
    await _log_action(db, None, "sms_verification_requested", "phone_verifications", normalized_phone)

    # TODO: integrate real SMS provider here. For now, code can be shown in debug.
    debug_code = code if bool(getattr(settings, "debug", False)) else None
    return RequestSmsCodeResponse(success=True, ttl_seconds=SMS_CODE_TTL_MINUTES * 60, debug_code=debug_code)


@router.post("/register/confirm", response_model=AuthV2Response)
async def register_confirm(
    request: ConfirmRegistrationRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_phone = _normalize_phone(request.phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone")

    row = (
        await db.execute(
            select(PhoneVerification)
            .where(PhoneVerification.phone == normalized_phone, PhoneVerification.is_verified == False)
            .order_by(desc(PhoneVerification.id))
            .limit(1)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=400, detail="SMS verification is required")

    now = datetime.now(timezone.utc)
    if row.expires_at < now:
        raise HTTPException(status_code=400, detail="SMS code expired")
    if row.attempts >= MAX_SMS_VERIFY_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many SMS verification attempts")

    row.attempts += 1
    if row.code_hash != _hash_sms_code(normalized_phone, request.sms_code.strip()):
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid SMS code")

    row.is_verified = True
    await db.commit()
    return await register(
        RegisterV2Request(
            name=request.name,
            phone=normalized_phone,
            email=request.email,
            password=request.password,
            avatar=request.avatar,
            language=request.language,
            agreement_accepted=request.agreement_accepted,
            privacy_accepted=request.privacy_accepted,
        ),
        http_request=http_request,
        db=db,
    )


@router.post("/login", response_model=AuthV2Response)
async def login(
    request: LoginV2Request,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_phone = _normalize_phone(request.phone)
    attempts = _clean_attempts(normalized_phone)
    if len(attempts) >= MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Too many login attempts")

    user = (
        await db.execute(select(User).where(User.phone == normalized_phone))
    ).scalar_one_or_none()
    if not user or not user.password_hash or not _verify_password(request.password, user.password_hash):
        attempts.append(datetime.now(timezone.utc))
        LOGIN_ATTEMPTS[normalized_phone] = attempts
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.status == "blocked" or not user.is_active:
        raise HTTPException(status_code=403, detail="User is blocked")

    now = datetime.now(timezone.utc)
    jti = str(uuid4())
    token = create_access_token(
        {
            "sub": str(user.id),
            "phone": user.phone or "",
            "email": user.email or "",
            "name": user.name or "",
            "role": user.role or "user",
            "jti": jti,
        }
    )
    user.last_login = now
    db.add(
        UserSession(
            user_id=str(user.id),
            token_jti=jti,
            is_active=True,
            ip=http_request.client.host if http_request.client else None,
            user_agent=http_request.headers.get("user-agent", "")[:250],
            expires_at=now + timedelta(minutes=60),
        )
    )
    await db.commit()
    await _log_action(db, str(user.id), "login", "users", str(user.id))
    return AuthV2Response(token=token, user_id=str(user.id), role=user.role)  # type: ignore[arg-type]


@router.post("/logout")
async def logout(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = str(payload.get("sub") or "")
    jti = str(payload.get("jti") or "")
    session = (
        await db.execute(
            select(UserSession).where(
                and_(UserSession.user_id == user_id, UserSession.token_jti == jti, UserSession.is_active == True)
            )
        )
    ).scalar_one_or_none()
    if session:
        session.is_active = False
        await db.commit()
        await _log_action(db, user_id, "logout", "user_sessions", str(session.id))
    return {"success": True}


@router.get("/me", response_model=UserV2Response)
async def me(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    return _to_user_response(user)


@router.put("/me", response_model=UserV2Response)
async def update_me(
    request: UserV2UpdateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    if request.name is not None:
        user.name = request.name.strip()
    if request.email is not None:
        user.email = request.email
    if request.avatar is not None:
        user.avatar_url = request.avatar
    if request.language is not None:
        user.language = request.language
    await db.commit()
    await _log_action(db, str(user.id), "profile_update", "users", str(user.id))
    return _to_user_response(user)


@router.get("/cabinet")
async def cabinet(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    bonus_rows = (
        await db.execute(select(Bonus).where(Bonus.user_id == str(user.id)).order_by(desc(Bonus.id)).limit(100))
    ).scalars().all()
    order_rows = (
        await db.execute(select(Order).where(Order.user_id == str(user.id)).order_by(desc(Order.id)).limit(100))
    ).scalars().all()
    complaint_rows = (
        await db.execute(select(Complaints).where(Complaints.phone == (user.phone or "")).order_by(desc(Complaints.id)).limit(100))
    ).scalars().all()
    announcement_rows = (
        await db.execute(select(Announcements).where(Announcements.phone == (user.phone or "")).order_by(desc(Announcements.id)).limit(100))
    ).scalars().all()
    return {
        "profile": _to_user_response(user),
        "bonuses": [{"id": b.id, "points": b.points, "reason": b.reason, "created_at": b.created_at.isoformat() if b.created_at else None} for b in bonus_rows],
        "orders": [{"id": o.id, "type": o.order_type, "status": o.status, "amount": o.amount, "details": o.details} for o in order_rows],
        "complaints": [{"id": c.id, "category": c.category, "status": c.status, "description": c.description} for c in complaint_rows],
        "announcements": [{"id": a.id, "title": a.title, "status": a.status, "price": a.price} for a in announcement_rows],
        "settings": {"language": user.language, "agreement_accepted": bool(user.agreement_accepted), "privacy_accepted": bool(user.privacy_accepted)},
    }


@router.get("/admin/dashboard", response_model=DashboardStatsResponse)
async def admin_dashboard(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    today = datetime.now(timezone.utc).date()
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    new_users_today = (
        await db.execute(select(func.count(User.id)).where(func.date(User.created_at) == today))
    ).scalar() or 0
    active_users = (await db.execute(select(func.count(User.id)).where(User.status == "active"))).scalar() or 0
    total_bonuses = (await db.execute(select(func.coalesce(func.sum(Bonus.points), 0)))).scalar() or 0
    total_complaints = (await db.execute(select(func.count(Complaints.id)))).scalar() or 0
    total_orders = (await db.execute(select(func.count(Order.id)))).scalar() or 0
    return DashboardStatsResponse(
        total_users=int(total_users),
        new_users_today=int(new_users_today),
        active_users=int(active_users),
        total_bonuses=float(total_bonuses or 0),
        total_complaints=int(total_complaints),
        total_orders=int(total_orders),
    )


@router.get("/admin/users")
async def admin_users(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    users = (
        await db.execute(select(User).order_by(desc(User.created_at)).limit(500))
    ).scalars().all()
    return [_to_user_response(u).model_dump() for u in users]


@router.put("/admin/users/{user_id}")
async def admin_update_user(
    user_id: str,
    request: AdminUserUpdateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if request.role is not None:
        if request.role == "superadmin" and admin.role != "superadmin":
            raise HTTPException(status_code=403, detail="Only superadmin can assign superadmin")
        user.role = request.role
    if request.status is not None:
        user.status = request.status
        user.is_active = request.status == "active"
    if request.bonus_delta:
        user.bonus_balance = float(user.bonus_balance or 0) + float(request.bonus_delta)
        db.add(Bonus(user_id=str(user.id), points=float(request.bonus_delta), reason="admin_adjustment"))
    await db.commit()
    await _log_action(
        db,
        str(admin.id),
        "admin_user_update",
        "users",
        str(user.id),
        {"role": request.role, "status": request.status, "bonus_delta": request.bonus_delta},
    )
    return {"success": True}


@router.delete("/admin/users/{user_id}")
async def admin_delete_user(
    user_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = "deleted"
    user.is_active = False
    await db.commit()
    await _log_action(db, str(admin.id), "admin_user_delete", "users", user_id)
    return {"success": True}


@router.get("/admin/registrations")
async def admin_registrations(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    rows = (
        await db.execute(select(UserAction).where(UserAction.action == "register").order_by(desc(UserAction.id)).limit(200))
    ).scalars().all()
    return [{"id": r.id, "user_id": r.user_id, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.get("/admin/bonuses")
async def admin_bonuses(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    rows = (await db.execute(select(Bonus).order_by(desc(Bonus.id)).limit(300))).scalars().all()
    return [{"id": r.id, "user_id": r.user_id, "points": r.points, "reason": r.reason, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.get("/admin/orders")
async def admin_orders(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    rows = (await db.execute(select(Order).order_by(desc(Order.id)).limit(300))).scalars().all()
    return [{"id": r.id, "user_id": r.user_id, "order_type": r.order_type, "status": r.status, "amount": r.amount, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.get("/admin/complaints")
async def admin_complaints(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    rows = (await db.execute(select(Complaints).order_by(desc(Complaints.id)).limit(300))).scalars().all()
    return [{"id": r.id, "category": r.category, "status": r.status, "description": r.description, "created_at": r.created_at} for r in rows]


@router.get("/admin/announcements")
async def admin_announcements(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    rows = (await db.execute(select(Announcements).order_by(desc(Announcements.id)).limit(300))).scalars().all()
    return [{"id": r.id, "title": r.title, "status": r.status, "price": r.price, "created_at": r.created_at} for r in rows]


@router.get("/admin/logs")
async def admin_logs(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    rows = (await db.execute(select(UserAction).order_by(desc(UserAction.id)).limit(500))).scalars().all()
    return [{"id": r.id, "user_id": r.user_id, "action": r.action, "entity": r.entity, "entity_id": r.entity_id, "payload": r.payload, "created_at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.get("/admin/settings")
async def admin_settings(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    admin = await _current_user(db, authorization)
    _assert_admin(admin)
    return {"roles": ["user", "master", "driver", "seller", "moderator", "admin", "superadmin"], "session_window_minutes": 60, "login_rate_limit_window_minutes": int(LOGIN_WINDOW.total_seconds() // 60), "max_login_attempts": MAX_ATTEMPTS}
