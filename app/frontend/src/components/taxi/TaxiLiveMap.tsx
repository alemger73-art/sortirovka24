import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const defaultIcon = L.icon({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const fromIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#facc15;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const toIcon = L.divIcon({
  className: '',
  html: '<div style="width:14px;height:14px;border-radius:50%;background:#111827;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"></div>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const driverIcon = L.divIcon({
  className: '',
  html: '<div style="width:36px;height:36px;border-radius:12px;background:#facc15;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:18px">🚕</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

type Point = { lat: number; lng: number; label?: string };

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length < 1) return;
    if (points.length === 1) {
      map.setView(points[0], 15);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16 });
  }, [map, points]);
  return null;
}

type Props = {
  from?: Point | null;
  to?: Point | null;
  driver?: Point | null;
  trackTarget?: 'pickup' | 'dropoff';
  height?: string;
  centerLat?: number;
  centerLng?: number;
};

export default function TaxiLiveMap({
  from,
  to,
  driver,
  trackTarget = 'pickup',
  height = '240px',
  centerLat = 49.9774,
  centerLng = 73.2137,
}: Props) {
  const points = useMemo(() => {
    const list: [number, number][] = [];
    if (from) list.push([from.lat, from.lng]);
    if (to) list.push([to.lat, to.lng]);
    if (driver) list.push([driver.lat, driver.lng]);
    return list;
  }, [from, to, driver]);

  const center: [number, number] = points[0] || [centerLat, centerLng];
  const line = useMemo(() => {
    const target = trackTarget === 'dropoff' && to ? to : from;
    if (driver && target) {
      return [[driver.lat, driver.lng], [target.lat, target.lng]] as [number, number][];
    }
    if (from && to) return [[from.lat, from.lng], [to.lat, to.lng]] as [number, number][];
    return [] as [number, number][];
  }, [from, to, driver, trackTarget]);

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-inner z-0" style={{ height }}>
      <MapContainer center={center} zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {from && (
          <Marker position={[from.lat, from.lng]} icon={fromIcon}>
            <Popup>Откуда</Popup>
          </Marker>
        )}
        {to && (
          <Marker position={[to.lat, to.lng]} icon={toIcon}>
            <Popup>Куда</Popup>
          </Marker>
        )}
        {driver && (
          <Marker position={[driver.lat, driver.lng]} icon={driverIcon}>
            <Popup>Водитель</Popup>
          </Marker>
        )}
        {line.length >= 2 && (
          <Polyline positions={line} pathOptions={{ color: '#facc15', weight: 4, opacity: 0.85, dashArray: driver ? '8 8' : undefined }} />
        )}
      </MapContainer>
    </div>
  );
}
