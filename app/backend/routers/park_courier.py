"""Authenticated park courier flows (PIN login + order status updates)."""

from datetime import datetime, timezone

from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException
from models.couriers import Couriers
from models.park_orders import Park_orders
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api/v1/park/courier", tags=["park_courier"])

ALLOWED_STATUS_TRANSITIONS = {
    "courier_assigned": "on_the_way",
    "on_the_way": "delivered",
}


class CourierLoginRequest(BaseModel):
    pin_code: str = Field(..., min_length=4, max_length=12)


class CourierPublicProfile(BaseModel):
    id: int
    name: str
    phone: str
    is_active: bool


class CourierStatusUpdateRequest(BaseModel):
    pin_code: str = Field(..., min_length=4, max_length=12)
    status: str = Field(..., min_length=3, max_length=32)


@router.post("/login", response_model=CourierPublicProfile)
async def courier_login(body: CourierLoginRequest, db: AsyncSession = Depends(get_db)):
    pin = body.pin_code.strip()
    row = (
        await db.execute(
            select(Couriers).where(Couriers.pin_code == pin, Couriers.is_active == True)  # noqa: E712
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=401, detail="Invalid PIN")
    return CourierPublicProfile(
        id=int(row.id),
        name=row.name or "",
        phone=row.phone or "",
        is_active=bool(row.is_active),
    )


@router.patch("/orders/{order_id}/status")
async def update_courier_order_status(
    order_id: int,
    body: CourierStatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
):
    pin = body.pin_code.strip()
    courier = (
        await db.execute(
            select(Couriers).where(Couriers.pin_code == pin, Couriers.is_active == True)  # noqa: E712
        )
    ).scalar_one_or_none()
    if not courier:
        raise HTTPException(status_code=401, detail="Invalid PIN")

    order = (await db.execute(select(Park_orders).where(Park_orders.id == order_id))).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    assigned_id = getattr(order, "assigned_courier_id", None)
    if assigned_id is not None and int(assigned_id) != int(courier.id):
        raise HTTPException(status_code=403, detail="Order is not assigned to this courier")

    current_status = (order.status or "").strip()
    expected_next = ALLOWED_STATUS_TRANSITIONS.get(current_status)
    if expected_next != body.status.strip():
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition from '{current_status}' to '{body.status}'",
        )

    order.status = body.status.strip()
    if hasattr(order, "updated_at"):
        order.updated_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return {"success": True, "order_id": order_id, "status": order.status}
