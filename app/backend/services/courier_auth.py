"""Resolve active couriers by PIN (supports legacy plaintext + bcrypt)."""

from __future__ import annotations

from models.couriers import Couriers
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.courier_pin import hash_courier_pin, is_hashed_pin, verify_courier_pin


async def find_active_courier_by_pin(db: AsyncSession, pin: str) -> Couriers | None:
    """Match PIN against active couriers; upgrade legacy plaintext hashes in-place."""
    normalized = (pin or "").strip()
    if not normalized:
        return None

    rows = (
        await db.execute(select(Couriers).where(Couriers.is_active == True))  # noqa: E712
    ).scalars().all()

    for row in rows:
        if not verify_courier_pin(row.pin_code, normalized):
            continue
        if row.pin_code and not is_hashed_pin(row.pin_code):
            row.pin_code = hash_courier_pin(normalized)
            await db.commit()
            await db.refresh(row)
        return row
    return None
