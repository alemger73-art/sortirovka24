"""DAM ALEM employee shift API."""

from datetime import datetime, timedelta, timezone

from core.database import get_db
from core.food_staff_guard import food_owner, food_staff
from fastapi import APIRouter, Depends, Query, Request
from models.food_shifts import FoodShift, FoodStaffAction
from models.partner_auth import PartnerCredentials
from pydantic import BaseModel, Field
from services.food_shifts import active_shift, close_shift, open_shift, shift_view
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.rate_limit import check_keyed_rate_limit


router = APIRouter(prefix="/api/v1/dam-alem/shifts", tags=["DAM ALEM shifts"])
CITY = timezone(timedelta(hours=5))


class PinBody(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")


def _limit(request: Request, staff_id: str | int) -> None:
    host = request.client.host if request.client else "unknown"
    check_keyed_rate_limit(
        f"dam-shift-pin:{staff_id}:{host}",
        window_seconds=15 * 60,
        max_hits=8,
        message="Слишком много попыток PIN. Повторите через 15 минут.",
    )


@router.get("/me")
async def my_shift(db: AsyncSession = Depends(get_db), claims=Depends(food_staff)):
    staff_id = claims.get("staff_id")
    credentials = await db.get(PartnerCredentials, int(staff_id)) if staff_id else None
    row = await active_shift(db, "partner", staff_id) if staff_id else None
    return {
        "staff": {
            "id": staff_id,
            "name": claims.get("display_name") or claims.get("username") or "Администратор",
            "role": claims["access_role"],
            "pin_set": bool(credentials and credentials.pin_hash),
        },
        "shift": shift_view(row),
    }


@router.post("/open")
async def open_my_shift(body: PinBody, request: Request, db: AsyncSession = Depends(get_db), claims=Depends(food_staff)):
    staff_id = claims.get("staff_id")
    credentials = await db.get(PartnerCredentials, int(staff_id)) if staff_id else None
    if not credentials:
        # System administrators are deliberately not employees in shift reports.
        from fastapi import HTTPException
        raise HTTPException(403, "Войдите под персональной учётной записью сотрудника")
    _limit(request, staff_id)
    row = await open_shift(
        db,
        staff_type="partner",
        staff_id=staff_id,
        staff_name=credentials.display_name or credentials.email or credentials.phone or "Сотрудник",
        role=credentials.access_role or "owner",
        stored_pin=credentials.pin_hash,
        pin=body.pin,
    )
    return {"shift": shift_view(row)}


@router.post("/close")
async def close_my_shift(body: PinBody, request: Request, db: AsyncSession = Depends(get_db), claims=Depends(food_staff)):
    staff_id = claims.get("staff_id")
    credentials = await db.get(PartnerCredentials, int(staff_id)) if staff_id else None
    if not credentials:
        from fastapi import HTTPException
        raise HTTPException(403, "Войдите под персональной учётной записью сотрудника")
    _limit(request, staff_id)
    row = await close_shift(
        db,
        staff_type="partner",
        staff_id=staff_id,
        stored_pin=credentials.pin_hash,
        pin=body.pin,
    )
    return {"shift": shift_view(row)}


@router.get("/today")
async def today_shifts(db: AsyncSession = Depends(get_db), claims=Depends(food_owner)):
    start_local = datetime.now(CITY).replace(hour=0, minute=0, second=0, microsecond=0)
    start = start_local.astimezone(timezone.utc)
    rows = (
        await db.scalars(
            select(FoodShift)
            .where((FoodShift.opened_at >= start) | (FoodShift.active_key.is_not(None)))
            .order_by(desc(FoodShift.opened_at))
        )
    ).all()
    return {"items": [shift_view(row) for row in rows]}


@router.get("/history")
async def shift_history(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    claims=Depends(food_owner),
):
    rows = (await db.scalars(select(FoodShift).order_by(desc(FoodShift.opened_at)).limit(limit))).all()
    return {"items": [shift_view(row) for row in rows]}


@router.get("/actions")
async def action_history(
    shift_id: int | None = None,
    staff_id: str | None = None,
    limit: int = Query(150, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    claims=Depends(food_owner),
):
    query = select(FoodStaffAction)
    if shift_id is not None:
        query = query.where(FoodStaffAction.shift_id == shift_id)
    if staff_id:
        query = query.where(FoodStaffAction.staff_id == staff_id)
    rows = (await db.scalars(query.order_by(desc(FoodStaffAction.created_at)).limit(limit))).all()
    return {"items": [{
        "id": row.id,
        "shift_id": row.shift_id,
        "staff_type": row.staff_type,
        "staff_id": row.staff_id,
        "staff_name": row.staff_name,
        "role": row.role,
        "action": row.action,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "details": row.details,
        "created_at": row.created_at.replace(tzinfo=timezone.utc) if row.created_at and row.created_at.tzinfo is None else row.created_at,
    } for row in rows]}
