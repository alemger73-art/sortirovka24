export interface DeliveryZone {
  id: string;
  name: string;
  price: number;
  color: string;
  sort_order: number;
  polygon: [number, number][];
}

export interface DeliveryQuote {
  available: boolean;
  delivery_fee: number;
  zone_id: string | null;
  zone_name: string | null;
  lat: number;
  lng: number;
  used_zones?: boolean;
  message?: string;
  geocoded_address?: string;
  display_address?: string;
  detected_city?: string;
  distance_km?: number;
  location_warning?: string;
}

export const DEFAULT_STORE: [number, number] = [49.9774, 73.2137];

export const ZONE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export function parseDeliveryZones(
  raw: string | undefined,
  storeLat = DEFAULT_STORE[0],
  storeLng = DEFAULT_STORE[1],
): DeliveryZone[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .map((item, idx) => {
        let polygon = (item.polygon || [])
          .filter((p: unknown) => Array.isArray(p) && p.length >= 2)
          .map((p: number[]) => [Number(p[0]), Number(p[1])] as [number, number]);
        if (polygon.length < 3) {
          const radiusKm = Number(item.radius_km) || 0;
          if (radiusKm > 0) {
            const cLat = Number(item.center_lat) || storeLat;
            const cLng = Number(item.center_lng) || storeLng;
            polygon = circlePolygon(cLat, cLng, radiusKm);
          }
        }
        if (polygon.length < 3) return null;
        return {
          id: String(item.id || `zone-${idx + 1}`),
          name: String(item.name || `Зона ${idx + 1}`),
          price: Number(item.price) || 0,
          color: String(item.color || ZONE_COLORS[idx % ZONE_COLORS.length]),
          sort_order: Number(item.sort_order) || idx + 1,
          polygon,
        };
      })
      .filter(Boolean) as DeliveryZone[];
  } catch {
    return [];
  }
}

function circlePolygon(lat: number, lng: number, radiusKm: number, points = 24): [number, number][] {
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const kmPerDegLat = 111;
  const kmPerDegLng = Math.max(111 * Math.cos(latRad), 1e-6);
  for (let i = 0; i < points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const dLat = (radiusKm * Math.sin(angle)) / kmPerDegLat;
    const dLng = (radiusKm * Math.cos(angle)) / kmPerDegLng;
    coords.push([lat + dLat, lng + dLng]);
  }
  return coords;
}

export function serializeDeliveryZones(zones: DeliveryZone[]): string {
  return JSON.stringify(
    zones.map((z, idx) => ({
      ...z,
      sort_order: z.sort_order || idx + 1,
    }))
  );
}

export function newZone(index: number, center: [number, number]): DeliveryZone {
  const [lat, lng] = center;
  const d = 0.008;
  return {
    id: crypto.randomUUID?.() || `zone-${Date.now()}`,
    name: `Зона ${index + 1}`,
    price: (index + 1) * 500,
    color: ZONE_COLORS[index % ZONE_COLORS.length],
    sort_order: index + 1,
    polygon: [
      [lat + d, lng - d],
      [lat + d, lng + d],
      [lat - d, lng + d],
      [lat - d, lng - d],
    ],
  };
}
