"""Google OAuth 2.0 for resident account login/registration."""

import logging
import os
from typing import Any
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPES = "openid email profile"


class GoogleOAuthError(Exception):
    """Raised when Google OAuth is misconfigured or fails."""


def google_oauth_enabled() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID", "").strip() and os.getenv("GOOGLE_CLIENT_SECRET", "").strip())


def _client_id() -> str:
    value = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    if not value:
        raise GoogleOAuthError("GOOGLE_CLIENT_ID is not set")
    return value


def _client_secret() -> str:
    value = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    if not value:
        raise GoogleOAuthError("GOOGLE_CLIENT_SECRET is not set")
    return value


def build_google_authorization_url(*, state: str, redirect_uri: str) -> str:
    params = {
        "client_id": _client_id(),
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_google_code(*, code: str, redirect_uri: str) -> dict[str, Any]:
    payload = {
        "code": code,
        "client_id": _client_id(),
        "client_secret": _client_secret(),
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data=payload,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.HTTPError as exc:
        logger.error("[google_oauth] Token exchange HTTP error: %s", exc)
        raise GoogleOAuthError("Не удалось связаться с Google") from exc

    if response.status_code != 200:
        logger.error("[google_oauth] Token exchange failed: %s", response.text)
        raise GoogleOAuthError("Google отклонил авторизацию")

    data = response.json()
    if not data.get("access_token"):
        raise GoogleOAuthError("Google не вернул access_token")
    return data


async def fetch_google_userinfo(access_token: str) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
    except httpx.HTTPError as exc:
        logger.error("[google_oauth] Userinfo HTTP error: %s", exc)
        raise GoogleOAuthError("Не удалось получить профиль Google") from exc

    if response.status_code != 200:
        logger.error("[google_oauth] Userinfo failed: %s", response.text)
        raise GoogleOAuthError("Google не вернул профиль пользователя")

    profile = response.json()
    if not profile.get("sub"):
        raise GoogleOAuthError("Некорректный ответ Google")
    return profile
