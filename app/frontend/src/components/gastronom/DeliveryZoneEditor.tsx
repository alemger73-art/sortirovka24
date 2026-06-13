import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, CircleMarker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, MapPin } from 'lucide-react';
import {
  type DeliveryZone,
  DEFAULT_STORE,
  ZONE_COLORS,
  newZone,
} from '@/lib/gastronomDelivery';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function ZoneMapClick({
  active,
  onAddPoint,
  onSetStore,
}: {
  active: boolean;
  onAddPoint: (lat: number, lng: number) => void;
  onSetStore: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      if (active) onAddPoint(e.latlng.lat, e.latlng.lng);
    },
    dblclick(e) {
      e.originalEvent.preventDefault();
      onSetStore(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface Props {
  zones: DeliveryZone[];
  storeLat: number;
  storeLng: number;
  onZonesChange: (zones: DeliveryZone[]) => void;
  onStoreChange: (lat: number, lng: number) => void;
}

export default function DeliveryZoneEditor({
  zones,
  storeLat,
  storeLng,
  onZonesChange,
  onStoreChange,
}: Props) {
  const [activeZoneId, setActiveZoneId] = useState<string | null>(zones[0]?.id ?? null);

  const center = useMemo((): [number, number] => {
    if (storeLat && storeLng) return [storeLat, storeLng];
    return DEFAULT_STORE;
  }, [storeLat, storeLng]);

  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;

  function updateZone(id: string, patch: Partial<DeliveryZone>) {
    onZonesChange(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }

  function addZone() {
    const zone = newZone(zones.length, center);
    onZonesChange([...zones, zone]);
    setActiveZoneId(zone.id);
  }

  function removeZone(id: string) {
    const next = zones.filter((z) => z.id !== id);
    onZonesChange(next);
    if (activeZoneId === id) setActiveZoneId(next[0]?.id ?? null);
  }

  function addPoint(lat: number, lng: number) {
    if (!activeZoneId) return;
    updateZone(activeZoneId, {
      polygon: [...(activeZone?.polygon || []), [lat, lng]],
    });
  }

  function undoPoint() {
    if (!activeZoneId || !activeZone?.polygon.length) return;
    updateZone(activeZoneId, { polygon: activeZone.polygon.slice(0, -1) });
  }

  function clearPolygon() {
    if (!activeZoneId) return;
    updateZone(activeZoneId, { polygon: [] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <p className="text-xs text-gray-500">
          <strong>Клик</strong> — точка границы выбранной зоны. <strong>Двойной клик</strong> — переместить магазин.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={addZone}>
          <Plus className="h-4 w-4 mr-1" /> Добавить зону
        </Button>
      </div>

      <div className="h-[360px] md:h-[420px] rounded-xl overflow-hidden border border-gray-200 relative z-0">
        <MapContainer center={center} zoom={14} scrollWheelZoom className="h-full w-full" style={{ zIndex: 0 }}>
          <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ZoneMapClick active={!!activeZoneId} onAddPoint={addPoint} onSetStore={onStoreChange} />
          <Marker position={[storeLat || center[0], storeLng || center[1]]} />

          {zones.map((zone) => (
            <Polygon
              key={zone.id}
              positions={zone.polygon}
              pathOptions={{
                color: zone.color,
                fillColor: zone.color,
                fillOpacity: zone.id === activeZoneId ? 0.35 : 0.15,
                weight: zone.id === activeZoneId ? 3 : 2,
              }}
            />
          ))}

          {activeZone?.polygon.map((pt, i) => (
            <CircleMarker
              key={`${activeZone.id}-${i}`}
              center={pt}
              radius={5}
              pathOptions={{ color: activeZone.color, fillColor: '#fff', fillOpacity: 1, weight: 2 }}
            />
          ))}
        </MapContainer>
      </div>

      <div className="space-y-2">
        {zones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Добавьте зону доставки и нарисуйте границу на карте</p>
        )}
        {zones.map((zone) => (
          <div
            key={zone.id}
            className={`rounded-xl border p-3 space-y-2 transition-colors ${
              zone.id === activeZoneId ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => setActiveZoneId(zone.id)}
                className="w-4 h-4 rounded-full shrink-0 border-2 border-white shadow"
                style={{ backgroundColor: zone.color }}
                title="Выбрать для редактирования"
              />
              <Input
                value={zone.name}
                onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                className="h-9 flex-1 min-w-[120px]"
                placeholder="Название зоны"
              />
              <Input
                type="number"
                value={zone.price}
                onChange={(e) => updateZone(zone.id, { price: Number(e.target.value) })}
                className="h-9 w-28"
                placeholder="₸"
              />
              <span className="text-xs text-gray-400">{zone.polygon.length} точек</span>
              <Button type="button" size="sm" variant="outline" className="text-red-600" onClick={() => removeZone(zone.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            {zone.id === activeZoneId && (
              <div className="flex gap-2 flex-wrap">
                <Button type="button" size="sm" variant="outline" onClick={undoPoint} disabled={!zone.polygon.length}>
                  Убрать точку
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={clearPolygon} disabled={!zone.polygon.length}>
                  Очистить границу
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
            <MapPin className="h-3.5 w-3.5" /> Широта магазина
          </label>
          <Input
            type="number"
            step="any"
            value={storeLat}
            onChange={(e) => onStoreChange(Number(e.target.value), storeLng)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Долгота магазина</label>
          <Input
            type="number"
            step="any"
            value={storeLng}
            onChange={(e) => onStoreChange(storeLat, Number(e.target.value))}
          />
        </div>
      </div>
    </div>
  );
}
