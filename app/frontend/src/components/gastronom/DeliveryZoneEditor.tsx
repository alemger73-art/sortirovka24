import { useStoreTranslations } from '@/i18n/storeTranslations';
import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
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
  deliveryZoneGeometryError,
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
}: {
  active: boolean;
  onAddPoint: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (active) onAddPoint(e.latlng.lat, e.latlng.lng);
    },
  });
  useEffect(() => {if (active) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();}, [active, map]);
  return null;
}

function ZoneMapOverview({zones, center, label}: {zones: DeliveryZone[]; center: [number, number]; label: string}) {
  const map = useMap();
  return <button type="button" className="absolute bottom-7 left-3 z-[1000] rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 shadow" onClick={() => {
    const points: [number, number][] = [center, ...zones.flatMap(zone => zone.polygon)];
    map.fitBounds(L.latLngBounds(points), {padding: [40, 40], maxZoom: 16});
  }}>{label}</button>;
}

function boundaryIcon(color: string, text: string, midpoint = false) {
  return L.divIcon({className: 'delivery-boundary-handle', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:3px solid ${/^#[0-9a-f]{3,8}$/i.test(color) ? color : '#059669'};border-radius:50%;background:white;color:#111827;font:700 14px sans-serif;box-shadow:0 1px 5px #0005;cursor:${midpoint ? 'pointer' : 'grab'}">${text}</span>`});
}

interface Props {
  courierTariffs?: boolean;
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
  courierTariffs = false,
}: Props) {
  const st = useStoreTranslations();

  const [activeZoneId, setActiveZoneId] = useState<string | null>(zones[0]?.id ?? null);
  const [addingPoints, setAddingPoints] = useState(false);
  const [history, setHistory] = useState<Record<string, [number, number][][]>>({});
  useEffect(() => {
    if (!zones.some(zone => zone.id === activeZoneId)) setActiveZoneId(zones[0]?.id ?? null);
  }, [zones, activeZoneId]);

  const center = useMemo((): [number, number] => {
    if (storeLat && storeLng) return [storeLat, storeLng];
    return DEFAULT_STORE;
  }, [storeLat, storeLng]);

  const activeZone = zones.find((z) => z.id === activeZoneId) ?? null;

  function updateZone(id: string, patch: Partial<DeliveryZone>, remember = true) {
    const previous = zones.find(zone => zone.id === id);
    if (remember && patch.polygon && previous) setHistory(value => ({...value, [id]: [...(value[id] || []).slice(-19), previous.polygon.map(point => [...point] as [number, number])]}));
    onZonesChange(zones.map((z) => (z.id === id ? { ...z, ...patch } : z)));
  }

  function addZone() {
    const zone = newZone(zones.length, center);
    onZonesChange([...zones, zone]);
    setActiveZoneId(zone.id);
    setAddingPoints(false);
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
    if (!activeZoneId) return;
    const previous = history[activeZoneId]?.at(-1);
    if (!previous) return;
    updateZone(activeZoneId, {polygon: previous}, false);
    setHistory(value => ({...value, [activeZoneId]: value[activeZoneId].slice(0, -1)}));
  }

  function clearPolygon() {
    if (!activeZoneId) return;
    updateZone(activeZoneId, { polygon: [] });
    setAddingPoints(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500 order-2 sm:order-1">
          {st("Перетаскивайте пронумерованные точки границы. Нажмите + на линии, чтобы добавить точку. Магазин тоже можно перетащить.")}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={addZone} className="order-1 sm:order-2 h-10 w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" />  {st("Добавить зону")} </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant={addingPoints ? 'default' : 'outline'} disabled={!activeZone || (addingPoints && !!deliveryZoneGeometryError(activeZone.polygon))} aria-pressed={addingPoints} onClick={() => setAddingPoints(value => !value)}>{addingPoints ? st("Закончить добавление точек") : st("Добавлять точки кликом по карте")}</Button>
        <Button type="button" variant="outline" disabled={!activeZone} onClick={clearPolygon}>{st("Нарисовать заново")}</Button>
        <Button type="button" variant="outline" disabled={!activeZone} onClick={() => {if (activeZone) {updateZone(activeZone.id, {polygon: newZone(0, center).polygon}); setAddingPoints(false);}}}>{st("Начать с прямоугольника")}</Button>
        <Button type="button" variant="outline" onClick={undoPoint} disabled={!activeZoneId || !history[activeZoneId]?.length}>{st("Отменить последнее изменение")}</Button>
      </div>
      {addingPoints && <p role="status" className="rounded-lg border bg-muted p-3 text-sm">{st("Нажимайте по контуру зоны последовательно: по часовой стрелке или против неё. Не проводите линии через середину зоны. Затем закончите добавление точек.")}</p>}
      {activeZone && deliveryZoneGeometryError(activeZone.polygon) && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{st(deliveryZoneGeometryError(activeZone.polygon)!)}</p>}

      <div className="h-[min(50vh,420px)] min-h-[260px] md:h-[420px] rounded-xl overflow-hidden border border-gray-200 relative z-0 touch-pan-y">
        <MapContainer center={center} zoom={14} scrollWheelZoom className="h-full w-full" style={{ zIndex: 0 }}>
          <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ZoneMapClick active={addingPoints && !!activeZoneId} onAddPoint={addPoint} />
          <ZoneMapOverview zones={zones} center={center} label={st("Показать все зоны")} />
          <Marker key={st("Перетащите магазин")} draggable autoPan title={st("Перетащите магазин")} position={[storeLat || center[0], storeLng || center[1]]} eventHandlers={{dragend: event => {const point = event.target.getLatLng(); onStoreChange(point.lat, point.lng);}}} />

          {zones.map((zone) => {
            const Boundary = addingPoints && zone.id === activeZoneId ? Polyline : Polygon;
            return <Boundary
              key={zone.id}
              positions={zone.polygon}
              pathOptions={{
                color: zone.color,
                fillColor: zone.color,
                fillOpacity: zone.id === activeZoneId ? 0.35 : 0.15,
                weight: zone.id === activeZoneId ? 3 : 2,
              }}
              eventHandlers={{click: () => {if (!addingPoints) setActiveZoneId(zone.id);}}}
            />;
          })}

          {activeZone?.polygon.map((pt, i) => (
            <Marker
              key={`${activeZone.id}-${i}-${st("Точка границы {0}", [i + 1])}`}
              position={pt}
              draggable autoPan
              title={st("Точка границы {0}", [i + 1])}
              icon={boundaryIcon(activeZone.color, String(i + 1))}
              eventHandlers={{dragend: event => {const point = event.target.getLatLng(); updateZone(activeZone.id, {polygon: activeZone.polygon.map((value, index) => index === i ? [point.lat, point.lng] : value)});}}}
            ><Popup><Button type="button" variant="outline" disabled={activeZone.polygon.length <= 3} onClick={() => updateZone(activeZone.id, {polygon: activeZone.polygon.filter((_, index) => index !== i)})}>{st("Удалить точку")}</Button></Popup></Marker>
          ))}
          {!!activeZone && activeZone.polygon.length >= 3 && activeZone.polygon.map((point, index) => {
            const next = activeZone.polygon[(index + 1) % activeZone.polygon.length];
            return <Marker key={`mid-${activeZone.id}-${index}-${st("Удалить точку")}`} position={[(point[0] + next[0]) / 2, (point[1] + next[1]) / 2]} icon={boundaryIcon(activeZone.color, '+', true)} title={st("Добавить точку между {0} и {1}", [index + 1, (index + 1) % activeZone.polygon.length + 1])} eventHandlers={{click: () => updateZone(activeZone.id, {polygon: [...activeZone.polygon.slice(0, index + 1), [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2], ...activeZone.polygon.slice(index + 1)]})}}/>;
          })}
        </MapContainer>
      </div>

      <div className="space-y-2">
        {zones.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">{st("Добавьте зону доставки и нарисуйте границу на карте")}</p>
        )}
        {zones.map((zone) => (
          <div
            key={zone.id}
            className={`rounded-xl border p-3 space-y-2 transition-colors ${
              zone.id === activeZoneId ? 'border-emerald-400 bg-emerald-50/50' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
              <button
                type="button"
                onClick={() => {setActiveZoneId(zone.id); setAddingPoints(false);}}
                className="min-h-10 rounded-lg border px-3 text-sm font-medium shrink-0"
                title={st("Выбрать для редактирования")}
                aria-label={`${st("Редактировать границу")} ${zone.name}`}
              >{st("Редактировать границу")}</button>
              <Input
                value={zone.name}
                onChange={(e) => updateZone(zone.id, { name: e.target.value })}
                className="h-10 sm:h-9 flex-1 min-w-0"
                placeholder={st("Название зоны")}
              />
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  aria-label={courierTariffs ? "Цена доставки клиенту, ₸" : "Цена доставки, ₸"}
                  min={0} max={50000} step={0.01}
                  value={zone.price}
                  onChange={(e) => updateZone(zone.id, { price: Number(e.target.value) })}
                  className="h-10 sm:h-9 flex-1 sm:w-28 sm:flex-none"
                  placeholder={st("Цена ₸")}
                />
                <span className="text-xs text-gray-400 whitespace-nowrap">{zone.polygon.length}  {st("тч.")}</span>
                <Button type="button" size="sm" variant="outline" className="h-10 w-10 p-0 text-red-600 shrink-0" onClick={() => removeZone(zone.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {courierTariffs && <div className="grid gap-2 sm:grid-cols-2 rounded-lg bg-slate-50 p-3 text-sm"><p>Клиент платит за доставку: {zone.price} ₸</p><label>Курьер получит всего, ₸<Input aria-label="Полная выплата курьеру, ₸" type="number" min={0} max={50000} step={0.01} value={zone.courier_payout ?? ''} onChange={e=>updateZone(zone.id,{courier_payout:e.target.value===''?null:Number(e.target.value)})} placeholder="Установите тариф"/></label><p className="sm:col-span-2">{zone.courier_payout == null ? 'Выплата курьеру не настроена. Передать новый заказ курьеру можно после настройки и фиксации тарифа.' : `Доплата бизнеса: ${Math.max(0,zone.courier_payout-zone.price)} ₸. При бесплатной доставке бизнес оплачивает все ${zone.courier_payout} ₸ курьеру.`}</p></div>}
            {zone.id === activeZoneId && (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <p className="text-xs text-muted-foreground">{st("После изменения границы сохраните зоны кнопкой под картой.")}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 flex items-center gap-1 mb-1">
            <MapPin className="h-3.5 w-3.5" />  {st("Широта магазина")} </label>
          <Input
            type="number"
            step="any"
            value={storeLat}
            onChange={(e) => onStoreChange(Number(e.target.value), storeLng)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">{st("Долгота магазина")}</label>
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
