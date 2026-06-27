"""Logistics business logic — tasks, couriers, food order bridge."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from models.auth import User
from models.food_orders import Food_orders
from models.logistics import CourierProfile, LogisticsSettings, LogisticsTask
from services.taxi_geo import DEFAULT_CENTER_LAT, DEFAULT_CENTER_LNG, geocode_address, geo_context_from_taxi_settings
from sqlalchemy import desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

DEFAULT_LOGISTICS_SETTINGS: Dict[str, str] = {
    "enabled": "true",
    "offer_timeout_sec": "15",
    "max_dispatch_rounds": "5",
    "gps_max_age_sec": "120",
    "pending_timeout_min": "45",
    "default_prep_minutes": "20",
    "pickup_lat": str(DEFAULT_CENTER_LAT),
    "pickup_lng": str(DEFAULT_CENTER_LNG),
}

TASK_STATUSES = {
    "pending",
    "ready",
    "assigned",
    "picked_up",
    "on_the_way",
    "delivered",
    "cancelled",
}

ACTIVE_TASK_STATUSES = {"assigned", "picked_up", "on_the_way"}

COURIER_STATUS_FLOW = {
    "assigned": ("picked_up", "Забрал заказ"),
    "picked_up": ("on_the_way", "Еду к клиенту"),
    "on_the_way": ("delivered", "Доставлено"),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_prep_minutes(raw: Optional[str], default: int = 20) -> int:
    if not raw:
        return default
    m = re.search(r"\d+", str(raw))
    if m:
        return max(5, min(90, int(m.group())))
    return default


async def ensure_logistics_settings(db: AsyncSession) -> None:
    existing = (await db.execute(select(LogisticsSettings))).scalars().all()
    if existing:
        return
    for key, value in DEFAULT_LOGISTICS_SETTINGS.items():
        db.add(LogisticsSettings(key=key, value=value))
    await db.commit()


async def get_logistics_settings(db: AsyncSession) -> Dict[str, str]:
    await ensure_logistics_settings(db)
    rows = (await db.execute(select(LogisticsSettings))).scalars().all()
    result = dict(DEFAULT_LOGISTICS_SETTINGS)
    for row in rows:
        if row.key and row.value is not None:
            result[row.key] = str(row.value)
    return result


def task_to_dict(task: LogisticsTask, courier_user: Optional[User] = None, courier: Optional[CourierProfile] = None) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "id": task.id,
        "vertical": task.vertical,
        "source_type": task.source_type,
        "source_id": task.source_id,
        "status": task.status,
        "pickup_address": task.pickup_address,
        "pickup_lat": task.pickup_lat,
        "pickup_lng": task.pickup_lng,
        "dropoff_address": task.dropoff_address,
        "dropoff_lat": task.dropoff_lat,
        "dropoff_lng": task.dropoff_lng,
        "customer_name": task.customer_name,
        "customer_phone": task.customer_phone,
        "merchant_name": task.merchant_name,
        "prep_minutes": task.prep_minutes,
        "ready_at": task.ready_at,
        "courier_id": task.courier_id,
        "offered_courier_id": task.offered_courier_id,
        "offer_expires_at": task.offer_expires_at,
        "total_amount": task.total_amount,
        "delivery_fee": task.delivery_fee,
        "comment": task.comment,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }
    if courier and courier_user:
        data["courier"] = {
            "name": courier_user.name or "Курьер",
            "phone": courier.phone or courier_user.phone,
            "rating": courier.rating,
            "vehicle_type": courier.vehicle_type,
            "photo_url": courier.photo_url,
        }
    return data


async def get_or_create_courier_profile(db: AsyncSession, user: User) -> CourierProfile:
    """Return verified courier profile; raises if user has no approved courier access."""
    from services.logistics_courier import assert_courier_cabinet_access

    return await assert_courier_cabinet_access(db, user)


def courier_profile_dict(profile: CourierProfile, user: User) -> Dict[str, Any]:
    return {
        "online": profile.is_online,
        "verified": profile.is_verified,
        "vehicle_type": profile.vehicle_type,
        "rating": profile.rating,
        "deliveries_count": profile.deliveries_count,
        "phone": profile.phone or user.phone,
        "name": user.name,
        "photo_url": profile.photo_url,
    }


async def create_task_from_food_order(db: AsyncSession, order: Food_orders, *, delivery_fee: float = 0) -> Optional[LogisticsTask]:
    settings = await get_logistics_settings(db)
    if settings.get("enabled", "true").lower() not in ("true", "1", "yes"):
        return None
    if (order.delivery_method or "").lower() not in ("delivery", "доставка"):
        return None
    if not (order.delivery_address or "").strip():
        return None

    existing = (
        await db.execute(
            select(LogisticsTask).where(
                LogisticsTask.source_type == "food_orders",
                LogisticsTask.source_id == order.id,
            )
        )
    ).scalar_one_or_none()
    if existing:
        return existing

    prep = _parse_prep_minutes(None, int(float(settings.get("default_prep_minutes", 20))))
    ready_at = datetime.now(timezone.utc) + timedelta(minutes=prep)

    pickup_lat = float(settings.get("pickup_lat") or DEFAULT_CENTER_LAT)
    pickup_lng = float(settings.get("pickup_lng") or DEFAULT_CENTER_LNG)
    pickup_address = order.restaurant_name or "DAM ALEM, Сортировка"

    geo_ctx = geo_context_from_taxi_settings({})
    drop_lat, drop_lng = None, None
    try:
        coords = await geocode_address(order.delivery_address.strip(), settings=geo_ctx)
        if coords:
            drop_lat, drop_lng = coords
    except Exception as exc:
        logger.warning("Geocode dropoff failed: %s", exc)

    task = LogisticsTask(
        vertical="food",
        source_type="food_orders",
        source_id=order.id,
        status="pending",
        pickup_address=pickup_address,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        dropoff_address=order.delivery_address.strip(),
        dropoff_lat=drop_lat,
        dropoff_lng=drop_lng,
        customer_name=order.customer_name,
        customer_phone=order.customer_phone,
        merchant_name=order.restaurant_name,
        prep_minutes=prep,
        ready_at=ready_at.isoformat(),
        total_amount=order.total_amount,
        delivery_fee=delivery_fee,
        comment=order.comment,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    logger.info("Logistics task %s created for food order %s", task.id, order.id)
    return task


async def get_task_by_id(db: AsyncSession, task_id: int) -> Optional[LogisticsTask]:
    return (await db.execute(select(LogisticsTask).where(LogisticsTask.id == task_id))).scalar_one_or_none()


async def get_task_by_source(db: AsyncSession, source_type: str, source_id: int) -> Optional[LogisticsTask]:
    return (
        await db.execute(
            select(LogisticsTask).where(
                LogisticsTask.source_type == source_type,
                LogisticsTask.source_id == source_id,
            )
        )
    ).scalar_one_or_none()


async def mark_task_ready(db: AsyncSession, task: LogisticsTask) -> LogisticsTask:
    if task.status not in ("pending", "ready"):
        raise ValueError("Задача не может быть отмечена готовой")
    task.status = "ready"
    task.ready_at = _now_iso()
    await db.commit()
    await db.refresh(task)
    return task


async def accept_task(db: AsyncSession, task_id: int, courier_user: User) -> LogisticsTask:
    profile = await get_or_create_courier_profile(db, courier_user)
    if not profile.is_verified and courier_user.role not in {"admin", "superadmin"}:
        raise ValueError("Пройдите верификацию курьера")
    if not profile.is_online:
        raise ValueError("Включите статус «На линии»")

    active = (
        await db.execute(
            select(LogisticsTask).where(
                LogisticsTask.courier_id == str(courier_user.id),
                LogisticsTask.status.in_(ACTIVE_TASK_STATUSES),
            )
        )
    ).scalar_one_or_none()
    if active:
        raise ValueError("У вас уже есть активная доставка")

    task = await get_task_by_id(db, task_id)
    if not task or task.status != "ready":
        raise ValueError("Заказ недоступен")

    from services.logistics_dispatch import offer_is_active

    if offer_is_active(task) and task.offered_courier_id != str(courier_user.id):
        raise ValueError("Заказ предложен другому курьеру")

    result = await db.execute(
        update(LogisticsTask)
        .where(LogisticsTask.id == task_id, LogisticsTask.status == "ready", LogisticsTask.courier_id.is_(None))
        .values(
            courier_id=str(courier_user.id),
            status="assigned",
            offered_courier_id=None,
            offer_expires_at=None,
        )
    )
    if result.rowcount == 0:
        raise ValueError("Заказ уже принят")

    await db.commit()
    task = await get_task_by_id(db, task_id)
    if not task:
        raise ValueError("Задача не найдена")
    try:
        from services.user_notifications import notify_logistics_task_status

        await notify_logistics_task_status(db, task, "ready", "assigned")
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("[Notify] logistics assign notify skipped: %s", exc)
    return task


async def advance_task_status(db: AsyncSession, task: LogisticsTask, courier_user: User, new_status: str) -> LogisticsTask:
    if task.courier_id != str(courier_user.id) and courier_user.role not in {"admin", "superadmin"}:
        raise ValueError("Нет доступа")
    expected = COURIER_STATUS_FLOW.get(task.status)
    if not expected or expected[0] != new_status:
        raise ValueError(f"Нельзя перейти из {task.status} в {new_status}")

    old_status = task.status
    task.status = new_status
    now = _now_iso()
    if new_status == "picked_up":
        task.picked_up_at = now
    elif new_status == "delivered":
        task.delivered_at = now
        profile = (
            await db.execute(select(CourierProfile).where(CourierProfile.user_id == task.courier_id))
        ).scalar_one_or_none()
        if profile:
            profile.deliveries_count = (profile.deliveries_count or 0) + 1
            fee = float(task.delivery_fee or 0)
            if fee > 0:
                profile.balance = float(profile.balance or 0) + fee

    await db.commit()
    await db.refresh(task)
    try:
        from services.user_notifications import notify_logistics_task_status

        await notify_logistics_task_status(db, task, old_status, new_status)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("[Notify] logistics status notify skipped: %s", exc)
    return task


async def get_task_with_courier(db: AsyncSession, task_id: int) -> Dict[str, Any]:
    task = await get_task_by_id(db, task_id)
    if not task:
        return {}
    courier = None
    courier_user = None
    if task.courier_id:
        courier = (
            await db.execute(select(CourierProfile).where(CourierProfile.user_id == task.courier_id))
        ).scalar_one_or_none()
        courier_user = (await db.execute(select(User).where(User.id == task.courier_id))).scalar_one_or_none()

    from services.logistics_tracking import build_task_tracking

    tracking = await build_task_tracking(task, courier)
    return {**task_to_dict(task, courier_user, courier), "tracking": tracking}
