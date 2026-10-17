export interface DeliveryZone {
  id: string;
  name: string;
  price: number;
  courier_payout?: number | null;
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
          courier_payout: item.courier_payout == null || item.courier_payout === "" ? null : Number(item.courier_payout),
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
  for (const zone of zones) {
    const error = deliveryZoneGeometryError(zone.polygon);
    if (error) throw new Error(`${zone.name}: ${error}`);
  }
  return JSON.stringify(
    zones.map((z, idx) => ({
      ...z,
      sort_order: z.sort_order || idx + 1,
    }))
  );
}

/** A delivery boundary must be a simple, non-degenerate ring. */
export function deliveryZoneGeometryError(polygon: [number, number][]): string | null {
  const equal = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
  const points = polygon.length > 1 && equal(polygon[0], polygon[polygon.length - 1]) ? polygon.slice(0, -1) : polygon;
  if (points.length < 3) return 'Нужно минимум 3 точки границы.';
  if (points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180)) return 'Проверьте координаты границы.';
  const cross = (a: number[], b: number[], c: number[]) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const epsilon = 1e-12;
  const onSegment = (a: number[], b: number[], p: number[]) => Math.abs(cross(a,b,p)) <= epsilon && p[0] >= Math.min(a[0],b[0])-epsilon && p[0] <= Math.max(a[0],b[0])+epsilon && p[1] >= Math.min(a[1],b[1])-epsilon && p[1] <= Math.max(a[1],b[1])+epsilon;
  for (let i=0;i<points.length;i++) {
    const a=points[i], b=points[(i+1)%points.length];
    if (equal(a,b)) return 'Уберите повторяющиеся точки границы.';
    for (let j=i+1;j<points.length;j++) {
      if (j===i+1 || (i===0 && j===points.length-1)) continue;
      const c=points[j], d=points[(j+1)%points.length];
      const first=cross(a,b,c), second=cross(a,b,d), third=cross(c,d,a), fourth=cross(c,d,b);
      if ((first*second < -epsilon*epsilon && third*fourth < -epsilon*epsilon) || onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b)) return 'Граница пересекает сама себя. Передвиньте точки или нарисуйте заново.';
    }
  }
  const area=points.reduce((sum,p,i)=>{const next=points[(i+1)%points.length];return sum+p[0]*next[1]-next[0]*p[1];},0);
  return Math.abs(area) <= epsilon ? 'Точки границы не должны лежать на одной линии.' : null;
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
