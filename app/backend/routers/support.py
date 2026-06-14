"""Public support page settings and admin management."""

from __future__ import annotations

from typing import Dict

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from services.support_settings import (
    get_settings_dict,
    public_settings_payload,
    update_settings,
)
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/support", tags=["support"])


class SupportSettingsUpdateRequest(BaseModel):
    settings: Dict[str, str]


@router.get("/settings")
async def public_settings(db: AsyncSession = Depends(get_db)):
    settings = await get_settings_dict(db)
    return public_settings_payload(settings)


@router.get("/admin/settings")
async def admin_get_settings(
    _admin: dict = Depends(require_panel_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_settings_dict(db)


@router.put("/admin/settings")
async def admin_update_settings(
    body: SupportSettingsUpdateRequest,
    _admin: dict = Depends(require_panel_admin),
    db: AsyncSession = Depends(get_db),
):
    return await update_settings(db, body.settings)
