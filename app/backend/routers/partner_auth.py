"""Partner panel authentication — separate from platform admin and resident accounts."""

import hashlib
import logging
import os
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import AccessTokenError, create_access_token, decode_access_token
from core.database import db_manager, get_db
from core.partner_guard import (
    DAM_ALEM_PARTNER_TYPE,
    PARTNER_TYPES,
    is_panel_admin_payload,
    is_partner_payload,
)
from models.partner_auth import PartnerCredentials, PartnerLoginAttempt
from utils.phone import normalize_phone as _normalize_phone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/partner-auth", tags=["partner-auth"])

SESSION_EXPIRY_HOURS = 72

PARTNER_DEFAULT_NAMES: dict[str, str] = {
    "dam_alem": "DAM ALEM",
    "gastronom": "Гастроном",
    "volna": "VOLNA",
    "prorab": "PRORAB",
    "pharmacy": "Аптека",
}

PARTNER_ENV_PREFIX: dict[str, str] = {
    "dam_alem": "DAM_ALEM",
    "gastronom": "GASTRONOM",
    "volna": "VOLNA",
    "prorab": "PRORAB",
    "pharmacy": "PHARMACY",
}


def _truthy(value: str) -> bool:
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip
    if request.client:
        return request.client.host
    return "unknown"


def _normalize_login(login: str) -> tuple[str, str]:
    raw = (login or "").strip()
    if not raw:
        return "", ""
    if "@" in raw:
        return "email", raw.lower()
    return "phone", _normalize_phone(raw)


def _assert_partner_type(partner_type: str) -> str:
    if partner_type not in PARTNER_TYPES:
        raise HTTPException(status_code=404, detail="Неизвестный тип партнёра")
    return partner_type


def _default_name(partner_type: str) -> str:
    return PARTNER_DEFAULT_NAMES.get(partner_type, partner_type)


def _create_partner_jwt(partner_id: int, partner_type: str, login: str, display_name: str = "") -> str:
    return create_access_token(
        claims={
            "sub": f"partner:{partner_type}:{partner_id}",
            "role": "partner",
            "partner_type": partner_type,
            "partner_id": partner_id,
            "login": login,
            "display_name": display_name or "",
            "type": "partner_session",
        },
        expires_minutes=SESSION_EXPIRY_HOURS * 60,
    )


def _verify_partner_jwt(token: str, partner_type: str) -> Optional[dict]:
    try:
        payload = decode_access_token(token)
    except AccessTokenError:
        return None
    if not is_partner_payload(payload, partner_type):
        return None
    return payload


async def _log_attempt(
    db: AsyncSession,
    partner_type: str,
    login: str,
    ip_address: str,
    user_agent: str,
    success: bool,
    failure_reason: Optional[str] = None,
) -> None:
    db.add(
        PartnerLoginAttempt(
            partner_type=partner_type,
            login=login,
            ip_address=ip_address,
            user_agent=user_agent[:500] if user_agent else None,
            success=success,
            failure_reason=failure_reason,
        )
    )
    await db.commit()
    status_str = "SUCCESS" if success else f"FAILED ({failure_reason})"
    ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()[:8]
    logger.info("[Partner Auth] login=%s type=%s ip_hash=%s status=%s", login, partner_type, ip_hash, status_str)


async def _find_partner(db: AsyncSession, partner_type: str, login: str) -> PartnerCredentials | None:
    kind, normalized = _normalize_login(login)
    if not normalized:
        return None
    clause = PartnerCredentials.email == normalized if kind == "email" else PartnerCredentials.phone == normalized
    return (
        await db.execute(
            select(PartnerCredentials).where(
                PartnerCredentials.partner_type == partner_type,
                PartnerCredentials.is_active == True,
                clause,
            )
        )
    ).scalar_one_or_none()


def _require_panel_admin(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация администратора.")
    token = auth[7:].strip()
    try:
        payload = decode_access_token(token)
    except AccessTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    if not is_panel_admin_payload(payload):
        raise HTTPException(status_code=403, detail="Доступ только для администратора.")
    return payload


class PartnerLoginRequest(BaseModel):
    login: str = Field(..., description="Email или номер телефона")
    password: str


class PartnerLoginResponse(BaseModel):
    success: bool
    message: str = ""
    token: str = ""
    jwt_token: str = ""
    display_name: str = ""


class PartnerSessionCheckResponse(BaseModel):
    valid: bool
    login: str = ""
    display_name: str = ""
    jwt_token: str = ""


class PartnerChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class PartnerChangePasswordResponse(BaseModel):
    success: bool
    message: str = ""


class PartnerCredentialItem(BaseModel):
    id: int
    partner_type: str
    email: str | None = None
    phone: str | None = None
    display_name: str | None = None
    is_active: bool
    created_at: str | None = None


class PartnerCredentialCreateRequest(BaseModel):
    email: str | None = None
    phone: str | None = None
    password: str
    display_name: str | None = None


class PartnerCredentialUpdateRequest(BaseModel):
    email: str | None = None
    phone: str | None = None
    password: str | None = None
    display_name: str | None = None
    is_active: bool | None = None


def _credential_item(row: PartnerCredentials) -> PartnerCredentialItem:
    return PartnerCredentialItem(
        id=row.id,
        partner_type=row.partner_type,
        email=row.email,
        phone=row.phone,
        display_name=row.display_name,
        is_active=row.is_active,
        created_at=row.created_at.isoformat() if row.created_at else None,
    )


@router.post("/{partner_type}/login", response_model=PartnerLoginResponse)
async def partner_login(
    partner_type: str,
    payload: PartnerLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    partner_type = _assert_partner_type(partner_type)
    login_raw = payload.login.strip()
    ip_address = _get_client_ip(request)
    user_agent = request.headers.get("user-agent", "")

    if not login_raw or not payload.password:
        await _log_attempt(db, partner_type, login_raw, ip_address, user_agent, False, "empty_fields")
        return PartnerLoginResponse(success=False, message="Введите email или телефон и пароль.")

    partner = await _find_partner(db, partner_type, login_raw)
    if not partner or not _verify_password(payload.password, partner.password_hash):
        await _log_attempt(db, partner_type, login_raw, ip_address, user_agent, False, "invalid_credentials")
        return PartnerLoginResponse(success=False, message="Неверный email/телефон или пароль.")

    kind, normalized = _normalize_login(login_raw)
    login_label = partner.email if kind == "email" else (partner.phone or normalized)
    default_name = _default_name(partner_type)
    token = _create_partner_jwt(
        partner.id, partner_type, login_label or login_raw, partner.display_name or default_name
    )
    await _log_attempt(db, partner_type, login_raw, ip_address, user_agent, True)

    return PartnerLoginResponse(
        success=True,
        message="Вход выполнен",
        token=token,
        jwt_token=token,
        display_name=partner.display_name or default_name,
    )


@router.post("/{partner_type}/verify-session", response_model=PartnerSessionCheckResponse)
async def partner_verify_session(
    partner_type: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    partner_type = _assert_partner_type(partner_type)
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return PartnerSessionCheckResponse(valid=False)
    token = auth[7:].strip()
    claims = _verify_partner_jwt(token, partner_type)
    if not claims:
        return PartnerSessionCheckResponse(valid=False)

    partner_id = claims.get("partner_id")
    if partner_id:
        partner = (
            await db.execute(
                select(PartnerCredentials).where(
                    PartnerCredentials.id == partner_id,
                    PartnerCredentials.is_active == True,
                )
            )
        ).scalar_one_or_none()
        if not partner:
            return PartnerSessionCheckResponse(valid=False)

    return PartnerSessionCheckResponse(
        valid=True,
        login=str(claims.get("login") or ""),
        display_name=str(claims.get("display_name") or _default_name(partner_type)),
        jwt_token=token,
    )


@router.post("/{partner_type}/change-password", response_model=PartnerChangePasswordResponse)
async def partner_change_password(
    partner_type: str,
    payload: PartnerChangePasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    partner_type = _assert_partner_type(partner_type)
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    claims = _verify_partner_jwt(auth[7:].strip(), partner_type)
    if not claims:
        raise HTTPException(status_code=401, detail="Сессия истекла")

    partner_id = claims.get("partner_id")
    partner = (
        await db.execute(select(PartnerCredentials).where(PartnerCredentials.id == partner_id))
    ).scalar_one_or_none()
    if not partner or not partner.is_active:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    if not _verify_password(payload.current_password, partner.password_hash):
        return PartnerChangePasswordResponse(success=False, message="Неверный текущий пароль.")
    if len(payload.new_password or "") < 6:
        return PartnerChangePasswordResponse(success=False, message="Новый пароль — минимум 6 символов.")

    partner.password_hash = _hash_password(payload.new_password)
    await db.commit()
    return PartnerChangePasswordResponse(success=True, message="Пароль обновлён.")


@router.get("/{partner_type}/credentials", response_model=list[PartnerCredentialItem])
async def list_partner_credentials(
    partner_type: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    partner_type = _assert_partner_type(partner_type)
    _require_panel_admin(request)
    rows = (
        await db.execute(
            select(PartnerCredentials)
            .where(PartnerCredentials.partner_type == partner_type)
            .order_by(PartnerCredentials.id)
        )
    ).scalars().all()
    return [_credential_item(r) for r in rows]


@router.post("/{partner_type}/credentials", response_model=PartnerCredentialItem, status_code=status.HTTP_201_CREATED)
async def create_partner_credential(
    partner_type: str,
    payload: PartnerCredentialCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    partner_type = _assert_partner_type(partner_type)
    _require_panel_admin(request)

    email = (payload.email or "").strip().lower() or None
    phone = _normalize_phone(payload.phone or "") if payload.phone else None
    if not email and not phone:
        raise HTTPException(status_code=400, detail="Укажите email или телефон.")
    if len(payload.password or "") < 6:
        raise HTTPException(status_code=400, detail="Пароль — минимум 6 символов.")

    filters = []
    if email:
        filters.append(PartnerCredentials.email == email)
    if phone:
        filters.append(PartnerCredentials.phone == phone)
    if filters:
        existing = (
            await db.execute(
                select(PartnerCredentials).where(
                    PartnerCredentials.partner_type == partner_type,
                    or_(*filters),
                )
            )
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status_code=409, detail="Такой email или телефон уже используется для этого партнёра.")

    row = PartnerCredentials(
        partner_type=partner_type,
        email=email,
        phone=phone,
        password_hash=_hash_password(payload.password),
        display_name=(payload.display_name or "").strip() or _default_name(partner_type),
        is_active=True,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _credential_item(row)


@router.patch("/{partner_type}/credentials/{credential_id}", response_model=PartnerCredentialItem)
async def update_partner_credential(
    partner_type: str,
    credential_id: int,
    payload: PartnerCredentialUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    partner_type = _assert_partner_type(partner_type)
    _require_panel_admin(request)
    row = (
        await db.execute(
            select(PartnerCredentials).where(
                PartnerCredentials.id == credential_id,
                PartnerCredentials.partner_type == partner_type,
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    if payload.email is not None:
        row.email = payload.email.strip().lower() or None
    if payload.phone is not None:
        row.phone = _normalize_phone(payload.phone) if payload.phone.strip() else None
    if payload.display_name is not None:
        row.display_name = payload.display_name.strip() or row.display_name
    if payload.is_active is not None:
        row.is_active = payload.is_active
    if payload.password:
        if len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="Пароль — минимум 6 символов.")
        row.password_hash = _hash_password(payload.password)

    if not row.email and not row.phone:
        raise HTTPException(status_code=400, detail="Нужен хотя бы email или телефон.")

    await db.commit()
    await db.refresh(row)
    return _credential_item(row)


async def _initialize_partner_from_env(partner_type: str) -> None:
    prefix = PARTNER_ENV_PREFIX.get(partner_type, partner_type.upper())
    email = os.getenv(f"{prefix}_PARTNER_EMAIL", "").strip().lower() or None
    phone = _normalize_phone(os.getenv(f"{prefix}_PARTNER_PHONE", "")) or None
    password = os.getenv(f"{prefix}_PARTNER_PASSWORD", "").strip()
    display_name = os.getenv(f"{prefix}_PARTNER_NAME", "").strip() or _default_name(partner_type)
    force_reset = _truthy(os.getenv(f"{prefix}_PARTNER_FORCE_RESET", ""))

    if not email and not phone:
        return

    async with db_manager.async_session_maker() as db:
        existing = (
            await db.execute(
                select(PartnerCredentials).where(PartnerCredentials.partner_type == partner_type)
            )
        ).scalars().first()

        if existing and not force_reset:
            logger.info("[Partner Auth] %s partner account already exists (id=%s).", partner_type, existing.id)
            return

        pwd = password or f"{partner_type}-change-me"
        if existing:
            existing.email = email or existing.email
            existing.phone = phone or existing.phone
            existing.display_name = display_name
            existing.password_hash = _hash_password(pwd)
            existing.is_active = True
            logger.info("[Partner Auth] %s partner account updated (id=%s).", partner_type, existing.id)
        else:
            db.add(
                PartnerCredentials(
                    partner_type=partner_type,
                    email=email,
                    phone=phone,
                    password_hash=_hash_password(pwd),
                    display_name=display_name,
                    is_active=True,
                )
            )
            logger.info("[Partner Auth] %s partner account created.", partner_type)
        await db.commit()


async def initialize_dam_alem_partner_credentials():
    """Backward-compatible entry point."""
    await initialize_all_partner_credentials()


async def initialize_all_partner_credentials():
    try:
        await db_manager.ensure_initialized()
        if not db_manager.async_session_maker:
            logger.error("[Partner Auth] Database unavailable — skipping partner credential setup.")
            return
        for partner_type in PARTNER_TYPES:
            try:
                await _initialize_partner_from_env(partner_type)
            except Exception as exc:
                logger.warning("[Partner Auth] Init failed for %s: %s", partner_type, exc)
    except Exception as exc:
        logger.exception("[Partner Auth] Failed to initialize partner credentials: %s", exc)
