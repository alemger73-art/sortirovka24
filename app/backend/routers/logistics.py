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
from services.logistics_courier import (
    application_to_dict,
    approve_courier_application,
    assert_courier_cabinet_access,
    courier_access_info,
    get_user_courier_application,
    list_courier_applications,
    reject_courier_application,
    submit_courier_application,
)
from services.logistics_dispatch import courier_cabinet_tasks, decline_offer
from services.logistics_service import (
    accept_task,
    advance_task_status,
    courier_profile_dict,
    get_logistics_settings,
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


class CourierApplyRequest(BaseModel):
    full_name: str
    phone: str = ""
    vehicle_type: str = "bike"
    vehicle_plate: str = ""
    comment: str = ""
    photo_url: str = ""
    id_photo_url: str = ""
    vehicle_photo_url: str = ""


class AdminNoteRequest(BaseModel):
    admin_note: str = ""


# ─── Courier registration ──────────────────────────────────────────

@router.get("/courier/access")
async def courier_access(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    return await courier_access_info(db, user)


@router.get("/courier/application")
async def courier_application_status(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    app = await get_user_courier_application(db, str(user.id))
    info = await courier_access_info(db, user)
    if not app:
        return {"status": "none", "is_courier": info["is_courier"], "can_access_cabinet": info["can_access_cabinet"]}
    return {**application_to_dict(app, user), "is_courier": info["is_courier"], "can_access_cabinet": info["can_access_cabinet"]}


@router.post("/courier/application")
async def courier_submit_application(
    body: CourierApplyRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    settings = await get_logistics_settings(db)
    if settings.get("enabled", "true").lower() not in ("true", "1", "yes"):
        raise HTTPException(status_code=503, detail="Доставка временно недоступна")
    if not body.full_name.strip():
        raise HTTPException(status_code=400, detail="Укажите ФИО")
    try:
        app = await submit_courier_application(
            db,
            user,
            full_name=body.full_name,
            phone=body.phone or user.phone or "",
            vehicle_type=body.vehicle_type,
            vehicle_plate=body.vehicle_plate,
            comment=body.comment,
            photo_url=body.photo_url,
            id_photo_url=body.id_photo_url,
            vehicle_photo_url=body.vehicle_photo_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return application_to_dict(app, user)


# ─── Courier cabinet ───────────────────────────────────────────────

@router.get("/courier/cabinet")
async def courier_cabinet(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    profile = await assert_courier_cabinet_access(db, user)
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

    profile = await assert_courier_cabinet_access(db, user)
    if body.online and not profile.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Ожидайте одобрения заявки администратором.",
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
    profile = await assert_courier_cabinet_access(db, user)
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
    profile = await assert_courier_cabinet_access(db, user)
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
    await assert_courier_cabinet_access(db, user)
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
    try:
        task = await get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена")
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

@router.get("/admin/applications")
async def admin_list_applications(
    status: Optional[str] = "pending",
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    apps = await list_courier_applications(db, status=status or None)
    result: List[Dict[str, Any]] = []
    for app in apps:
        user = (await db.execute(select(User).where(User.id == app.user_id))).scalar_one_or_none()
        result.append(application_to_dict(app, user))
    return result


@router.post("/admin/applications/{user_id}/approve")
async def admin_approve_application(
    user_id: str,
    body: AdminNoteRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    try:
        profile = await approve_courier_application(db, user_id, body.admin_note or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    return {"success": True, "profile": courier_profile_dict(profile, user) if user else {}}


@router.post("/admin/applications/{user_id}/reject")
async def admin_reject_application(
    user_id: str,
    body: AdminNoteRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    try:
        app = await reject_courier_application(db, user_id, body.admin_note or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    return application_to_dict(app, user)


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
    profiles = (
        await db.execute(select(CourierProfile).where(CourierProfile.is_verified.is_(True)))
    ).scalars().all()
    result: List[Dict[str, Any]] = []
    for p in profiles:
        user = (await db.execute(select(User).where(User.id == p.user_id))).scalar_one_or_none()
        if user:
            result.append({**courier_profile_dict(p, user), "user_id": p.user_id})
    return result


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
