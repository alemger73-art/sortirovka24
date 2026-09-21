"""Unified logistics API — courier cabinet, tracking, admin."""

from __future__ import annotations

import logging
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.auth import create_access_token, decode_access_token
from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException, Request
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
from services.food_shifts import (
    active_shift,
    close_shift,
    open_shift,
    record_action,
    require_courier_shift,
    shift_view,
)
from utils.rate_limit import check_keyed_rate_limit
from utils.courier_pin import verify_courier_pin
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

async def public_delivery_guard(request: Request, db: AsyncSession = Depends(get_db)):
    from core.delivery_mode import COURIER_PORTAL_ENABLED
    if not COURIER_PORTAL_ENABLED and (request.url.path.startswith('/api/v1/logistics/courier') or
            (request.method != 'GET' and request.url.path.startswith('/api/v1/logistics/tasks/'))):
        raise HTTPException(404, 'Доставкой управляет оператор')
    if '/admin/' in request.url.path:
        return
    from services.cabinet_modules import availability
    flags = await availability(db)
    if not any(flags.get(key) for key in ('food', 'gastronom', 'volna', 'pharmacy', 'prorab')):
        raise HTTPException(404, 'Доставка недоступна')


router = APIRouter(prefix="/api/v1/logistics", tags=["logistics"], dependencies=[Depends(public_delivery_guard)])

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


class CourierPinRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{4}$")


class CourierPinLoginResponse(BaseModel):
    token: str
    name: str
    expires_in: int = 43200


class CourierApplyRequest(BaseModel):
    model_config = {"extra": "forbid"}
    full_name: str = Field(min_length=1, max_length=150)
    phone: str = Field("", max_length=32)
    vehicle_type: str = Field("bike", max_length=16)
    vehicle_plate: str = Field("", max_length=32)
    comment: str = Field("", max_length=2000)
    photo_url: str = Field("", max_length=512)
    id_photo_url: str = Field("", max_length=512)
    vehicle_photo_url: str = Field("", max_length=512)


class AdminNoteRequest(BaseModel):
    admin_note: str = ""


def _courier_pin_version(pin_hash: str | None) -> str:
    return hashlib.sha256((pin_hash or "").encode("utf-8")).hexdigest()[:16]


async def _courier_user(
    db: AsyncSession,
    authorization: str | None,
) -> User:
    """Accept only the dedicated courier PIN session."""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        try:
            claims = decode_access_token(token)
        except Exception:
            claims = {}
        if claims.get("type") == "courier_pin_session":
            user_id = str(claims.get("sub") or "")
            profile = await db.get(CourierProfile, user_id)
            user = await db.get(User, user_id)
            if (
                not profile
                or not profile.is_verified
                or not profile.pin_hash
                or not user
                or not user.is_active
                or user.status != "active"
                or claims.get("pin_version") != _courier_pin_version(profile.pin_hash)
            ):
                raise HTTPException(status_code=401, detail="Сессия курьера недействительна")
            return user
    raise HTTPException(status_code=401, detail="Войдите в кабинет курьера по PIN")


@router.post("/courier/pin-login", response_model=CourierPinLoginResponse)
async def courier_pin_login(
    body: CourierPinRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    host = request.client.host if request.client else "unknown"
    check_keyed_rate_limit(
        f"dam-courier-pin-login:{host}",
        window_seconds=15 * 60,
        max_hits=6,
        message="Слишком много попыток PIN. Повторите через 15 минут.",
    )
    profiles = (
        await db.execute(
            select(CourierProfile).where(
                CourierProfile.is_verified == True,
                CourierProfile.pin_hash.isnot(None),
            )
        )
    ).scalars().all()
    matches = [profile for profile in profiles if verify_courier_pin(profile.pin_hash, body.pin)]
    if not matches:
        raise HTTPException(status_code=401, detail="Неверный PIN")
    if len(matches) > 1:
        raise HTTPException(status_code=409, detail="PIN назначен нескольким курьерам. Обратитесь к владельцу.")
    profile = matches[0]
    user = await db.get(User, profile.user_id)
    if not user or not user.is_active or user.status != "active":
        raise HTTPException(status_code=403, detail="Доступ курьера отключён")
    token = create_access_token(
        {
            "sub": str(user.id),
            "role": "courier",
            "type": "courier_pin_session",
            "pin_version": _courier_pin_version(profile.pin_hash),
        },
        expires_minutes=12 * 60,
    )
    return CourierPinLoginResponse(token=token, name=user.name or profile.phone or "Курьер")


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
    user = await _courier_user(db, authorization)
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
    shift = await active_shift(db, "courier", str(user.id))

    if active and active.get('source_type') == 'food_orders':
        from models.food_orders import Food_orders
        food_order = await db.get(Food_orders, active['source_id'])
        if food_order:
            active['payment_method'] = food_order.payment_method
            active['payment_status'] = food_order.payment_status
            active['order_source'] = food_order.order_source or 'app'

    return {
        "profile": courier_profile_dict(profile, user),
        "offered_task": offered,
        "available_tasks": broadcast,
        "active_task": active,
        "task_history": [task_to_dict(t) for t in history],
        "earnings": earnings,
        "status_flow": COURIER_STATUS_FLOW,
        "pin_set": bool(profile.pin_hash),
        "shift": shift_view(shift),
    }


def _courier_pin_limit(request: Request, user_id: str) -> None:
    host = request.client.host if request.client else "unknown"
    check_keyed_rate_limit(
        f"courier-shift-pin:{user_id}:{host}", window_seconds=15 * 60, max_hits=8,
        message="Слишком много попыток PIN. Повторите через 15 минут.",
    )


@router.post("/courier/shift/open")
async def open_courier_shift(
    body: CourierPinRequest,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _courier_user(db, authorization)
    profile = await assert_courier_cabinet_access(db, user)
    _courier_pin_limit(request, str(user.id))
    row = await open_shift(
        db, staff_type="courier", staff_id=str(user.id),
        staff_name=user.name or profile.phone or user.phone or "Курьер", role="courier",
        stored_pin=profile.pin_hash, pin=body.pin,
    )
    return {"shift": shift_view(row)}


@router.post("/courier/shift/close")
async def close_courier_shift(
    body: CourierPinRequest,
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _courier_user(db, authorization)
    profile = await assert_courier_cabinet_access(db, user)
    _courier_pin_limit(request, str(user.id))
    row = await close_shift(db, staff_type="courier", staff_id=str(user.id), stored_pin=profile.pin_hash, pin=body.pin)
    profile.is_online = False
    await db.commit()
    return {"shift": shift_view(row), "online": False}


@router.put("/courier/online")
async def set_courier_online(
    body: CourierOnlineRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _courier_user(db, authorization)
    settings = await get_logistics_settings(db)
    if settings.get("enabled", "true").lower() not in ("true", "1", "yes"):
        raise HTTPException(status_code=503, detail="Доставка временно недоступна")

    profile = await assert_courier_cabinet_access(db, user)
    if body.online and not profile.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Ожидайте одобрения заявки администратором.",
        )
    shift = await require_courier_shift(db, profile) if body.online else await active_shift(db, "courier", str(user.id))
    profile.is_online = body.online
    record_action(db, shift, 'courier_online_changed', staff_type='courier', staff_id=str(user.id), staff_name=user.name or profile.phone or 'Курьер', role='courier', details={'online':body.online})
    await db.commit()
    return {"online": profile.is_online}


@router.put("/courier/location")
async def update_courier_location(
    body: CourierLocationRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _courier_user(db, authorization)
    profile = await assert_courier_cabinet_access(db, user)
    await require_courier_shift(db, profile)
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
    user = await _courier_user(db, authorization)
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
    user = await _courier_user(db, authorization)
    profile = await assert_courier_cabinet_access(db, user)
    shift = await require_courier_shift(db, profile)
    record_action(db, shift, 'delivery_accepted', staff_type='courier', staff_id=str(user.id), staff_name=user.name or profile.phone or 'Курьер', role='courier', entity_type='delivery_task', entity_id=task_id)
    try:
        task = await accept_task(db, task_id, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await _tracking_access(db, task, authorization)
    return await get_task_with_courier(db, task.id)


@router.post("/tasks/{task_id}/decline")
async def decline_logistics_task(
    task_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await _courier_user(db, authorization)
    profile = await assert_courier_cabinet_access(db, user)
    shift = await require_courier_shift(db, profile)
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    try:
        record_action(db, shift, 'delivery_declined', staff_type='courier', staff_id=str(user.id), staff_name=user.name or profile.phone or 'Курьер', role='courier', entity_type='delivery_task', entity_id=task_id)
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
    user = await _courier_user(db, authorization)
    profile = await assert_courier_cabinet_access(db, user)
    shift = await require_courier_shift(db, profile)
    try:
        task = await get_task_by_id(db, task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Задача не найдена")
        record_action(db, shift, 'delivery_status_changed', staff_type='courier', staff_id=str(user.id), staff_name=user.name or profile.phone or 'Курьер', role='courier', entity_type='delivery_task', entity_id=task_id, details={'status':body.status})
        task = await advance_task_status(db, task, user, body.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    await _tracking_access(db, task, authorization)
    return await get_task_with_courier(db, task.id)


# ─── Customer tracking ─────────────────────────────────────────────

async def _tracking_access(db, task, authorization):
    token_type = ""
    if authorization and authorization.lower().startswith("bearer "):
        try:
            token_type = str(decode_access_token(authorization.split(" ", 1)[1].strip()).get("type") or "")
        except Exception:
            token_type = ""
    user = await _courier_user(db, authorization) if token_type == "courier_pin_session" else await get_taxi_user(db, authorization)
    from routers.account_v2 import _owns_user_content
    if user.role in ('admin', 'superadmin') or task.courier_id == str(user.id):
        return
    if not _owns_user_content(user, None, task.customer_phone):
        raise HTTPException(404, 'Доставка не найдена')


@router.get("/tasks/{task_id}")
async def get_logistics_task(
    task_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(404, 'Доставка не найдена')
    await _tracking_access(db, task, authorization)
    data = await get_task_with_courier(db, task_id)
    if not data:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return data


@router.get("/track/food/{order_id}")
async def track_food_order(
    order_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    task = await get_task_by_source(db, "food_orders", order_id)
    if not task:
        raise HTTPException(status_code=404, detail="Доставка не найдена")
    await _tracking_access(db, task, authorization)
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
