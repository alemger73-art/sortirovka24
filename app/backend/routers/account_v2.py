import bcrypt
import json
import hashlib
import logging
import os
import random
from typing import Any
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
from uuid import uuid4

from core.auth import create_access_token, decode_access_token, generate_state
from core.config import settings
from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from models.announcements import Announcements
from models.real_estate import Real_estate
from models.auth import User
from models.become_master_requests import Become_master_requests
from models.complaints import Complaints
from models.food_orders import Food_orders
from models.food_restaurants import Food_restaurants
from models.gastronom_orders import Gastronom_orders
from models.gastronom_products import Gastronom_products
from models.pharmacy_orders import Pharmacy_orders
from models.prorab_orders import Prorab_orders
from models.park_orders import Park_orders
from models.volna_orders import Volna_orders
from models.master_reviews import Master_reviews
from models.master_requests import Master_requests
from models.masters import Masters
from models.user_addresses import UserAddress
from models.user_management import Bonus, Order, PhoneVerification, UserAction, UserSession
from models.categories import Categories
from services.announcements import ANN_TYPE_SLUG
from services.real_estate import RE_TYPE_BY_SLUG
from schemas.account_v2 import (
    AddressCreateRequest,
    AddressGeocodeRequest,
    AddressGeocodeResponse,
    AddressResponse,
    AddressUpdateRequest,
    AdminUserUpdateRequest,
    AuthV2Response,
    ChangePasswordV2Request,
    ConfirmRegistrationRequest,
    DashboardStatsResponse,
    LoginV2Request,
    AnnouncementUpdateRequest,
    RealEstateUpdateRequest,
    MasterProfileUpdateRequest,
    MasterRequestStatusUpdate,
    MasterReviewCreateRequest,
    RequestSmsCodeRequest,
    RequestSmsCodeResponse,
    RegisterV2Request,
    SetPasswordV2Request,
    UserV2Response,
    UserV2UpdateRequest,
)
from schemas.storage import FileUpDownRequest, FileUpDownResponse
from services.account_profile import AvatarValidationError, normalize_avatar_url
from services.gastronom_delivery import geocode_address, reverse_geocode
from services.account_session import resolve_account_user
from services.auth import AuthService
from services.google_oauth import (
    GoogleOAuthError,
    build_google_authorization_url,
    exchange_google_code,
    fetch_google_userinfo,
    google_oauth_enabled,
)
from services.sms import SMSDeliveryError, SMSDeliveryResult, send_verification_code, should_expose_code_on_screen
from services.storage import StorageService
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/account", tags=["account-v2"])
logger = logging.getLogger(__name__)

LOGIN_ATTEMPTS: dict[str, list[datetime]] = {}
LOGIN_WINDOW = timedelta(minutes=15)
MAX_ATTEMPTS = 6
SMS_CODE_TTL_MINUTES = 5
MAX_SMS_VERIFY_ATTEMPTS = 5
SMS_REQUEST_ATTEMPTS: dict[str, list[datetime]] = {}
SMS_REQUEST_WINDOW = timedelta(minutes=max(1, int(os.getenv("SMS_REQUEST_WINDOW_MINUTES", "15"))))
MAX_SMS_REQUESTS_PER_WINDOW = max(1, int(os.getenv("SMS_MAX_REQUESTS_PER_WINDOW", "6")))
SESSION_EXPIRY_DAYS = max(1, int(os.getenv("ACCOUNT_SESSION_DAYS", "30")))
WELCOME_BONUS_POINTS = float(os.getenv("WELCOME_BONUS_POINTS", "300"))


def _hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def _verify_password(raw: str, password_hash: str) -> bool:
    return bcrypt.checkpw(raw.encode("utf-8"), (password_hash or "").encode("utf-8"))


from utils.phone import normalize_phone as _normalize_phone, phone_digits as _phone_digits
from utils.rate_limit import check_ip_rate_limit, check_keyed_rate_limit
from utils.timeutils import as_aware_utc as _as_aware_utc
def _matches_user_phone(candidate: str | None, user_phone: str | None) -> bool:
    left = _phone_digits(candidate)
    right = _phone_digits(user_phone)
    return bool(left and right and left == right)


async def _find_master_listing(db: AsyncSession, user: User) -> Masters | None:
    masters = (await db.execute(select(Masters).order_by(desc(Masters.id)).limit(500))).scalars().all()
    return next(
        (
            m
            for m in masters
            if _matches_user_phone(m.phone, user.phone) or _matches_user_phone(m.whatsapp, user.phone)
        ),
        None,
    )


async def _find_user_by_phone(db: AsyncSession, phone: str | None) -> User | None:
    normalized = _normalize_phone(phone or "")
    if not normalized:
        return None
    user = (await db.execute(select(User).where(User.phone == normalized))).scalar_one_or_none()
    if user:
        return user
    # Legacy rows may store phone in alternate formats — bounded fallback scan.
    candidates = (
        await db.execute(
            select(User).where(User.phone.isnot(None)).order_by(desc(User.created_at)).limit(200)
        )
    ).scalars().all()
    return next((u for u in candidates if _matches_user_phone(u.phone, normalized)), None)


def _is_legacy_admin_jwt(token: str) -> bool:
    try:
        payload = decode_access_token(token)
        return payload.get("role") == "admin" and bool(payload.get("username"))
    except Exception:
        return False


async def _assert_panel_admin(
    authorization: str | None,
    db: AsyncSession,
) -> tuple[str, User | None]:
    """Accept legacy /admin JWT or account users with moderator+ role."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    if _is_legacy_admin_jwt(token):
        payload = decode_access_token(token)
        username = str(payload.get("username") or "admin")
        return f"legacy_admin:{username}", None
    user = await _current_user(db, authorization)
    _assert_admin(user)
    return str(user.id), user


async def _maybe_promote_master_role(db: AsyncSession, user: User) -> bool:
    """Promote user -> master if approved application or catalog listing exists."""
    if user.role not in {"user"}:
        return False
    listing = await _find_master_listing(db, user)
    if listing:
        user.role = "master"
        await db.commit()
        await db.refresh(user)
        return True
    become_rows = (
        await db.execute(
            select(Become_master_requests)
            .where(Become_master_requests.status == "approved")
            .order_by(desc(Become_master_requests.id))
            .limit(200)
        )
    ).scalars().all()
    if any(_owns_become_master_request(user, b) for b in become_rows):
        user.role = "master"
        await db.commit()
        await db.refresh(user)
        return True
    return False


def _request_visible_to_master(request: Master_requests, listing: Masters) -> bool:
    mid = getattr(request, "master_id", None)
    if mid and int(mid) == int(listing.id):
        return True
    if mid:
        return False
    return (request.category or "").strip().lower() == (listing.category or "").strip().lower()


def _owns_user_content(user: User, record_user_id: str | None, record_phone: str | None) -> bool:
    if record_user_id and str(record_user_id) == str(user.id):
        return True
    return _matches_user_phone(record_phone, user.phone)


def _owns_become_master_request(user: User, row: Become_master_requests) -> bool:
    row_uid = getattr(row, "user_id", None)
    if row_uid:
        return str(row_uid) == str(user.id)
    return _matches_user_phone(row.phone, user.phone)


def _announcement_cover_image(row: Announcements) -> str | None:
    if row.image_url:
        return row.image_url
    if row.gallery_images:
        first = (row.gallery_images.split(",")[0] or "").strip()
        return first or None
    return None


SLUG_TO_ANN_TYPE = {slug: ann_type for ann_type, slug in ANN_TYPE_SLUG.items()}


def _announcement_to_dict(row: Announcements) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "ann_type": row.ann_type,
        "category_id": row.category_id,
        "title": row.title,
        "description": row.description,
        "price": row.price,
        "address": row.address,
        "image_url": _announcement_cover_image(row),
        "gallery_images": row.gallery_images,
        "phone": row.phone,
        "whatsapp": row.whatsapp,
        "telegram": row.telegram,
        "author_name": row.author_name,
        "active": row.active,
        "status": row.status,
        "created_at": row.created_at,
        "expires_at": row.expires_at,
        "promoted_until": row.promoted_until,
        "promotion_tier": row.promotion_tier,
        "views_count": int(row.views_count or 0),
    }


async def _get_owned_announcement(db: AsyncSession, user: User, announcement_id: int) -> Announcements:
    row = (
        await db.execute(select(Announcements).where(Announcements.id == announcement_id))
    ).scalar_one_or_none()
    if not row or not _owns_user_content(user, row.user_id, row.phone):
        raise HTTPException(status_code=404, detail="Объявление не найдено")
    return row


def _real_estate_cover_image(row: Real_estate) -> str | None:
    if row.image_url:
        return row.image_url
    if row.gallery_images:
        first = (row.gallery_images.split(",")[0] or "").strip()
        return first or None
    return None


def _real_estate_to_dict(row: Real_estate) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "re_type": row.re_type,
        "category_id": row.category_id,
        "title": row.title,
        "description": row.description,
        "price": row.price,
        "address": row.address,
        "rooms": row.rooms,
        "area": row.area,
        "floor_info": row.floor_info,
        "image_url": _real_estate_cover_image(row),
        "gallery_images": row.gallery_images,
        "phone": row.phone,
        "whatsapp": row.whatsapp,
        "telegram": row.telegram,
        "author_name": row.author_name,
        "active": row.active,
        "status": row.status,
        "created_at": row.created_at,
        "expires_at": row.expires_at,
        "promoted_until": row.promoted_until,
        "promotion_tier": row.promotion_tier,
        "views_count": int(row.views_count or 0),
    }


async def _get_owned_real_estate(db: AsyncSession, user: User, listing_id: int) -> Real_estate:
    row = (
        await db.execute(select(Real_estate).where(Real_estate.id == listing_id))
    ).scalar_one_or_none()
    if not row or not _owns_user_content(user, row.user_id, row.phone):
        raise HTTPException(status_code=404, detail="Объявление не найдено")
    return row


def _store_order_summary(type_key: str, label: str, store_path: str, row: Any) -> dict:
    return {
        "id": f"{type_key}_{row.id}",
        "type": type_key,
        "status": row.status,
        "amount": row.total_amount,
        "details": f"{label} — заказ #{row.id}",
        "store_label": label,
        "store_path": store_path,
        "payment_method": getattr(row, "payment_method", None),
        "order_number": row.id,
        "order_items": getattr(row, "order_items", None),
        "customer_name": getattr(row, "customer_name", None),
        "customer_phone": getattr(row, "customer_phone", None),
        "customer_address": getattr(row, "customer_address", None),
        "comment": getattr(row, "comment", None),
        "created_at": row.created_at,
    }


STORE_ORDER_SOURCES = [
    ("volna", "VOLNA", "/volna", Volna_orders),
    ("gastronom", "Гастроном", "/gastronom", Gastronom_orders),
    ("pharmacy", "Аптека", "/apteka", Pharmacy_orders),
    ("prorab", "Прораб", "/prorab", Prorab_orders),
    ("park", "Фуд-парк", "/food/park", Park_orders),
]


def _assert_role(user: User, allowed: set[str]):
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="Insufficient permissions for this cabinet")


def _session_expiry_minutes() -> int:
    return SESSION_EXPIRY_DAYS * 24 * 60


def _hash_sms_code(phone: str, code: str) -> str:
    return hashlib.sha256(f"{phone}:{code}".encode("utf-8")).hexdigest()


def _clean_attempts(phone: str) -> list[datetime]:
    now = datetime.now(timezone.utc)
    attempts = [a for a in LOGIN_ATTEMPTS.get(phone, []) if now - a <= LOGIN_WINDOW]
    LOGIN_ATTEMPTS[phone] = attempts
    return attempts


def _clean_sms_requests(key: str) -> list[datetime]:
    now = datetime.now(timezone.utc)
    attempts = [a for a in SMS_REQUEST_ATTEMPTS.get(key, []) if now - a <= SMS_REQUEST_WINDOW]
    SMS_REQUEST_ATTEMPTS[key] = attempts
    return attempts


def _sms_retry_minutes(*attempt_lists: list[datetime]) -> int:
    now = datetime.now(timezone.utc)
    oldest = None
    for attempts in attempt_lists:
        if attempts:
            candidate = min(attempts)
            oldest = candidate if oldest is None else min(oldest, candidate)
    if oldest is None:
        return int(SMS_REQUEST_WINDOW.total_seconds() // 60) or 1
    remaining = SMS_REQUEST_WINDOW - (now - oldest)
    return max(1, int(remaining.total_seconds() // 60) + (1 if remaining.total_seconds() % 60 else 0))


async def _active_phone_verification(db: AsyncSession, phone: str) -> PhoneVerification | None:
    now = datetime.now(timezone.utc)
    return (
        await db.execute(
            select(PhoneVerification)
            .where(
                PhoneVerification.phone == phone,
                PhoneVerification.is_verified == False,
                PhoneVerification.expires_at > now,
            )
            .order_by(desc(PhoneVerification.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()


def _existing_code_response(row: PhoneVerification, *, resend: bool) -> RequestSmsCodeResponse:
    now = datetime.now(timezone.utc)
    ttl = max(1, int((row.expires_at - now).total_seconds()))
    hint = (
        "Код уже был отправлен. Введите его с экрана — новое SMS не отправлялось."
        if resend
        else "SMS проходит модерацию Mobizon. Пока SMS не пришло — введите код с экрана."
    )
    expose = (
        row.pending_code
        if should_expose_code_on_screen(SMSDeliveryResult(delivered=False, pending_moderation=True))
        else None
    )
    return RequestSmsCodeResponse(
        success=True,
        ttl_seconds=ttl,
        debug_code=expose,
        sms_pending_moderation=True,
        on_screen_code_hint=hint if expose else None,
    )


async def _cleanup_phone_verifications(db: AsyncSession, phone: str | None = None) -> None:
    now = datetime.now(timezone.utc)
    query = select(PhoneVerification).where(PhoneVerification.expires_at < now)
    if phone:
        query = query.where(PhoneVerification.phone == phone)
    rows = (await db.execute(query)).scalars().all()
    for row in rows:
        await db.delete(row)
    if rows:
        await db.commit()


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
        has_password=bool(user.password_hash),
        created_at=user.created_at.isoformat() if user.created_at else None,
    )


def _public_origin(request: Request) -> str:
    scheme = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if not host:
        return settings.backend_url.rstrip("/")
    return f"{scheme}://{host}"


def _google_callback_url(request: Request) -> str:
    return f"{_public_origin(request)}/api/v1/account/google/callback"


async def _issue_account_session(user: User, http_request: Request, db: AsyncSession) -> AuthV2Response:
    if user.status == "blocked" or not user.is_active:
        raise HTTPException(status_code=403, detail="User is blocked")

    await _maybe_promote_master_role(db, user)

    now = datetime.now(timezone.utc)
    jti = str(uuid4())
    session_minutes = _session_expiry_minutes()
    token = create_access_token(
        {
            "sub": str(user.id),
            "phone": user.phone or "",
            "email": user.email or "",
            "name": user.name or "",
            "role": user.role or "user",
            "jti": jti,
        },
        expires_minutes=session_minutes,
    )
    user.last_login = now
    db.add(
        UserSession(
            user_id=str(user.id),
            token_jti=jti,
            is_active=True,
            ip=http_request.client.host if http_request.client else None,
            user_agent=http_request.headers.get("user-agent", "")[:250],
            expires_at=now + timedelta(minutes=session_minutes),
        )
    )
    await db.commit()
    await _log_action(db, str(user.id), "login", "users", str(user.id))
    return AuthV2Response(token=token, user_id=str(user.id), role=user.role)  # type: ignore[arg-type]


async def _get_or_create_google_user(
    db: AsyncSession,
    *,
    google_sub: str,
    email: str | None,
    name: str | None,
    avatar: str | None,
    language: str = "ru",
) -> tuple[User, bool]:
    user = (
        await db.execute(select(User).where(User.google_sub == google_sub))
    ).scalar_one_or_none()

    if not user and email:
        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if user:
            user.google_sub = google_sub

    created = False
    if not user:
        created = True
        user = User(
            id=str(uuid4()),
            google_sub=google_sub,
            email=email,
            name=(name or email.split("@", 1)[0] if email else "Пользователь").strip(),
            avatar_url=avatar,
            password_hash=None,
            phone=None,
            language=language if language in {"ru", "kz"} else "ru",
            agreement_accepted=True,
            privacy_accepted=True,
            role="user",
            status="active",
            is_active=True,
            bonus_balance=WELCOME_BONUS_POINTS,
            last_login=datetime.now(timezone.utc),
        )
        db.add(user)
        await db.flush()
        if WELCOME_BONUS_POINTS > 0:
            db.add(
                Bonus(
                    user_id=str(user.id),
                    points=WELCOME_BONUS_POINTS,
                    reason="Бонус за регистрацию через Google",
                )
            )
    else:
        if email and not user.email:
            user.email = email
        if name and (not user.name or user.name == "Пользователь"):
            user.name = name
        if avatar and not user.avatar_url:
            user.avatar_url = avatar
        user.last_login = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(user)
    if created:
        await _log_action(db, str(user.id), "register_google", "users", str(user.id))
    return user, created


def _apply_avatar_update(user: User, avatar: str | None) -> None:
    normalized = normalize_avatar_url(avatar)
    if normalized is None:
        return
    user.avatar_url = normalized or None


def _avatar_http_error(exc: AvatarValidationError) -> HTTPException:
    return HTTPException(status_code=400, detail=str(exc))


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
    session_expiry = _as_aware_utc(session.expires_at)
    if session_expiry and session_expiry < datetime.now(timezone.utc):
        session.is_active = False
        await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _assert_admin(user: User):
    if user.role not in {"moderator", "admin", "superadmin"}:
        raise HTTPException(status_code=403, detail="Admin access required")


async def _create_user_and_login(
    request: RegisterV2Request,
    http_request: Request,
    db: AsyncSession,
):
    normalized_phone = _normalize_phone(request.phone)
    # Only match on email when one was actually supplied — otherwise
    # `User.email == None` becomes `email IS NULL` and matches every existing
    # email-less account, wrongly rejecting all registrations after the first.
    dedupe_conditions = [User.phone == normalized_phone]
    if request.email:
        dedupe_conditions.append(User.email == request.email)
    existing = (
        await db.execute(select(User).where(or_(*dedupe_conditions)).limit(1))
    ).scalars().first()
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
        avatar_url=None,
        language=request.language,
        agreement_accepted=request.agreement_accepted,
        privacy_accepted=request.privacy_accepted,
        role="user",
        status="active",
        is_active=True,
        bonus_balance=WELCOME_BONUS_POINTS,
        last_login=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    try:
        _apply_avatar_update(user, request.avatar)
    except AvatarValidationError as exc:
        raise _avatar_http_error(exc) from exc
    if WELCOME_BONUS_POINTS > 0:
        db.add(
            Bonus(
                user_id=str(user.id),
                points=WELCOME_BONUS_POINTS,
                reason="Бонус за регистрацию",
            )
        )
    await db.commit()
    await db.refresh(user)
    await _maybe_promote_master_role(db, user)
    await _log_action(db, str(user.id), "register", "users", str(user.id))
    return await login(LoginV2Request(phone=normalized_phone, password=request.password), http_request, db)


@router.post("/register", response_model=AuthV2Response)
async def register(
    request: RegisterV2Request,
    _http_request: Request,
):
    raise HTTPException(
        status_code=400,
        detail="SMS confirmation required. Use /api/v1/account/register/request-sms and /api/v1/account/register/confirm",
    )


@router.post("/register/request-sms", response_model=RequestSmsCodeResponse)
async def register_request_sms(
    request: RequestSmsCodeRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_phone = _normalize_phone(request.phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone")
    await _cleanup_phone_verifications(db, normalized_phone)

    active_row = await _active_phone_verification(db, normalized_phone)
    if active_row and active_row.pending_code:
        return _existing_code_response(active_row, resend=True)

    client_ip = http_request.client.host if http_request.client else "unknown"
    window_sec = SMS_REQUEST_WINDOW.total_seconds()
    check_keyed_rate_limit(
        f"sms:phone:{normalized_phone}",
        window_seconds=window_sec,
        max_hits=MAX_SMS_REQUESTS_PER_WINDOW,
        message="Слишком много запросов SMS. Подождите 15 минут и попробуйте снова.",
    )
    check_keyed_rate_limit(
        f"sms:ip:{client_ip}",
        window_seconds=window_sec,
        max_hits=MAX_SMS_REQUESTS_PER_WINDOW,
        message="Слишком много запросов SMS с вашего IP. Попробуйте позже.",
    )
    now = datetime.now(timezone.utc)

    existing = (await db.execute(select(User).where(User.phone == normalized_phone))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="User with this phone already exists")

    code = f"{random.randint(1000, 9999)}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=SMS_CODE_TTL_MINUTES)
    previous_rows = (
        await db.execute(
            select(PhoneVerification).where(
                PhoneVerification.phone == normalized_phone,
                PhoneVerification.is_verified == False,
            )
        )
    ).scalars().all()
    for row in previous_rows:
        await db.delete(row)
    db.add(
        PhoneVerification(
            phone=normalized_phone,
            code_hash=_hash_sms_code(normalized_phone, code),
            pending_code=code,
            is_verified=False,
            attempts=0,
            expires_at=expires_at,
        )
    )
    await db.commit()
    await _log_action(db, None, "sms_verification_requested", "phone_verifications", normalized_phone)

    try:
        delivery = await send_verification_code(normalized_phone, code)
    except SMSDeliveryError as exc:
        logger_msg = str(exc)
        raise HTTPException(
            status_code=502,
            detail=f"Не удалось отправить SMS. {logger_msg}",
        ) from exc

    expose_code = should_expose_code_on_screen(delivery)
    on_screen_hint = None
    if delivery.pending_moderation:
        on_screen_hint = (
            "SMS проходит модерацию Mobizon (обычно 1–15 минут). "
            "Пока SMS не пришло — введите код ниже с экрана."
        )
    elif expose_code:
        on_screen_hint = "Код для регистрации — введите его с экрана."

    stored_code = code if expose_code else None

    return RequestSmsCodeResponse(
        success=True,
        ttl_seconds=SMS_CODE_TTL_MINUTES * 60,
        debug_code=stored_code,
        sms_pending_moderation=delivery.pending_moderation,
        on_screen_code_hint=on_screen_hint,
    )


@router.post("/register/confirm", response_model=AuthV2Response)
async def register_confirm(
    request: ConfirmRegistrationRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db),
):
    normalized_phone = _normalize_phone(request.phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Invalid phone")
    await _cleanup_phone_verifications(db, normalized_phone)

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
    if _as_aware_utc(row.expires_at) < now:
        raise HTTPException(status_code=400, detail="SMS code expired")
    if row.attempts >= MAX_SMS_VERIFY_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Слишком много попыток ввода кода. Запросите новый SMS-код.")

    row.attempts += 1
    if row.code_hash != _hash_sms_code(normalized_phone, request.sms_code.strip()):
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid SMS code")

    row.is_verified = True
    await db.commit()
    return await _create_user_and_login(
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
    check_keyed_rate_limit(
        f"login:{normalized_phone}",
        window_seconds=LOGIN_WINDOW.total_seconds(),
        max_hits=MAX_ATTEMPTS,
        message="Too many login attempts",
    )

    user = (
        await db.execute(select(User).where(User.phone == normalized_phone))
    ).scalar_one_or_none()
    if not user or not user.password_hash or not _verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.status == "blocked" or not user.is_active:
        raise HTTPException(status_code=403, detail="User is blocked")

    return await _issue_account_session(user, http_request, db)


@router.get("/google/status")
async def google_status():
    return {"enabled": google_oauth_enabled()}


@router.get("/google/start")
async def google_start(
    request: Request,
    db: AsyncSession = Depends(get_db),
    language: str = "ru",
):
    if not google_oauth_enabled():
        raise HTTPException(status_code=503, detail="Google вход не настроен на сервере")

    state = generate_state()
    auth_service = AuthService(db)
    await auth_service.store_oidc_state(state, "google_account", language if language in {"ru", "kz"} else "ru")

    redirect_uri = _google_callback_url(request)
    auth_url = build_google_authorization_url(state=state, redirect_uri=redirect_uri)
    return RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)


@router.get("/google/callback")
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    origin = _public_origin(request)

    def redirect_error(message: str) -> RedirectResponse:
        query = urlencode({"error": message})
        return RedirectResponse(url=f"{origin}/login/google/callback?{query}", status_code=status.HTTP_302_FOUND)

    if error:
        return redirect_error(f"Google: {error}")
    if not code or not state:
        return redirect_error("Не получен код авторизации Google")

    auth_service = AuthService(db)
    temp = await auth_service.get_and_delete_oidc_state(state)
    if not temp or temp.get("nonce") != "google_account":
        return redirect_error("Сессия Google устарела. Попробуйте снова.")

    language = str(temp.get("code_verifier") or "ru")

    try:
        redirect_uri = _google_callback_url(request)
        tokens = await exchange_google_code(code=code, redirect_uri=redirect_uri)
        profile = await fetch_google_userinfo(tokens["access_token"])
        user, _created = await _get_or_create_google_user(
            db,
            google_sub=str(profile["sub"]),
            email=profile.get("email"),
            name=profile.get("name"),
            avatar=profile.get("picture"),
            language=language,
        )
        session = await _issue_account_session(user, request, db)
    except GoogleOAuthError as exc:
        logger.warning("[google_callback] %s", exc)
        return redirect_error(str(exc))
    except HTTPException as exc:
        return redirect_error(str(exc.detail))
    except Exception as exc:
        logger.exception("[google_callback] unexpected error: %s", exc)
        return redirect_error("Не удалось войти через Google")

    fragment = urlencode(
        {
            "token": session.token,
            "user_id": session.user_id,
            "role": session.role,
        }
    )
    return RedirectResponse(url=f"{origin}/login/google/callback#{fragment}", status_code=status.HTTP_302_FOUND)


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
    await _maybe_promote_master_role(db, user)
    return _to_user_response(user)


@router.get("/bonus-rules")
async def bonus_rules(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    from services.bonus_spending import bonus_rules_public

    rules = bonus_rules_public()
    if authorization:
        try:
            user = await _current_user(db, authorization)
            rules = {**rules, "balance": float(user.bonus_balance or 0)}
        except HTTPException:
            pass
    return rules


@router.get("/notifications")
async def list_notifications(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
    unread_only: bool = False,
):
    from services.user_notifications import list_user_notifications, unread_notification_count

    user = await _current_user(db, authorization)
    rows = await list_user_notifications(
        db, str(user.id), limit=min(max(limit, 1), 100), unread_only=unread_only
    )
    unread = await unread_notification_count(db, str(user.id))
    return {
        "unread_count": unread,
        "items": [
            {
                "id": row.id,
                "category": row.category,
                "title": row.title,
                "body": row.body,
                "path": row.path,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "is_read": bool(row.is_read),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
    }


@router.post("/notifications/{notification_id}/read")
async def read_notification(
    notification_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    from services.user_notifications import mark_notification_read

    user = await _current_user(db, authorization)
    ok = await mark_notification_read(db, str(user.id), notification_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    return {"success": True}


@router.post("/notifications/read-all")
async def read_all_notifications(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    from services.user_notifications import mark_all_notifications_read

    user = await _current_user(db, authorization)
    count = await mark_all_notifications_read(db, str(user.id))
    return {"success": True, "marked": count}


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
        user.email = request.email.strip() or None
    if request.avatar is not None:
        try:
            _apply_avatar_update(user, request.avatar)
        except AvatarValidationError as exc:
            raise _avatar_http_error(exc) from exc
    if request.language is not None:
        user.language = request.language
    await db.commit()
    await db.refresh(user)
    await _log_action(db, str(user.id), "profile_update", "users", str(user.id))
    return _to_user_response(user)


@router.post("/me/change-password")
async def change_password(
    request: ChangePasswordV2Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    if not user.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Пароль не задан. Используйте «Установить пароль» в настройках.",
        )
    if not _verify_password(request.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Неверный текущий пароль")
    if request.current_password == request.new_password:
        raise HTTPException(status_code=400, detail="Новый пароль должен отличаться от текущего")
    user.password_hash = _hash_password(request.new_password)
    await db.commit()
    await _log_action(db, str(user.id), "password_change", "users", str(user.id))
    return {"success": True}


@router.post("/me/set-password")
async def set_password(
    request: SetPasswordV2Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    if user.password_hash:
        raise HTTPException(status_code=400, detail="Пароль уже задан. Используйте смену пароля.")
    user.password_hash = _hash_password(request.new_password)
    await db.commit()
    await _log_action(db, str(user.id), "password_set", "users", str(user.id))
    return {"success": True}


@router.post("/me/avatar-upload-url", response_model=FileUpDownResponse)
async def create_avatar_upload_url(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    object_key = f"avatars/{user.id}-{uuid4()}.jpg"
    service = StorageService()
    return await service.create_upload_url(
        request=FileUpDownRequest(bucket_name="portal-images", object_key=object_key)
    )


MAX_SAVED_ADDRESSES = 20


def _address_to_response(row: UserAddress) -> AddressResponse:
    return AddressResponse(
        id=row.id,
        label=row.label,
        address=row.address,
        comment=row.comment,
        lat=row.lat,
        lng=row.lng,
        is_default=bool(row.is_default),
        created_at=row.created_at.isoformat() if row.created_at else None,
    )


async def _list_user_addresses(db: AsyncSession, user_id: str) -> list[UserAddress]:
    return (
        await db.execute(
            select(UserAddress)
            .where(UserAddress.user_id == str(user_id))
            .order_by(desc(UserAddress.is_default), desc(UserAddress.id))
        )
    ).scalars().all()


async def _unset_default_addresses(db: AsyncSession, user_id: str, keep_id: int | None = None) -> None:
    rows = (
        await db.execute(
            select(UserAddress).where(
                UserAddress.user_id == str(user_id), UserAddress.is_default == True
            )
        )
    ).scalars().all()
    for row in rows:
        if keep_id is not None and row.id == keep_id:
            continue
        row.is_default = False


@router.post("/me/addresses/geocode", response_model=AddressGeocodeResponse)
async def geocode_user_address(
    request: AddressGeocodeRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a free-form address to map coordinates so saved addresses are 'working'."""
    await _current_user(db, authorization)
    coords = await geocode_address(request.address.strip())
    if not coords:
        return AddressGeocodeResponse(found=False)
    lat, lng = coords
    display, city = await reverse_geocode(lat, lng)
    return AddressGeocodeResponse(
        found=True,
        lat=lat,
        lng=lng,
        display_address=display or request.address.strip(),
        detected_city=city or None,
    )


@router.get("/me/addresses", response_model=list[AddressResponse])
async def list_addresses(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    rows = await _list_user_addresses(db, str(user.id))
    return [_address_to_response(r) for r in rows]


@router.post("/me/addresses", response_model=AddressResponse, status_code=201)
async def create_address(
    request: AddressCreateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    existing = await _list_user_addresses(db, str(user.id))
    if len(existing) >= MAX_SAVED_ADDRESSES:
        raise HTTPException(
            status_code=400,
            detail=f"Можно сохранить не более {MAX_SAVED_ADDRESSES} адресов",
        )
    # First address becomes default automatically.
    make_default = request.is_default or len(existing) == 0
    if make_default:
        await _unset_default_addresses(db, str(user.id))
    lat, lng = request.lat, request.lng
    # Auto-resolve coordinates so the saved address is usable on the map.
    if lat is None or lng is None:
        coords = await geocode_address(request.address.strip())
        if coords:
            lat, lng = coords
    row = UserAddress(
        user_id=str(user.id),
        label=(request.label or "").strip() or None,
        address=request.address.strip(),
        comment=(request.comment or "").strip() or None,
        lat=lat,
        lng=lng,
        is_default=make_default,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    await _log_action(db, str(user.id), "address_create", "user_addresses", str(row.id))
    return _address_to_response(row)


@router.put("/me/addresses/{address_id}", response_model=AddressResponse)
async def update_address(
    address_id: int,
    request: AddressUpdateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = (
        await db.execute(
            select(UserAddress).where(
                UserAddress.id == address_id, UserAddress.user_id == str(user.id)
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    address_changed = request.address is not None and request.address.strip() != (row.address or "")
    if request.label is not None:
        row.label = request.label.strip() or None
    if request.address is not None:
        row.address = request.address.strip()
    if request.comment is not None:
        row.comment = request.comment.strip() or None
    if request.lat is not None:
        row.lat = request.lat
    if request.lng is not None:
        row.lng = request.lng
    # Re-resolve coordinates when the address text changed but no coords were sent.
    if address_changed and request.lat is None and request.lng is None:
        coords = await geocode_address(row.address)
        row.lat = coords[0] if coords else None
        row.lng = coords[1] if coords else None
    if request.is_default is not None:
        if request.is_default:
            await _unset_default_addresses(db, str(user.id), keep_id=row.id)
            row.is_default = True
        else:
            row.is_default = False
    await db.commit()
    await db.refresh(row)
    await _log_action(db, str(user.id), "address_update", "user_addresses", str(row.id))
    return _address_to_response(row)


@router.post("/me/addresses/{address_id}/default", response_model=AddressResponse)
async def set_default_address(
    address_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = (
        await db.execute(
            select(UserAddress).where(
                UserAddress.id == address_id, UserAddress.user_id == str(user.id)
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    await _unset_default_addresses(db, str(user.id), keep_id=row.id)
    row.is_default = True
    await db.commit()
    await db.refresh(row)
    await _log_action(db, str(user.id), "address_set_default", "user_addresses", str(row.id))
    return _address_to_response(row)


@router.delete("/me/addresses/{address_id}")
async def delete_address(
    address_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = (
        await db.execute(
            select(UserAddress).where(
                UserAddress.id == address_id, UserAddress.user_id == str(user.id)
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Адрес не найден")
    was_default = bool(row.is_default)
    await db.delete(row)
    await db.flush()
    # Promote another address to default to always keep one preferred entry.
    if was_default:
        remaining = await _list_user_addresses(db, str(user.id))
        if remaining:
            remaining[0].is_default = True
    await db.commit()
    await _log_action(db, str(user.id), "address_delete", "user_addresses", str(address_id))
    return {"success": True}


@router.get("/cabinet")
async def cabinet(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    await _maybe_promote_master_role(db, user)
    bonus_rows = (
        await db.execute(select(Bonus).where(Bonus.user_id == str(user.id)).order_by(desc(Bonus.id)).limit(100))
    ).scalars().all()
    order_rows = (
        await db.execute(select(Order).where(Order.user_id == str(user.id)).order_by(desc(Order.id)).limit(100))
    ).scalars().all()
    food_rows = (
        await db.execute(select(Food_orders).order_by(desc(Food_orders.id)).limit(500))
    ).scalars().all()
    food_rows = [
        f for f in food_rows
        if _owns_user_content(
            user,
            str(f.user_id) if getattr(f, "user_id", None) else None,
            f.customer_phone,
        )
    ]
    complaint_rows = (
        await db.execute(select(Complaints).order_by(desc(Complaints.id)).limit(500))
    ).scalars().all()
    complaint_rows = [c for c in complaint_rows if _owns_user_content(user, c.user_id, c.phone)]
    announcement_rows = (
        await db.execute(select(Announcements).order_by(desc(Announcements.id)).limit(500))
    ).scalars().all()
    announcement_rows = [a for a in announcement_rows if _owns_user_content(user, a.user_id, a.phone)]
    real_estate_rows = (
        await db.execute(select(Real_estate).order_by(desc(Real_estate.id)).limit(500))
    ).scalars().all()
    real_estate_rows = [r for r in real_estate_rows if _owns_user_content(user, r.user_id, r.phone)]
    master_request_rows = (
        await db.execute(select(Master_requests).order_by(desc(Master_requests.id)).limit(500))
    ).scalars().all()
    master_request_rows = [r for r in master_request_rows if _matches_user_phone(r.phone, user.phone)]
    address_rows = await _list_user_addresses(db, str(user.id))
    become_rows = (
        await db.execute(
            select(Become_master_requests).order_by(desc(Become_master_requests.id)).limit(100)
        )
    ).scalars().all()
    become_rows = [b for b in become_rows if _owns_become_master_request(user, b)]

    merged_orders = [
        {"id": o.id, "type": o.order_type, "status": o.status, "amount": o.amount, "details": o.details, "created_at": o.created_at.isoformat() if o.created_at else None}
        for o in order_rows
    ]
    linked_food_ids = {
        part
        for o in order_rows
        if o.order_type == "food" and o.details
        for part in str(o.details).split("#")
        if part.strip().isdigit()
    }
    merged_orders.extend(
        {
            "id": f"food_{f.id}",
            "type": "food",
            "status": f.status,
            "amount": f.total_amount,
            "details": f"{f.restaurant_name or 'DAM ALEM 2.0'} — заказ #{f.id}",
            "restaurant_name": f.restaurant_name,
            "delivery_method": f.delivery_method,
            "payment_method": f.payment_method,
            "order_number": f.id,
            "food_order_id": f.id,
            "order_items": f.order_items,
            "delivery_address": f.delivery_address,
            "customer_name": f.customer_name,
            "customer_phone": f.customer_phone,
            "comment": f.comment,
            "store_path": "/food",
            "created_at": f.created_at,
        }
        for f in food_rows[:100]
        if str(f.id) not in linked_food_ids
    )

    # Store orders (gastronom / pharmacy / prorab / food-park) belong to the
    # SAME personal cabinet — matched to the account by customer phone so every
    # purchase across the app shows up in one place.
    for type_key, label, store_path, model in STORE_ORDER_SOURCES:
        try:
            rows = (
                await db.execute(select(model).order_by(desc(model.id)).limit(500))
            ).scalars().all()
        except Exception:
            continue
        rows = [
            r for r in rows
            if _owns_user_content(user, getattr(r, "user_id", None), getattr(r, "customer_phone", None))
        ]
        merged_orders.extend(
            _store_order_summary(type_key, label, store_path, r)
            for r in rows[:100]
        )

    merged_orders.sort(key=lambda item: str(item.get("created_at") or ""), reverse=True)

    return {
        "profile": _to_user_response(user),
        "bonuses": [{"id": b.id, "points": b.points, "reason": b.reason, "created_at": b.created_at.isoformat() if b.created_at else None} for b in bonus_rows],
        "orders": merged_orders[:100],
        "complaints": [{"id": c.id, "category": c.category, "status": c.status, "description": c.description} for c in complaint_rows[:100]],
        "announcements": [_announcement_to_dict(a) for a in announcement_rows[:100]],
        "real_estate": [_real_estate_to_dict(r) for r in real_estate_rows[:100]],
        "master_requests": [
            {
                "id": r.id,
                "category": r.category,
                "status": r.status,
                "problem_description": r.problem_description,
                "master_id": getattr(r, "master_id", None),
                "created_at": r.created_at,
            }
            for r in master_request_rows[:50]
        ],
        "become_master_requests": [
            {
                "id": b.id,
                "category": b.category,
                "status": b.status,
                "created_at": b.created_at,
            }
            for b in become_rows[:10]
        ],
        "addresses": [_address_to_response(a).model_dump() for a in address_rows],
        "settings": {"language": user.language, "agreement_accepted": bool(user.agreement_accepted), "privacy_accepted": bool(user.privacy_accepted)},
    }


def _serialize_food_order_detail(row: Food_orders) -> dict:
    return {
        "id": f"food_{row.id}",
        "type": "food",
        "status": row.status,
        "amount": row.total_amount,
        "details": f"{row.restaurant_name or 'DAM ALEM 2.0'} — заказ #{row.id}",
        "store_label": row.restaurant_name or "DAM ALEM 2.0",
        "store_path": "/food",
        "payment_method": row.payment_method,
        "order_number": row.id,
        "food_order_id": row.id,
        "order_items": row.order_items,
        "delivery_address": row.delivery_address,
        "customer_name": row.customer_name,
        "customer_phone": row.customer_phone,
        "comment": row.comment,
        "delivery_method": row.delivery_method,
        "restaurant_name": row.restaurant_name,
        "created_at": row.created_at,
    }


@router.get("/orders/{source}/{order_id}")
async def cabinet_order_detail(
    source: str,
    order_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    source = source.strip().lower()

    if source == "food":
        row = (await db.execute(select(Food_orders).where(Food_orders.id == order_id))).scalar_one_or_none()
        if not row or not _owns_user_content(
            user,
            str(row.user_id) if getattr(row, "user_id", None) else None,
            row.customer_phone,
        ):
            raise HTTPException(status_code=404, detail="Order not found")
        return _serialize_food_order_detail(row)

    for type_key, label, store_path, model in STORE_ORDER_SOURCES:
        if type_key != source:
            continue
        row = (await db.execute(select(model).where(model.id == order_id))).scalar_one_or_none()
        if not row or not _owns_user_content(
            user,
            getattr(row, "user_id", None),
            getattr(row, "customer_phone", None),
        ):
            raise HTTPException(status_code=404, detail="Order not found")
        return _store_order_summary(type_key, label, store_path, row)

    raise HTTPException(status_code=404, detail="Unknown order source")


@router.get("/master/cabinet")
async def master_cabinet(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    await _maybe_promote_master_role(db, user)
    _assert_role(user, {"master", "admin", "superadmin", "moderator"})
    listing = await _find_master_listing(db, user)
    become = (
        await db.execute(
            select(Become_master_requests)
            .order_by(desc(Become_master_requests.id))
            .limit(50)
        )
    ).scalars().all()
    become_rows = [b for b in become if _owns_become_master_request(user, b)]
    requests = (
        await db.execute(select(Master_requests).order_by(desc(Master_requests.id)).limit(200))
    ).scalars().all()
    if listing:
        requests = [r for r in requests if _request_visible_to_master(r, listing)]
    else:
        requests = []
    gallery = (listing.gallery_images or "").split(",") if listing and listing.gallery_images else []
    gallery = [g.strip() for g in gallery if g.strip()]
    return {
        "profile": {
            "name": listing.name if listing else "",
            "bio": listing.description if listing else "",
            "service_categories": [listing.category] if listing and listing.category else [],
            "services": listing.services if listing else "",
            "work_photos": gallery,
            "photo_url": listing.photo_url if listing else "",
            "gallery_images": listing.gallery_images if listing else "",
            "whatsapp": listing.whatsapp if listing else "",
            "telegram": listing.telegram if listing else "",
            "avg_rating": float(listing.rating or 0) if listing else 0,
            "reviews_count": int(listing.reviews_count or 0) if listing else 0,
            "verified": bool(listing.verified) if listing else False,
            "available_today": bool(listing.available_today) if listing else False,
            "listing_id": listing.id if listing else None,
        },
        "become_master_requests": [
            {"id": b.id, "category": b.category, "status": b.status, "created_at": b.created_at}
            for b in become_rows[:20]
        ],
        "requests": [
            {
                "id": r.id,
                "title": r.category or "Заявка",
                "status": r.status,
                "client_name": r.client_name,
                "address": r.address,
                "phone": r.phone,
                "problem_description": r.problem_description,
                "master_id": getattr(r, "master_id", None),
                "created_at": r.created_at,
            }
            for r in requests[:50]
        ],
        "stats": {
            "requests_total": len(requests),
            "new_requests_count": sum(1 for r in requests if (r.status or "new") == "new"),
            "reviews_total": int(listing.reviews_count or 0) if listing else 0,
            "avg_rating": float(listing.rating or 0) if listing else 0,
        },
    }


@router.put("/master/profile")
async def update_master_profile(
    request: MasterProfileUpdateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    _assert_role(user, {"master", "admin", "superadmin", "moderator"})
    listing = await _find_master_listing(db, user)
    if not listing:
        raise HTTPException(status_code=404, detail="Карточка мастера не найдена. Обратитесь к администратору.")
    if request.description is not None:
        listing.description = request.description.strip()
    if request.photo_url is not None:
        listing.photo_url = request.photo_url.strip() or None
    if request.gallery_images is not None:
        listing.gallery_images = request.gallery_images.strip() or None
    if request.whatsapp is not None:
        listing.whatsapp = request.whatsapp.strip() or None
    if request.telegram is not None:
        listing.telegram = request.telegram.strip() or None
    if request.services is not None:
        listing.services = request.services.strip() or None
    if request.available_today is not None:
        listing.available_today = request.available_today
    await db.commit()
    await _log_action(db, str(user.id), "master_profile_update", "masters", str(listing.id))
    return {"success": True, "listing_id": listing.id}


@router.get("/me/announcements/{announcement_id}")
async def get_my_announcement(
    announcement_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_announcement(db, user, announcement_id)
    return _announcement_to_dict(row)


@router.put("/me/announcements/{announcement_id}")
async def update_my_announcement(
    announcement_id: int,
    request: AnnouncementUpdateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_announcement(db, user, announcement_id)
    changed = False
    if request.ann_type is not None:
        row.ann_type = request.ann_type.strip() or None
        changed = True
    if request.category_id is not None:
        row.category_id = request.category_id or None
        if row.category_id:
            cat = (
                await db.execute(select(Categories).where(Categories.id == row.category_id))
            ).scalar_one_or_none()
            if cat and cat.slug and cat.slug in SLUG_TO_ANN_TYPE:
                row.ann_type = SLUG_TO_ANN_TYPE[cat.slug]
        changed = True
    if request.title is not None:
        row.title = request.title.strip() or None
        changed = True
    if request.description is not None:
        row.description = request.description.strip() or None
        changed = True
    if request.price is not None:
        row.price = request.price.strip() or None
        changed = True
    if request.address is not None:
        row.address = request.address.strip() or None
        changed = True
    if request.phone is not None:
        row.phone = request.phone.strip() or None
        changed = True
    if request.whatsapp is not None:
        row.whatsapp = request.whatsapp.strip() or None
        changed = True
    if request.author_name is not None:
        row.author_name = request.author_name.strip() or None
        changed = True
    if request.gallery_images is not None:
        gallery = request.gallery_images.strip() or None
        row.gallery_images = gallery
        first = (gallery.split(",")[0] or "").strip() if gallery else None
        row.image_url = first or None
        changed = True
    if changed and row.status in {"approved", "published"}:
        row.status = "pending"
        row.active = True
    await db.commit()
    await _log_action(db, str(user.id), "announcement_update", "announcements", str(row.id))
    return {"success": True, "announcement": _announcement_to_dict(row)}


@router.post("/me/announcements/{announcement_id}/unpublish")
async def unpublish_my_announcement(
    announcement_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_announcement(db, user, announcement_id)
    row.status = "hidden"
    row.active = False
    await db.commit()
    await _log_action(db, str(user.id), "announcement_unpublish", "announcements", str(row.id))
    return {"success": True, "announcement": _announcement_to_dict(row)}


@router.delete("/me/announcements/{announcement_id}")
async def delete_my_announcement(
    announcement_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_announcement(db, user, announcement_id)
    await db.delete(row)
    await db.commit()
    await _log_action(db, str(user.id), "announcement_delete", "announcements", str(announcement_id))
    return {"success": True}


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        return None


@router.post("/me/announcements/{announcement_id}/extend")
async def extend_my_announcement(
    announcement_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_announcement(db, user, announcement_id)
    now = datetime.now(timezone.utc)
    base = _parse_iso_datetime(row.expires_at) or now
    if base < now:
        base = now
    row.expires_at = (base + timedelta(days=30)).isoformat()
    row.active = True
    if row.status == "hidden":
        row.status = "pending"
    await db.commit()
    await _log_action(db, str(user.id), "announcement_extend", "announcements", str(row.id))
    return {"success": True, "announcement": _announcement_to_dict(row)}


@router.post("/me/announcements/{announcement_id}/boost")
async def boost_my_announcement(
    announcement_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_announcement(db, user, announcement_id)
    if row.status not in {"approved", "published"}:
        raise HTTPException(status_code=400, detail="Поднять можно только опубликованное объявление")
    now = datetime.now(timezone.utc)
    active_until = _parse_iso_datetime(row.promoted_until)
    if active_until and active_until > now and row.promotion_tier:
        raise HTTPException(status_code=400, detail="Объявление уже поднято. Повторите после окончания текущего периода.")
    row.promoted_until = (now + timedelta(days=7)).isoformat()
    row.promotion_tier = "boost"
    await db.commit()
    await _log_action(db, str(user.id), "announcement_boost", "announcements", str(row.id))
    return {"success": True, "announcement": _announcement_to_dict(row)}


@router.get("/me/real-estate/{listing_id}")
async def get_my_real_estate(
    listing_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_real_estate(db, user, listing_id)
    return _real_estate_to_dict(row)


@router.put("/me/real-estate/{listing_id}")
async def update_my_real_estate(
    listing_id: int,
    request: RealEstateUpdateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_real_estate(db, user, listing_id)
    changed = False
    if request.re_type is not None:
        row.re_type = request.re_type.strip() or None
        changed = True
    if request.category_id is not None:
        row.category_id = request.category_id or None
        if row.category_id:
            cat = (
                await db.execute(select(Categories).where(Categories.id == row.category_id))
            ).scalar_one_or_none()
            if cat and cat.slug and cat.slug in RE_TYPE_BY_SLUG:
                row.re_type = RE_TYPE_BY_SLUG[cat.slug]
        changed = True
    if request.title is not None:
        row.title = request.title.strip() or None
        changed = True
    if request.description is not None:
        row.description = request.description.strip() or None
        changed = True
    if request.price is not None:
        row.price = request.price.strip() or None
        changed = True
    if request.address is not None:
        row.address = request.address.strip() or None
        changed = True
    if request.rooms is not None:
        row.rooms = request.rooms.strip() or None
        changed = True
    if request.area is not None:
        row.area = request.area.strip() or None
        changed = True
    if request.floor_info is not None:
        row.floor_info = request.floor_info.strip() or None
        changed = True
    if request.phone is not None:
        row.phone = request.phone.strip() or None
        changed = True
    if request.whatsapp is not None:
        row.whatsapp = request.whatsapp.strip() or None
        changed = True
    if request.telegram is not None:
        row.telegram = request.telegram.strip() or None
        changed = True
    if request.author_name is not None:
        row.author_name = request.author_name.strip() or None
        changed = True
    if request.gallery_images is not None:
        gallery = request.gallery_images.strip() or None
        row.gallery_images = gallery
        first = (gallery.split(",")[0] or "").strip() if gallery else None
        row.image_url = first or None
        changed = True
    if changed and row.status in {"approved", "published"}:
        row.status = "pending"
        row.active = True
    await db.commit()
    await _log_action(db, str(user.id), "real_estate_update", "real_estate", str(row.id))
    return {"success": True, "listing": _real_estate_to_dict(row)}


@router.post("/me/real-estate/{listing_id}/unpublish")
async def unpublish_my_real_estate(
    listing_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_real_estate(db, user, listing_id)
    row.status = "hidden"
    row.active = False
    await db.commit()
    await _log_action(db, str(user.id), "real_estate_unpublish", "real_estate", str(row.id))
    return {"success": True, "listing": _real_estate_to_dict(row)}


@router.delete("/me/real-estate/{listing_id}")
async def delete_my_real_estate(
    listing_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_real_estate(db, user, listing_id)
    await db.delete(row)
    await db.commit()
    await _log_action(db, str(user.id), "real_estate_delete", "real_estate", str(listing_id))
    return {"success": True}


@router.post("/me/real-estate/{listing_id}/extend")
async def extend_my_real_estate(
    listing_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_real_estate(db, user, listing_id)
    now = datetime.now(timezone.utc)
    base = _parse_iso_datetime(row.expires_at) or now
    if base < now:
        base = now
    row.expires_at = (base + timedelta(days=30)).isoformat()
    row.active = True
    if row.status == "hidden":
        row.status = "pending"
    await db.commit()
    await _log_action(db, str(user.id), "real_estate_extend", "real_estate", str(row.id))
    return {"success": True, "listing": _real_estate_to_dict(row)}


@router.post("/me/real-estate/{listing_id}/boost")
async def boost_my_real_estate(
    listing_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = await _get_owned_real_estate(db, user, listing_id)
    if row.status not in {"approved", "published"}:
        raise HTTPException(status_code=400, detail="Поднять можно только опубликованное объявление")
    now = datetime.now(timezone.utc)
    active_until = _parse_iso_datetime(row.promoted_until)
    if active_until and active_until > now and row.promotion_tier:
        raise HTTPException(status_code=400, detail="Объявление уже поднято. Повторите после окончания текущего периода.")
    row.promoted_until = (now + timedelta(days=7)).isoformat()
    row.promotion_tier = "boost"
    await db.commit()
    await _log_action(db, str(user.id), "real_estate_boost", "real_estate", str(row.id))
    return {"success": True, "listing": _real_estate_to_dict(row)}


async def _recalc_master_rating(db: AsyncSession, master_id: int) -> None:
    listing = (await db.execute(select(Masters).where(Masters.id == master_id))).scalar_one_or_none()
    if not listing:
        return
    rows = (
        await db.execute(select(Master_reviews).where(Master_reviews.master_id == master_id))
    ).scalars().all()
    if not rows:
        listing.rating = float(listing.rating or 0)
        listing.reviews_count = 0
    else:
        listing.rating = round(sum(int(r.rating or 0) for r in rows) / len(rows), 1)
        listing.reviews_count = len(rows)
    await db.commit()


@router.get("/masters/{master_id}/reviews")
async def list_master_reviews(
    master_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    listing = (await db.execute(select(Masters).where(Masters.id == master_id))).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    rows = (
        await db.execute(
            select(Master_reviews)
            .where(Master_reviews.master_id == master_id)
            .order_by(desc(Master_reviews.id))
            .offset(skip)
            .limit(limit)
        )
    ).scalars().all()
    total = (
        await db.execute(
            select(func.count()).select_from(Master_reviews).where(Master_reviews.master_id == master_id)
        )
    ).scalar() or 0
    return {
        "items": [
            {
                "id": r.id,
                "rating": r.rating,
                "comment": r.comment,
                "reviewer_name": r.reviewer_name,
                "created_at": r.created_at,
            }
            for r in rows
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
        "avg_rating": float(listing.rating or 0),
    }


@router.post("/masters/{master_id}/reviews", status_code=201)
async def create_master_review(
    master_id: int,
    body: MasterReviewCreateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    listing = (await db.execute(select(Masters).where(Masters.id == master_id))).scalar_one_or_none()
    if not listing:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    master_listing = await _find_master_listing(db, user)
    if master_listing and int(master_listing.id) == int(master_id):
        raise HTTPException(status_code=400, detail="Нельзя оставить отзыв самому себе")
    existing = (
        await db.execute(
            select(Master_reviews).where(
                Master_reviews.master_id == master_id,
                Master_reviews.reviewer_user_id == str(user.id),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Вы уже оставляли отзыв этому мастеру")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    review = Master_reviews(
        master_id=master_id,
        reviewer_user_id=str(user.id),
        reviewer_name=user.name or "Клиент",
        rating=body.rating,
        comment=(body.comment or "").strip() or None,
        created_at=now,
    )
    db.add(review)
    await db.flush()
    review_id = review.id
    await db.commit()
    await _recalc_master_rating(db, master_id)
    await _log_action(db, str(user.id), "master_review_create", "master_reviews", str(master_id))
    return {"success": True, "id": review_id}


@router.get("/masters/{master_id}/reviews/mine")
async def my_master_review(
    master_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    row = (
        await db.execute(
            select(Master_reviews).where(
                Master_reviews.master_id == master_id,
                Master_reviews.reviewer_user_id == str(user.id),
            )
        )
    ).scalar_one_or_none()
    if not row:
        return {"reviewed": False}
    return {
        "reviewed": True,
        "review": {
            "id": row.id,
            "rating": row.rating,
            "comment": row.comment,
            "created_at": row.created_at,
        },
    }


@router.put("/master/requests/{request_id}/status")
async def update_master_request_status(
    request_id: int,
    body: MasterRequestStatusUpdate,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    _assert_role(user, {"master", "admin", "superadmin", "moderator"})
    listing = await _find_master_listing(db, user)
    if not listing and user.role == "master":
        raise HTTPException(status_code=404, detail="Карточка мастера не найдена")
    req = (
        await db.execute(select(Master_requests).where(Master_requests.id == request_id))
    ).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if user.role == "master":
        if not listing or not _request_visible_to_master(req, listing):
            raise HTTPException(status_code=403, detail="Заявка недоступна")
    allowed = {"new": {"in_progress"}, "in_progress": {"done"}}
    current = (req.status or "new").strip().lower()
    target = body.status.strip().lower()
    if target not in allowed.get(current, set()):
        raise HTTPException(status_code=400, detail=f"Нельзя перевести из «{current}» в «{target}»")
    req.status = target
    await db.commit()
    await _log_action(db, str(user.id), "master_request_status", "master_requests", str(request_id))
    try:
        from services.user_notifications import notify_master_request_status

        await notify_master_request_status(db, req, target)
    except Exception:
        pass
    return {"success": True, "status": req.status}


@router.post("/admin/masters/approve-become-request/{request_id}")
async def approve_become_master_request(
    request_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    """Approve become-master application: create catalog entry and assign master role."""
    admin_actor, admin_user = await _assert_panel_admin(authorization, db)
    req = (
        await db.execute(select(Become_master_requests).where(Become_master_requests.id == request_id))
    ).scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")
    if req.status == "approved":
        raise HTTPException(status_code=400, detail="Заявка уже одобрена")

    normalized_phone = _normalize_phone(req.phone or "")
    existing_masters = (await db.execute(select(Masters).limit(500))).scalars().all()
    listing = next((m for m in existing_masters if _matches_user_phone(m.phone, req.phone)), None)
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    if not listing:
        listing = Masters(
            name=req.name or "",
            category=req.category or "",
            phone=normalized_phone or req.phone or "",
            whatsapp=getattr(req, "whatsapp", None) or normalized_phone or req.phone or "",
            telegram="",
            district=getattr(req, "district", None) or "Сортировка",
            description=req.description or "",
            rating=5.0,
            reviews_count=0,
            photo_url=getattr(req, "photo_url", None) or "",
            gallery_images=getattr(req, "gallery_images", None) or "",
            verified=True,
            available_today=True,
            services=req.description or req.category or "",
            experience_years=1,
            created_at=now,
        )
        db.add(listing)
    else:
        listing.name = req.name or listing.name
        listing.category = req.category or listing.category
        listing.phone = normalized_phone or listing.phone
        listing.whatsapp = getattr(req, "whatsapp", None) or listing.whatsapp or listing.phone
        listing.district = getattr(req, "district", None) or listing.district
        listing.description = req.description or listing.description
        if getattr(req, "photo_url", None):
            listing.photo_url = req.photo_url
        if getattr(req, "gallery_images", None):
            listing.gallery_images = req.gallery_images
        if req.description:
            listing.services = req.description

    req.status = "approved"

    matched_user = await _find_user_by_phone(db, req.phone)
    role_assigned = False
    if matched_user:
        if matched_user.role == "user":
            matched_user.role = "master"
            role_assigned = True
        elif matched_user.role == "master":
            role_assigned = True

    await db.commit()
    await db.refresh(listing)
    await _log_action(
        db,
        admin_actor,
        "approve_become_master",
        "become_master_requests",
        str(req.id),
        {"master_id": listing.id, "user_id": str(matched_user.id) if matched_user else None, "role_assigned": role_assigned},
    )
    try:
        from services.user_notifications import notify_become_master_decision

        await notify_become_master_decision(db, req, "approved")
    except Exception:
        pass
    return {"success": True, "master_id": listing.id, "role_assigned": role_assigned}


@router.get("/partner/cabinet")
async def partner_cabinet(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _current_user(db, authorization)
    _assert_role(user, {"seller", "admin", "superadmin", "moderator"})
    restaurants = (await db.execute(select(Food_restaurants).order_by(desc(Food_restaurants.id)).limit(100))).scalars().all()
    shops = [r for r in restaurants if _matches_user_phone(r.whatsapp_phone, user.phone)]
    food_orders = (await db.execute(select(Food_orders).order_by(desc(Food_orders.id)).limit(500))).scalars().all()
    shop_ids = {r.id for r in shops}
    partner_orders = [
        o
        for o in food_orders
        if (o.restaurant_id in shop_ids)
        or _matches_user_phone(o.restaurant_phone, user.phone)
    ]
    # Global gastronom catalog/orders are platform-wide data with no per-seller
    # ownership, so only admin-level roles may see them. A plain seller must only
    # see their own restaurant data, never the whole platform's gastronom feed.
    is_admin = (user.role or "") in {"moderator", "admin", "superadmin"}
    if is_admin:
        gastronom_products = (
            await db.execute(select(Gastronom_products).where(Gastronom_products.is_active == True).limit(500))
        ).scalars().all()
        gastronom_orders = (
            await db.execute(select(Gastronom_orders).order_by(desc(Gastronom_orders.id)).limit(500))
        ).scalars().all()
    else:
        gastronom_products = []
        gastronom_orders = []
    primary = shops[0] if shops else None
    revenue = sum(float(o.total_amount or 0) for o in partner_orders)
    return {
        "shop_profile": {
            "shop_name": primary.name if primary else user.name,
            "shop_description": primary.description if primary else "",
            "logo_url": primary.photo if primary else user.avatar_url,
            "banners": [primary.photo] if primary and primary.photo else [],
            "phone": user.phone,
        },
        "products": [
            {"id": p.id, "title": p.name, "price": p.price, "active": bool(p.is_active)}
            for p in gastronom_products[:100]
        ],
        "orders": [
            {
                "id": o.id,
                "status": o.status,
                "total": o.total_amount,
                "customer_name": o.customer_name,
                "created_at": o.created_at,
            }
            for o in partner_orders[:100]
        ],
        "gastronom_orders": [
            {"id": o.id, "status": o.status, "total": o.total_amount, "created_at": o.created_at}
            for o in gastronom_orders[:50]
        ],
        "analytics": {
            "products_total": len(gastronom_products),
            "orders_total": len(partner_orders),
            "gastronom_orders_total": len(gastronom_orders),
            "revenue": revenue,
            "restaurants_total": len(shops),
        },
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
    return {"roles": ["user", "master", "driver", "seller", "moderator", "admin", "superadmin"], "session_window_minutes": _session_expiry_minutes(), "login_rate_limit_window_minutes": int(LOGIN_WINDOW.total_seconds() // 60), "max_login_attempts": MAX_ATTEMPTS, "welcome_bonus_points": WELCOME_BONUS_POINTS}
