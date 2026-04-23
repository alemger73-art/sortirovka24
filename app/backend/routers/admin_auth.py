"""Admin Panel Authentication Router.

Provides secure admin authentication with:
- bcrypt password hashing
- JWT-based stateless authentication (survives server restarts)
- Brute-force protection (5 attempts → 15 min lockout)
- Login attempt logging (IP, time, status)
- Multi-password support for the "admin" account
"""

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import create_access_token, decode_access_token, AccessTokenError
from core.database import get_db, db_manager
from models.admin_auth import AdminCredentials, AdminLoginAttempt, AdminLoginLockout

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin-auth", tags=["admin-auth"])

# Configuration
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15
SESSION_EXPIRY_HOURS = 24


# ---------- Schemas ----------

class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    success: bool
    message: str = ""
    token: str = ""
    jwt_token: str = ""
    remaining_attempts: int = MAX_FAILED_ATTEMPTS


class AdminSessionCheckResponse(BaseModel):
    valid: bool
    username: str = ""
    jwt_token: str = ""


class AdminLoginLogEntry(BaseModel):
    id: int
    username: str
    ip_address: str | None
    success: bool
    failure_reason: str | None
    created_at: str | None


# ---------- Helpers ----------

def _hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# Pre-computed bcrypt hashes for the "admin" account's allowed passwords.
_admin_password_hashes: list[str] = []


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request headers."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip
    if request.client:
        return request.client.host
    return "unknown"


def _create_admin_jwt(username: str) -> str:
    """Create a JWT token for admin authentication."""
    return create_access_token(
        claims={
            "sub": f"admin:{username}",
            "role": "admin",
            "username": username,
            "type": "admin_session",
        },
        expires_minutes=SESSION_EXPIRY_HOURS * 60,
    )


def _verify_admin_jwt(token: str) -> Optional[dict]:
    """Verify and decode an admin JWT token. Returns claims or None."""
    try:
        payload = decode_access_token(token)
        # Verify it's an admin token
        if payload.get("role") != "admin":
            return None
        if not payload.get("username"):
            return None
        return payload
    except AccessTokenError:
        return None
    except Exception:
        return None


async def _log_attempt(
    db: AsyncSession,
    username: str,
    ip_address: str,
    user_agent: str,
    success: bool,
    failure_reason: Optional[str] = None,
) -> None:
    """Log a login attempt."""
    attempt = AdminLoginAttempt(
        username=username,
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent else None,
        success=success,
        failure_reason=failure_reason,
    )
    db.add(attempt)
    await db.commit()

    status_str = "SUCCESS" if success else f"FAILED ({failure_reason})"
    ip_hash = hashlib.sha256(ip_address.encode()).hexdigest()[:8]
    logger.info(f"[Admin Auth] Login attempt: user='{username}', ip_hash={ip_hash}, status={status_str}")


async def _check_lockout(db: AsyncSession, ip_address: str) -> tuple[bool, int]:
    """Check if an IP is locked out. Returns: (is_locked, remaining_attempts)"""
    result = await db.execute(
        select(AdminLoginLockout).where(AdminLoginLockout.ip_address == ip_address)
    )
    lockout = result.scalar_one_or_none()

    if not lockout:
        return False, MAX_FAILED_ATTEMPTS

    if lockout.locked_until and lockout.locked_until > datetime.now(timezone.utc):
        return True, 0

    if lockout.locked_until and lockout.locked_until <= datetime.now(timezone.utc):
        lockout.failed_attempts = 0
        lockout.locked_until = None
        await db.commit()
        return False, MAX_FAILED_ATTEMPTS

    remaining = MAX_FAILED_ATTEMPTS - lockout.failed_attempts
    return False, max(0, remaining)


async def _record_failed_attempt(db: AsyncSession, ip_address: str) -> int:
    """Record a failed login attempt and return remaining attempts."""
    result = await db.execute(
        select(AdminLoginLockout).where(AdminLoginLockout.ip_address == ip_address)
    )
    lockout = result.scalar_one_or_none()

    if not lockout:
        lockout = AdminLoginLockout(
            ip_address=ip_address,
            failed_attempts=1,
            last_attempt_at=datetime.now(timezone.utc),
        )
        db.add(lockout)
    else:
        lockout.failed_attempts += 1
        lockout.last_attempt_at = datetime.now(timezone.utc)

        if lockout.failed_attempts >= MAX_FAILED_ATTEMPTS:
            lockout.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
            logger.warning(f"[Admin Auth] IP locked out for {LOCKOUT_DURATION_MINUTES} minutes")

    await db.commit()
    remaining = MAX_FAILED_ATTEMPTS - lockout.failed_attempts
    return max(0, remaining)


async def _reset_failed_attempts(db: AsyncSession, ip_address: str) -> None:
    """Reset failed attempts after successful login."""
    result = await db.execute(
        select(AdminLoginLockout).where(AdminLoginLockout.ip_address == ip_address)
    )
    lockout = result.scalar_one_or_none()

    if lockout:
        lockout.failed_attempts = 0
        lockout.locked_until = None
        await db.commit()


# ---------- Routes ----------

@router.post("/login", response_model=AdminLoginResponse)
async def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate admin user with JWT-based stateless auth."""
    ip_address = _get_client_ip(request)
    user_agent = request.headers.get("user-agent", "")

    # Check lockout
    is_locked, remaining = await _check_lockout(db, ip_address)
    if is_locked:
        await _log_attempt(db, payload.username, ip_address, user_agent, False, "ip_locked_out")
        return AdminLoginResponse(
            success=False,
            message=f"Слишком много попыток входа. Повторите через {LOCKOUT_DURATION_MINUTES} минут.",
            remaining_attempts=0,
        )

    # Find admin credentials
    result = await db.execute(
        select(AdminCredentials).where(
            AdminCredentials.username == payload.username,
            AdminCredentials.is_active == True,
        )
    )
    admin = result.scalar_one_or_none()

    if not admin:
        remaining = await _record_failed_attempt(db, ip_address)
        await _log_attempt(db, payload.username, ip_address, user_agent, False, "user_not_found")
        return AdminLoginResponse(
            success=False,
            message="Неверный логин или пароль.",
            remaining_attempts=remaining,
        )

    # Verify password — check DB hash first, then alternative hashes for "admin" account
    password_ok = _verify_password(payload.password, admin.password_hash)
    if not password_ok and admin.username == "admin" and _admin_password_hashes:
        password_ok = any(
            _verify_password(payload.password, h) for h in _admin_password_hashes
        )
    if not password_ok:
        remaining = await _record_failed_attempt(db, ip_address)
        await _log_attempt(db, payload.username, ip_address, user_agent, False, "wrong_password")
        return AdminLoginResponse(
            success=False,
            message="Неверный логин или пароль.",
            remaining_attempts=remaining,
        )

    # Success — generate JWT token (stateless, survives server restarts)
    jwt_token = ""
    try:
        jwt_token = _create_admin_jwt(admin.username)
    except Exception as e:
        logger.error(f"[Admin Auth] Failed to create JWT for admin: {e}")
        return AdminLoginResponse(
            success=False,
            message="Ошибка создания токена авторизации.",
            remaining_attempts=remaining,
        )

    # Reset failed attempts
    await _reset_failed_attempts(db, ip_address)
    await _log_attempt(db, payload.username, ip_address, user_agent, True)

    return AdminLoginResponse(
        success=True,
        message="Вход выполнен успешно.",
        token=jwt_token,       # Primary token — JWT (used by frontend for auth)
        jwt_token=jwt_token,   # Same JWT (for backward compatibility with SDK storage)
        remaining_attempts=MAX_FAILED_ATTEMPTS,
    )


@router.post("/verify-session", response_model=AdminSessionCheckResponse)
async def verify_session(request: Request):
    """Verify if a JWT admin token is still valid.

    Stateless verification — decodes JWT without server-side session storage.
    Works across server restarts and deployments.
    """
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return AdminSessionCheckResponse(valid=False)

    token = auth_header[7:]
    claims = _verify_admin_jwt(token)

    if not claims:
        return AdminSessionCheckResponse(valid=False)

    username = claims.get("username", "")

    # Re-issue a fresh JWT to extend the session
    fresh_jwt = ""
    try:
        fresh_jwt = _create_admin_jwt(username)
    except Exception as e:
        logger.warning(f"[Admin Auth] Failed to re-issue JWT on session verify: {e}")
        # Use existing token if re-issue fails
        fresh_jwt = token

    return AdminSessionCheckResponse(valid=True, username=username, jwt_token=fresh_jwt)


@router.post("/logout")
async def admin_logout(request: Request):
    """Logout admin session.

    With JWT-based auth, logout is handled client-side by removing the token.
    This endpoint exists for API consistency and logging.
    """
    return {"success": True, "message": "Сессия завершена."}


@router.get("/login-log")
async def get_login_log(
    request: Request,
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    """Get recent login attempts (admin only — requires valid JWT)."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    token = auth_header[7:]
    claims = _verify_admin_jwt(token)
    if not claims:
        raise HTTPException(status_code=401, detail="Сессия истекла")

    result = await db.execute(
        select(AdminLoginAttempt)
        .order_by(AdminLoginAttempt.id.desc())
        .limit(limit)
    )
    attempts = result.scalars().all()

    return [
        AdminLoginLogEntry(
            id=a.id,
            username=a.username,
            ip_address=a.ip_address,
            success=a.success,
            failure_reason=a.failure_reason,
            created_at=a.created_at.isoformat() if a.created_at else None,
        )
        for a in attempts
    ]


# ---------- Change Credentials ----------

class ChangeCredentialsRequest(BaseModel):
    current_password: str
    new_username: str | None = None
    new_password: str | None = None


class ChangeCredentialsResponse(BaseModel):
    success: bool
    message: str = ""


class CreateAdminResponse(BaseModel):
    message: str


@router.post("/create-admin", response_model=CreateAdminResponse)
async def create_or_update_admin(
    db: AsyncSession = Depends(get_db),
):
    """Create or update admin credentials from environment variables."""
    admin_email = os.getenv("ADMIN_EMAIL", "").strip()
    admin_password = os.getenv("ADMIN_PASSWORD", "")

    if not admin_email or not admin_password:
        raise HTTPException(
            status_code=400,
            detail="ADMIN_EMAIL and ADMIN_PASSWORD must be set",
        )

    result = await db.execute(
        select(AdminCredentials).where(AdminCredentials.username == admin_email)
    )
    admin = result.scalar_one_or_none()

    hashed_password = _hash_password(admin_password)
    if not _verify_password(admin_password, hashed_password):
        raise HTTPException(status_code=500, detail="Failed to hash admin password")

    if admin:
        admin.password_hash = hashed_password
        admin.is_active = True
    else:
        admin = AdminCredentials(
            username=admin_email,
            password_hash=hashed_password,
            is_active=True,
        )
        db.add(admin)

    await db.commit()
    logger.info("Admin user created or updated")
    return CreateAdminResponse(message="admin created or updated")


@router.post("/change-credentials", response_model=ChangeCredentialsResponse)
async def change_credentials(
    payload: ChangeCredentialsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Change admin username and/or password. Requires valid JWT and current password."""
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    token = auth_header[7:]
    claims = _verify_admin_jwt(token)
    if not claims:
        raise HTTPException(status_code=401, detail="Сессия истекла")

    current_username = claims.get("username", "")

    # Find current admin
    result = await db.execute(
        select(AdminCredentials).where(
            AdminCredentials.username == current_username,
            AdminCredentials.is_active == True,
        )
    )
    admin = result.scalar_one_or_none()

    if not admin:
        raise HTTPException(status_code=404, detail="Администратор не найден")

    # Verify current password
    if not _verify_password(payload.current_password, admin.password_hash):
        return ChangeCredentialsResponse(
            success=False,
            message="Неверный текущий пароль.",
        )

    if not payload.new_username and not payload.new_password:
        return ChangeCredentialsResponse(
            success=False,
            message="Укажите новый логин или пароль.",
        )

    changes = []

    # Update username
    if payload.new_username and payload.new_username.strip() != current_username:
        new_username = payload.new_username.strip()
        if len(new_username) < 3:
            return ChangeCredentialsResponse(
                success=False,
                message="Логин должен содержать минимум 3 символа.",
            )
        existing = await db.execute(
            select(AdminCredentials).where(
                AdminCredentials.username == new_username,
                AdminCredentials.id != admin.id,
            )
        )
        if existing.scalar_one_or_none():
            return ChangeCredentialsResponse(
                success=False,
                message="Этот логин уже занят.",
            )
        admin.username = new_username
        changes.append("логин")

    # Update password
    if payload.new_password:
        if len(payload.new_password) < 6:
            return ChangeCredentialsResponse(
                success=False,
                message="Пароль должен содержать минимум 6 символов.",
            )
        admin.password_hash = _hash_password(payload.new_password)
        changes.append("пароль")

    await db.commit()

    logger.info(f"[Admin Auth] Credentials updated for '{current_username}': {', '.join(changes)}")

    return ChangeCredentialsResponse(
        success=True,
        message=f"Успешно обновлено: {', '.join(changes)}.",
    )


# ---------- Initialization ----------

# The accepted passwords for the "admin" account
_ADMIN_PASSWORDS = ["Admin123@", "Admin", "Adminger123@", "Adminger123"]


async def initialize_admin_credentials():
    """Initialize admin credentials and sync env-configured admin password.

    Creates admin accounts and pre-computes alternative password hashes.
    IMPORTANT: The env-configured admin account password is always updated.
    """
    global _admin_password_hashes

    try:
        await db_manager.ensure_initialized()

        if not db_manager.async_session_maker:
            logger.error("[Admin Auth] Database session maker unavailable. Skipping admin credential setup.")
            return

        # Pre-compute bcrypt hashes for all accepted admin passwords
        _admin_password_hashes = [_hash_password(p) for p in _ADMIN_PASSWORDS]
        logger.info(f"[Admin Auth] Pre-computed {len(_admin_password_hashes)} alternative password hashes for 'admin' account")

        async with db_manager.async_session_maker() as db:
            # --- env-configured admin account ---
            admin_username = os.getenv("ADMIN_EMAIL", "admin").strip() or "admin"
            admin_password = os.getenv("ADMIN_PASSWORD", "Admin123@")
            result = await db.execute(
                select(AdminCredentials).where(AdminCredentials.username == admin_username)
            )
            existing_admin = result.scalar_one_or_none()

            if not existing_admin:
                # Create account from env values
                password_hash = _hash_password(admin_password)
                admin = AdminCredentials(
                    username=admin_username,
                    password_hash=password_hash,
                    is_active=True,
                )
                db.add(admin)
                await db.commit()
                logger.info("[Admin Auth] Admin credentials created from env (username: %s)", admin_username)
            else:
                # Always sync password from env and ensure account is active
                existing_admin.password_hash = _hash_password(admin_password)
                existing_admin.is_active = True
                await db.commit()
                logger.info("[Admin Auth] Admin credentials updated from env (username: %s)", admin_username)

            # --- "alemger_core" account (legacy) ---
            result = await db.execute(
                select(AdminCredentials).where(AdminCredentials.username == "alemger_core")
            )
            existing_legacy = result.scalar_one_or_none()

            if not existing_legacy:
                password_hash = _hash_password("AlemgerDarad123@")
                legacy = AdminCredentials(
                    username="alemger_core",
                    password_hash=password_hash,
                    is_active=True,
                )
                db.add(legacy)
                await db.commit()
                logger.info("[Admin Auth] Legacy admin credentials created (username: alemger_core)")

            # --- "alemgersrt24" account (main admin) ---
            result = await db.execute(
                select(AdminCredentials).where(AdminCredentials.username == "alemgersrt24")
            )
            existing_main = result.scalar_one_or_none()

            if not existing_main:
                password_hash = _hash_password("AlemgerAdmin123@")
                main_admin = AdminCredentials(
                    username="alemgersrt24",
                    password_hash=password_hash,
                    is_active=True,
                )
                db.add(main_admin)
                await db.commit()
                logger.info("[Admin Auth] Main admin credentials created (username: alemgersrt24)")

    except Exception as e:
        logger.error(f"[Admin Auth] Failed to initialize admin credentials: {e}", exc_info=True)