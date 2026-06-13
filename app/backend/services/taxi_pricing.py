"""Taxi fare calculation and service area validation for Sortirovka."""

from __future__ import annotations

import json
import math
from typing import Any, Dict, List, Optional, Tuple

from services.gastronom_delivery import (
    DEFAULT_STORE_LAT,
    DEFAULT_STORE_LNG,
    geocode_address,
    haversine_km,
    reverse_geocode,
)

# Sortirovka district center
DEFAULT_CENTER_LAT = DEFAULT_STORE_LAT
DEFAULT_CENTER_LNG = DEFAULT_STORE_LNG

DEFAULT_SETTINGS: Dict[str, str] = {
    "enabled": "true",
    "base_fare": "500",
    "per_km": "150",
    "min_fare": "800",
    "max_radius_km": "25",
    "center_lat": str(DEFAULT_CENTER_LAT),
    "center_lng": str(DEFAULT_CENTER_LNG),
    "service_area": "Сортировка, Караганда",
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
    if len(polygon) < 3:
        return True
    x, y = lng, lat
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][1], polygon[i][0]
        xj, yj = polygon[j][1], polygon[j][0]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _in_service_area(lat: float, lng: float, settings: Dict[str, str]) -> Tuple[bool, str]:
    polygon = parse_service_polygon(settings)
    center_lat = _parse_float(settings.get("center_lat"), DEFAULT_CENTER_LAT)
    center_lng = _parse_float(settings.get("center_lng"), DEFAULT_CENTER_LNG)
    max_radius = _parse_float(settings.get("max_radius_km"), 25)
    service_area = settings.get("service_area") or "Сортировка, Караганда"

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
) -> Dict[str, Any]:
    if lat is not None and lng is not None:
        rev = await reverse_geocode(lat, lng)
        return {
            "lat": lat,
            "lng": lng,
            "address": rev.get("address") or address or f"{lat:.5f}, {lng:.5f}",
            "detected_city": rev.get("city") or "",
        }
    if address and address.strip():
        geo = await geocode_address(address.strip())
        if not geo.get("lat") or not geo.get("lng"):
            return {"error": geo.get("message") or "Не удалось найти адрес на карте"}
        return {
            "lat": geo["lat"],
            "lng": geo["lng"],
            "address": geo.get("address") or address.strip(),
            "detected_city": geo.get("city") or "",
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
