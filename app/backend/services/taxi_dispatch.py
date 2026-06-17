"""Auto-dispatch: offer rides to nearest drivers (Yandex-style cascade)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from models.auth import User
from models.taxi import TaxiDriverProfile, TaxiRide
from services.taxi_geo import haversine_km
from services.taxi_routing import road_eta_minutes
from services.taxi_service import get_settings_dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

ACTIVE_DRIVER_RIDE = ("accepted", "driver_arrived", "in_progress")


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


def _excluded_ids(ride: TaxiRide) -> Set[str]:
    raw = ride.dispatch_excluded or "[]"
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return {str(x) for x in data}
    except json.JSONDecodeError:
        pass
    return set()


def _add_excluded(ride: TaxiRide, driver_id: str) -> None:
    ids = _excluded_ids(ride)
    ids.add(str(driver_id))
    ride.dispatch_excluded = json.dumps(sorted(ids))


def _settings_int(settings: Dict[str, str], key: str, default: int) -> int:
    try:
        return int(float(settings.get(key, default)))
    except (TypeError, ValueError):
        return default


async def _busy_driver_ids(db: AsyncSession) -> Set[str]:
    rows = (
        await db.execute(
            select(TaxiRide.driver_id).where(
                TaxiRide.status.in_(ACTIVE_DRIVER_RIDE),
                TaxiRide.driver_id.isnot(None),
            )
        )
    ).scalars().all()
    return {str(r) for r in rows if r}


async def _eligible_drivers(db: AsyncSession, settings: Dict[str, str]) -> List[TaxiDriverProfile]:
    gps_max_age = _settings_int(settings, "gps_max_age_sec", 120)
    cutoff = _now() - timedelta(seconds=gps_max_age)
    busy = await _busy_driver_ids(db)

    profiles = (
        await db.execute(
            select(TaxiDriverProfile).where(
                TaxiDriverProfile.is_online.is_(True),
                TaxiDriverProfile.is_verified.is_(True),
                TaxiDriverProfile.documents_status == "verified",
                TaxiDriverProfile.current_lat.isnot(None),
                TaxiDriverProfile.current_lng.isnot(None),
            )
        )
    ).scalars().all()

    eligible: List[TaxiDriverProfile] = []
    for p in profiles:
        if str(p.user_id) in busy:
            continue
        updated = _parse_iso(p.location_updated_at)
        if updated and updated < cutoff:
            continue
        eligible.append(p)
    return eligible


async def _rank_drivers_for_pickup(
    drivers: List[TaxiDriverProfile],
    pickup_lat: float,
    pickup_lng: float,
    excluded: Set[str],
    minutes_per_km: float,
) -> List[tuple[TaxiDriverProfile, int]]:
    ranked: List[tuple[TaxiDriverProfile, int]] = []
    for d in drivers:
        if str(d.user_id) in excluded:
            continue
        eta, _ = await road_eta_minutes(
            d.current_lat, d.current_lng, pickup_lat, pickup_lng,
            fallback_minutes_per_km=minutes_per_km,
        )
        ranked.append((d, eta))
    ranked.sort(key=lambda x: (x[1], -(x[0].rating or 5)))
    return ranked


async def offer_ride_to_next_driver(db: AsyncSession, ride: TaxiRide) -> bool:
    """Assign exclusive offer to the best next driver. Returns True if offered."""
    if ride.status != "pending" or ride.driver_id:
        return False

    settings = await get_settings_dict(db)
    max_rounds = _settings_int(settings, "max_dispatch_rounds", 5)
    timeout_sec = _settings_int(settings, "offer_timeout_sec", 15)
    minutes_per_km = float(settings.get("eta_minutes_per_km") or 3)

    excluded = _excluded_ids(ride)
    drivers = await _eligible_drivers(db, settings)
    ranked = await _rank_drivers_for_pickup(
        drivers, ride.from_lat, ride.from_lng, excluded, minutes_per_km,
    )

    if not ranked:
        ride.offered_driver_id = None
        ride.offer_expires_at = None
        await db.commit()
        return False

    if ride.dispatch_round >= max_rounds:
        ride.offered_driver_id = None
        ride.offer_expires_at = None
        await db.commit()
        return False

    driver, _eta = ranked[0]
    ride.dispatch_round = (ride.dispatch_round or 0) + 1
    ride.offered_driver_id = str(driver.user_id)
    ride.offer_expires_at = _iso(_now() + timedelta(seconds=timeout_sec))
    await db.commit()
    logger.info("Ride %s offered to driver %s (round %s)", ride.id, driver.user_id, ride.dispatch_round)
    return True


async def decline_offer(db: AsyncSession, ride: TaxiRide, driver_user: User) -> TaxiRide:
    if ride.status != "pending":
        raise ValueError("Заказ уже недоступен")
    if ride.offered_driver_id != str(driver_user.id):
        raise ValueError("Этот заказ вам не предложен")
    _add_excluded(ride, str(driver_user.id))
    ride.offered_driver_id = None
    ride.offer_expires_at = None
    await db.commit()
    await offer_ride_to_next_driver(db, ride)
    await db.refresh(ride)
    return ride


def offer_is_active(ride: TaxiRide) -> bool:
    if ride.status != "pending" or not ride.offered_driver_id:
        return False
    expires = _parse_iso(ride.offer_expires_at)
    if not expires:
        return False
    return expires > _now()


async def process_expired_offers(db: AsyncSession) -> int:
    """Rotate expired offers to the next driver."""
    pending = (
        await db.execute(select(TaxiRide).where(TaxiRide.status == "pending"))
    ).scalars().all()
    processed = 0
    for ride in pending:
        if not ride.offered_driver_id:
            continue
        expires = _parse_iso(ride.offer_expires_at)
        if expires and expires > _now():
            continue
        if ride.offered_driver_id:
            _add_excluded(ride, ride.offered_driver_id)
        ride.offered_driver_id = None
        ride.offer_expires_at = None
        await db.commit()
        await offer_ride_to_next_driver(db, ride)
        processed += 1
    return processed


async def process_stale_pending(db: AsyncSession) -> int:
    """Auto-cancel orders waiting too long without a driver."""
    settings = await get_settings_dict(db)
    timeout_min = _settings_int(settings, "pending_timeout_min", 7)
    cutoff = _now() - timedelta(minutes=timeout_min)

    pending = (
        await db.execute(select(TaxiRide).where(TaxiRide.status == "pending"))
    ).scalars().all()
    cancelled = 0
    for ride in pending:
        created = ride.created_at
        if not created:
            continue
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if created > cutoff:
            continue
        ride.status = "cancelled"
        ride.cancelled_by = "system"
        ride.cancel_reason = "Не нашли водителя. Попробуйте заказать снова."
        ride.cancelled_at = _iso(_now())
        ride.offered_driver_id = None
        ride.offer_expires_at = None
        cancelled += 1
    if cancelled:
        await db.commit()
    return cancelled


async def run_dispatch_maintenance(db: AsyncSession) -> None:
    await process_expired_offers(db)
    await process_stale_pending(db)


async def driver_cabinet_orders(
    db: AsyncSession,
    driver_id: str,
) -> tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """Return (offered_order, broadcast_orders) for driver cabinet."""
    from services.taxi_service import ride_to_dict

    pending = (
        await db.execute(
            select(TaxiRide).where(TaxiRide.status == "pending").order_by(TaxiRide.id.desc()).limit(50)
        )
    ).scalars().all()

    offered: Optional[Dict[str, Any]] = None
    broadcast: List[Dict[str, Any]] = []

    for ride in pending:
        data = ride_to_dict(ride)
        if offer_is_active(ride) and ride.offered_driver_id == driver_id:
            data["offer_expires_at"] = ride.offer_expires_at
            data["offer_seconds_left"] = max(
                0,
                int((_parse_iso(ride.offer_expires_at) - _now()).total_seconds())
                if _parse_iso(ride.offer_expires_at) else 0,
            )
            offered = data
        elif not offer_is_active(ride):
            broadcast.append(data)

    return offered, broadcast


async def check_geofence_arrival(
    db: AsyncSession,
    profile: TaxiDriverProfile,
    ride: TaxiRide,
    settings: Dict[str, str],
) -> Optional[TaxiRide]:
    """Auto-suggest arrived when driver is within geofence at pickup."""
    if ride.status != "accepted":
        return None
    if profile.current_lat is None or profile.current_lng is None:
        return None
    if ride.from_lat is None or ride.from_lng is None:
        return None
    radius_m = _settings_int(settings, "geofence_arrival_m", 80)
    dist_km = haversine_km(profile.current_lat, profile.current_lng, ride.from_lat, ride.from_lng)
    if dist_km * 1000 <= radius_m:
        ride.status = "driver_arrived"
        ride.arrived_at = _iso(_now())
        await db.commit()
        await db.refresh(ride)
        return ride
    return None
