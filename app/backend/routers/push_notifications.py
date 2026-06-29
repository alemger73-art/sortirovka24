"""Register native device tokens for push notifications."""

from __future__ import annotations

import hashlib
from uuid import uuid4

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends, Header, Request
from models.push_devices import PushDevice
from schemas.push import (
    PushBroadcastRequest,
    PushBroadcastResponse,
    PushRegisterRequest,
    PushRegisterResponse,
    PushStatsResponse,
    PushUnregisterRequest,
)
from services.account_session import resolve_account_user
from services.push_broadcast import ADMIN_DEVICE_USER_ID, broadcast_push
from services.push_notifications import push_enabled
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/push", tags=["push"])


def _device_id(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:32]


@router.post("/register", response_model=PushRegisterResponse)
async def register_push_device(
    body: PushRegisterRequest,
    db: AsyncSession = Depends(get_db),
    authorization: str | None = Header(None),
):
    user = await resolve_account_user(db, authorization)
    token = body.token.strip()
    device_id = _device_id(token)

    existing = (
        await db.execute(select(PushDevice).where(PushDevice.token == token))
    ).scalar_one_or_none()

    if existing:
        existing.platform = body.platform
        existing.user_id = user.id if user else None
        existing.is_active = True
        await db.commit()
        return PushRegisterResponse(success=True, registered=True)

    device = PushDevice(
        id=device_id or str(uuid4()),
        token=token,
        platform=body.platform,
        user_id=user.id if user else None,
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
):
    token = body.token.strip()
    existing = (
        await db.execute(select(PushDevice).where(PushDevice.token == token))
    ).scalar_one_or_none()
    if existing:
        existing.is_active = False
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
        admin_active=admin_active,
    )
