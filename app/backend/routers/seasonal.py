"""Seasonal decoration: public settings for every page and the admin editor."""

from __future__ import annotations

from typing import Any, Dict

from core.admin_guard import require_panel_admin
from core.database import get_db
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from services import seasonal
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/seasonal", tags=["seasonal"])


class SeasonalUpdate(BaseModel):
    settings: Dict[str, Any]


@router.get("")
async def public_settings(db: AsyncSession = Depends(get_db)):
    return await seasonal.get_settings(db)


@router.put("/admin")
async def admin_update(body: SeasonalUpdate, _admin: dict = Depends(require_panel_admin), db: AsyncSession = Depends(get_db)):
    return await seasonal.save_settings(db, body.settings)
