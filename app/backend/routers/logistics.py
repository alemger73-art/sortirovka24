"""Unified logistics API — courier cabinet, tracking, admin."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException
from models.auth import User
from models.logistics import CourierProfile, LogisticsTask
from pydantic import BaseModel, Field
from services.logistics_dispatch import courier_cabinet_tasks, decline_offer
from services.logistics_service import (
    accept_task,
    advance_task_status,
    courier_profile_dict,
    get_logistics_settings,
    get_or_create_courier_profile,
    get_task_by_id,
    get_task_by_source,
    get_task_with_courier,
    mark_task_ready,
    task_to_dict,
)
from services.taxi_auth import get_taxi_user, require_taxi_admin
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/logistics", tags=["logistics"])

COURIER_STATUS_FLOW = {
    "assigned": ("picked_up", "Забрал заказ"),
    "picked_up": ("on_the_way", "Еду к клиенту"),
    "on_the_way": ("delivered", "Доставлено"),
}


class CourierOnlineRequest(BaseModel):
    online: bool


class CourierLocationRequest(BaseModel):
    lat: float
    lng: float


class CourierProfileUpdate(BaseModel):
    vehicle_type: Optional[str] = None
    phone: Optional[str] = None
    photo_url: Optional[str] = None


class TaskStatusRequest(BaseModel):
    status: str


class VerifyCourierRequest(BaseModel):
    verified: bool = True


# ─── Courier cabinet ───────────────────────────────────────────────

@router.get("/courier/cabinet")
async def courier_cabinet(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    profile = await get_or_create_courier_profile(db, user)
    offered, broadcast, active = await courier_cabinet_tasks(db, str(user.id))

    history = (
        await db.execute(
            select(LogisticsTask)
            .where(LogisticsTask.courier_id == str(user.id))
            .order_by(desc(LogisticsTask.id))
            .limit(30)
        )
    ).scalars().all()

    completed = [t for t in history if t.status == "delivered"]
    earnings = sum(float(t.delivery_fee or 0) for t in completed)

    return {
        "profile": courier_profile_dict(profile, user),
        "offered_task": offered,
        "available_tasks": broadcast,
        "active_task": active,
        "task_history": [task_to_dict(t) for t in history],
        "earnings": earnings,
        "status_flow": COURIER_STATUS_FLOW,
    }


@router.put("/courier/online")
async def set_courier_online(
    body: CourierOnlineRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    settings = await get_logistics_settings(db)
    if settings.get("enabled", "true").lower() not in ("true", "1", "yes"):
        raise HTTPException(status_code=503, detail="Доставка временно недоступна")

    profile = await get_or_create_courier_profile(db, user)
    if body.online:
        if not profile.is_verified and user.role not in {"admin", "superadmin"}:
            raise HTTPException(
                status_code=403,
                detail="Ожидайте проверки администратором перед выходом на линию.",
            )
    profile.is_online = body.online
    await db.commit()
    return {"online": profile.is_online}


@router.put("/courier/location")
async def update_courier_location(
    body: CourierLocationRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    profile = await get_or_create_courier_profile(db, user)
    profile.current_lat = body.lat
    profile.current_lng = body.lng
    profile.location_updated_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return {"success": True}


@router.put("/courier/profile")
async def update_courier_profile(
    body: CourierProfileUpdate,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    profile = await get_or_create_courier_profile(db, user)
    if body.vehicle_type:
        if body.vehicle_type not in {"bike", "car", "foot"}:
            raise HTTPException(status_code=400, detail="Неверный тип транспорта")
        profile.vehicle_type = body.vehicle_type
    if body.phone is not None:
        profile.phone = body.phone
    if body.photo_url is not None:
        profile.photo_url = body.photo_url
    await db.commit()
    return {"success": True, "profile": courier_profile_dict(profile, user)}


@router.post("/tasks/{task_id}/accept")
async def accept_logistics_task(
    task_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    try:
        task = await accept_task(db, task_id, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await get_task_with_courier(db, task.id)


@router.post("/tasks/{task_id}/decline")
async def decline_logistics_task(
    task_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    try:
        task = await decline_offer(db, task, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return task_to_dict(task)


@router.post("/tasks/{task_id}/status")
async def update_task_status(
    task_id: int,
    body: TaskStatusRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    try:
        task = await advance_task_status(db, task, user, body.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await get_task_with_courier(db, task.id)


# ─── Customer tracking ─────────────────────────────────────────────

@router.get("/tasks/{task_id}")
async def get_logistics_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
):
    data = await get_task_with_courier(db, task_id)
    if not data:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return data


@router.get("/track/food/{order_id}")
async def track_food_order(
    order_id: int,
    db: AsyncSession = Depends(get_db),
):
    task = await get_task_by_source(db, "food_orders", order_id)
    if not task:
        raise HTTPException(status_code=404, detail="Доставка не найдена")
    return await get_task_with_courier(db, task.id)


# ─── Admin ─────────────────────────────────────────────────────────

@router.get("/admin/tasks")
async def admin_list_tasks(
    limit: int = 50,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    tasks = (
        await db.execute(select(LogisticsTask).order_by(desc(LogisticsTask.id)).limit(min(limit, 200)))
    ).scalars().all()
    return [task_to_dict(t) for t in tasks]


@router.get("/admin/couriers")
async def admin_list_couriers(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    profiles = (await db.execute(select(CourierProfile))).scalars().all()
    result: List[Dict[str, Any]] = []
    for p in profiles:
        user = (await db.execute(select(User).where(User.id == p.user_id))).scalar_one_or_none()
        if user:
            result.append({**courier_profile_dict(p, user), "user_id": p.user_id})
    return result


@router.post("/admin/couriers/{user_id}/verify")
async def admin_verify_courier(
    user_id: str,
    body: VerifyCourierRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    profile = (
        await db.execute(select(CourierProfile).where(CourierProfile.user_id == user_id))
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Курьер не найден")
    profile.is_verified = body.verified
    await db.commit()
    return {"success": True, "verified": profile.is_verified}


@router.post("/admin/tasks/{task_id}/ready")
async def admin_mark_task_ready(
    task_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    try:
        task = await mark_task_ready(db, task)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return task_to_dict(task)
