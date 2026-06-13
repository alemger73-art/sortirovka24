function pad(v: number) {
  return v.toFixed(5);
}

interface Point {
  lat: number;
  lng: number;
  label?: string;
}

interface Props {
  from?: Point | null;
  to?: Point | null;
  centerLat?: number;
  centerLng?: number;
  height?: string;
}

export default function TaxiMap({ from, to, centerLat = 49.9774, centerLng = 73.2137, height = '280px' }: Props) {
  const markers: string[] = [];
  if (from) markers.push(`${from.lat},${from.lng}`);
  if (to) markers.push(`${to.lat},${to.lng}`);

  let bbox: string;
  if (from && to) {
    const minLat = Math.min(from.lat, to.lat) - 0.01;
    const maxLat = Math.max(from.lat, to.lat) + 0.01;
    const minLng = Math.min(from.lng, to.lng) - 0.01;
    const maxLng = Math.max(from.lng, to.lng) + 0.01;
    bbox = `${pad(minLng)},${pad(minLat)},${pad(maxLng)},${pad(maxLat)}`;
  } else if (from) {
    bbox = `${pad(from.lng - 0.012)},${pad(from.lat - 0.008)},${pad(from.lng + 0.012)},${pad(from.lat + 0.008)}`;
  } else if (to) {
    bbox = `${pad(to.lng - 0.012)},${pad(to.lat - 0.008)},${pad(to.lng + 0.012)},${pad(to.lat + 0.008)}`;
  } else {
    bbox = `${pad(centerLng - 0.025)},${pad(centerLat - 0.018)},${pad(centerLng + 0.025)},${pad(centerLat + 0.018)}`;
  }

  const markerParam = markers.length ? `&marker=${markers.join('&marker=')}` : '';
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik${markerParam}`;

  return (
    <iframe
      title="Карта маршрута"
      src={src}
      className="w-full rounded-2xl border border-gray-200 shadow-inner"
      style={{ height }}
      loading="lazy"
    />
  );
}
