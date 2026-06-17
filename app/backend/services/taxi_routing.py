"""OSRM road routing for taxi pricing, ETA, and map display."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

OSRM_BASE = "https://router.project-osrm.org/route/v1/driving"


async def fetch_osrm_route(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    *,
    timeout: float = 12.0,
) -> Optional[Dict[str, Any]]:
  """Return road distance_km, duration_min, and geometry points."""
  url = (
      f"{OSRM_BASE}/{from_lng},{from_lat};{to_lng},{to_lat}"
      f"?overview=full&geometries=geojson"
  )
  try:
      async with httpx.AsyncClient(timeout=timeout) as client:
          resp = await client.get(url)
          resp.raise_for_status()
          data = resp.json()
      route = (data.get("routes") or [None])[0]
      if not route:
          return None
      coords = route.get("geometry", {}).get("coordinates") or []
      points: List[Dict[str, float]] = [{"lat": c[1], "lng": c[0]} for c in coords]
      return {
          "points": points,
          "distance_km": round((route.get("distance") or 0) / 1000, 2),
          "duration_min": max(1, int(round((route.get("duration") or 0) / 60))),
      }
  except Exception as exc:
      logger.warning("OSRM route failed: %s", exc)
      return None


async def road_eta_minutes(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    *,
    fallback_minutes_per_km: float = 3.0,
) -> Tuple[int, float]:
    """ETA in minutes and distance km (road or straight-line fallback)."""
    from services.taxi_geo import haversine_km

    route = await fetch_osrm_route(from_lat, from_lng, to_lat, to_lng)
    if route:
        return int(route["duration_min"]), float(route["distance_km"])
    dist = haversine_km(from_lat, from_lng, to_lat, to_lng)
    return max(1, int(round(dist * fallback_minutes_per_km))), round(dist, 2)
