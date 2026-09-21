from core.database import get_db
from models.admin_auth import AdminCredentials
from services.account_session import resolve_account_user
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from typing import Optional

from core.auth import AccessTokenError, decode_access_token
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False)


async def get_bearer_token(
    request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)
) -> str:
    """Extract bearer token from Authorization header."""
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials

    logger.debug("Authentication required for request %s %s", request.method, request.url.path)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication credentials were not provided")


async def get_current_user(token: str = Depends(get_bearer_token), db: AsyncSession = Depends(get_db)) -> UserResponse:
    """Resolve live account sessions; never trust stale role/status JWT claims."""
    try:
        payload = decode_access_token(token)
    except AccessTokenError:
        raise HTTPException(401, "Invalid authentication token")
    # Platform administrators have separate credentials, not resident sessions.
    if payload.get("type") == "admin_session" and payload.get("role") == "admin":
        username = payload.get("username")
        admin = await db.scalar(select(AdminCredentials).where(
            AdminCredentials.username == username, AdminCredentials.is_active == True))
        if admin and payload.get("sub") == f"admin:{username}":
            return UserResponse(id=payload["sub"], email="", name=username, role="admin")
        raise HTTPException(401, "Administrator access is not active")
    user = await resolve_account_user(db, f"Bearer {token}")
    if user is None:
        raise HTTPException(401, "Session is not active")
    return UserResponse(id=str(user.id), email=user.email or "", name=user.name,
                        role=user.role, last_login=user.last_login)


async def get_admin_user(current_user: UserResponse = Depends(get_current_user)) -> UserResponse:
    """Dependency to ensure current user has admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
