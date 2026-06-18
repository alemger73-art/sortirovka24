"""Delivery zone resolution for ГАСТРАНОМ — polygons, geocoding, pricing."""

from __future__ import annotations

import json
import logging
import math
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# Sortirovka, Karaganda (ул. Жекибаева 129)
DEFAULT_STORE_LAT = 49.9774
DEFAULT_STORE_LNG = 73.2137
# Legacy seed values — auto-migrated on catalog load
LEGACY_ALMATY_STORE_LAT = 43.2250
LEGACY_ALMATY_STORE_LNG = 76.9120
DEFAULT_DELIVERY_CITY = "Караганда"
DEFAULT_SERVICE_AREA = "Сортировка, Караганда"

ZONE_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"]


def _parse_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _circle_polygon(lat: float, lng: float, radius_km: float, points: int = 24) -> List[List[float]]:
    """Approximate a circle as a polygon for map display and point-in-polygon checks."""
    if radius_km <= 0:
        return []
    coords: List[List[float]] = []
    lat_rad = math.radians(lat)
    km_per_deg_lat = 111.0
    km_per_deg_lng = max(111.0 * math.cos(lat_rad), 1e-6)
    for i in range(points):
        angle = 2 * math.pi * i / points
        d_lat = (radius_km * math.sin(angle)) / km_per_deg_lat
        d_lng = (radius_km * math.cos(angle)) / km_per_deg_lng
        coords.append([lat + d_lat, lng + d_lng])
    return coords


def parse_delivery_zones(settings: Dict[str, str]) -> List[Dict[str, Any]]:
    raw = settings.get("delivery_zones") or "[]"
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    store_lat, store_lng = get_store_coords(settings)
    zones: List[Dict[str, Any]] = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            continue
        polygon_raw = item.get("polygon") or []
        coords: List[List[float]] = []
        if isinstance(polygon_raw, list) and len(polygon_raw) >= 3:
            for pt in polygon_raw:
                if isinstance(pt, (list, tuple)) and len(pt) >= 2:
                    coords.append([float(pt[0]), float(pt[1])])
        if len(coords) < 3:
            radius_km = _parse_float(item.get("radius_km"), 0)
            if radius_km > 0:
                center_lat = _parse_float(item.get("center_lat"), store_lat)
                center_lng = _parse_float(item.get("center_lng"), store_lng)
                coords = _circle_polygon(center_lat, center_lng, radius_km)
        if len(coords) < 3:
            continue
        zones.append({
            "id": str(item.get("id") or f"zone-{idx + 1}"),
            "name": str(item.get("name") or f"Зона {idx + 1}"),
            "price": _parse_float(item.get("price"), 0),
            "color": str(item.get("color") or ZONE_COLORS[idx % len(ZONE_COLORS)]),
            "sort_order": int(item.get("sort_order") or idx + 1),
            "polygon": coords,
            "radius_km": _parse_float(item.get("radius_km"), 0) or None,
        })
    zones.sort(key=lambda z: z.get("sort_order", 0))
    return zones


def get_store_coords(settings: Dict[str, str]) -> Tuple[float, float]:
    lat = _parse_float(settings.get("store_lat"), DEFAULT_STORE_LAT)
    lng = _parse_float(settings.get("store_lng"), DEFAULT_STORE_LNG)
    if lat == 0 and lng == 0:
        return DEFAULT_STORE_LAT, DEFAULT_STORE_LNG
    return lat, lng


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance between two points on Earth in kilometers."""
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def get_delivery_city(settings: Dict[str, str]) -> str:
    return (
        settings.get("delivery_city")
        or settings.get("store_city")
        or DEFAULT_DELIVERY_CITY
    ).strip()


def get_service_area_label(settings: Dict[str, str]) -> str:
    return (settings.get("delivery_area") or DEFAULT_SERVICE_AREA).strip()


def _normalize_city_token(name: str) -> str:
    n = name.lower()
    if "алмат" in n or "almaty" in n:
        return "almaty"
    if "караган" in n or "qarag" in n or "qarağ" in n:
        return "karaganda"
    if "сортир" in n or "surypt" in n or "сұрып" in n:
        return "sortirovka"
    return n.strip()


def cities_compatible(detected: str, store_city: str) -> bool:
    if not detected or not store_city:
        return True
    d = _normalize_city_token(detected)
    s = _normalize_city_token(store_city)
    if d == s:
        return True
    if s == "karaganda" and d in ("karaganda", "sortirovka"):
        return True
    if d == "sortirovka" and s == "karaganda":
        return True
    return s in d or d in s


def enrich_quote_with_location(
    quote: Dict[str, Any],
    settings: Dict[str, str],
    lat: float,
    lng: float,
    *,
    detected_city: str = "",
    via_gps: bool = False,
) -> Dict[str, Any]:
    """Add distance and warnings when coordinates look wrong for this store."""
    store_lat, store_lng = get_store_coords(settings)
    dist = haversine_km(lat, lng, store_lat, store_lng)
    quote["distance_km"] = round(dist, 1)
    if detected_city:
        quote["detected_city"] = detected_city

    store_city = get_delivery_city(settings)
    service_area = get_service_area_label(settings)
    # Delivery zones are local — warn if point is far from the store
    if dist > 25:
        city_part = f" ({detected_city})" if detected_city else ""
        quote["location_warning"] = (
            f"Точка на карте в {dist:.0f} км от магазина{city_part}. "
            f"Доставка работает в районе {service_area}. "
            + ("Если GPS ошибся — введите адрес вручную." if via_gps else "Проверьте адрес.")
        )
        quote["available"] = False
        quote["message"] = quote.get("message") or (
            f"Этот адрес далеко от зоны доставки ({service_area}). "
            "Укажите адрес в Сортировке или нажмите «Найти на карте»."
        )
    elif via_gps and detected_city and not cities_compatible(detected_city, store_city):
        quote["location_warning"] = (
            f"GPS определил: {detected_city}. "
            f"Магазин доставляет в {service_area}. Если это не так — введите адрес вручную."
        )
    return quote


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


STREET_TYPE_RE = r"(?:ул\.?|улица|пер\.?|переулок|пр\.?|проспект|мкр\.?|микрорайон|бул\.?|бульвар|street)"


def _normalize_address_input(address: str) -> str:
    q = re.sub(r"\s+", " ", address.strip())
    q = re.sub(r"\s+дом\s+", " ", q, flags=re.I)
    return q


def _street_prefix_from_query(query: str) -> str:
    lower = query.lower()
    if re.search(r"пер\.?|переулок", lower):
        return "переулок"
    if re.search(r"пр\.?|проспект", lower):
        return "проспект"
    if re.search(r"мкр\.?|микрорайон", lower):
        return "микрорайон"
    return "улица"


def _parse_street_house(query: str) -> Optional[Tuple[str, str, str]]:
    """Return (street_name, house, apt_or_empty) from free-form address."""
    m = re.match(
        rf"^(?:(?:{STREET_TYPE_RE})\s*)?([^\d,]+?)\s*(?:дом\s*)?(\d+[a-zA-Zа-яА-Я]?)(?:\s*,?\s*(?:кв\.?\s*|квартира\s*)?(\d+))?$",
        query,
        re.IGNORECASE,
    )
    if not m:
        return None
    return m.group(1).strip(), m.group(2), m.group(3) or ""


def _geocode_query_variants(address: str, delivery_city: str = DEFAULT_DELIVERY_CITY) -> List[str]:
    """Build search queries for local KZ addresses near the store."""
    query = _normalize_address_input(address)
    if len(query) < 3:
        return []

    seen: set[str] = set()
    variants: List[str] = []

    def add(q: str) -> None:
        q = re.sub(r"\s+", " ", q.strip())
        if len(q) >= 3 and q.lower() not in seen:
            seen.add(q.lower())
            variants.append(q)

    add(query)
    lower = query.lower()
    has_city = (
        "алмат" in lower
        or "almaty" in lower
        or "караган" in lower
        or "karaganda" in lower
        or delivery_city.lower() in lower
    )
    has_street = bool(re.search(STREET_TYPE_RE, lower, re.I))

    if not has_city:
        add(f"{query}, {delivery_city}, Казахстан")
        if "караган" in delivery_city.lower():
            add(f"{query}, Сортировка, {delivery_city}, Казахстан")
            add(f"{query}, мкр. Сортировка, {delivery_city}, Казахстан")
        elif "алмат" in delivery_city.lower():
            add(f"{query}, Almaty, Kazakhstan")

    parsed = _parse_street_house(query)
    if parsed:
        street_name, house, apt = parsed
        apt_part = f", квартира {apt}" if apt else ""
        prefix = _street_prefix_from_query(query)
        add(f"{prefix} {street_name} {house}{apt_part}, {delivery_city}, Казахстан")
        add(f"{street_name} {house}, {delivery_city}, Kazakhstan")
        if prefix == "переулок":
            add(f"lane {street_name} {house}, {delivery_city}, Kazakhstan")
    elif not has_street and len(query) >= 5:
        add(f"улица {query}, {delivery_city}, Казахстан")

    return variants


async def _nominatim_search(
    client: httpx.AsyncClient,
    *,
    params: Dict[str, Any],
    headers: Dict[str, str],
) -> Optional[Tuple[float, float]]:
    resp = await client.get(
        "https://nominatim.openstreetmap.org/search",
        params=params,
        headers=headers,
    )
    resp.raise_for_status()
    results = resp.json()
    if not results:
        return None
    lat = float(results[0]["lat"])
    lng = float(results[0]["lon"])
    return lat, lng


async def geocode_address(
    address: str,
    *,
    country_hint: str = "kz",
    settings: Optional[Dict[str, str]] = None,
) -> Optional[Tuple[float, float]]:
    """Geocode address via Nominatim (OpenStreetMap). Returns (lat, lng) or None."""
    settings = settings or {}
    delivery_city = get_delivery_city(settings)
    variants = _geocode_query_variants(address, delivery_city)
    if not variants:
        return None

    headers = {
        "User-Agent": "Sortirovka24-Gastronom/1.0 (delivery-zones; contact@sortirovka24.kz)",
        "Accept-Language": "ru,en",
    }
    store_lat, store_lng = get_store_coords(settings)
    d = 0.25
    viewbox = f"{store_lng - d},{store_lat + d},{store_lng + d},{store_lat - d}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for candidate in variants:
                try:
                    coords = await _nominatim_search(
                        client,
                        params={
                            "q": candidate,
                            "format": "json",
                            "limit": 1,
                            "addressdetails": 0,
                            "countrycodes": country_hint,
                            "viewbox": viewbox,
                            "bounded": 0,
                        },
                        headers=headers,
                    )
                    if coords:
                        return coords
                except Exception as e:
                    logger.debug("Nominatim query failed for %r: %s", candidate[:60], e)

            # Structured search: street + house in delivery city
            parsed = _parse_street_house(_normalize_address_input(address))
            if parsed:
                street_name, house, _apt = parsed
                prefix = _street_prefix_from_query(address)
                street_line = f"{prefix} {street_name} {house}" if prefix != "улица" else f"{street_name} {house}"
                city_variants = [delivery_city]
                if "караган" in delivery_city.lower():
                    city_variants.append("Karaganda")
                elif delivery_city.lower() not in ("almaty", "алматы"):
                    city_variants.append(delivery_city)
                else:
                    city_variants.extend(["Almaty", "Алматы"])
                for city in city_variants:
                    try:
                        coords = await _nominatim_search(
                            client,
                            params={
                                "street": street_line,
                                "city": city,
                                "country": "Kazakhstan",
                                "format": "json",
                                "limit": 1,
                                "countrycodes": country_hint,
                            },
                            headers=headers,
                        )
                        if coords:
                            return coords
                    except Exception as e:
                        logger.debug("Structured geocode failed: %s", e)

            return None
    except Exception as e:
        logger.warning("Geocoding failed for %r: %s", address[:80], e)
        return None


async def reverse_geocode(lat: float, lng: float) -> Tuple[Optional[str], str]:
    """Human-readable address from coordinates. Returns (label, city)."""
    headers = {
        "User-Agent": "Sortirovka24-Gastronom/1.0 (delivery-zones; contact@sortirovka24.kz)",
        "Accept-Language": "ru,en",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={
                    "lat": lat,
                    "lon": lng,
                    "format": "json",
                    "zoom": 18,
                    "addressdetails": 1,
                },
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
            if not data:
                return None, ""
            addr = data.get("address") or {}
            city = (
                addr.get("city")
                or addr.get("town")
                or addr.get("village")
                or addr.get("hamlet")
                or addr.get("municipality")
                or addr.get("county")
                or ""
            )
            road = (
                addr.get("road")
                or addr.get("pedestrian")
                or addr.get("footway")
                or addr.get("residential")
                or addr.get("neighbourhood")
                or ""
            )
            house = addr.get("house_number") or ""
            line = " ".join(p for p in (road, house) if p)
            if line and city:
                return f"{line}, {city}", str(city)
            if line:
                return line, str(city)
            display = data.get("display_name") or ""
            return (display or None), str(city)
    except Exception as e:
        logger.debug("Reverse geocode failed: %s", e)
        return None, ""


def default_zones_json() -> str:
    """Starter template for Sortirovka / Karaganda area."""
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
