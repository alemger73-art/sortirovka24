"""Register native device tokens for push notifications."""

from __future__ import annotations

import hashlib
import json
from urllib.parse import urlparse
from uuid import uuid4

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from models.push_devices import PushDevice
from schemas.push import (
    PushBroadcastRequest,
    PushBroadcastResponse,
    PushRegisterRequest,
    PushRegisterResponse,
    PushStatsResponse,
    PushUnregisterRequest,
    WebPushRegisterRequest,
    WebPushUnregisterRequest,
)
from services.account_session import resolve_account_user
from services.push_broadcast import ADMIN_DEVICE_USER_ID, broadcast_push
from services.push_notifications import push_enabled, web_push_enabled, web_push_public_key
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.rate_limit import check_keyed_rate_limit

router = APIRouter(prefix="/api/v1/push", tags=["push"])


def _device_id(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]


async def _require_account(db: AsyncSession, authorization: str | None):
    user = await resolve_account_user(db, authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _web_token(body: WebPushRegisterRequest) -> str:
    return json.dumps(body.subscription.model_dump(), sort_keys=True, separators=(",", ":"))


def _validate_web_push_endpoint(endpoint: str) -> None:
    """Only browser vendor push gateways are valid; arbitrary URLs would enable SSRF."""
    hostname = (urlparse(endpoint).hostname or "").lower()
    allowed_hosts = {
        "fcm.googleapis.com",
        "android.googleapis.com",
        "updates.push.services.mozilla.com",
        "push.services.mozilla.com",
        "web.push.apple.com",
    }
    allowed_suffixes = (".notify.windows.com", ".push.apple.com")
    if hostname not in allowed_hosts and not hostname.endswith(allowed_suffixes):
        raise HTTPException(status_code=422, detail="Unsupported browser push endpoint")


@router.post("/register", response_model=PushRegisterResponse)
async def register_push_device(
    body: PushRegisterRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
):
    user = await _require_account(db, authorization)
    check_keyed_rate_limit(f"push-register:{user.id}", window_seconds=60, max_hits=20)
    token = body.token.strip()
    device_id = _device_id(token)

    existing = (
        await db.execute(select(PushDevice).where(PushDevice.token == token))
    ).scalar_one_or_none()

    if existing:
        existing.platform = body.platform
        existing.user_id = user.id
        existing.is_active = True
        await db.commit()
        return PushRegisterResponse(success=True, registered=True)

    device = PushDevice(
        id=device_id or str(uuid4()),
        token=token,
        platform=body.platform,
        user_id=user.id,
        is_active=True,
    )
    db.add(device)
    await db.commit()
    return PushRegisterResponse(success=True, registered=True)


@router.post("/register-admin", response_model=PushRegisterResponse)
async def register_admin_push_device(
    body: PushRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Register admin APK device for operational alerts (requires panel JWT)."""
    require_panel_admin(request)
    token = body.token.strip()
    device_id = _device_id(token)

    existing = (
        await db.execute(select(PushDevice).where(PushDevice.token == token))
    ).scalar_one_or_none()

    if existing:
        existing.platform = body.platform
        existing.user_id = ADMIN_DEVICE_USER_ID
        existing.is_active = True
        await db.commit()
        return PushRegisterResponse(success=True, registered=True)

    device = PushDevice(
        id=device_id or str(uuid4()),
        token=token,
        platform=body.platform,
        user_id=ADMIN_DEVICE_USER_ID,
        is_active=True,
    )
    db.add(device)
    await db.commit()
    return PushRegisterResponse(success=True, registered=True)


@router.post("/unregister", response_model=PushRegisterResponse)
async def unregister_push_device(
    body: PushUnregisterRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
):
    user = await _require_account(db, authorization)
    check_keyed_rate_limit(f"push-unregister:{user.id}", window_seconds=60, max_hits=30)
    token = body.token.strip()
    existing = (
        await db.execute(select(PushDevice).where(PushDevice.token == token))
    ).scalar_one_or_none()
    if existing and existing.user_id == user.id:
        existing.is_active = False
        await db.commit()
    return PushRegisterResponse(success=True, registered=False)


@router.get("/web-key")
async def web_push_key():
    return {"enabled": web_push_enabled(), "public_key": web_push_public_key()}


@router.post("/register-web", response_model=PushRegisterResponse)
async def register_web_push_device(
    body: WebPushRegisterRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
):
    user = await _require_account(db, authorization)
    check_keyed_rate_limit(f"push-web-register:{user.id}", window_seconds=60, max_hits=20)
    token = _web_token(body)
    endpoint = body.subscription.endpoint
    _validate_web_push_endpoint(endpoint)
    device_id = _device_id(endpoint)
    existing = await db.get(PushDevice, device_id)
    if existing:
        existing.token = token
        existing.user_id = user.id
        existing.is_active = True
    else:
        db.add(PushDevice(id=device_id or str(uuid4()), token=token, platform="web", user_id=user.id, is_active=True))
    await db.commit()
    return PushRegisterResponse(success=True, registered=True)


@router.post("/unregister-web", response_model=PushRegisterResponse)
async def unregister_web_push_device(
    body: WebPushUnregisterRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
):
    user = await _require_account(db, authorization)
    device = await db.get(PushDevice, _device_id(body.endpoint))
    if device and device.platform == "web" and device.user_id == user.id:
        device.is_active = False
    await db.commit()
    return PushRegisterResponse(success=True, registered=False)


@router.post("/broadcast", response_model=PushBroadcastResponse)
async def broadcast_push_notification(
    body: PushBroadcastRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: send push to all registered devices."""
    require_panel_admin(request)

    data = {"path": body.path} if body.path else None
    result = await broadcast_push(
        db,
        title=body.title,
        body=body.body,
        data=data,
        user_id=body.user_id,
        platform=body.platform,
    )

    if result.get("skipped"):
        return PushBroadcastResponse(
            success=False,
            sent=0,
            failed=0,
            total=0,
            skipped=True,
        )

    return PushBroadcastResponse(
        success=result["sent"] > 0 or result["total"] == 0,
        sent=int(result["sent"]),
        failed=int(result["failed"]),
        total=int(result["total"]),
    )


@router.get("/status")
async def push_status():
    """Check whether FCM is configured on the server."""
    return {"enabled": push_enabled()}


@router.get("/stats", response_model=PushStatsResponse)
async def push_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Admin-only: device counts for push dashboard."""
    require_panel_admin(request)

    total = int(
        await db.scalar(select(func.count()).select_from(PushDevice)) or 0
    )
    active = int(
        await db.scalar(
            select(func.count())
            .select_from(PushDevice)
            .where(PushDevice.is_active.is_(True))
        )
        or 0
    )
    android_active = int(
        await db.scalar(
            select(func.count())
            .select_from(PushDevice)
            .where(PushDevice.is_active.is_(True), PushDevice.platform == "android")
        )
        or 0
    )
    ios_active = int(
        await db.scalar(
            select(func.count())
            .select_from(PushDevice)
            .where(PushDevice.is_active.is_(True), PushDevice.platform == "ios")
        )
        or 0
    )
    web_active = int(
        await db.scalar(
            select(func.count()).select_from(PushDevice).where(
                PushDevice.is_active.is_(True), PushDevice.platform == "web"
            )
        ) or 0
    )
    admin_active = int(
        await db.scalar(
            select(func.count())
            .select_from(PushDevice)
            .where(
                PushDevice.is_active.is_(True),
                PushDevice.user_id == ADMIN_DEVICE_USER_ID,
            )
        )
        or 0
    )

    return PushStatsResponse(
        enabled=push_enabled(),
        total_devices=total,
        active_devices=active,
        android_active=android_active,
        ios_active=ios_active,
        web_active=web_active,
        admin_active=admin_active,
    )
