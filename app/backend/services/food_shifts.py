"""Shared shift lifecycle and staff action journal for DAM ALEM."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from models.food_shifts import FoodShift, FoodStaffAction
from models.logistics import CourierProfile
from models.partner_auth import PartnerCredentials
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from utils.courier_pin import verify_courier_pin


PIN_PATTERN = re.compile(r"^\d{4}$")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def staff_key(staff_type: str, staff_id: str | int) -> str:
    return f"{staff_type}:{staff_id}"


async def active_shift(db: AsyncSession, staff_type: str, staff_id: str | int) -> FoodShift | None:
    return await db.scalar(
        select(FoodShift).where(FoodShift.active_key == staff_key(staff_type, staff_id)).limit(1)
    )


def shift_view(row: FoodShift | None) -> dict | None:
    if not row:
        return None
    duration_seconds = None
    if row.closed_at:
        opened = row.opened_at
        closed = row.closed_at
        if opened and opened.tzinfo is None:
            opened = opened.replace(tzinfo=timezone.utc)
        if closed and closed.tzinfo is None:
            closed = closed.replace(tzinfo=timezone.utc)
        duration_seconds = max(0, int((closed - opened).total_seconds())) if opened else None
    return {
        "id": row.id,
        "staff_type": row.staff_type,
        "staff_id": row.staff_id,
        "staff_name": row.staff_name,
        "role": row.role,
        "opened_at": row.opened_at,
        "closed_at": row.closed_at,
        "opened_by": row.opened_by,
        "closed_by": row.closed_by,
        "duration_seconds": duration_seconds,
        "active": bool(row.active_key),
    }


async def open_shift(
    db: AsyncSession,
    *,
    staff_type: str,
    staff_id: str | int,
    staff_name: str,
    role: str,
    stored_pin: str | None,
    pin: str,
) -> FoodShift:
    if not PIN_PATTERN.fullmatch(pin or "") or not verify_courier_pin(stored_pin, pin):
        raise HTTPException(401, "Неверный PIN-код")
    existing = await active_shift(db, staff_type, staff_id)
    if existing:
        raise HTTPException(409, "Смена уже открыта")
    row = FoodShift(
        staff_type=staff_type,
        staff_id=str(staff_id),
        staff_name=staff_name[:255],
        role=role,
        active_key=staff_key(staff_type, staff_id),
        opened_at=utcnow(),
        opened_by=staff_name[:255],
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(409, "Смена уже открыта") from None
    record_action(db, row, "shift_opened", entity_type="shift", entity_id=str(row.id))
    await db.commit()
    await db.refresh(row)
    return row


async def close_shift(
    db: AsyncSession,
    *,
    staff_type: str,
    staff_id: str | int,
    stored_pin: str | None,
    pin: str,
) -> FoodShift:
    if not PIN_PATTERN.fullmatch(pin or "") or not verify_courier_pin(stored_pin, pin):
        raise HTTPException(401, "Неверный PIN-код")
    row = await active_shift(db, staff_type, staff_id)
    if not row:
        raise HTTPException(409, "Открытая смена не найдена")
    row.closed_at = utcnow()
    row.closed_by = row.staff_name
    row.active_key = None
    record_action(db, row, "shift_closed", entity_type="shift", entity_id=str(row.id))
    await db.commit()
    await db.refresh(row)
    return row


async def require_partner_shift(db: AsyncSession, claims: dict) -> FoodShift | None:
    """Require a shift once a personal PIN is configured.

    Existing production accounts are rolled out safely: until the owner sets a
    PIN, current work keeps functioning and the UI clearly requests setup.
    """
    staff_id = claims.get("staff_id")
    if not staff_id:  # system administrator maintenance session
        return None
    credentials = await db.get(PartnerCredentials, int(staff_id))
    if not credentials or not credentials.pin_hash:
        return None
    row = await active_shift(db, "partner", staff_id)
    if not row:
        raise HTTPException(409, "Сначала откройте смену")
    return row


async def require_courier_shift(db: AsyncSession, profile: CourierProfile) -> FoodShift | None:
    if not profile.pin_hash:
        raise HTTPException(409, "Владелец должен назначить курьеру PIN-код")
    row = await active_shift(db, "courier", profile.user_id)
    if not row:
        raise HTTPException(409, "Сначала откройте смену курьера")
    return row


def record_action(
    db: AsyncSession,
    shift: FoodShift | None,
    action: str,
    *,
    claims: dict | None = None,
    staff_type: str = "partner",
    staff_id: str | int | None = None,
    staff_name: str | None = None,
    role: str | None = None,
    entity_type: str | None = None,
    entity_id: str | int | None = None,
    details: dict[str, Any] | None = None,
) -> FoodStaffAction:
    if shift:
        staff_type = shift.staff_type
        staff_id = shift.staff_id
        staff_name = shift.staff_name
        role = shift.role
    elif claims:
        staff_id = claims.get("staff_id") or claims.get("sub") or "admin"
        staff_name = claims.get("display_name") or claims.get("username") or "Администратор"
        role = claims.get("access_role") or claims.get("role") or "owner"
    row = FoodStaffAction(
        shift_id=shift.id if shift else None,
        staff_type=staff_type,
        staff_id=str(staff_id or "unknown"),
        staff_name=str(staff_name or "Сотрудник")[:255],
        role=str(role or "operator")[:20],
        action=action[:80],
        entity_type=entity_type[:40] if entity_type else None,
        entity_id=str(entity_id)[:255] if entity_id is not None else None,
        details=json.dumps(details, ensure_ascii=False, default=str)[:8000] if details else None,
        created_at=utcnow(),
    )
    db.add(row)
    return row
