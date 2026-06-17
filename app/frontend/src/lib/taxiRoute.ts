/** Road route via OSRM (OpenStreetMap) — real driving path, not straight line. */

import { getAPIBaseURL } from '@/lib/config';

export type LatLng = { lat: number; lng: number };

type OsrmResponse = {
  routes?: Array<{
    geometry?: { coordinates?: [number, number][] };
    distance?: number;
    duration?: number;
  }>;
};

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

function toLeaflet(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

export async function fetchRoadRoute(
  from: LatLng,
  to: LatLng,
): Promise<{ points: [number, number][]; distanceKm: number; durationMin: number } | null> {
  const apiBase = getAPIBaseURL().replace(/\/$/, '');
  const qs = new URLSearchParams({
    from_lat: String(from.lat),
    from_lng: String(from.lng),
    to_lat: String(to.lat),
    to_lng: String(to.lng),
  });
  try {
    const resp = await fetch(`${apiBase}/api/v1/taxi/route?${qs}`);
    if (resp.ok) {
      const data = await resp.json();
      const pts = (data.points || []) as Array<{ lat: number; lng: number }>;
      if (pts.length >= 2) {
        return {
          points: pts.map((p) => [p.lat, p.lng] as [number, number]),
          distanceKm: data.distance_km ?? 0,
          durationMin: data.duration_min ?? 1,
        };
      }
    }
  } catch {
    /* fallback to OSRM direct */
  }

  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = (await resp.json()) as OsrmResponse;
    const route = data.routes?.[0];
    const raw = route?.geometry?.coordinates;
    if (!raw || raw.length < 2) return null;
    return {
      points: toLeaflet(raw),
      distanceKm: (route.distance ?? 0) / 1000,
      durationMin: Math.max(1, Math.round((route.duration ?? 0) / 60)),
    };
  } catch {
    return null;
  }
}
