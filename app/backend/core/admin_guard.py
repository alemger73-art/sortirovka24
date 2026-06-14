"""Reusable admin-panel JWT checks (same rules as EntityWriteGuard)."""

from fastapi import HTTPException, Request

from core.auth import AccessTokenError, decode_access_token


def _panel_admin_payload(request: Request) -> dict:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация администратора.")
    token = auth[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация администратора.")
    try:
        payload = decode_access_token(token)
    except AccessTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    if payload.get("role") != "admin" or not payload.get("username"):
        raise HTTPException(status_code=403, detail="Доступ только для администратора.")
    return payload


def require_panel_admin(request: Request) -> dict:
    return _panel_admin_payload(request)
