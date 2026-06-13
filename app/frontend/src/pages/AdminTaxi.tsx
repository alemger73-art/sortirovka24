import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  formatTenge,
  taxiApi,
  TAXI_STATUS_LABELS,
  type DriverApplication,
  type TaxiAdminStats,
  type TaxiRide,
} from '@/lib/taxiApi';
import {
  Car,
  Check,
  ClipboardList,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'stats' | 'rides' | 'applications' | 'drivers' | 'settings';

export default function AdminTaxi() {
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<TaxiAdminStats | null>(null);
  const [rides, setRides] = useState<TaxiRide[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rideFilter, setRideFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, d, apps, cfg] = await Promise.all([
        taxiApi.adminStats(),
        taxiApi.adminRides(rideFilter || undefined),
        taxiApi.adminDrivers(),
        taxiApi.adminApplications('pending'),
        taxiApi.adminSettings(),
      ]);
      setStats(s);
      setRides(r);
      setDrivers(d);
      setApplications(apps);
      setSettings(cfg);
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка загрузки'));
    } finally {
      setLoading(false);
    }
  }, [rideFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const updated = await taxiApi.adminUpdateSettings(settings);
      setSettings(updated);
      toast.success('Настройки сохранены');
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    } finally {
      setSavingSettings(false);
    }
  }

  async function approveApp(userId: string) {
    try {
      await taxiApi.adminApproveApplication(userId);
      toast.success('Водитель одобрен — роль назначена автоматически');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    }
  }

  async function rejectApp(userId: string) {
    try {
      await taxiApi.adminRejectApplication(userId, 'Не прошёл проверку');
      toast.success('Заявка отклонена');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Car; badge?: number }[] = [
    { id: 'stats', label: 'Статистика', icon: Car },
    { id: 'rides', label: 'Поездки', icon: RefreshCw },
    { id: 'applications', label: 'Заявки', icon: ClipboardList, badge: stats?.pending_applications },
    { id: 'drivers', label: 'Водители', icon: Users },
    { id: 'settings', label: 'Тарифы', icon: Settings },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Car className="h-5 w-5 text-yellow-500" />
            Такси Сортировка
          </h2>
          <p className="text-sm text-gray-500">Управление районным сервисом · интеграция Sortirovka24</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === id ? 'bg-yellow-400 text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {badge ? (
              <span className="ml-1 rounded-full bg-red-500 text-white text-xs px-1.5 py-0.5 min-w-[1.25rem] text-center">
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {loading && !stats ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          {tab === 'stats' && stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Всего поездок', value: stats.total_rides },
                { label: 'Завершено', value: stats.completed_rides },
                { label: 'Ожидают водителя', value: stats.pending_rides },
                { label: 'В пути сейчас', value: stats.active_rides },
                { label: 'Оборот', value: formatTenge(stats.revenue) },
                { label: 'Online водителей', value: stats.online_drivers },
                { label: 'Заявок водителей', value: stats.pending_applications ?? 0 },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'applications' && (
            <div className="space-y-3">
              {applications.length === 0 ? (
                <p className="text-center py-10 text-gray-400 rounded-2xl bg-white border">Нет новых заявок</p>
              ) : (
                applications.map((app) => (
                  <div key={app.user_id} className="rounded-2xl bg-white border border-yellow-200 p-5 shadow-sm">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-900">{app.full_name || app.account_name}</p>
                        <p className="text-sm text-gray-600">{app.phone || app.account_phone}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {[app.car_make, app.car_model, app.car_color, app.car_number].filter(Boolean).join(' · ')}
                        </p>
                        {app.comment && <p className="text-xs text-gray-400 mt-2">{app.comment}</p>}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="bg-yellow-400 hover:bg-yellow-500 text-gray-900" onClick={() => approveApp(app.user_id)}>
                          <Check className="h-3.5 w-3.5 mr-1" /> Одобрить
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => rejectApp(app.user_id)}>
                          <X className="h-3.5 w-3.5 mr-1" /> Отклонить
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'rides' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {['', 'pending', 'accepted', 'in_progress', 'completed', 'cancelled'].map((s) => (
                  <button
                    key={s || 'all'}
                    onClick={() => setRideFilter(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                      rideFilter === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {s ? TAXI_STATUS_LABELS[s]?.label || s : 'Все'}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl bg-white border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">Маршрут</th>
                      <th className="px-4 py-3 text-left">Телефон</th>
                      <th className="px-4 py-3 text-left">Цена</th>
                      <th className="px-4 py-3 text-left">Статус</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rides.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-mono text-gray-500">#{r.id}</td>
                        <td className="px-4 py-3 max-w-xs">
                          <p className="truncate">{r.from_address}</p>
                          <p className="truncate text-xs text-gray-400">→ {r.to_address}</p>
                        </td>
                        <td className="px-4 py-3">{r.passenger_phone || '—'}</td>
                        <td className="px-4 py-3 font-semibold">{formatTenge(r.final_price ?? r.estimated_price)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${TAXI_STATUS_LABELS[r.status]?.color || ''}`}>
                            {TAXI_STATUS_LABELS[r.status]?.label || r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rides.length === 0 && <p className="text-center py-8 text-gray-400">Поездок нет</p>}
              </div>
            </div>
          )}

          {tab === 'drivers' && (
            <div className="space-y-3">
              {drivers.length === 0 ? (
                <p className="text-center py-8 text-gray-400 rounded-2xl bg-white border">Водителей пока нет</p>
              ) : (
                drivers.map((d) => (
                  <div key={d.user_id} className="rounded-2xl bg-white border p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{d.name || 'Без имени'}</p>
                      <p className="text-sm text-gray-500">{d.phone} · {[d.car_make, d.car_model, d.car_number].filter(Boolean).join(' ')}</p>
                      <p className="text-xs mt-1">{d.is_online ? '🟢 Online' : '⚫ Offline'} · {d.rides_count} поездок · ⭐ {d.rating?.toFixed(1)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={d.is_verified ? 'outline' : 'default'}
                      className={!d.is_verified ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900' : ''}
                      onClick={async () => {
                        try {
                          await taxiApi.adminVerifyDriver(d.user_id, !d.is_verified);
                          toast.success('Обновлено');
                          load();
                        } catch (e: any) {
                          toast.error(String(e?.message));
                        }
                      }}
                    >
                      {d.is_verified ? 'Снять верификацию' : 'Верифицировать'}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white border p-5 space-y-4">
                <h3 className="font-bold text-gray-900">Тарифы</h3>
                {[
                  { key: 'base_fare', label: 'Посадка (₸)' },
                  { key: 'per_km', label: 'За километр (₸)' },
                  { key: 'min_fare', label: 'Минимальная поездка (₸)' },
                  { key: 'eta_minutes_per_km', label: 'Минут на км (расчёт ETA)' },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500 block mb-1">{label}</label>
                    <Input value={settings[key] || ''} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className="rounded-xl" />
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-white border p-5 space-y-4">
                <h3 className="font-bold text-gray-900">Зона и сервис</h3>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Название зоны</label>
                  <Input value={settings.service_area || ''} onChange={(e) => setSettings({ ...settings, service_area: e.target.value })} className="rounded-xl" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Радиус обслуживания (км)</label>
                  <Input value={settings.max_radius_km || ''} onChange={(e) => setSettings({ ...settings, max_radius_km: e.target.value })} className="rounded-xl" />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <span className="text-sm font-medium">Сервис включён</span>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, enabled: settings.enabled === 'true' ? 'false' : 'true' })}
                    className={`relative h-7 w-12 rounded-full transition-colors ${settings.enabled !== 'false' ? 'bg-yellow-400' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${settings.enabled !== 'false' ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                <Button className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-xl" disabled={savingSettings} onClick={saveSettings}>
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Сохранить настройки
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
