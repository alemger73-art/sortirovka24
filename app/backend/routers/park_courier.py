"""Authenticated park courier flows (PIN login + order status updates)."""

from datetime import datetime, timezone

from core.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Request
from models.park_orders import Park_orders
from pydantic import BaseModel, Field
from services.courier_auth import find_active_courier_by_pin
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from utils.rate_limit import check_ip_rate_limit

router = APIRouter(prefix="/api/v1/park/courier", tags=["park_courier"])

ALLOWED_STATUS_TRANSITIONS = {
    "courier_assigned": "on_the_way",
    "on_the_way": "delivered",
}

_PIN_RATE_LIMIT = {
    "max_hits": 5,
    "window_seconds": 900.0,
    "message": "Слишком много попыток PIN. Попробуйте через 15 минут.",
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


def _enforce_pin_rate_limit(request: Request, *, action: str) -> None:
    check_ip_rate_limit(
        request,
        key_prefix=f"park_courier_pin:{action}",
        max_hits=_PIN_RATE_LIMIT["max_hits"],
        window_seconds=_PIN_RATE_LIMIT["window_seconds"],
        message=_PIN_RATE_LIMIT["message"],
    )


@router.post("/login", response_model=CourierPublicProfile)
async def courier_login(
    body: CourierLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _enforce_pin_rate_limit(request, action="login")
    row = await find_active_courier_by_pin(db, body.pin_code)
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
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    _enforce_pin_rate_limit(request, action="status")
    courier = await find_active_courier_by_pin(db, body.pin_code)
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
