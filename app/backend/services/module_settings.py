"""On/off flags for whole app modules (admin kill-switch).

A single source of truth that the frontend reads to hide a module everywhere
(home tiles, quick actions, banners, hero, footer nav, bottom nav, "More" page)
and that the backend can use to block a module's data endpoints.
"""

from __future__ import annotations

from typing import Any, Dict, List

from core.database import get_db
from fastapi import Depends, HTTPException, Request
from models.module_settings import ModuleSettings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# All toggleable modules. Keep in sync with frontend src/config/modules.ts.
# Taxi and support keep their own dedicated settings and are NOT managed here.
MODULE_KEYS: tuple[str, ...] = (
    "food",
    "gastronom",
    "prorab",
    "pharmacy",
    "masters",
    "salons",
    "inspectors",
    "real_estate",
    "announcements",
    "jobs",
    "directory",
    "transport",
    "questions",
    "complaints",
    "news",
    "business",
    "history",
)

# Every module is enabled by default.
DEFAULT_MODULE_SETTINGS: Dict[str, str] = {key: "true" for key in MODULE_KEYS}


def settings_to_dict(rows: List[ModuleSettings]) -> Dict[str, str]:
    merged = dict(DEFAULT_MODULE_SETTINGS)
    for row in rows:
        if row.key in merged and row.value is not None:
            merged[row.key] = row.value
    return merged


def public_payload(settings: Dict[str, str]) -> Dict[str, bool]:
    """Map of module slug -> enabled (bool)."""
    return {key: settings.get(key, "true") == "true" for key in MODULE_KEYS}


async def ensure_module_settings(db: AsyncSession) -> None:
    existing = (await db.execute(select(ModuleSettings))).scalars().all()
    existing_keys = {row.key for row in existing}
    missing = [key for key in MODULE_KEYS if key not in existing_keys]
    if not missing:
        return
    for key in missing:
        db.add(ModuleSettings(key=key, value=DEFAULT_MODULE_SETTINGS[key]))
    await db.commit()


async def get_settings_dict(db: AsyncSession) -> Dict[str, str]:
    await ensure_module_settings(db)
    rows = (await db.execute(select(ModuleSettings))).scalars().all()
    return settings_to_dict(rows)


async def get_public_modules(db: AsyncSession) -> Dict[str, bool]:
    return public_payload(await get_settings_dict(db))


async def update_settings(db: AsyncSession, updates: Dict[str, Any]) -> Dict[str, str]:
    await ensure_module_settings(db)
    allowed = set(MODULE_KEYS)
    for key, value in updates.items():
        if key not in allowed:
            continue
        normalized = "true" if str(value).lower() in ("true", "1", "yes", "on") else "false"
        row = (
            await db.execute(select(ModuleSettings).where(ModuleSettings.key == key))
        ).scalar_one_or_none()
        if row:
            row.value = normalized
        else:
            db.add(ModuleSettings(key=key, value=normalized))
    await db.commit()
    return await get_settings_dict(db)


async def is_module_enabled(db: AsyncSession, key: str) -> bool:
    """True unless the module is explicitly turned off. Unknown keys -> True.

    Lightweight: reads a single row and never writes, so it is cheap to call
    on every request as a route dependency.
    """
    if key not in MODULE_KEYS:
        return True
    try:
        row = (
            await db.execute(select(ModuleSettings).where(ModuleSettings.key == key))
        ).scalar_one_or_none()
    except Exception:
        # Table not ready (cold start) or transient DB error: fail open so a
        # module is never accidentally hidden because of infrastructure issues.
        try:
            await db.rollback()
        except Exception:
            pass
        return True
    if row is None or row.value is None:
        return True
    return row.value == "true"


def _request_is_panel_admin(request) -> bool:
    """Non-raising check: True if the request carries a valid admin panel token."""
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return False
    token = auth[7:].strip()
    if not token:
        return False
    try:
        from core.auth import decode_access_token

        payload = decode_access_token(token)
    except Exception:
        return False
    return payload.get("role") == "admin" and bool(payload.get("username"))


def require_module(key: str):
    """FastAPI dependency factory: 404 when the given module is disabled.

    Attach to a module's router so a disabled module becomes unreachable via
    the API, not just hidden in the UI. Authenticated panel admins are allowed
    through so they can still manage a switched-off module's content.
    """

    async def _guard(request: Request, db: AsyncSession = Depends(get_db)) -> None:
        if await is_module_enabled(db, key):
            return
        if _request_is_panel_admin(request):
            return
        raise HTTPException(status_code=404, detail="Module is disabled")

    return _guard
