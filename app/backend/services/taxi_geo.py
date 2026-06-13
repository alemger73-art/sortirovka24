"""Geocoding and distance helpers for Sortirovka Taxi (standalone, no Gastronom deps)."""

from __future__ import annotations

import logging
import math
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

NOMINATIM_SEARCH = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse"

# Sortirovka, Karaganda — district center
DEFAULT_CENTER_LAT = 49.9774
DEFAULT_CENTER_LNG = 73.2137
DEFAULT_CITY = "Караганда"
DEFAULT_SERVICE_AREA = "Сортировка, Караганда"

USER_AGENT = "Sortirovka24-Taxi/1.0 (local taxi; contact@sortirovka24.kz)"

STREET_TYPE_RE = r"(?:ул\.?|улица|пер\.?|переулок|пр\.?|проспект|мкр\.?|микрорайон|бул\.?|бульвар|street)"


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _city_from_context(settings: Optional[Dict[str, str]]) -> str:
    if not settings:
        return DEFAULT_CITY
    return (
        settings.get("city")
        or settings.get("service_area", "").split(",")[0].strip()
        or DEFAULT_CITY
    )


def _center_coords(settings: Optional[Dict[str, str]]) -> Tuple[float, float]:
    if not settings:
        return DEFAULT_CENTER_LAT, DEFAULT_CENTER_LNG
    try:
        lat = float(settings.get("center_lat") or DEFAULT_CENTER_LAT)
        lng = float(settings.get("center_lng") or DEFAULT_CENTER_LNG)
        return lat, lng
    except (TypeError, ValueError):
        return DEFAULT_CENTER_LAT, DEFAULT_CENTER_LNG


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
    m = re.match(
        rf"^(?:(?:{STREET_TYPE_RE})\s*)?([^\d,]+?)\s*(?:дом\s*)?(\d+[a-zA-Zа-яА-Я]?)(?:\s*,?\s*(?:кв\.?\s*|квартира\s*)?(\d+))?$",
        query,
        re.IGNORECASE,
    )
    if not m:
        return None
    return m.group(1).strip(), m.group(2), m.group(3) or ""


def _geocode_query_variants(address: str, city: str = DEFAULT_CITY) -> List[str]:
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
        "караган" in lower
        or "karaganda" in lower
        or "сортир" in lower
        or city.lower() in lower
    )
    has_street = bool(re.search(STREET_TYPE_RE, lower, re.I))

    if not has_city:
        add(f"{query}, {city}, Казахстан")
        add(f"{query}, Сортировка, {city}, Казахстан")
        add(f"{query}, мкр. Сортировка, {city}, Казахстан")

    parsed = _parse_street_house(query)
    if parsed:
        street_name, house, apt = parsed
        apt_part = f", квартира {apt}" if apt else ""
        prefix = _street_prefix_from_query(query)
        add(f"{prefix} {street_name} {house}{apt_part}, {city}, Казахстан")
        add(f"{street_name} {house}, {city}, Kazakhstan")
        if prefix == "переулок":
            add(f"lane {street_name} {house}, {city}, Kazakhstan")
    elif not has_street and len(query) >= 5:
        add(f"улица {query}, {city}, Казахстан")

    return variants


async def _nominatim_search(
    client: httpx.AsyncClient,
    *,
    params: Dict[str, Any],
    headers: Dict[str, str],
) -> Optional[Tuple[float, float]]:
    resp = await client.get(NOMINATIM_SEARCH, params=params, headers=headers)
    resp.raise_for_status()
    results = resp.json()
    if not results:
        return None
    return float(results[0]["lat"]), float(results[0]["lon"])


async def geocode_address(
    address: str,
    *,
    settings: Optional[Dict[str, str]] = None,
    country_hint: str = "kz",
) -> Optional[Tuple[float, float]]:
    """Geocode a street address in Sortirovka / Karaganda via Nominatim."""
    city = _city_from_context(settings)
    variants = _geocode_query_variants(address, city)
    if not variants:
        return None

    center_lat, center_lng = _center_coords(settings)
    d = 0.25
    viewbox = f"{center_lng - d},{center_lat + d},{center_lng + d},{center_lat - d}"
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "ru,en"}

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
                    logger.debug("Taxi geocode failed for %r: %s", candidate[:60], e)

            parsed = _parse_street_house(_normalize_address_input(address))
            if parsed:
                street_name, house, _apt = parsed
                prefix = _street_prefix_from_query(address)
                street_line = f"{prefix} {street_name} {house}" if prefix != "улица" else f"{street_name} {house}"
                for city_name in (city, "Karaganda", "Караганда"):
                    try:
                        coords = await _nominatim_search(
                            client,
                            params={
                                "street": street_line,
                                "city": city_name,
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
                        logger.debug("Taxi structured geocode failed: %s", e)

            return None
    except Exception as e:
        logger.warning("Taxi geocoding failed for %r: %s", address[:80], e)
        return None


async def reverse_geocode(lat: float, lng: float) -> Tuple[Optional[str], str]:
    """Coordinates → human-readable address. Returns (label, city)."""
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "ru,en"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                NOMINATIM_REVERSE,
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
        logger.debug("Taxi reverse geocode failed: %s", e)
        return None, ""


def geo_context_from_taxi_settings(settings: Dict[str, str]) -> Dict[str, str]:
    """Build geocoder context from taxi_settings rows."""
    area = (settings.get("service_area") or DEFAULT_SERVICE_AREA).split(",")[0].strip()
    return {
        "city": area or DEFAULT_CITY,
        "service_area": settings.get("service_area") or DEFAULT_SERVICE_AREA,
        "center_lat": settings.get("center_lat") or str(DEFAULT_CENTER_LAT),
        "center_lng": settings.get("center_lng") or str(DEFAULT_CENTER_LNG),
    }
