"""Server-side publication privileges, independent of client filter fields."""
from core.auth import AccessTokenError, decode_access_token
from models.admin_auth import AdminCredentials
from sqlalchemy import select
from services.account_session import resolve_account_user


async def is_content_admin(db, authorization: str | None) -> bool:
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    try:
        claims = decode_access_token(authorization.split(" ", 1)[1].strip())
    except AccessTokenError:
        return False
    if claims.get("type") == "admin_session" and claims.get("role") == "admin":
        username = claims.get("username")
        if not username or claims.get("sub") != f"admin:{username}":
            return False
        return bool(await db.scalar(select(AdminCredentials.id).where(
            AdminCredentials.username == username, AdminCredentials.is_active == True)))
    user = await resolve_account_user(db, authorization)
    return bool(user and user.role in {"admin", "superadmin", "moderator"})
