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

from services.taxi_routing import fetch_osrm_route



DEFAULT_SETTINGS: Dict[str, str] = {

    "enabled": "false",

    "base_fare": "500",

    "per_km": "150",

    "min_fare": "800",

    "max_radius_km": "25",

    "center_lat": str(DEFAULT_CENTER_LAT),

    "center_lng": str(DEFAULT_CENTER_LNG),

    "service_area": DEFAULT_SERVICE_AREA,

    "eta_minutes_per_km": "3",

    "per_minute": "25",

    "offer_timeout_sec": "15",

    "pending_timeout_min": "7",

    "max_dispatch_rounds": "5",

    "gps_max_age_sec": "120",

    "geofence_arrival_m": "80",

    "surge_max": "1.5",

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


def is_taxi_enabled(settings: Dict[str, str]) -> bool:
    return (settings.get("enabled") or "false").strip().lower() in ("true", "1", "yes")





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





def calculate_fare(
    distance_km: float,
    settings: Dict[str, str],
    *,
    duration_min: float = 0,
    surge: float = 1.0,
) -> float:
    base = _parse_float(settings.get("base_fare"), 500)
    per_km = _parse_float(settings.get("per_km"), 150)
    per_min = _parse_float(settings.get("per_minute"), 25)
    min_fare = _parse_float(settings.get("min_fare"), 800)
    surge = max(1.0, min(_parse_float(surge, 1.0), _parse_float(settings.get("surge_max"), 1.5)))

    raw = (base + distance_km * per_km + duration_min * per_min) * surge
    return max(min_fare, round(raw / 50) * 50)


def build_price_breakdown(
    distance_km: float,
    settings: Dict[str, str],
    *,
    duration_min: float = 0,
    surge: float = 1.0,
) -> Dict[str, Any]:
    base = _parse_float(settings.get("base_fare"), 500)
    per_km = _parse_float(settings.get("per_km"), 150)
    per_min = _parse_float(settings.get("per_minute"), 25)
    surge = max(1.0, min(_parse_float(surge, 1.0), _parse_float(settings.get("surge_max"), 1.5)))
    distance_part = round(distance_km * per_km)
    time_part = round(duration_min * per_min)
    subtotal = base + distance_part + time_part
    total = calculate_fare(distance_km, settings, duration_min=duration_min, surge=surge)
    return {
        "base_fare": int(base),
        "distance_km": round(distance_km, 2),
        "distance_part": distance_part,
        "duration_min": int(round(duration_min)),
        "time_part": time_part,
        "subtotal": int(subtotal),
        "surge_multiplier": surge,
        "surge_part": int(max(0, total - max(_parse_float(settings.get("min_fare"), 800), round(subtotal / 50) * 50))) if surge > 1 else 0,
        "total": int(total),
    }





def estimate_eta_minutes(distance_km: float, settings: Dict[str, str]) -> int:

    per_km = _parse_float(settings.get("eta_minutes_per_km"), 3)

    return max(2, int(math.ceil(distance_km * per_km)))


async def compute_surge_multiplier(db, settings: Dict[str, str]) -> float:
    """Lightweight surge from pending orders vs online drivers."""
    from models.taxi import TaxiDriverProfile, TaxiRide
    from sqlalchemy import func, select

    try:
        online = (
            await db.execute(
                select(func.count()).select_from(TaxiDriverProfile).where(
                    TaxiDriverProfile.is_online.is_(True),
                    TaxiDriverProfile.is_verified.is_(True),
                    TaxiDriverProfile.documents_status == "verified",
                )
            )
        ).scalar() or 0
        pending = (
            await db.execute(
                select(func.count()).select_from(TaxiRide).where(TaxiRide.status == "pending")
            )
        ).scalar() or 0
    except Exception:
        return 1.0

    surge = 1.0
    if online > 0 and pending > online:
        surge = 1.0 + 0.1 * min(5, pending - online)
    elif online == 0 and pending > 0:
        surge = 1.2
    return min(surge, _parse_float(settings.get("surge_max"), 1.5))





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

    db=None,

) -> Dict[str, Any]:

    if not is_taxi_enabled(settings):

        return {"available": False, "message": "Сервис такси временно недоступен"}



    for label, lat, lng in (("откуда", from_lat, from_lng), ("куда", to_lat, to_lng)):

        ok, msg = _in_service_area(lat, lng, settings)

        if not ok:

            return {"available": False, "message": f"Точка «{label}»: {msg}"}



    route = await fetch_osrm_route(from_lat, from_lng, to_lat, to_lng)
    if route:
        distance_km = float(route["distance_km"])
        duration_min = float(route["duration_min"])
        eta = max(2, int(duration_min))
        route_type = "road"
    else:
        distance_km = haversine_km(from_lat, from_lng, to_lat, to_lng)
        duration_min = float(estimate_eta_minutes(distance_km, settings))
        eta = int(duration_min)
        route_type = "estimate"

    if distance_km < 0.1:

        return {"available": False, "message": "Выберите разные точки отправления и назначения"}



    surge = 1.0
    if db is not None:
        surge = await compute_surge_multiplier(db, settings)

    price = calculate_fare(distance_km, settings, duration_min=duration_min, surge=surge)
    breakdown = build_price_breakdown(distance_km, settings, duration_min=duration_min, surge=surge)



    return {

        "available": True,

        "from_address": from_address,

        "to_address": to_address,

        "from_lat": from_lat,

        "from_lng": from_lng,

        "to_lat": to_lat,

        "to_lng": to_lng,

        "distance_km": round(distance_km, 2),

        "duration_minutes": round(duration_min, 1),

        "price": price,

        "eta_minutes": eta,

        "surge_multiplier": surge,

        "price_breakdown": breakdown,

        "route_type": route_type,

        "currency": "KZT",

    }


