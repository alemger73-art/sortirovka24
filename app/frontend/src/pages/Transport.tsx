import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry, timeAgo } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { ChevronLeft, ChevronRight, Clock, MapPin, Bus, AlertTriangle, Info, Navigation } from 'lucide-react';

/* ─── Types ─── */
interface BusRoute {
  id: number;
  route_number: string;
  route_name: string;
  description: string;
  color: string;
  first_departure_weekday: string;
  last_departure_weekday: string;
  interval_weekday: string;
  first_departure_weekend: string;
  last_departure_weekend: string;
  interval_weekend: string;
  is_active: boolean;
  sort_order: number;
}

interface BusStop {
  id: number;
  route_id: number;
  stop_name: string;
  lat: number;
  lng: number;
  stop_order: number;
}

interface BusNotification {
  id: number;
  route_id: number | null;
  message: string;
  is_active: boolean;
  created_at: string;
}

/* ─── Helpers ─── */
function isWeekend(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

function isRouteRunning(route: BusRoute): boolean {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes;

  const weekend = isWeekend();
  const firstStr = weekend ? route.first_departure_weekend : route.first_departure_weekday;
  const lastStr = weekend ? route.last_departure_weekend : route.last_departure_weekday;

  if (!firstStr || !lastStr) return false;

  const [fh, fm] = firstStr.split(':').map(Number);
  const [lh, lm] = lastStr.split(':').map(Number);
  const firstMin = fh * 60 + fm;
  const lastMin = lh * 60 + lm;

  return currentTime >= firstMin && currentTime <= lastMin;
}

/* ─── Leaflet Map Component ─── */
function RouteMap({ stops, color }: { stops: BusStop[]; color: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || stops.length === 0) return;

    let cancelled = false;

    (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      if (cancelled || !mapRef.current) return;

      // Clean up previous map
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapRef.current, {
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: false,
      });

      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
      }).addTo(map);

      const points: [number, number][] = stops
        .sort((a, b) => a.stop_order - b.stop_order)
        .map(s => [s.lat, s.lng]);

      // Draw route line
      if (points.length > 1) {
        L.polyline(points, {
          color: color || '#3B82F6',
          weight: 4,
          opacity: 0.8,
        }).addTo(map);
      }

      // Add markers
      stops.sort((a, b) => a.stop_order - b.stop_order).forEach((stop, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === stops.length - 1;

        const icon = L.divIcon({
          className: 'custom-marker',
          html: `<div style="
            width: ${isFirst || isLast ? 28 : 20}px;
            height: ${isFirst || isLast ? 28 : 20}px;
            border-radius: 50%;
            background: ${isFirst || isLast ? color || '#3B82F6' : '#fff'};
            border: 3px solid ${color || '#3B82F6'};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: bold;
            color: ${isFirst || isLast ? '#fff' : color || '#3B82F6'};
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          ">${stop.stop_order}</div>`,
          iconSize: [isFirst || isLast ? 28 : 20, isFirst || isLast ? 28 : 20],
          iconAnchor: [isFirst || isLast ? 14 : 10, isFirst || isLast ? 14 : 10],
        });

        L.marker([stop.lat, stop.lng], { icon })
          .bindPopup(`<b>${stop.stop_name}</b><br/>Остановка №${stop.stop_order}`)
          .addTo(map);
      });

      // Fit bounds
      if (points.length > 0) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    })();

    return () => {
      cancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [stops, color]);

  return <div ref={mapRef} className="w-full h-full rounded-xl" />;
}

/* ─── Route Card ─── */
function RouteCard({
  route,
  stops,
  notifications,
  isExpanded,
  onToggle,
}: {
  route: BusRoute;
  stops: BusStop[];
  notifications: BusNotification[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const running = isRouteRunning(route);
  const weekend = isWeekend();
  const routeStops = stops.filter(s => s.route_id === route.id).sort((a, b) => a.stop_order - b.stop_order);
  const routeNotifs = notifications.filter(n => n.route_id === route.id || n.route_id === null);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-100 dark:border-gray-800 transition-all hover:shadow-md">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full text-left p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        {/* Route number badge */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg"
          style={{ backgroundColor: route.color || '#3B82F6' }}
        >
          <span className="text-white font-extrabold text-xl">{route.route_number}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate">{route.route_name}</h3>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{route.description}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              running
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${running ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              {running ? 'На линии' : 'Не работает'}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              {weekend ? route.interval_weekend : route.interval_weekday}
            </span>
          </div>
        </div>

        <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-2 duration-200">
          {/* Notifications */}
          {routeNotifs.length > 0 && (
            <div className="px-5 pt-4">
              {routeNotifs.map(n => (
                <div key={n.id} className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-amber-800 dark:text-amber-300">{n.message}</p>
                    <p className="text-xs text-amber-500 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Schedule */}
          <div className="px-5 pt-4 pb-2">
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" /> Расписание
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-xl ${!weekend ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800' : 'bg-gray-50 dark:bg-gray-800'}`}>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Будни</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Первый рейс</span>
                    <span className="font-bold text-gray-900 dark:text-white">{route.first_departure_weekday || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Последний рейс</span>
                    <span className="font-bold text-gray-900 dark:text-white">{route.last_departure_weekday || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Интервал</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{route.interval_weekday || '—'}</span>
                  </div>
                </div>
              </div>
              <div className={`p-3 rounded-xl ${weekend ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-200 dark:ring-blue-800' : 'bg-gray-50 dark:bg-gray-800'}`}>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Выходные</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Первый рейс</span>
                    <span className="font-bold text-gray-900 dark:text-white">{route.first_departure_weekend || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Последний рейс</span>
                    <span className="font-bold text-gray-900 dark:text-white">{route.last_departure_weekend || '—'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Интервал</span>
                    <span className="font-bold text-blue-600 dark:text-blue-400">{route.interval_weekend || '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stops list */}
          <div className="px-5 pt-3 pb-2">
            <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-500" /> Остановки маршрута ({routeStops.length})
            </h4>
            <div className="relative pl-6">
              {/* Vertical line */}
              <div
                className="absolute left-[11px] top-2 bottom-2 w-0.5"
                style={{ backgroundColor: route.color || '#3B82F6' }}
              />
              <div className="space-y-0">
                {routeStops.map((stop, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === routeStops.length - 1;
                  return (
                    <div key={stop.id} className="relative flex items-center gap-3 py-2">
                      {/* Dot */}
                      <div
                        className="absolute -left-6 w-[22px] h-[22px] rounded-full border-[3px] flex items-center justify-center z-10"
                        style={{
                          borderColor: route.color || '#3B82F6',
                          backgroundColor: isFirst || isLast ? (route.color || '#3B82F6') : '#fff',
                        }}
                      >
                        {(isFirst || isLast) && (
                          <span className="text-[8px] font-bold text-white">{isFirst ? 'A' : 'B'}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm ${isFirst || isLast ? 'font-bold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                          {stop.stop_name}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Map */}
          {routeStops.length > 0 && (
            <div className="px-5 pt-3 pb-5">
              <h4 className="font-semibold text-gray-900 dark:text-white text-sm mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-500" /> Карта маршрута
              </h4>
              <div className="h-64 md:h-80 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <RouteMap stops={routeStops} color={route.color} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Main Transport Page ─── */
export default function TransportPage() {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [stops, setStops] = useState<BusStop[]>([]);
  const [notifications, setNotifications] = useState<BusNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [routesRes, stopsRes, notifsRes] = await Promise.allSettled([
        fetchWithCache('bus_routes', () => withRetry(() => client.entities.bus_routes.query({ sort: 'sort_order', limit: 50 })), 10 * 60 * 1000),
        fetchWithCache('bus_stops', () => withRetry(() => client.entities.bus_stops.query({ sort: 'stop_order', limit: 200 })), 10 * 60 * 1000),
        fetchWithCache('bus_notifications', () => withRetry(() => client.entities.bus_notifications.query({ query: { is_active: true }, sort: '-created_at', limit: 20 })), 5 * 60 * 1000),
      ]);

      if (routesRes.status === 'fulfilled') {
        setRoutes((routesRes.value.data?.items || []).filter((r: BusRoute) => r.is_active));
      }
      if (stopsRes.status === 'fulfilled') {
        setStops(stopsRes.value.data?.items || []);
      }
      if (notifsRes.status === 'fulfilled') {
        setNotifications((notifsRes.value.data?.items || []).filter((n: BusNotification) => n.is_active));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const activeRoutes = routes.filter(r => isRouteRunning(r));

  return (
    <Layout>
      <div className="bg-[#f8f9fa] dark:bg-gray-950 min-h-screen">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.1) 40px, rgba(255,255,255,0.1) 41px)',
            }} />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-10 md:py-16">
            <div className="flex items-center gap-2 mb-3">
              <Link to="/directory" className="text-blue-200 hover:text-white text-sm flex items-center gap-1 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Справочник
              </Link>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 bg-white/15 backdrop-blur rounded-2xl flex items-center justify-center flex-shrink-0">
                <Bus className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
                  Автобусы Сортировки
                </h1>
                <p className="text-blue-200 text-base md:text-lg mt-2">
                  Маршруты, расписание и остановки общественного транспорта
                </p>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-white">{routes.length}</p>
                <p className="text-xs text-blue-200 mt-0.5">Маршрутов</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-white">{activeRoutes.length}</p>
                <p className="text-xs text-blue-200 mt-0.5">Сейчас на линии</p>
              </div>
              <div className="bg-white/10 backdrop-blur rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-white">{isWeekend() ? 'Выходной' : 'Будний'}</p>
                <p className="text-xs text-blue-200 mt-0.5">Тип дня</p>
              </div>
            </div>
          </div>
        </section>

        {/* General notifications */}
        {notifications.filter(n => !n.route_id).length > 0 && (
          <div className="max-w-7xl mx-auto px-4 -mt-4 relative z-10">
            {notifications.filter(n => !n.route_id).map(n => (
              <div key={n.id} className="flex items-start gap-3 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-xl mb-3 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{n.message}</p>
                  <p className="text-xs text-amber-500 mt-1">{timeAgo(n.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Routes list */}
        <div className="max-w-7xl mx-auto px-4 py-6 pb-16">
          {/* Info card */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-6">
            <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                Нажмите на маршрут, чтобы увидеть подробное расписание, список остановок и карту маршрута.
                Зелёный индикатор означает, что автобус сейчас ходит.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="relative w-14 h-14 mx-auto mb-3">
                  <div className="absolute inset-0 border-4 border-blue-100 rounded-full" />
                  <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
                  <Bus className="absolute inset-0 m-auto w-5 h-5 text-blue-400" />
                </div>
                <p className="text-gray-500 font-medium text-sm">Загружаем маршруты...</p>
              </div>
            </div>
          ) : routes.length > 0 ? (
            <div className="space-y-3">
              {routes.map(route => (
                <RouteCard
                  key={route.id}
                  route={route}
                  stops={stops}
                  notifications={notifications}
                  isExpanded={expandedRoute === route.id}
                  onToggle={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Bus className="w-8 h-8 text-blue-300" />
              </div>
              <p className="text-gray-500 font-medium">Маршруты пока не добавлены</p>
              <p className="text-gray-400 text-sm mt-1">Информация о маршрутах скоро появится</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}