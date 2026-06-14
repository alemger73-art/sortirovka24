"""Taxi business logic — rides, drivers, settings."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from models.auth import User
from models.taxi import TaxiDriverApplication, TaxiDriverProfile, TaxiRide, TaxiSettings
from services.taxi_pricing import DEFAULT_SETTINGS, build_quote, is_taxi_enabled, settings_to_dict
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


RIDE_STATUSES = {
    "pending",
    "accepted",
    "driver_arrived",
    "in_progress",
    "completed",
    "cancelled",
}

DRIVER_STATUS_FLOW = {
    "accepted": "driver_arrived",
    "driver_arrived": "in_progress",
    "in_progress": "completed",
}

ACTIVE_RIDE_STATUSES = {"pending", "accepted", "driver_arrived", "in_progress"}


async def ensure_taxi_settings(db: AsyncSession) -> None:
    existing = (await db.execute(select(TaxiSettings))).scalars().all()
    if existing:
        return
    for key, value in DEFAULT_SETTINGS.items():
        db.add(TaxiSettings(key=key, value=value))
    await db.commit()


async def get_settings_dict(db: AsyncSession) -> Dict[str, str]:
    await ensure_taxi_settings(db)
    rows = (await db.execute(select(TaxiSettings))).scalars().all()
    return settings_to_dict(rows)


async def ensure_taxi_service_enabled(db: AsyncSession) -> Dict[str, str]:
    """Raise ValueError when taxi is turned off in admin settings."""
    settings = await get_settings_dict(db)
    if not is_taxi_enabled(settings):
        raise ValueError("Сервис такси временно недоступен")
    return settings


async def update_settings(db: AsyncSession, updates: Dict[str, str]) -> Dict[str, str]:
    await ensure_taxi_settings(db)
    for key, value in updates.items():
        row = (await db.execute(select(TaxiSettings).where(TaxiSettings.key == key))).scalar_one_or_none()
        if row:
            row.value = str(value)
        else:
            db.add(TaxiSettings(key=key, value=str(value)))
    await db.commit()
    return await get_settings_dict(db)


def ride_to_dict(ride: TaxiRide, driver: Optional[TaxiDriverProfile] = None, driver_user: Optional[User] = None) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "id": ride.id,
        "user_id": ride.user_id,
        "driver_id": ride.driver_id,
        "passenger_name": ride.passenger_name,
        "passenger_phone": ride.passenger_phone,
        "from_address": ride.from_address,
        "to_address": ride.to_address,
        "from_lat": ride.from_lat,
        "from_lng": ride.from_lng,
        "to_lat": ride.to_lat,
        "to_lng": ride.to_lng,
        "distance_km": ride.distance_km,
        "estimated_price": ride.estimated_price,
        "final_price": ride.final_price,
        "status": ride.status,
        "payment_method": ride.payment_method,
        "comment": ride.comment,
        "cancel_reason": ride.cancel_reason,
        "cancelled_by": ride.cancelled_by,
        "accepted_at": ride.accepted_at,
        "arrived_at": ride.arrived_at,
        "started_at": ride.started_at,
        "completed_at": ride.completed_at,
        "cancelled_at": ride.cancelled_at,
        "rating": ride.rating,
        "rating_comment": ride.rating_comment,
        "created_at": ride.created_at.isoformat() if ride.created_at else None,
    }
    if driver and driver_user:
        result["driver"] = {
            "name": driver_user.name or "Водитель",
            "phone": driver.phone or driver_user.phone,
            "car_make": driver.car_make,
            "car_model": driver.car_model,
            "car_number": driver.car_number,
            "car_color": driver.car_color,
            "rating": driver.rating,
        }
    return result


async def get_or_create_driver_profile(db: AsyncSession, user: User) -> TaxiDriverProfile:
    profile = (
        await db.execute(select(TaxiDriverProfile).where(TaxiDriverProfile.user_id == str(user.id)))
    ).scalar_one_or_none()
    if profile:
        return profile
    profile = TaxiDriverProfile(
        user_id=str(user.id),
        phone=user.phone,
        is_online=False,
        is_verified=user.role in {"admin", "superadmin"},
    )
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


async def create_ride(
    db: AsyncSession,
    user: User,
    *,
    from_address: str,
    to_address: str,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    passenger_name: str,
    passenger_phone: str,
    payment_method: str = "cash",
    comment: str = "",
    estimated_price: float,
    distance_km: float,
) -> TaxiRide:
    active = (
        await db.execute(
            select(TaxiRide).where(
                TaxiRide.user_id == str(user.id),
                TaxiRide.status.in_(ACTIVE_RIDE_STATUSES),
            )
        )
    ).scalar_one_or_none()
    if active:
        raise ValueError("У вас уже есть активная поездка")

    ride = TaxiRide(
        user_id=str(user.id),
        passenger_name=passenger_name.strip(),
        passenger_phone=passenger_phone.strip(),
        from_address=from_address.strip(),
        to_address=to_address.strip(),
        from_lat=from_lat,
        from_lng=from_lng,
        to_lat=to_lat,
        to_lng=to_lng,
        distance_km=distance_km,
        estimated_price=estimated_price,
        payment_method=payment_method,
        comment=comment.strip() or None,
        status="pending",
    )
    db.add(ride)
    await db.commit()
    await db.refresh(ride)
    return ride


async def get_ride_by_id(db: AsyncSession, ride_id: int) -> Optional[TaxiRide]:
    return (await db.execute(select(TaxiRide).where(TaxiRide.id == ride_id))).scalar_one_or_none()


async def get_ride_with_driver(db: AsyncSession, ride_id: int) -> Dict[str, Any]:
    ride = await get_ride_by_id(db, ride_id)
    if not ride:
        return {}
    driver_profile = None
    driver_user = None
    if ride.driver_id:
        driver_profile = (
            await db.execute(select(TaxiDriverProfile).where(TaxiDriverProfile.user_id == ride.driver_id))
        ).scalar_one_or_none()
        driver_user = (await db.execute(select(User).where(User.id == ride.driver_id))).scalar_one_or_none()
    return ride_to_dict(ride, driver_profile, driver_user)


async def accept_ride(db: AsyncSession, ride_id: int, driver_user: User) -> TaxiRide:
    profile = await get_or_create_driver_profile(db, driver_user)
    if not profile.is_verified and driver_user.role not in {"admin", "superadmin"}:
        raise ValueError("Профиль водителя не верифицирован")
    if not profile.is_online:
        raise ValueError("Включите статус «На линии»")

    active_driver_ride = (
        await db.execute(
            select(TaxiRide).where(
                TaxiRide.driver_id == str(driver_user.id),
                TaxiRide.status.in_(("accepted", "driver_arrived", "in_progress")),
            )
        )
    ).scalar_one_or_none()
    if active_driver_ride:
        raise ValueError("У вас уже есть активная поездка")

    result = await db.execute(
        update(TaxiRide)
        .where(TaxiRide.id == ride_id, TaxiRide.status == "pending", TaxiRide.driver_id.is_(None))
        .values(driver_id=str(driver_user.id), status="accepted", accepted_at=_now_iso())
    )
    if result.rowcount == 0:
        raise ValueError("Заказ уже принят другим водителем или недоступен")

    await db.commit()
    ride = await get_ride_by_id(db, ride_id)
    if not ride:
        raise ValueError("Поездка не найдена")
    return ride


async def advance_ride_status(db: AsyncSession, ride: TaxiRide, driver_user: User, new_status: str) -> TaxiRide:
    if ride.driver_id != str(driver_user.id) and driver_user.role not in {"admin", "superadmin"}:
        raise ValueError("Нет доступа к этой поездке")
    expected = DRIVER_STATUS_FLOW.get(ride.status)
    if expected != new_status:
        raise ValueError(f"Нельзя перейти из {ride.status} в {new_status}")

    ride.status = new_status
    now = _now_iso()
    if new_status == "driver_arrived":
        ride.arrived_at = now
    elif new_status == "in_progress":
        ride.started_at = now
    elif new_status == "completed":
        ride.completed_at = now
        ride.final_price = ride.final_price or ride.estimated_price
        profile = (
            await db.execute(select(TaxiDriverProfile).where(TaxiDriverProfile.user_id == ride.driver_id))
        ).scalar_one_or_none()
        if profile:
            profile.rides_count = (profile.rides_count or 0) + 1
            profile.balance = float(profile.balance or 0) + float(ride.final_price or 0)

    await db.commit()
    await db.refresh(ride)
    return ride


async def cancel_ride(
    db: AsyncSession,
    ride: TaxiRide,
    *,
    cancelled_by: str,
    reason: str = "",
) -> TaxiRide:
    if ride.status in ("completed", "cancelled"):
        raise ValueError("Поездку нельзя отменить")
    ride.status = "cancelled"
    ride.cancelled_by = cancelled_by
    ride.cancel_reason = reason.strip() or None
    ride.cancelled_at = _now_iso()
    await db.commit()
    await db.refresh(ride)
    return ride


async def rate_ride(db: AsyncSession, ride: TaxiRide, user_id: str, rating: int, comment: str = "") -> TaxiRide:
    if ride.user_id != user_id:
        raise ValueError("Нет доступа")
    if ride.status != "completed":
        raise ValueError("Оценить можно только завершённую поездку")
    if ride.rating is not None:
        raise ValueError("Поездка уже оценена")
    if rating < 1 or rating > 5:
        raise ValueError("Оценка от 1 до 5")

    ride.rating = rating
    ride.rating_comment = comment.strip() or None

    if ride.driver_id:
        profile = (
            await db.execute(select(TaxiDriverProfile).where(TaxiDriverProfile.user_id == ride.driver_id))
        ).scalar_one_or_none()
        if profile:
            count = profile.rides_count or 1
            profile.rating = round(((profile.rating or 5) * max(count - 1, 0) + rating) / count, 2)

    await db.commit()
    await db.refresh(ride)
    return ride


async def list_pending_rides(db: AsyncSession) -> List[TaxiRide]:
    return (
        await db.execute(
            select(TaxiRide).where(TaxiRide.status == "pending").order_by(desc(TaxiRide.id)).limit(50)
        )
    ).scalars().all()


async def list_driver_rides(db: AsyncSession, driver_id: str, limit: int = 50) -> List[TaxiRide]:
    return (
        await db.execute(
            select(TaxiRide)
            .where(TaxiRide.driver_id == driver_id)
            .order_by(desc(TaxiRide.id))
            .limit(limit)
        )
    ).scalars().all()


async def list_user_rides(db: AsyncSession, user_id: str, limit: int = 50) -> List[TaxiRide]:
    return (
        await db.execute(
            select(TaxiRide).where(TaxiRide.user_id == user_id).order_by(desc(TaxiRide.id)).limit(limit)
        )
    ).scalars().all()


async def list_all_rides(db: AsyncSession, status: Optional[str] = None, limit: int = 100) -> List[TaxiRide]:
    q = select(TaxiRide).order_by(desc(TaxiRide.id)).limit(limit)
    if status:
        q = q.where(TaxiRide.status == status)
    return (await db.execute(q)).scalars().all()


async def validate_quote_for_order(
    db: AsyncSession,
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    client_price: float,
) -> Dict[str, Any]:
    settings = await get_settings_dict(db)
    quote = await build_quote(
        settings, from_lat, from_lng, to_lat, to_lng,
    )
    if not quote.get("available"):
        raise ValueError(quote.get("message") or "Маршрут недоступен")
    server_price = float(quote["price"])
    if abs(server_price - client_price) > 50:
        raise ValueError("Цена изменилась, пересчитайте маршрут")
    return quote


def application_to_dict(app: TaxiDriverApplication, user: Optional[User] = None) -> Dict[str, Any]:
    return {
        "user_id": app.user_id,
        "full_name": app.full_name,
        "phone": app.phone,
        "car_make": app.car_make,
        "car_model": app.car_model,
        "car_number": app.car_number,
        "car_color": app.car_color,
        "comment": app.comment,
        "status": app.status,
        "admin_note": app.admin_note,
        "reviewed_at": app.reviewed_at,
        "created_at": app.created_at.isoformat() if app.created_at else None,
        "account_name": user.name if user else "",
        "account_phone": user.phone if user else "",
    }


async def get_user_application(db: AsyncSession, user_id: str) -> Optional[TaxiDriverApplication]:
    return (
        await db.execute(select(TaxiDriverApplication).where(TaxiDriverApplication.user_id == user_id))
    ).scalar_one_or_none()


async def submit_driver_application(
    db: AsyncSession,
    user: User,
    *,
    full_name: str,
    phone: str,
    car_make: str,
    car_model: str,
    car_number: str,
    car_color: str = "",
    comment: str = "",
) -> TaxiDriverApplication:
    if user.role in {"driver", "admin", "superadmin"}:
        raise ValueError("Вы уже зарегистрированы как водитель")

    existing = await get_user_application(db, str(user.id))
    if existing and existing.status == "pending":
        raise ValueError("Заявка уже на рассмотрении")
    if existing and existing.status == "approved":
        raise ValueError("Заявка уже одобрена")

    data = {
        "full_name": full_name.strip(),
        "phone": phone.strip(),
        "car_make": car_make.strip(),
        "car_model": car_model.strip(),
        "car_number": car_number.strip(),
        "car_color": car_color.strip(),
        "comment": comment.strip() or None,
        "status": "pending",
        "admin_note": None,
        "reviewed_at": None,
    }
    if existing:
        for k, v in data.items():
            setattr(existing, k, v)
        app = existing
    else:
        app = TaxiDriverApplication(user_id=str(user.id), **data)
        db.add(app)
    await db.commit()
    await db.refresh(app)
    return app


async def list_driver_applications(db: AsyncSession, status: Optional[str] = None) -> List[TaxiDriverApplication]:
    q = select(TaxiDriverApplication).order_by(desc(TaxiDriverApplication.id))
    if status:
        q = q.where(TaxiDriverApplication.status == status)
    return (await db.execute(q)).scalars().all()


async def approve_driver_application(
    db: AsyncSession,
    user_id: str,
    admin_note: str = "",
) -> TaxiDriverProfile:
    app = await get_user_application(db, user_id)
    if not app:
        raise ValueError("Заявка не найдена")
    if app.status != "pending":
        raise ValueError("Заявка уже обработана")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise ValueError("Пользователь не найден")

    user.role = "driver"
    profile = (
        await db.execute(select(TaxiDriverProfile).where(TaxiDriverProfile.user_id == user_id))
    ).scalar_one_or_none()
    if not profile:
        profile = TaxiDriverProfile(user_id=user_id)
        db.add(profile)

    profile.is_verified = True
    profile.is_online = False
    profile.phone = app.phone or user.phone
    profile.car_make = app.car_make
    profile.car_model = app.car_model
    profile.car_number = app.car_number
    profile.car_color = app.car_color

    app.status = "approved"
    app.admin_note = admin_note.strip() or None
    app.reviewed_at = _now_iso()

    await db.commit()
    await db.refresh(profile)
    return profile


async def reject_driver_application(db: AsyncSession, user_id: str, admin_note: str = "") -> TaxiDriverApplication:
    app = await get_user_application(db, user_id)
    if not app:
        raise ValueError("Заявка не найдена")
    if app.status != "pending":
        raise ValueError("Заявка уже обработана")
    app.status = "rejected"
    app.admin_note = admin_note.strip() or None
    app.reviewed_at = _now_iso()
    await db.commit()
    await db.refresh(app)
    return app
