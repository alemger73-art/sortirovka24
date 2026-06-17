"""Live ETA and tracking helpers for taxi rides."""

from __future__ import annotations

from typing import Any, Dict, Optional

from models.taxi import TaxiDriverProfile, TaxiRide
from services.taxi_geo import haversine_km
from services.taxi_routing import road_eta_minutes


def estimate_eta_minutes(distance_km: float, minutes_per_km: float = 3.0) -> int:
    return max(1, int(round(distance_km * minutes_per_km)))


async def build_ride_tracking_async(
    ride: TaxiRide,
    driver: Optional[TaxiDriverProfile],
    *,
    minutes_per_km: float = 3.0,
) -> Dict[str, Any]:
    """Passenger-facing tracking: driver position + road ETA."""
    tracking: Dict[str, Any] = {
        "driver_lat": None,
        "driver_lng": None,
        "eta_minutes": None,
        "eta_label": None,
        "phase": ride.status,
    }

    if ride.status == "pending":
        tracking["eta_label"] = "Ищем ближайшего водителя…"
        return tracking

    if not driver or ride.status in ("completed", "cancelled"):
        return tracking

    if driver.current_lat is not None and driver.current_lng is not None:
        tracking["driver_lat"] = driver.current_lat
        tracking["driver_lng"] = driver.current_lng

    if ride.status == "driver_arrived":
        tracking["eta_minutes"] = 0
        tracking["eta_label"] = "Водитель на месте"
        return tracking

    target_lat: Optional[float] = None
    target_lng: Optional[float] = None

    if ride.status == "accepted" and ride.from_lat is not None and ride.from_lng is not None:
        target_lat, target_lng = ride.from_lat, ride.from_lng
        phase_label = "до вас"
    elif ride.status == "in_progress" and ride.to_lat is not None and ride.to_lng is not None:
        target_lat, target_lng = ride.to_lat, ride.to_lng
        phase_label = "до пункта назначения"
    else:
        return tracking

    if tracking["driver_lat"] is not None and target_lat is not None:
        eta, _ = await road_eta_minutes(
            tracking["driver_lat"], tracking["driver_lng"], target_lat, target_lng,
            fallback_minutes_per_km=minutes_per_km,
        )
        tracking["eta_minutes"] = eta
        tracking["eta_label"] = f"~{eta} мин {phase_label}"
    elif ride.duration_minutes and ride.status == "accepted":
        eta = max(2, int(round(float(ride.duration_minutes) * 0.35)))
        tracking["eta_minutes"] = eta
        tracking["eta_label"] = f"~{eta} мин до вас"

    return tracking
