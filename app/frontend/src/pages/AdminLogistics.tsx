import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  formatTenge,
  logisticsApi,
  LOGISTICS_STATUS_LABELS,
  type LogisticsTask,
} from '@/lib/logisticsApi';
import { Check, Loader2, RefreshCw, Users } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminLogistics() {
  const [tasks, setTasks] = useState<LogisticsTask[]>([]);
  const [couriers, setCouriers] = useState<Array<{ user_id: string; name?: string; phone?: string; verified: boolean; online: boolean; deliveries_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([logisticsApi.adminTasks(80), logisticsApi.adminCouriers()]);
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

  async function verifyCourier(userId: string) {
    setVerifying(userId);
    try {
      await logisticsApi.adminVerifyCourier(userId, true);
      toast.success('Курьер верифицирован');
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка'));
    } finally {
      setVerifying(null);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Логистика / Курьеры</h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> Обновить
        </Button>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Users className="h-5 w-5" /> Курьеры ({couriers.length})
        </h2>
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-3">Имя</th>
                <th className="p-3">Телефон</th>
                <th className="p-3">Статус</th>
                <th className="p-3">Доставок</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {couriers.map((c) => (
                <tr key={c.user_id} className="border-t">
                  <td className="p-3 font-medium">{c.name || c.user_id}</td>
                  <td className="p-3">{c.phone || '—'}</td>
                  <td className="p-3">
                    {c.verified ? (
                      <span className="text-green-700">{c.online ? '🟢 На линии' : '✓ Верифицирован'}</span>
                    ) : (
                      <span className="text-amber-600">Ожидает</span>
                    )}
                  </td>
                  <td className="p-3">{c.deliveries_count}</td>
                  <td className="p-3">
                    {!c.verified && (
                      <Button
                        size="sm"
                        disabled={verifying === c.user_id}
                        onClick={() => verifyCourier(c.user_id)}
                      >
                        {verifying === c.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {couriers.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-gray-400">Курьеров пока нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Задачи доставки ({tasks.length})</h2>
        <div className="space-y-2">
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
          {tasks.length === 0 && (
            <p className="text-center text-gray-400 py-8">Задач пока нет</p>
          )}
        </div>
      </section>
    </div>
  );
}
