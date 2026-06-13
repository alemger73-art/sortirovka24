"""Taxi fare calculation and service area validation for Sortirovka."""

from __future__ import annotations

import json
import math
from typing import Any, Dict, List, Optional, Tuple

from services.taxi_geo import (
    DEFAULT_CENTER_LAT,
    DEFAULT_CENTER_LNG,
    DEFAULT_SERVICE_AREA,
    geocode_address,
    geo_context_from_taxi_settings,
    haversine_km,
    reverse_geocode,
)

DEFAULT_SETTINGS: Dict[str, str] = {
    "enabled": "true",
    "base_fare": "500",
    "per_km": "150",
    "min_fare": "800",
    "max_radius_km": "25",
    "center_lat": str(DEFAULT_CENTER_LAT),
    "center_lng": str(DEFAULT_CENTER_LNG),
    "service_area": DEFAULT_SERVICE_AREA,
    "eta_minutes_per_km": "3",
    "service_polygon": "[]",
}


def _parse_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def settings_to_dict(rows: List[Any]) -> Dict[str, str]:
    result = dict(DEFAULT_SETTINGS)
    for row in rows:
        if row.key and row.value is not None:
            result[row.key] = str(row.value)
    return result


def parse_service_polygon(settings: Dict[str, str]) -> List[List[float]]:
    raw = settings.get("service_polygon") or "[]"
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    coords: List[List[float]] = []
    for pt in data:
        if isinstance(pt, (list, tuple)) and len(pt) >= 2:
            coords.append([float(pt[0]), float(pt[1])])
    return coords


def point_in_polygon(lat: float, lng: float, polygon: List[List[float]]) -> bool:
    """Ray-casting. Polygon points are [lat, lng]."""
    if len(polygon) < 3:
        return True
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i][0], polygon[i][1]
        yj, xj = polygon[j][0], polygon[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def _in_service_area(lat: float, lng: float, settings: Dict[str, str]) -> Tuple[bool, str]:
    polygon = parse_service_polygon(settings)
    center_lat = _parse_float(settings.get("center_lat"), DEFAULT_CENTER_LAT)
    center_lng = _parse_float(settings.get("center_lng"), DEFAULT_CENTER_LNG)
    max_radius = _parse_float(settings.get("max_radius_km"), 25)
    service_area = settings.get("service_area") or DEFAULT_SERVICE_AREA

    dist_from_center = haversine_km(lat, lng, center_lat, center_lng)
    if dist_from_center > max_radius:
        return False, f"Адрес за пределами зоны обслуживания ({service_area}, до {max_radius:.0f} км)"

    if polygon and not point_in_polygon(lat, lng, polygon):
        return False, f"Адрес вне зоны обслуживания ({service_area})"

    return True, ""


def calculate_fare(distance_km: float, settings: Dict[str, str]) -> float:
    base = _parse_float(settings.get("base_fare"), 500)
    per_km = _parse_float(settings.get("per_km"), 150)
    min_fare = _parse_float(settings.get("min_fare"), 800)
    raw = base + distance_km * per_km
    return max(min_fare, round(raw / 50) * 50)


def estimate_eta_minutes(distance_km: float, settings: Dict[str, str]) -> int:
    per_km = _parse_float(settings.get("eta_minutes_per_km"), 3)
    return max(3, int(math.ceil(distance_km * per_km)))


async def resolve_location(
    *,
    address: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    settings: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    geo_ctx = settings or geo_context_from_taxi_settings(DEFAULT_SETTINGS)

    if lat is not None and lng is not None:
        lat_f, lng_f = float(lat), float(lng)
        display, city = await reverse_geocode(lat_f, lng_f)
        return {
            "lat": lat_f,
            "lng": lng_f,
            "address": display or address or f"{lat_f:.5f}, {lng_f:.5f}",
            "detected_city": city or "",
        }

    if address and address.strip():
        coords = await geocode_address(address.strip(), settings=geo_ctx)
        if not coords:
            return {
                "error": "Не нашли этот адрес. Попробуйте GPS или напишите короче: «ул. Жекибаева 129»",
            }
        lat_f, lng_f = coords
        display, city = await reverse_geocode(lat_f, lng_f)
        return {
            "lat": lat_f,
            "lng": lng_f,
            "address": display or address.strip(),
            "detected_city": city or "",
        }

    return {"error": "Укажите адрес или координаты"}


async def build_quote(
    settings: Dict[str, str],
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    from_address: str = "",
    to_address: str = "",
) -> Dict[str, Any]:
    if settings.get("enabled", "true").lower() not in ("true", "1", "yes"):
        return {"available": False, "message": "Сервис такси временно недоступен"}

    for label, lat, lng in (("откуда", from_lat, from_lng), ("куда", to_lat, to_lng)):
        ok, msg = _in_service_area(lat, lng, settings)
        if not ok:
            return {"available": False, "message": f"Точка «{label}»: {msg}"}

    distance_km = haversine_km(from_lat, from_lng, to_lat, to_lng)
    if distance_km < 0.1:
        return {"available": False, "message": "Выберите разные точки отправления и назначения"}

    price = calculate_fare(distance_km, settings)
    eta = estimate_eta_minutes(distance_km, settings)

    return {
        "available": True,
        "from_address": from_address,
        "to_address": to_address,
        "from_lat": from_lat,
        "from_lng": from_lng,
        "to_lat": to_lat,
        "to_lng": to_lng,
        "distance_km": round(distance_km, 2),
        "price": price,
        "eta_minutes": eta,
        "currency": "KZT",
    }
