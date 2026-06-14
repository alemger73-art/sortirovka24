"""Register native device tokens for push notifications."""

from __future__ import annotations

import hashlib
from uuid import uuid4

from core.database import get_db
from fastapi import APIRouter, Depends, Header
from models.push_devices import PushDevice
from schemas.push import PushRegisterRequest, PushRegisterResponse, PushUnregisterRequest
from services.account_session import resolve_account_user
from sqlalchemy import select
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
