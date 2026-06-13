"""Sortirovka Taxi API — quotes, rides, driver cabinet, admin."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from core.database import get_db
from fastapi import APIRouter, Depends, Header, HTTPException
from models.auth import User
from pydantic import BaseModel, Field
from services.taxi_auth import assert_driver_user, get_taxi_user, require_taxi_admin
from services.taxi_pricing import build_quote, resolve_location
from services.taxi_geo import geo_context_from_taxi_settings, suggest_addresses
from services.taxi_service import (
    accept_ride,
    approve_driver_application,
    application_to_dict,
    reject_driver_application,
    submit_driver_application,
    get_user_application,
    list_driver_applications,
    advance_ride_status,
    cancel_ride,
    create_ride,
    get_or_create_driver_profile,
    get_ride_by_id,
    get_ride_with_driver,
    get_settings_dict,
    list_all_rides,
    list_driver_rides,
    list_pending_rides,
    list_user_rides,
    rate_ride,
    ride_to_dict,
    update_settings,
    validate_quote_for_order,
)
from services.telegram import notify_taxi_new_ride, notify_taxi_status_change, notify_taxi_driver_application
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.taxi import TaxiDriverProfile

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/taxi", tags=["taxi"])

VALID_PAYMENT = {"cash", "card"}


class LocationInput(BaseModel):
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class SuggestRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=200)
    limit: int = Field(default=6, ge=1, le=10)


class QuoteRequest(BaseModel):
    from_point: LocationInput
    to_point: LocationInput


class CreateRideRequest(BaseModel):
    from_address: str
    to_address: str
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    passenger_name: str
    passenger_phone: str
    estimated_price: float
    distance_km: float
    payment_method: str = "cash"
    comment: Optional[str] = ""


class CancelRequest(BaseModel):
    reason: Optional[str] = ""


class StatusRequest(BaseModel):
    status: str


class RateRequest(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = ""


class DriverOnlineRequest(BaseModel):
    online: bool


class DriverLocationRequest(BaseModel):
    lat: float
    lng: float


class DriverProfileUpdate(BaseModel):
    car_make: Optional[str] = None
    car_model: Optional[str] = None
    car_number: Optional[str] = None
    car_color: Optional[str] = None
    phone: Optional[str] = None


class SettingsUpdateRequest(BaseModel):
    settings: Dict[str, str]


class AdminDriverVerifyRequest(BaseModel):
    verified: bool


class DriverApplyRequest(BaseModel):
    full_name: str
    phone: str
    car_make: str
    car_model: str
    car_number: str
    car_color: Optional[str] = ""
    comment: Optional[str] = ""


class AdminApplicationActionRequest(BaseModel):
    admin_note: Optional[str] = ""


async def _resolve_point(point: LocationInput, settings: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    geo_ctx = geo_context_from_taxi_settings(settings) if settings else None
    loc = await resolve_location(
        address=point.address,
        lat=point.lat,
        lng=point.lng,
        settings=geo_ctx,
    )
    if loc.get("error"):
        raise HTTPException(status_code=400, detail=loc["error"])
    return loc


# ─── Public ────────────────────────────────────────────────────────

@router.get("/settings")
async def public_settings(db: AsyncSession = Depends(get_db)):
    settings = await get_settings_dict(db)
    return {
        "enabled": settings.get("enabled", "true").lower() in ("true", "1", "yes"),
        "service_area": settings.get("service_area"),
        "base_fare": float(settings.get("base_fare", 500)),
        "per_km": float(settings.get("per_km", 150)),
        "min_fare": float(settings.get("min_fare", 800)),
        "center_lat": float(settings.get("center_lat", 49.9774)),
        "center_lng": float(settings.get("center_lng", 73.2137)),
        "max_radius_km": float(settings.get("max_radius_km", 25)),
    }


@router.post("/quote")
async def quote_ride(body: QuoteRequest, db: AsyncSession = Depends(get_db)):
    settings = await get_settings_dict(db)
    from_loc = await _resolve_point(body.from_point, settings)
    to_loc = await _resolve_point(body.to_point, settings)
    result = await build_quote(
        settings,
        from_loc["lat"],
        from_loc["lng"],
        to_loc["lat"],
        to_loc["lng"],
        from_address=from_loc.get("address") or "",
        to_address=to_loc.get("address") or "",
    )
    return result


@router.post("/geocode")
async def geocode_point(body: LocationInput, db: AsyncSession = Depends(get_db)):
    settings = await get_settings_dict(db)
    loc = await resolve_location(
        address=body.address,
        lat=body.lat,
        lng=body.lng,
        settings=geo_context_from_taxi_settings(settings),
    )
    if loc.get("error"):
        raise HTTPException(status_code=400, detail=loc["error"])
    return loc


@router.post("/suggest")
async def suggest_address(body: SuggestRequest, db: AsyncSession = Depends(get_db)):
    settings = await get_settings_dict(db)
    items = await suggest_addresses(
        body.query.strip(),
        settings=geo_context_from_taxi_settings(settings),
        limit=body.limit,
    )
    return {"suggestions": items}


# ─── Passenger ─────────────────────────────────────────────────────

@router.post("/rides")
async def create_taxi_ride(
    body: CreateRideRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    if body.payment_method not in VALID_PAYMENT:
        raise HTTPException(status_code=400, detail="Недопустимый способ оплаты")

    try:
        await validate_quote_for_order(
            db,
            body.from_lat,
            body.from_lng,
            body.to_lat,
            body.to_lng,
            body.estimated_price,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        ride = await create_ride(
            db,
            user,
            from_address=body.from_address,
            to_address=body.to_address,
            from_lat=body.from_lat,
            from_lng=body.from_lng,
            to_lat=body.to_lat,
            to_lng=body.to_lng,
            passenger_name=body.passenger_name or user.name or "",
            passenger_phone=body.passenger_phone or user.phone or "",
            payment_method=body.payment_method,
            comment=body.comment or "",
            estimated_price=body.estimated_price,
            distance_km=body.distance_km,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    data = ride_to_dict(ride)
    await notify_taxi_new_ride(data)
    return data


@router.get("/rides/my")
async def my_rides(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    rides = await list_user_rides(db, str(user.id))
    return [ride_to_dict(r) for r in rides]


@router.get("/rides/active")
async def my_active_ride(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    from services.taxi_service import ACTIVE_RIDE_STATUSES
    from models.taxi import TaxiRide

    ride = (
        await db.execute(
            select(TaxiRide).where(
                TaxiRide.user_id == str(user.id),
                TaxiRide.status.in_(ACTIVE_RIDE_STATUSES),
            )
        )
    ).scalar_one_or_none()
    if not ride:
        return None
    return await get_ride_with_driver(db, ride.id)


@router.get("/rides/{ride_id}")
async def get_ride(
    ride_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    ride = await get_ride_by_id(db, ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Поездка не найдена")
    uid = str(user.id)
    if ride.user_id != uid and ride.driver_id != uid and user.role not in {"admin", "superadmin", "moderator"}:
        raise HTTPException(status_code=403, detail="Нет доступа")
    return await get_ride_with_driver(db, ride_id)


@router.post("/rides/{ride_id}/cancel")
async def cancel_taxi_ride(
    ride_id: int,
    body: CancelRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    ride = await get_ride_by_id(db, ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Поездка не найдена")

    uid = str(user.id)
    if ride.user_id == uid:
        cancelled_by = "passenger"
    elif ride.driver_id == uid:
        cancelled_by = "driver"
    elif user.role in {"admin", "superadmin", "moderator"}:
        cancelled_by = "admin"
    else:
        raise HTTPException(status_code=403, detail="Нет доступа")

    try:
        ride = await cancel_ride(db, ride, cancelled_by=cancelled_by, reason=body.reason or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    data = ride_to_dict(ride)
    await notify_taxi_status_change(data, "cancelled")
    return data


@router.post("/rides/{ride_id}/rate")
async def rate_taxi_ride(
    ride_id: int,
    body: RateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    ride = await get_ride_by_id(db, ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Поездка не найдена")
    try:
        ride = await rate_ride(db, ride, str(user.id), body.rating, body.comment or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ride_to_dict(ride)


# ─── Driver ────────────────────────────────────────────────────────

@router.get("/driver/cabinet")
async def driver_cabinet(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    assert_driver_user(user)
    profile = await get_or_create_driver_profile(db, user)
    pending = await list_pending_rides(db)
    history = await list_driver_rides(db, str(user.id))
    active = [r for r in history if r.status in ("accepted", "driver_arrived", "in_progress")]
    completed = [r for r in history if r.status == "completed"]
    earnings = sum(float(r.final_price or r.estimated_price or 0) for r in completed)

    return {
        "profile": {
            "online": profile.is_online,
            "verified": profile.is_verified,
            "car_make": profile.car_make,
            "car_model": profile.car_model,
            "car_number": profile.car_number,
            "car_color": profile.car_color,
            "phone": profile.phone or user.phone,
            "rating": profile.rating,
            "rides_count": profile.rides_count,
            "current_lat": profile.current_lat,
            "current_lng": profile.current_lng,
        },
        "available_orders": [ride_to_dict(r) for r in pending],
        "active_ride": ride_to_dict(active[0]) if active else None,
        "order_history": [ride_to_dict(r) for r in history[:30]],
        "earnings": earnings,
    }


@router.put("/driver/online")
async def set_driver_online(
    body: DriverOnlineRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    assert_driver_user(user)
    profile = await get_or_create_driver_profile(db, user)
    profile.is_online = body.online
    await db.commit()
    return {"online": profile.is_online}


@router.put("/driver/location")
async def update_driver_location(
    body: DriverLocationRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    assert_driver_user(user)
    profile = await get_or_create_driver_profile(db, user)
    profile.current_lat = body.lat
    profile.current_lng = body.lng
    await db.commit()
    return {"success": True}


@router.put("/driver/profile")
async def update_driver_profile(
    body: DriverProfileUpdate,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    assert_driver_user(user)
    profile = await get_or_create_driver_profile(db, user)
    if body.car_make is not None:
        profile.car_make = body.car_make.strip()
    if body.car_model is not None:
        profile.car_model = body.car_model.strip()
    if body.car_number is not None:
        profile.car_number = body.car_number.strip()
    if body.car_color is not None:
        profile.car_color = body.car_color.strip()
    if body.phone is not None:
        profile.phone = body.phone.strip()
    await db.commit()
    return {"success": True}


@router.get("/driver/available")
async def driver_available_rides(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    assert_driver_user(user)
    pending = await list_pending_rides(db)
    return [ride_to_dict(r) for r in pending]


@router.post("/driver/rides/{ride_id}/accept")
async def driver_accept_ride(
    ride_id: int,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    assert_driver_user(user)
    try:
        ride = await accept_ride(db, ride_id, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await get_ride_with_driver(db, ride.id)
    await notify_taxi_status_change(data, "accepted")
    return data


@router.post("/driver/rides/{ride_id}/status")
async def driver_update_status(
    ride_id: int,
    body: StatusRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    assert_driver_user(user)
    ride = await get_ride_by_id(db, ride_id)
    if not ride:
        raise HTTPException(status_code=404, detail="Поездка не найдена")
    try:
        ride = await advance_ride_status(db, ride, user, body.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = await get_ride_with_driver(db, ride.id)
    await notify_taxi_status_change(data, body.status)
    return data


# ─── Driver registration ───────────────────────────────────────────

@router.get("/driver/application")
async def driver_application_status(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    app = await get_user_application(db, str(user.id))
    if not app:
        return {"status": "none", "is_driver": user.role == "driver"}
    u = user
    return {**application_to_dict(app, u), "is_driver": user.role == "driver"}


@router.post("/driver/application")
async def driver_submit_application(
    body: DriverApplyRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    user = await get_taxi_user(db, authorization)
    if not body.full_name.strip() or not body.car_number.strip():
        raise HTTPException(status_code=400, detail="Заполните имя и госномер")
    try:
        app = await submit_driver_application(
            db,
            user,
            full_name=body.full_name,
            phone=body.phone or user.phone or "",
            car_make=body.car_make,
            car_model=body.car_model,
            car_number=body.car_number,
            car_color=body.car_color or "",
            comment=body.comment or "",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    data = application_to_dict(app, user)
    await notify_taxi_driver_application(data)
    return data


# ─── Admin ─────────────────────────────────────────────────────────

@router.get("/admin/settings")
async def admin_get_settings(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    return await get_settings_dict(db)


@router.put("/admin/settings")
async def admin_update_settings(
    body: SettingsUpdateRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    return await update_settings(db, body.settings)


@router.get("/admin/rides")
async def admin_list_rides(
    status: Optional[str] = None,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    rides = await list_all_rides(db, status=status)
    return [ride_to_dict(r) for r in rides]


@router.get("/admin/drivers")
async def admin_list_drivers(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    profiles = (await db.execute(select(TaxiDriverProfile))).scalars().all()
    result: List[Dict[str, Any]] = []
    for p in profiles:
        u = (await db.execute(select(User).where(User.id == p.user_id))).scalar_one_or_none()
        result.append({
            "user_id": p.user_id,
            "name": u.name if u else "",
            "phone": p.phone or (u.phone if u else ""),
            "role": u.role if u else "",
            "is_online": p.is_online,
            "is_verified": p.is_verified,
            "car_make": p.car_make,
            "car_model": p.car_model,
            "car_number": p.car_number,
            "car_color": p.car_color,
            "rating": p.rating,
            "rides_count": p.rides_count,
            "balance": p.balance,
        })
    return result


@router.put("/admin/drivers/{user_id}/verify")
async def admin_verify_driver(
    user_id: str,
    body: AdminDriverVerifyRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    profile = (
        await db.execute(select(TaxiDriverProfile).where(TaxiDriverProfile.user_id == user_id))
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Профиль водителя не найден")
    profile.is_verified = body.verified
    if body.verified:
        user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user:
            user.role = "driver"
    await db.commit()
    return {"success": True, "verified": profile.is_verified}


@router.get("/admin/applications")
async def admin_list_applications(
    status: Optional[str] = "pending",
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    apps = await list_driver_applications(db, status=status or None)
    result = []
    for app in apps:
        u = (await db.execute(select(User).where(User.id == app.user_id))).scalar_one_or_none()
        result.append(application_to_dict(app, u))
    return result


@router.post("/admin/applications/{user_id}/approve")
async def admin_approve_application(
    user_id: str,
    body: AdminApplicationActionRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    try:
        await approve_driver_application(db, user_id, body.admin_note or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True}


@router.post("/admin/applications/{user_id}/reject")
async def admin_reject_application(
    user_id: str,
    body: AdminApplicationActionRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    try:
        await reject_driver_application(db, user_id, body.admin_note or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True}


@router.get("/admin/stats")
async def admin_taxi_stats(
    authorization: str | None = Header(default=None, alias="Authorization"),
    db: AsyncSession = Depends(get_db),
):
    await require_taxi_admin(db, authorization)
    from models.taxi import TaxiRide
    from sqlalchemy import func

    total = (await db.execute(select(func.count(TaxiRide.id)))).scalar() or 0
    completed = (await db.execute(select(func.count(TaxiRide.id)).where(TaxiRide.status == "completed"))).scalar() or 0
    pending = (await db.execute(select(func.count(TaxiRide.id)).where(TaxiRide.status == "pending"))).scalar() or 0
    active = (await db.execute(
        select(func.count(TaxiRide.id)).where(TaxiRide.status.in_(("accepted", "driver_arrived", "in_progress")))
    )).scalar() or 0
    revenue = (await db.execute(
        select(func.coalesce(func.sum(TaxiRide.final_price), 0)).where(TaxiRide.status == "completed")
    )).scalar() or 0
    online_drivers = (await db.execute(
        select(func.count(TaxiDriverProfile.user_id)).where(
            TaxiDriverProfile.is_online == True, TaxiDriverProfile.is_verified == True
        )
    )).scalar() or 0
    from models.taxi import TaxiDriverApplication
    pending_apps = (await db.execute(
        select(func.count(TaxiDriverApplication.id)).where(TaxiDriverApplication.status == "pending")
    )).scalar() or 0

    return {
        "total_rides": total,
        "completed_rides": completed,
        "pending_rides": pending,
        "active_rides": active,
        "revenue": float(revenue),
        "online_drivers": online_drivers,
        "pending_applications": int(pending_apps),
    }
