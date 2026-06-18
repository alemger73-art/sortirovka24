"""Public module flags + admin management (kill-switch for whole modules)."""

from __future__ import annotations

from typing import Dict

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from services.module_settings import (
    get_public_modules,
    get_settings_dict,
    update_settings,
)
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/modules", tags=["modules"])


class ModulesUpdateRequest(BaseModel):
    settings: Dict[str, bool]


@router.get("")
async def public_modules(db: AsyncSession = Depends(get_db)):
    """Map of module slug -> enabled. Read by the whole frontend."""
    return await get_public_modules(db)


@router.get("/admin/settings")
async def admin_get_modules(
    _admin: dict = Depends(require_panel_admin),
    db: AsyncSession = Depends(get_db),
):
    return await get_settings_dict(db)


@router.put("/admin/settings")
async def admin_update_modules(
    body: ModulesUpdateRequest,
    _admin: dict = Depends(require_panel_admin),
    db: AsyncSession = Depends(get_db),
):
    await update_settings(db, body.settings)
    return await get_public_modules(db)
