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

FUZZY_STREETS: Dict[str, Tuple[str, str]] = {
    "уранов": ("переулок", "Урановый"),
    "уранова": ("переулок", "Урановый"),
    "uranov": ("переулок", "Uranovy"),
    "жекибаев": ("улица", "Жекибаева"),
    "жекибаева": ("улица", "Жекибаева"),
    "сортировк": ("микрорайон", "Сортировка"),
    "бухар": ("улица", "Бухар-Жырау"),
    "бостан": ("улица", "Бостан"),
}

POPULAR_PLACES: List[Dict[str, str]] = [
    {"label": "пер. Урановый 10", "query": "переулок Урановый 10, Караганда"},
    {"label": "ул. Жекибаева 129", "query": "улица Жекибаева 129, Караганда"},
    {"label": "мкр. Сортировка", "query": "микрорайон Сортировка, Караганда"},
    {"label": "Ж/Д вокзал Караганды", "query": "Karaganda railway station"},
    {"label": "Центр Караганды", "query": "проспект Бухар-Жырау, Караганда"},
]


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


def _fuzzy_street_match(street_raw: str) -> Optional[Tuple[str, str]]:
    """Match partial street name like «уранова» → (переулок, Урановый)."""
    s = street_raw.lower().strip()
    for key, (prefix, canonical) in FUZZY_STREETS.items():
        if key in s or s in key or s.startswith(key[:4]):
            return prefix, canonical
    return None


def _expand_fuzzy_variants(query: str, city: str = DEFAULT_CITY) -> List[str]:
    """Build full-address variants from partial input like «уранова 10»."""
    normalized = _normalize_address_input(query)
    parsed = _parse_street_house(normalized)
    extras: List[str] = []
    if parsed:
        street_raw, house, apt = parsed
        fuzzy = _fuzzy_street_match(street_raw)
        if fuzzy:
            prefix, canonical = fuzzy
            apt_part = f", квартира {apt}" if apt else ""
            extras.append(f"{prefix} {canonical} {house}{apt_part}, {city}, Казахстан")
            extras.append(f"пер. {canonical} {house}, {city}, Казахстан")
            extras.append(f"переулок {canonical} {house}, Karaganda, Kazakhstan")
    lower = normalized.lower()
    for place in POPULAR_PLACES:
        if any(tok in lower for tok in place["label"].lower().split() if len(tok) > 3):
            extras.append(place["query"])
        if lower in place["label"].lower() or place["label"].lower() in lower:
            extras.append(place["query"])
    return extras


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
    for extra in _expand_fuzzy_variants(query, city):
        add(extra)
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
        fuzzy = _fuzzy_street_match(street_name)
        if fuzzy:
            fp, canonical = fuzzy
            add(f"{fp} {canonical} {house}{apt_part}, {city}, Казахстан")
            add(f"пер. {canonical} {house}, {city}, Казахстан")
        add(f"{prefix} {street_name} {house}{apt_part}, {city}, Казахстан")
        add(f"{street_name} {house}, {city}, Kazakhstan")
        if prefix == "переулок":
            add(f"lane {street_name} {house}, {city}, Kazakhstan")
    elif not has_street and len(query) >= 5:
        add(f"улица {query}, {city}, Казахстан")

    return variants


async def _nominatim_search_results(
    client: httpx.AsyncClient,
    *,
    params: Dict[str, Any],
    headers: Dict[str, str],
    limit: int = 5,
) -> List[Dict[str, Any]]:
    params = {**params, "limit": limit, "format": "json", "addressdetails": 1}
    resp = await client.get(NOMINATIM_SEARCH, params=params, headers=headers)
    resp.raise_for_status()
    results = resp.json()
    if not isinstance(results, list):
        return []
    out: List[Dict[str, Any]] = []
    for r in results:
        try:
            out.append({
                "address": r.get("display_name") or "",
                "lat": float(r["lat"]),
                "lng": float(r["lon"]),
                "importance": float(r.get("importance") or 0),
            })
        except (KeyError, TypeError, ValueError):
            continue
    return out


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
                fuzzy = _fuzzy_street_match(street_name)
                if fuzzy:
                    fp, canonical = fuzzy
                    street_line = f"{fp} {canonical} {house}"
                else:
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


def _local_fuzzy_labels(query: str, city: str = DEFAULT_CITY) -> List[Dict[str, str]]:
    """Human-readable labels for partial input like «уранова 10»."""
    parsed = _parse_street_house(_normalize_address_input(query))
    if not parsed:
        return []
    street_raw, house, _apt = parsed
    fuzzy = _fuzzy_street_match(street_raw)
    if not fuzzy:
        return []
    prefix, canonical = fuzzy
    short = {"переулок": "пер.", "улица": "ул.", "микрорайон": "мкр.", "проспект": "пр."}.get(prefix, prefix)
    label = f"{short} {canonical} {house}".strip()
    return [{"label": label, "query": f"{prefix} {canonical} {house}, {city}, Казахстан"}]


async def suggest_addresses(
    query: str,
    *,
    settings: Optional[Dict[str, str]] = None,
    limit: int = 6,
) -> List[Dict[str, Any]]:
    """Address autocomplete — local fuzzy + Nominatim."""
    q = _normalize_address_input(query)
    if len(q) < 2:
        return []

    city = _city_from_context(settings)
    center_lat, center_lng = _center_coords(settings)
    d = 0.25
    viewbox = f"{center_lng - d},{center_lat + d},{center_lng + d},{center_lat - d}"
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "ru,en"}

    seen: set[str] = set()
    suggestions: List[Dict[str, Any]] = []

    def push(item: Dict[str, Any], *, local: bool = False) -> None:
        key = f"{round(item['lat'], 4)}:{round(item['lng'], 4)}"
        addr_key = (item.get("address") or "").lower()[:80]
        dedupe = key + addr_key
        if dedupe in seen:
            return
        seen.add(dedupe)
        item["local"] = local
        suggestions.append(item)

    # Local fuzzy labels first (e.g. «уранова 10» → «пер. Урановый 10»)
    text_candidates: List[str] = []
    fuzzy_labels = _local_fuzzy_labels(q, city)
    for fl in fuzzy_labels:
        text_candidates.append(fl["query"])

    lower_q = q.lower()
    for place in POPULAR_PLACES:
        if any(part in lower_q for part in place["label"].lower().split() if len(part) > 2):
            text_candidates.append(place["query"])
    for v in _expand_fuzzy_variants(q, city):
        text_candidates.append(v)
    for v in _geocode_query_variants(q, city)[:8]:
        text_candidates.append(v)

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            for candidate in text_candidates[:10]:
                if len(suggestions) >= limit:
                    break
                try:
                    rows = await _nominatim_search_results(
                        client,
                        params={
                            "q": candidate,
                            "countrycodes": "kz",
                            "viewbox": viewbox,
                            "bounded": 0,
                        },
                        headers=headers,
                        limit=2,
                    )
                    for row in rows:
                        display = row["address"]
                        for fl in fuzzy_labels:
                            if fl["query"] == candidate or candidate.startswith(fl["query"].split(",")[0]):
                                display = fl["label"]
                                break
                        push({
                            "address": display,
                            "full_address": row["address"],
                            "lat": row["lat"],
                            "lng": row["lng"],
                        }, local=candidate in text_candidates[:3])
                        if len(suggestions) >= limit:
                            break
                except Exception as e:
                    logger.debug("Suggest failed for %r: %s", candidate[:50], e)

            if len(suggestions) < limit:
                rows = await _nominatim_search_results(
                    client,
                    params={"q": f"{q}, {city}, Kazakhstan", "countrycodes": "kz", "viewbox": viewbox, "bounded": 0},
                    headers=headers,
                    limit=limit,
                )
                for row in rows:
                    push({
                        "address": row["address"].split(",")[0] + (f", {row['address'].split(',')[1]}" if "," in row["address"] else ""),
                        "full_address": row["address"],
                        "lat": row["lat"],
                        "lng": row["lng"],
                    })
                    if len(suggestions) >= limit:
                        break
    except Exception as e:
        logger.warning("Address suggest failed: %s", e)

    return suggestions[:limit]
