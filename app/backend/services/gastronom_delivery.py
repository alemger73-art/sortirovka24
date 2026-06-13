"""Delivery zone resolution for ГАСТРАНОМ — polygons, geocoding, pricing."""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Sortirovka / Almaty area (Жекибаева)
DEFAULT_STORE_LAT = 43.2250
DEFAULT_STORE_LNG = 76.9120

ZONE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"]


def _parse_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_delivery_zones(settings: Dict[str, str]) -> List[Dict[str, Any]]:
    raw = settings.get("delivery_zones") or "[]"
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    zones: List[Dict[str, Any]] = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        polygon = item.get("polygon") or []
        if not isinstance(polygon, list) or len(polygon) < 3:
            continue
        coords: List[List[float]] = []
        for pt in polygon:
            if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                coords.append([float(pt[0]), float(pt[1])])
        if len(coords) < 3:
            continue
        zones.append({
            "id": str(item.get("id") or f"zone-{idx + 1}"),
            "name": str(item.get("name") or f"Зона {idx + 1}"),
            "price": _parse_float(item.get("price"), 0),
            "color": str(item.get("color") or ZONE_COLORS[idx % len(ZONE_COLORS)]),
            "sort_order": int(item.get("sort_order") or idx + 1),
            "polygon": coords,
        })
    zones.sort(key=lambda z: z.get("sort_order", 0))
    return zones


def get_store_coords(settings: Dict[str, str]) -> Tuple[float, float]:
    lat = _parse_float(settings.get("store_lat"), DEFAULT_STORE_LAT)
    lng = _parse_float(settings.get("store_lng"), DEFAULT_STORE_LNG)
    if lat == 0 and lng == 0:
        return DEFAULT_STORE_LAT, DEFAULT_STORE_LNG
    return lat, lng


def point_in_polygon(lat: float, lng: float, polygon: List[List[float]]) -> bool:
    """Ray-casting algorithm. Polygon points are [lat, lng]."""
    if len(polygon) < 3:
        return False
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


def find_zone_for_point(
    lat: float, lng: float, zones: List[Dict[str, Any]]
) -> Optional[Dict[str, Any]]:
    for zone in zones:
        if point_in_polygon(lat, lng, zone["polygon"]):
            return zone
    return None


def resolve_delivery_quote(
    settings: Dict[str, str],
    lat: float,
    lng: float,
) -> Dict[str, Any]:
    zones = parse_delivery_zones(settings)
    fallback_fee = _parse_float(settings.get("delivery_fee"), 0)
    outside_msg = (
        settings.get("outside_zone_message")
        or "Доставка по этому адресу недоступна. Выберите другой адрес или свяжитесь с магазином."
    )

    if not zones:
        return {
            "available": True,
            "delivery_fee": fallback_fee,
            "zone_id": None,
            "zone_name": "Стандартная доставка" if fallback_fee else "Бесплатная доставка",
            "lat": lat,
            "lng": lng,
            "used_zones": False,
        }

    zone = find_zone_for_point(lat, lng, zones)
    if not zone:
        return {
            "available": False,
            "delivery_fee": 0,
            "zone_id": None,
            "zone_name": None,
            "lat": lat,
            "lng": lng,
            "message": outside_msg,
            "used_zones": True,
        }

    return {
        "available": True,
        "delivery_fee": float(zone["price"]),
        "zone_id": zone["id"],
        "zone_name": zone["name"],
        "lat": lat,
        "lng": lng,
        "used_zones": True,
    }


async def geocode_address(address: str, *, country_hint: str = "kz") -> Optional[Tuple[float, float]]:
    """Geocode address via Nominatim (OpenStreetMap). Returns (lat, lng) or None."""
    query = address.strip()
    if len(query) < 3:
        return None

    params = {
        "q": query,
        "format": "json",
        "limit": 1,
        "addressdetails": 0,
    }
    if country_hint:
        params["countrycodes"] = country_hint

    headers = {
        "User-Agent": "Sortirovka24-Gastronom/1.0 (delivery-zones)",
        "Accept-Language": "ru",
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
            )
            resp.raise_for_status()
            results = resp.json()
            if not results:
                # Retry with Almaty context for local addresses
                if "алмат" not in query.lower() and "almaty" not in query.lower():
                    return await geocode_address(f"{query}, Алматы, Казахстан", country_hint=country_hint)
                return None
            lat = float(results[0]["lat"])
            lng = float(results[0]["lon"])
            return lat, lng
    except Exception as e:
        logger.warning("Geocoding failed for %r: %s", query[:80], e)
        return None


def default_zones_json() -> str:
    """Starter template for Sortirovka / Almaty area."""
    lat, lng = DEFAULT_STORE_LAT, DEFAULT_STORE_LNG
    d = 0.012
    zones = [
        {
            "id": str(uuid.uuid4()),
            "name": "Ближняя зона",
            "price": 500,
            "color": "#22c55e",
            "sort_order": 1,
            "polygon": [
                [lat + d * 0.5, lng - d * 0.6],
                [lat + d * 0.5, lng + d * 0.6],
                [lat - d * 0.5, lng + d * 0.6],
                [lat - d * 0.5, lng - d * 0.6],
            ],
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Дальняя зона",
            "price": 900,
            "color": "#f59e0b",
            "sort_order": 2,
            "polygon": [
                [lat + d, lng - d],
                [lat + d, lng + d],
                [lat - d, lng + d],
                [lat - d, lng - d],
            ],
        },
    ]
    return json.dumps(zones, ensure_ascii=False)


def validate_order_delivery(
    settings: Dict[str, str],
    lat: Optional[float],
    lng: Optional[float],
    zone_id: Optional[str],
    expected_fee: float,
) -> Tuple[float, str, Optional[str]]:
    """
    Validate delivery fee for order. Returns (fee, zone_name, zone_id).
    Raises ValueError with message on mismatch.
    """
    zones = parse_delivery_zones(settings)
    fallback = _parse_float(settings.get("delivery_fee"), 0)

    if not zones:
        if abs(expected_fee - fallback) > 0.01:
            raise ValueError("Стоимость доставки не совпадает")
        return fallback, "Стандартная доставка", None

    if lat is None or lng is None:
        raise ValueError("Укажите адрес и дождитесь расчёта доставки")

    quote = resolve_delivery_quote(settings, lat, lng)
    if not quote["available"]:
        raise ValueError(quote.get("message") or "Доставка недоступна")

    if zone_id and quote.get("zone_id") and zone_id != quote["zone_id"]:
        raise ValueError("Зона доставки изменилась — обновите адрес")

    fee = float(quote["delivery_fee"])
    if abs(expected_fee - fee) > 0.01:
        raise ValueError("Стоимость доставки не совпадает с зоной")

    return fee, str(quote.get("zone_name") or ""), quote.get("zone_id")
