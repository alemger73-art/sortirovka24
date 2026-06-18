import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  formatTenge,
  logisticsApi,
  LOGISTICS_STATUS_LABELS,
  type CourierApplication,
  type LogisticsTask,
} from '@/lib/logisticsApi';
import StorageImg from '@/components/StorageImg';
import { Check, ClipboardList, Loader2, RefreshCw, Users, X } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'applications' | 'couriers' | 'tasks';

const VEHICLE_LABELS: Record<string, string> = {
  bike: 'Велосипед',
  car: 'Авто',
  foot: 'Пешком',
};

export default function AdminLogistics() {
  const [tab, setTab] = useState<Tab>('applications');
  const [applications, setApplications] = useState<CourierApplication[]>([]);
  const [tasks, setTasks] = useState<LogisticsTask[]>([]);
  const [couriers, setCouriers] = useState<Array<{ user_id: string; name?: string; phone?: string; verified: boolean; online: boolean; deliveries_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, t, c] = await Promise.all([
        logisticsApi.adminApplications('pending'),
        logisticsApi.adminTasks(80),
        logisticsApi.adminCouriers(),
      ]);
      setApplications(apps);
      setTasks(t);
      setCouriers(c);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка загрузки'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function approveApp(userId: string) {
    setActing(userId);
    try {
      await logisticsApi.adminApproveApplication(userId);
      toast.success('Курьер одобрен — кабинет открыт');
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка'));
    } finally {
      setActing(null);
    }
  }

  async function rejectApp(userId: string) {
    const note = window.prompt('Причина отклонения (необязательно)') || '';
    setActing(userId);
    try {
      await logisticsApi.adminRejectApplication(userId, note);
      toast.success('Заявка отклонена');
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка'));
    } finally {
      setActing(null);
    }
  }

  async function markReady(taskId: number) {
    try {
      await logisticsApi.adminMarkReady(taskId);
      toast.success('Заказ готов к выдаче');
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка'));
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'applications', label: `Заявки (${applications.length})`, icon: ClipboardList },
    { id: 'couriers', label: 'Курьеры', icon: Users },
    { id: 'tasks', label: 'Доставки', icon: ClipboardList },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Логистика / Курьеры</h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Обновить
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
              tab === id ? 'bg-orange-600 text-white' : 'bg-white border text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'applications' && (
        <section className="space-y-3">
          {applications.map((app) => (
            <div key={app.user_id} className="bg-white rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <p className="font-bold text-gray-900">{app.full_name}</p>
                  <p className="text-sm text-gray-500">{app.phone} · {VEHICLE_LABELS[app.vehicle_type || 'bike']}</p>
                  {app.vehicle_plate && <p className="text-sm text-gray-500">Номер: {app.vehicle_plate}</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={acting === app.user_id} onClick={() => app.user_id && approveApp(app.user_id)}>
                    {acting === app.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" variant="outline" disabled={acting === app.user_id} onClick={() => app.user_id && rejectApp(app.user_id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {app.photo_url && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Фото</p>
                    <StorageImg src={app.photo_url} alt="" className="h-24 w-full object-cover rounded-lg" />
                  </div>
                )}
                {app.id_photo_url && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Удостоверение</p>
                    <StorageImg src={app.id_photo_url} alt="" className="h-24 w-full object-cover rounded-lg" />
                  </div>
                )}
                {app.vehicle_photo_url && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Транспорт</p>
                    <StorageImg src={app.vehicle_photo_url} alt="" className="h-24 w-full object-cover rounded-lg" />
                  </div>
                )}
              </div>
            </div>
          ))}
          {applications.length === 0 && (
            <p className="text-center text-gray-400 py-12 bg-white rounded-xl border">Новых заявок нет</p>
          )}
        </section>
      )}

      {tab === 'couriers' && (
        <section>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">Имя</th>
                  <th className="p-3">Телефон</th>
                  <th className="p-3">Статус</th>
                  <th className="p-3">Доставок</th>
                </tr>
              </thead>
              <tbody>
                {couriers.map((c) => (
                  <tr key={c.user_id} className="border-t">
                    <td className="p-3 font-medium">{c.name || c.user_id}</td>
                    <td className="p-3">{c.phone || '—'}</td>
                    <td className="p-3">{c.online ? '🟢 На линии' : '✓ Одобрен'}</td>
                    <td className="p-3">{c.deliveries_count}</td>
                  </tr>
                ))}
                {couriers.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">Курьеров пока нет</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'tasks' && (
        <section className="space-y-2">
          {tasks.map((t) => {
            const st = LOGISTICS_STATUS_LABELS[t.status] || { label: t.status, color: 'bg-gray-100' };
            return (
              <div key={t.id} className="bg-white rounded-xl border p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">#{t.id} · заказ еды #{t.source_id}</p>
                  <p className="text-sm text-gray-500 truncate max-w-md">{t.pickup_address} → {t.dropoff_address}</p>
                  {t.total_amount != null && <p className="text-sm font-medium mt-1">{formatTenge(t.total_amount)}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${st.color}`}>{st.label}</span>
                  {t.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => markReady(t.id)}>
                      Готов
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && <p className="text-center text-gray-400 py-8">Задач пока нет</p>}
        </section>
      )}
    </div>
  );
}
