import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatTenge, taxiApi, TAXI_STATUS_LABELS, type TaxiAdminStats, type TaxiRide } from '@/lib/taxiApi';
import { getAccountToken } from '@/lib/accountApi';
import { getAPIBaseURL } from '@/lib/config';
import {
  Car,
  Check,
  Loader2,
  RefreshCw,
  Save,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = getAPIBaseURL().replace(/\/$/, '');

async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccountToken() || localStorage.getItem('token') || localStorage.getItem('_sp924_token') || '';
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(txt || `HTTP ${resp.status}`);
  }
  return resp.json();
}

type Tab = 'stats' | 'rides' | 'drivers' | 'settings';

export default function AdminTaxi() {
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<TaxiAdminStats | null>(null);
  const [rides, setRides] = useState<TaxiRide[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rideFilter, setRideFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, r, d, cfg] = await Promise.all([
        adminApi<TaxiAdminStats>('/api/v1/taxi/admin/stats'),
        adminApi<TaxiRide[]>(`/api/v1/taxi/admin/rides${rideFilter ? `?status=${rideFilter}` : ''}`),
        adminApi<any[]>('/api/v1/taxi/admin/drivers'),
        adminApi<Record<string, string>>('/api/v1/taxi/admin/settings'),
      ]);
      setStats(s);
      setRides(r);
      setDrivers(d);
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
      const updated = await adminApi<Record<string, string>>('/api/v1/taxi/admin/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      });
      setSettings(updated);
      toast.success('Настройки сохранены');
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    } finally {
      setSavingSettings(false);
    }
  }

  async function verifyDriver(userId: string, verified: boolean) {
    try {
      await adminApi(`/api/v1/taxi/admin/drivers/${userId}/verify`, {
        method: 'PUT',
        body: JSON.stringify({ verified }),
      });
      toast.success(verified ? 'Водитель верифицирован' : 'Верификация снята');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Car }[] = [
    { id: 'stats', label: 'Статистика', icon: Car },
    { id: 'rides', label: 'Поездки', icon: RefreshCw },
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
          <p className="text-sm text-gray-500">Управление районным сервисом такси</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              tab === id ? 'bg-yellow-400 text-gray-900' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Всего поездок', value: stats.total_rides },
                { label: 'Завершено', value: stats.completed_rides },
                { label: 'Ожидают', value: stats.pending_rides },
                { label: 'Активные', value: stats.active_rides },
                { label: 'Оборот', value: formatTenge(stats.revenue) },
                { label: 'Водителей online', value: stats.online_drivers },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                </div>
              ))}
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
              <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">ID</th>
                        <th className="px-4 py-3 text-left">Маршрут</th>
                        <th className="px-4 py-3 text-left">Пассажир</th>
                        <th className="px-4 py-3 text-left">Цена</th>
                        <th className="px-4 py-3 text-left">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rides.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3 font-mono text-gray-500">#{r.id}</td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="truncate text-gray-800">{r.from_address}</p>
                            <p className="truncate text-gray-400 text-xs">→ {r.to_address}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{r.passenger_phone || '—'}</td>
                          <td className="px-4 py-3 font-semibold">{formatTenge(r.final_price ?? r.estimated_price)}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${TAXI_STATUS_LABELS[r.status]?.color || 'bg-gray-100'}`}>
                              {TAXI_STATUS_LABELS[r.status]?.label || r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rides.length === 0 && (
                    <p className="text-center py-8 text-gray-400">Поездок нет</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'drivers' && (
            <div className="space-y-3">
              {drivers.length === 0 ? (
                <p className="text-center py-8 text-gray-400 rounded-2xl bg-white border">Водителей пока нет</p>
              ) : (
                drivers.map((d) => (
                  <div key={d.user_id} className="rounded-2xl bg-white border border-gray-100 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{d.name || 'Без имени'}</p>
                      <p className="text-sm text-gray-500">{d.phone} · {[d.car_make, d.car_model, d.car_number].filter(Boolean).join(' ')}</p>
                      <div className="flex gap-2 mt-1 text-xs">
                        <span className={d.is_online ? 'text-green-600' : 'text-gray-400'}>
                          {d.is_online ? '🟢 Online' : '⚫ Offline'}
                        </span>
                        <span>{d.rides_count} поездок · ⭐ {d.rating?.toFixed(1)}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={d.is_verified ? 'outline' : 'default'}
                      className={d.is_verified ? '' : 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'}
                      onClick={() => verifyDriver(d.user_id, !d.is_verified)}
                    >
                      {d.is_verified ? <><X className="h-3.5 w-3.5 mr-1" /> Снять</> : <><Check className="h-3.5 w-3.5 mr-1" /> Верифицировать</>}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4 max-w-xl">
              {[
                { key: 'enabled', label: 'Сервис включён (true/false)' },
                { key: 'base_fare', label: 'Базовый тариф (₸)' },
                { key: 'per_km', label: 'За км (₸)' },
                { key: 'min_fare', label: 'Минимум (₸)' },
                { key: 'max_radius_km', label: 'Радиус зоны (км)' },
                { key: 'service_area', label: 'Название зоны' },
                { key: 'eta_minutes_per_km', label: 'Минут на км (ETA)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-gray-500 block mb-1">{label}</label>
                  <Input
                    value={settings[key] || ''}
                    onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
                    className="rounded-xl"
                  />
                </div>
              ))}
              <Button
                className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-xl"
                disabled={savingSettings}
                onClick={saveSettings}
              >
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                Сохранить тарифы
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
