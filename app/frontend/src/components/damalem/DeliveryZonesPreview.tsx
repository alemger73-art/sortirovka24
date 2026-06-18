import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { type DeliveryZone, DEFAULT_STORE, ZONE_COLORS } from '@/lib/gastronomDelivery';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Props {
  zones: DeliveryZone[];
  storeLat?: number;
  storeLng?: number;
  formatPrice: (n: number) => string;
}

export default function DeliveryZonesPreview({ zones, storeLat, storeLng, formatPrice }: Props) {
  const [expanded, setExpanded] = useState(false);

  const center = useMemo((): [number, number] => {
    if (storeLat && storeLng) return [storeLat, storeLng];
    return DEFAULT_STORE;
  }, [storeLat, storeLng]);

  if (zones.length === 0) return null;

  return (
    <section className="rounded-2xl border border-red-100 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#FF3B30]" />
          <span className="text-sm font-bold text-[#111111]">Зоны доставки на карте</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 space-y-3">
          <div className="h-52 rounded-xl overflow-hidden ring-1 ring-gray-100">
            <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={center} />
              {zones.map((zone, idx) => (
                zone.polygon.length >= 3 ? (
                  <Polygon
                    key={zone.id}
                    positions={zone.polygon.map(([lat, lng]) => [lat, lng] as [number, number])}
                    pathOptions={{
                      color: ZONE_COLORS[idx % ZONE_COLORS.length],
                      fillColor: ZONE_COLORS[idx % ZONE_COLORS.length],
                      fillOpacity: 0.25,
                    }}
                  />
                ) : null
              ))}
            </MapContainer>
          </div>
          <ul className="space-y-1.5">
            {zones.map((z, idx) => (
              <li key={z.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-[#444444]">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ZONE_COLORS[idx % ZONE_COLORS.length] }}
                  />
                  {z.name}
                </span>
                <span className="font-semibold text-[#FF3B30]">{formatPrice(z.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
