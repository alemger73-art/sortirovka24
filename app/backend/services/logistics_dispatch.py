"""Auto-dispatch logistics tasks to nearest couriers."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Set

from models.auth import User
from models.logistics import CourierProfile, LogisticsTask
from services.logistics_service import get_logistics_settings
from services.taxi_routing import road_eta_minutes
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ACTIVE_COURIER_TASK = ("assigned", "picked_up", "on_the_way")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _excluded_ids(task: LogisticsTask) -> Set[str]:
    raw = task.dispatch_excluded or "[]"
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return {str(x) for x in data}
    except json.JSONDecodeError:
        pass
    return set()


def _add_excluded(task: LogisticsTask, courier_id: str) -> None:
    ids = _excluded_ids(task)
    ids.add(str(courier_id))
    task.dispatch_excluded = json.dumps(sorted(ids))


def _settings_int(settings: Dict[str, str], key: str, default: int) -> int:
    try:
        return int(float(settings.get(key, default)))
    except (TypeError, ValueError):
        return default


async def _busy_courier_ids(db: AsyncSession) -> Set[str]:
    rows = (
        await db.execute(
            select(LogisticsTask.courier_id).where(
                LogisticsTask.status.in_(ACTIVE_COURIER_TASK),
                LogisticsTask.courier_id.isnot(None),
            )
        )
    ).scalars().all()
    return {str(r) for r in rows if r}


async def _eligible_couriers(db: AsyncSession, settings: Dict[str, str]) -> List[CourierProfile]:
    gps_max_age = _settings_int(settings, "gps_max_age_sec", 120)
    cutoff = _now() - timedelta(seconds=gps_max_age)
    busy = await _busy_courier_ids(db)

    profiles = (
        await db.execute(
            select(CourierProfile).where(
                CourierProfile.is_online.is_(True),
                CourierProfile.is_verified.is_(True),
                CourierProfile.current_lat.isnot(None),
                CourierProfile.current_lng.isnot(None),
            )
        )
    ).scalars().all()

    eligible: List[CourierProfile] = []
    for p in profiles:
        if str(p.user_id) in busy:
            continue
        updated = _parse_iso(p.location_updated_at)
        if updated and updated < cutoff:
            continue
        eligible.append(p)
    return eligible


async def _rank_couriers_for_pickup(
    couriers: List[CourierProfile],
    pickup_lat: float,
    pickup_lng: float,
    excluded: Set[str],
) -> List[tuple[CourierProfile, int]]:
    ranked: List[tuple[CourierProfile, int]] = []
    for c in couriers:
        if str(c.user_id) in excluded:
            continue
        eta, _ = await road_eta_minutes(c.current_lat, c.current_lng, pickup_lat, pickup_lng)
        ranked.append((c, eta))
    ranked.sort(key=lambda x: (x[1], -(x[0].rating or 5)))
    return ranked


def offer_is_active(task: LogisticsTask) -> bool:
    if task.status != "ready" or not task.offered_courier_id:
        return False
    expires = _parse_iso(task.offer_expires_at)
    if not expires:
        return False
    return expires > _now()


async def offer_task_to_next_courier(db: AsyncSession, task: LogisticsTask) -> bool:
    if task.status != "ready" or task.courier_id:
        return False
    if task.pickup_lat is None or task.pickup_lng is None:
        return False

    settings = await get_logistics_settings(db)
    max_rounds = _settings_int(settings, "max_dispatch_rounds", 5)
    timeout_sec = _settings_int(settings, "offer_timeout_sec", 15)

    excluded = _excluded_ids(task)
    couriers = await _eligible_couriers(db, settings)
    ranked = await _rank_couriers_for_pickup(couriers, task.pickup_lat, task.pickup_lng, excluded)

    if not ranked:
        task.offered_courier_id = None
        task.offer_expires_at = None
        await db.commit()
        return False

    if task.dispatch_round >= max_rounds:
        task.offered_courier_id = None
        task.offer_expires_at = None
        await db.commit()
        return False

    courier, _ = ranked[0]
    task.dispatch_round = (task.dispatch_round or 0) + 1
    task.offered_courier_id = str(courier.user_id)
    task.offer_expires_at = _iso(_now() + timedelta(seconds=timeout_sec))
    await db.commit()
    logger.info("Task %s offered to courier %s (round %s)", task.id, courier.user_id, task.dispatch_round)
    return True


async def decline_offer(db: AsyncSession, task: LogisticsTask, courier_user: User) -> LogisticsTask:
    if task.status != "ready":
        raise ValueError("Задача недоступна")
    if task.offered_courier_id != str(courier_user.id):
        raise ValueError("Эта доставка вам не предложена")
    _add_excluded(task, str(courier_user.id))
    task.offered_courier_id = None
    task.offer_expires_at = None
    await db.commit()
    await offer_task_to_next_courier(db, task)
    await db.refresh(task)
    return task


async def process_ready_pending(db: AsyncSession) -> int:
    """Move pending tasks to ready when prep time elapsed."""
    now = _now()
    pending = (
        await db.execute(select(LogisticsTask).where(LogisticsTask.status == "pending"))
    ).scalars().all()
    count = 0
    for task in pending:
        ready_at = _parse_iso(task.ready_at)
        if ready_at and ready_at <= now:
            task.status = "ready"
            count += 1
    if count:
        await db.commit()
    return count


async def process_expired_offers(db: AsyncSession) -> int:
    ready = (
        await db.execute(select(LogisticsTask).where(LogisticsTask.status == "ready"))
    ).scalars().all()
    processed = 0
    for task in ready:
        if not task.offered_courier_id:
            continue
        expires = _parse_iso(task.offer_expires_at)
        if expires and expires > _now():
            continue
        if task.offered_courier_id:
            _add_excluded(task, task.offered_courier_id)
        task.offered_courier_id = None
        task.offer_expires_at = None
        await db.commit()
        await offer_task_to_next_courier(db, task)
        processed += 1
    return processed


async def process_stale_tasks(db: AsyncSession) -> int:
    settings = await get_logistics_settings(db)
    timeout_min = _settings_int(settings, "pending_timeout_min", 45)
    cutoff = _now() - timedelta(minutes=timeout_min)

    tasks = (
        await db.execute(
            select(LogisticsTask).where(LogisticsTask.status.in_(("pending", "ready")))
        )
    ).scalars().all()
    cancelled = 0
    for task in tasks:
        created = task.created_at
        if not created:
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if created > cutoff:
            continue
        task.status = "cancelled"
        task.cancel_reason = "Не удалось найти курьера"
        task.cancelled_at = _iso(_now())
        task.offered_courier_id = None
        task.offer_expires_at = None
        cancelled += 1
    if cancelled:
        await db.commit()
    return cancelled


async def auto_offer_ready_tasks(db: AsyncSession) -> int:
    """Offer couriers for ready tasks without active offer."""
    ready = (
        await db.execute(
            select(LogisticsTask).where(
                LogisticsTask.status == "ready",
                LogisticsTask.courier_id.is_(None),
            )
        )
    ).scalars().all()
    offered = 0
    for task in ready:
        if offer_is_active(task):
            continue
        if await offer_task_to_next_courier(db, task):
            offered += 1
    return offered


async def run_logistics_maintenance(db: AsyncSession) -> None:
    await process_ready_pending(db)
    await process_expired_offers(db)
    await process_stale_tasks(db)
    await auto_offer_ready_tasks(db)


async def courier_cabinet_tasks(db: AsyncSession, courier_id: str) -> tuple[Optional[Dict], List[Dict], Optional[Dict]]:
    from services.logistics_service import task_to_dict

    tasks = (
        await db.execute(
            select(LogisticsTask).where(
                LogisticsTask.status.in_(("pending", "ready", "assigned", "picked_up", "on_the_way"))
            ).order_by(desc(LogisticsTask.id)).limit(50)
        )
    ).scalars().all()

    offered = None
    broadcast: List[Dict] = []
    active = None

    for task in tasks:
        data = task_to_dict(task)
        if task.courier_id == courier_id and task.status in ACTIVE_COURIER_TASK:
            active = data
        elif offer_is_active(task) and task.offered_courier_id == courier_id:
            data["offer_seconds_left"] = max(
                0,
                int((_parse_iso(task.offer_expires_at) - _now()).total_seconds())
                if _parse_iso(task.offer_expires_at) else 0,
            )
            offered = data
        elif task.status == "ready" and not offer_is_active(task):
            broadcast.append(data)

    return offered, broadcast, active
