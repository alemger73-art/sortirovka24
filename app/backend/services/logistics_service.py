"""Logistics business logic — tasks, couriers, food order bridge."""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from models.auth import User
from models.food_orders import Food_orders
from models.food_settings import Food_settings
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


async def assign_dam_delivery(db: AsyncSession, task: LogisticsTask, courier_user: User) -> LogisticsTask:
    """Atomically hand a ready DAM ALEM order to a selected verified courier."""
    profile = await get_or_create_courier_profile(db, courier_user)
    if not profile.is_verified:
        raise ValueError("Курьер не подтверждён")
    active = await db.scalar(select(LogisticsTask).where(
        LogisticsTask.courier_id == str(courier_user.id),
        LogisticsTask.status.in_(ACTIVE_TASK_STATUSES),
        LogisticsTask.id != task.id,
    ))
    if active:
        raise ValueError("У курьера уже есть активная доставка")
    from services.dam_order_workflow import lock_courier_order
    from services.food_operations import add_event, LABELS
    order = await lock_courier_order(db, task, require_ready=True)
    if not order:
        raise ValueError("Назначение доступно только для заказов DAM ALEM")
    result = await db.execute(update(LogisticsTask).where(
        LogisticsTask.id == task.id,
        LogisticsTask.status.in_(("ready", "assigned")),
    ).values(
        courier_id=str(courier_user.id), status="on_the_way",
        picked_up_at=_now_iso(), offered_courier_id=None, offer_expires_at=None,
        order_status="in_progress",
    ))
    if not result.rowcount:
        raise ValueError("Доставка уже изменена. Обновите заказ")
    old_status = order.status
    order.status = "in_progress"
    order.version = int(order.version or 0) + 1
    add_event(db, order,
        f"Статус: {LABELS.get(old_status, old_status)} → {LABELS['in_progress']}. Курьер: {courier_user.name or profile.phone or 'Курьер'}",
        "Оператор")
    await db.commit()
    await db.refresh(task)
    from services.user_notifications import notify_food_order_status
    try:
        await notify_food_order_status(db, order, old_status, order.status)
    except Exception:
        logger.exception("Courier assigned; customer notification failed")
        await db.rollback()
    return task


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
    existing_keys = {row.key for row in existing}
    missing = [(key, value) for key, value in DEFAULT_LOGISTICS_SETTINGS.items() if key not in existing_keys]
    if missing:
        for key, value in missing:
            db.add(LogisticsSettings(key=key, value=value))
        await db.commit()


async def resolve_courier_payout(db: AsyncSession, customer_delivery_fee: float = 0) -> float:
    """Resolve courier compensation without coupling it to the customer's delivery discount."""
    rows = (
        await db.execute(
            select(Food_settings).where(Food_settings.setting_key.in_(("courier_payout", "delivery_price")))
        )
    ).scalars().all()
    values = {row.setting_key: row.setting_value for row in rows if row.setting_key}
    for raw in (values.get("courier_payout"), values.get("delivery_price"), customer_delivery_fee):
        if raw is None or str(raw).strip() == "":
            continue
        try:
            amount = float(raw)
        except (TypeError, ValueError):
            continue
        if 0 <= amount <= 50_000:
            return round(amount, 2)
    return 0.0


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
        "paid_amount": task.paid_amount,
        "amount_due": max(0, float(task.total_amount or 0) - float(task.paid_amount or 0)),
        "order_items": task.order_items,
        "receipt_revision": task.receipt_revision,
        "order_status": task.order_status,
        "delivery_fee": task.customer_delivery_fee if task.customer_delivery_fee is not None else task.delivery_fee,
        "customer_delivery_fee": task.customer_delivery_fee if task.customer_delivery_fee is not None else task.delivery_fee,
        "courier_payout": task.courier_payout if task.courier_payout is not None else task.delivery_fee,
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
    from services.food_operations import is_dam_order
    dam = await is_dam_order(db, order)
    ready_at = None if dam else datetime.now(timezone.utc) + timedelta(minutes=prep)

    pickup_lat = float(settings.get("pickup_lat") or DEFAULT_CENTER_LAT)
    pickup_lng = float(settings.get("pickup_lng") or DEFAULT_CENTER_LNG)
    pickup_address = order.restaurant_name or "DAM ALEM 2.0, Сортировка"

    geo_ctx = geo_context_from_taxi_settings({})
    drop_lat, drop_lng = None, None
    try:
        coords = await geocode_address(order.delivery_address.strip(), settings=geo_ctx)
        if coords:
            drop_lat, drop_lng = coords
    except Exception as exc:
        logger.warning("Geocode dropoff failed: %s", exc)

    customer_fee = max(0, round(float(delivery_fee or 0), 2))
    courier_payout = await resolve_courier_payout(db, customer_fee)
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
        ready_at=ready_at.isoformat() if ready_at else None,
        total_amount=order.total_amount,
        delivery_fee=customer_fee,
        customer_delivery_fee=customer_fee,
        courier_payout=courier_payout,
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
    if task.source_type == 'food_orders':
        from services.food_operations import is_dam_order
        order = await db.get(Food_orders, task.source_id)
        if order and await is_dam_order(db, order) and order.status != 'ready':
            raise ValueError('Готовность отмечается в кабинете DAM ALEM')
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

    if task.source_type == "food_orders":
        from services.food_operations import is_dam_order

        order = await db.get(Food_orders, task.source_id)
        if order and await is_dam_order(db, order):
            raise ValueError("Курьера на заказ DÄM ALEM назначает оператор")

    from services.logistics_dispatch import offer_is_active

    if offer_is_active(task) and task.offered_courier_id != str(courier_user.id):
        raise ValueError("Заказ предложен другому курьеру")

    # Serialize with operator edits/cancellation using the same food row first.
    from services.dam_order_workflow import lock_courier_order
    await lock_courier_order(db, task, require_ready=True)
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

    from services.dam_order_workflow import lock_courier_order
    from services.food_operations import add_event, LABELS
    food = await lock_courier_order(db, task, require_ready=new_status == 'picked_up')
    old_food_status = food.status if food else None
    old_status = task.status
    changes = {'status': new_status}
    timestamp = _now_iso()
    if new_status == 'picked_up':
        changes['picked_up_at'] = timestamp
    elif new_status == 'delivered':
        changes['delivered_at'] = timestamp
    result = await db.execute(update(LogisticsTask).where(LogisticsTask.id == task.id,
        LogisticsTask.status == old_status, LogisticsTask.courier_id == task.courier_id).values(**changes))
    if not result.rowcount:
        await db.rollback()
        raise ValueError('Доставка уже изменена. Обновите кабинет.')
    if food:
        target = 'done' if new_status == 'delivered' else 'in_progress'
        if target != food.status:
            food.status = target
            food.version = int(food.version or 0) + 1
            task.order_status = target
            if target == 'done':
                food.completed_at = timestamp
            add_event(db, food, f'Статус: {LABELS.get(old_food_status)} → {LABELS[target]}', 'Курьер')
    if food:
        from services.bonus_rewards import settle_food_order_bonus
        await settle_food_order_bonus(db, food)
    if new_status == 'delivered':
        payout = task.courier_payout
        if payout is None:
            payout = await resolve_courier_payout(
                db,
                float(task.customer_delivery_fee if task.customer_delivery_fee is not None else task.delivery_fee or 0),
            )
            task.courier_payout = payout
        await db.execute(update(CourierProfile).where(CourierProfile.user_id == task.courier_id).values(
            deliveries_count=CourierProfile.deliveries_count + 1,
            balance=CourierProfile.balance + max(0, float(payout or 0))))
    await db.commit()
    await db.refresh(task)
    if food and old_food_status != food.status:
        from services.user_notifications import notify_food_order_status
        try:
            await notify_food_order_status(db, food, old_food_status, food.status)
        except Exception:
            logger.exception('Food delivery committed; notification/reward follow-up failed')
            await db.rollback()
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
