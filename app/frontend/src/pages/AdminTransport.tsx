import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Bus, Plus, Trash2, Edit2, Save, X, AlertTriangle, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

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

const DEFAULT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

export default function AdminTransport() {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [stops, setStops] = useState<BusStop[]>([]);
  const [notifications, setNotifications] = useState<BusNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'routes' | 'stops' | 'notifications'>('routes');

  // Route form
  const [editingRoute, setEditingRoute] = useState<Partial<BusRoute> | null>(null);
  const [savingRoute, setSavingRoute] = useState(false);

  // Stop form
  const [editingStop, setEditingStop] = useState<Partial<BusStop> | null>(null);
  const [savingStop, setSavingStop] = useState(false);

  // Notification form
  const [editingNotif, setEditingNotif] = useState<Partial<BusNotification> | null>(null);
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [r, s, n] = await Promise.allSettled([
        withRetry(() => client.entities.bus_routes.query({ sort: 'sort_order', limit: 50 })),
        withRetry(() => client.entities.bus_stops.query({ sort: 'stop_order', limit: 200 })),
        withRetry(() => client.entities.bus_notifications.query({ sort: '-created_at', limit: 50 })),
      ]);
      if (r.status === 'fulfilled') setRoutes(r.value.data?.items || []);
      if (s.status === 'fulfilled') setStops(s.value.data?.items || []);
      if (n.status === 'fulfilled') setNotifications(n.value.data?.items || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }

  /* ─── Route CRUD ─── */
  function newRoute() {
    setEditingRoute({
      route_number: '',
      route_name: '',
      description: '',
      color: DEFAULT_COLORS[routes.length % DEFAULT_COLORS.length],
      first_departure_weekday: '06:00',
      last_departure_weekday: '22:00',
      interval_weekday: '10-15 мин',
      first_departure_weekend: '07:00',
      last_departure_weekend: '21:00',
      interval_weekend: '15-20 мин',
      is_active: true,
      sort_order: routes.length + 1,
    });
  }

  async function saveRoute() {
    if (!editingRoute || !editingRoute.route_number || !editingRoute.route_name) {
      toast.error('Заполните номер и название маршрута');
      return;
    }
    setSavingRoute(true);
    try {
      if (editingRoute.id) {
        await withRetry(() => client.entities.bus_routes.update({
          id: String(editingRoute.id),
          data: editingRoute,
        }));
        toast.success('Маршрут обновлён');
      } else {
        await withRetry(() => client.entities.bus_routes.create({
          data: { ...editingRoute, created_at: new Date().toISOString() },
        }));
        toast.success('Маршрут создан');
        invalidateAllCaches();
      }
      setEditingRoute(null);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сохранения');
    } finally { setSavingRoute(false); }
  }

  async function deleteRoute(id: number) {
    if (!confirm('Удалить маршрут? Все остановки маршрута тоже будут потеряны.')) return;
    try {
      await withRetry(() => client.entities.bus_routes.delete({ id: String(id) }));
      toast.success('Маршрут удалён');
      invalidateAllCaches();
      loadAll();
    } catch (e) { console.error(e); toast.error('Ошибка удаления'); }
  }

  /* ─── Stop CRUD ─── */
  function newStop() {
    setEditingStop({
      route_id: routes[0]?.id || 0,
      stop_name: '',
      lat: 49.8348,
      lng: 73.0856,
      stop_order: 1,
    });
  }

  async function saveStop() {
    if (!editingStop || !editingStop.stop_name || !editingStop.route_id) {
      toast.error('Заполните название остановки и выберите маршрут');
      return;
    }
    setSavingStop(true);
    try {
      if (editingStop.id) {
        await withRetry(() => client.entities.bus_stops.update({
          id: String(editingStop.id),
          data: editingStop,
        }));
        toast.success('Остановка обновлена');
      } else {
        await withRetry(() => client.entities.bus_stops.create({
          data: { ...editingStop, created_at: new Date().toISOString() },
        }));
        toast.success('Остановка создана');
        invalidateAllCaches();
      }
      setEditingStop(null);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сохранения');
    } finally { setSavingStop(false); }
  }

  async function deleteStop(id: number) {
    if (!confirm('Удалить остановку?')) return;
    try {
      await withRetry(() => client.entities.bus_stops.delete({ id: String(id) }));
      toast.success('Остановка удалена');
      invalidateAllCaches();
      loadAll();
    } catch (e) { console.error(e); toast.error('Ошибка удаления'); }
  }

  /* ─── Notification CRUD ─── */
  function newNotif() {
    setEditingNotif({
      route_id: null,
      message: '',
      is_active: true,
    });
  }

  async function saveNotif() {
    if (!editingNotif || !editingNotif.message) {
      toast.error('Введите текст уведомления');
      return;
    }
    setSavingNotif(true);
    try {
      if (editingNotif.id) {
        await withRetry(() => client.entities.bus_notifications.update({
          id: String(editingNotif.id),
          data: editingNotif,
        }));
        toast.success('Уведомление обновлено');
      } else {
        await withRetry(() => client.entities.bus_notifications.create({
          data: { ...editingNotif, created_at: new Date().toISOString() },
        }));
        toast.success('Уведомление создано');
        invalidateAllCaches();
      }
      setEditingNotif(null);
      loadAll();
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сохранения');
    } finally { setSavingNotif(false); }
  }

  async function deleteNotif(id: number) {
    if (!confirm('Удалить уведомление?')) return;
    try {
      await withRetry(() => client.entities.bus_notifications.delete({ id: String(id) }));
      toast.success('Уведомление удалено');
      invalidateAllCaches();
      loadAll();
    } catch (e) { console.error(e); toast.error('Ошибка удаления'); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-500">Загрузка...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bus className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">Транспорт</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {[
          { id: 'routes' as const, label: 'Маршруты', count: routes.length },
          { id: 'stops' as const, label: 'Остановки', count: stops.length },
          { id: 'notifications' as const, label: 'Уведомления', count: notifications.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* ═══ ROUTES TAB ═══ */}
      {activeTab === 'routes' && (
        <div className="space-y-4">
          <Button onClick={newRoute} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Добавить маршрут
          </Button>

          {/* Route form */}
          {editingRoute && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">{editingRoute.id ? 'Редактировать маршрут' : 'Новый маршрут'}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Номер маршрута *</label>
                  <Input value={editingRoute.route_number || ''} onChange={e => setEditingRoute({ ...editingRoute, route_number: e.target.value })} placeholder="27" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Название *</label>
                  <Input value={editingRoute.route_name || ''} onChange={e => setEditingRoute({ ...editingRoute, route_name: e.target.value })} placeholder="Сортировка — Центр" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Цвет</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={editingRoute.color || '#3B82F6'} onChange={e => setEditingRoute({ ...editingRoute, color: e.target.value })} className="w-10 h-10 rounded cursor-pointer" />
                    <Input value={editingRoute.color || ''} onChange={e => setEditingRoute({ ...editingRoute, color: e.target.value })} className="flex-1" />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Описание</label>
                <Input value={editingRoute.description || ''} onChange={e => setEditingRoute({ ...editingRoute, description: e.target.value })} placeholder="Описание маршрута" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Первый рейс (будни)</label>
                  <Input value={editingRoute.first_departure_weekday || ''} onChange={e => setEditingRoute({ ...editingRoute, first_departure_weekday: e.target.value })} placeholder="06:00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Последний рейс (будни)</label>
                  <Input value={editingRoute.last_departure_weekday || ''} onChange={e => setEditingRoute({ ...editingRoute, last_departure_weekday: e.target.value })} placeholder="22:00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Интервал (будни)</label>
                  <Input value={editingRoute.interval_weekday || ''} onChange={e => setEditingRoute({ ...editingRoute, interval_weekday: e.target.value })} placeholder="10-15 мин" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Первый рейс (выходные)</label>
                  <Input value={editingRoute.first_departure_weekend || ''} onChange={e => setEditingRoute({ ...editingRoute, first_departure_weekend: e.target.value })} placeholder="07:00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Последний рейс (выходные)</label>
                  <Input value={editingRoute.last_departure_weekend || ''} onChange={e => setEditingRoute({ ...editingRoute, last_departure_weekend: e.target.value })} placeholder="21:00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Интервал (выходные)</label>
                  <Input value={editingRoute.interval_weekend || ''} onChange={e => setEditingRoute({ ...editingRoute, interval_weekend: e.target.value })} placeholder="15-20 мин" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Порядок сортировки</label>
                  <Input type="number" value={editingRoute.sort_order || 1} onChange={e => setEditingRoute({ ...editingRoute, sort_order: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingRoute.is_active !== false} onChange={e => setEditingRoute({ ...editingRoute, is_active: e.target.checked })} className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700">Активный маршрут</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveRoute} disabled={savingRoute} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {savingRoute ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Сохранить
                </Button>
                <Button variant="outline" onClick={() => setEditingRoute(null)}>
                  <X className="w-4 h-4 mr-2" /> Отмена
                </Button>
              </div>
            </div>
          )}

          {/* Routes list */}
          <div className="space-y-2">
            {routes.map(route => (
              <div key={route.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: route.color || '#3B82F6' }}
                >
                  <span className="text-white font-bold text-lg">{route.route_number}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900">{route.route_name}</h4>
                  <p className="text-sm text-gray-500 truncate">{route.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${route.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {route.is_active ? 'Активен' : 'Неактивен'}
                    </span>
                    <span className="text-xs text-gray-400">{stops.filter(s => s.route_id === route.id).length} остановок</span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditingRoute(route)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <Edit2 className="w-4 h-4 text-gray-500" />
                  </button>
                  <button onClick={() => deleteRoute(route.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            ))}
            {routes.length === 0 && (
              <p className="text-center text-gray-400 py-8">Маршруты не добавлены</p>
            )}
          </div>
        </div>
      )}

      {/* ═══ STOPS TAB ═══ */}
      {activeTab === 'stops' && (
        <div className="space-y-4">
          <Button onClick={newStop} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" /> Добавить остановку
          </Button>

          {editingStop && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">{editingStop.id ? 'Редактировать остановку' : 'Новая остановка'}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Маршрут *</label>
                  <select
                    value={editingStop.route_id || ''}
                    onChange={e => setEditingStop({ ...editingStop, route_id: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="">Выберите маршрут</option>
                    {routes.map(r => (
                      <option key={r.id} value={r.id}>№{r.route_number} — {r.route_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Название *</label>
                  <Input value={editingStop.stop_name || ''} onChange={e => setEditingStop({ ...editingStop, stop_name: e.target.value })} placeholder="Название остановки" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Порядок</label>
                  <Input type="number" value={editingStop.stop_order || 1} onChange={e => setEditingStop({ ...editingStop, stop_order: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Широта (lat)</label>
                  <Input type="number" step="0.0001" value={editingStop.lat || 49.8348} onChange={e => setEditingStop({ ...editingStop, lat: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Долгота (lng)</label>
                  <Input type="number" step="0.0001" value={editingStop.lng || 73.0856} onChange={e => setEditingStop({ ...editingStop, lng: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveStop} disabled={savingStop} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {savingStop ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Сохранить
                </Button>
                <Button variant="outline" onClick={() => setEditingStop(null)}>
                  <X className="w-4 h-4 mr-2" /> Отмена
                </Button>
              </div>
            </div>
          )}

          {/* Stops grouped by route */}
          {routes.map(route => {
            const routeStops = stops.filter(s => s.route_id === route.id).sort((a, b) => a.stop_order - b.stop_order);
            if (routeStops.length === 0) return null;
            return (
              <div key={route.id} className="space-y-2">
                <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                  <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: route.color }}>
                    {route.route_number}
                  </div>
                  {route.route_name}
                </h4>
                {routeStops.map(stop => (
                  <div key={stop.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3 ml-4">
                    <span className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-xs font-bold text-gray-600">{stop.stop_order}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{stop.stop_name}</p>
                      <p className="text-xs text-gray-400">{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}</p>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditingStop(stop)} className="p-1.5 hover:bg-gray-100 rounded transition-colors">
                        <Edit2 className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <button onClick={() => deleteStop(stop.id)} className="p-1.5 hover:bg-red-50 rounded transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ NOTIFICATIONS TAB ═══ */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <Button onClick={newNotif} className="bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="w-4 h-4 mr-2" /> Добавить уведомление
          </Button>

          {editingNotif && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-gray-900">{editingNotif.id ? 'Редактировать' : 'Новое уведомление'}</h3>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Маршрут (пусто = общее)</label>
                <select
                  value={editingNotif.route_id || ''}
                  onChange={e => setEditingNotif({ ...editingNotif, route_id: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  <option value="">Общее уведомление (все маршруты)</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>№{r.route_number} — {r.route_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Текст уведомления *</label>
                <textarea
                  value={editingNotif.message || ''}
                  onChange={e => setEditingNotif({ ...editingNotif, message: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none"
                  placeholder="Текст уведомления для пассажиров..."
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={editingNotif.is_active !== false} onChange={e => setEditingNotif({ ...editingNotif, is_active: e.target.checked })} className="w-4 h-4 rounded" />
                <span className="text-sm text-gray-700">Активное</span>
              </label>
              <div className="flex gap-2">
                <Button onClick={saveNotif} disabled={savingNotif} className="bg-amber-500 hover:bg-amber-600 text-white">
                  {savingNotif ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                  Сохранить
                </Button>
                <Button variant="outline" onClick={() => setEditingNotif(null)}>
                  <X className="w-4 h-4 mr-2" /> Отмена
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {notifications.map(n => {
              const route = routes.find(r => r.id === n.route_id);
              return (
                <div key={n.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${n.is_active ? 'text-amber-500' : 'text-gray-300'}`} />
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {route ? (
                        <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: route.color }}>
                          №{route.route_number}
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Общее</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full ${n.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {n.is_active ? 'Активно' : 'Скрыто'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditingNotif(n)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => deleteNotif(n.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })}
            {notifications.length === 0 && (
              <p className="text-center text-gray-400 py-8">Уведомлений нет</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}