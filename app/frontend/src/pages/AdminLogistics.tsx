import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  formatTenge,
  logisticsApi,
  LOGISTICS_STATUS_LABELS,
  type CourierApplication,
  type LogisticsTask,
} from '@/lib/logisticsApi';
import DocFilePreview from '@/components/DocFilePreview';
import { Check, ClipboardList, Loader2, RefreshCw, Users, X } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'applications' | 'couriers' | 'tasks';

function getVEHICLE_LABELS(adminT: (key: string) => string) {
  const VEHICLE_LABELS: Record<string, string> = {
  bike: adminT("admin.ui.0872"),
  car: adminT("admin.ui.0701"),
  foot: adminT("admin.ui.0873"),
};
  return VEHICLE_LABELS;
}

export default function AdminLogistics() {
  const { t: adminT } = useLanguage();
  const VEHICLE_LABELS = getVEHICLE_LABELS(adminT);

  const [tab, setTab] = useState<Tab>('applications');
  const [applications, setApplications] = useState<CourierApplication[]>([]);
  const [tasks, setTasks] = useState<LogisticsTask[]>([]);
  const [couriers, setCouriers] = useState<Array<{ user_id: string; name?: string; phone?: string; verified: boolean; online: boolean; deliveries_count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
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
      setLoadError(true);
      toast.error(String((e as Error)?.message || adminT("admin.ui.0044")));
    } finally {
      setLoading(false);
    }
  }, [adminT]);

  useEffect(() => {
    load();
  }, [load]);

  async function approveApp(userId: string) {
    setActing(userId);
    try {
      await logisticsApi.adminApproveApplication(userId);
      toast.success(adminT("admin.ui.0874"));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || adminT("admin.ui.0486")));
    } finally {
      setActing(null);
    }
  }

  async function rejectApp(userId: string) {
    const note = window.prompt(adminT("admin.ui.0875")) || '';
    setActing(userId);
    try {
      await logisticsApi.adminRejectApplication(userId, note);
      toast.success(adminT("admin.ui.0876"));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || adminT("admin.ui.0486")));
    } finally {
      setActing(null);
    }
  }

  async function markReady(taskId: number) {
    try {
      await logisticsApi.adminMarkReady(taskId);
      toast.success(adminT("admin.ui.0877"));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || adminT("admin.ui.0486")));
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'applications', label: adminT("admin.extra.1292").replace('{0}', () => String(applications.length)), icon: ClipboardList },
    { id: 'couriers', label: adminT("admin.ui.0392"), icon: Users },
    { id: 'tasks', label: adminT("admin.ui.0878"), icon: ClipboardList },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (loadError) return <div role="alert" className="rounded-xl border bg-white p-5 space-y-3"><p>{adminT("admin.ui.0879")}</p><Button onClick={() => void load()}>{adminT("admin.ui.0285")}</Button></div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">{adminT("admin.ui.0880")}</h1>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" /> {adminT("admin.ui.0408")} </Button>
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
                  {app.vehicle_plate && <p className="text-sm text-gray-500">{adminT("admin.ui.0881")} {app.vehicle_plate}</p>}
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
                    <p className="text-xs text-gray-400 mb-1">{adminT("admin.ui.0882")}</p>
                    <DocFilePreview value={app.photo_url} alt={adminT("admin.ui.0882")} className="h-24 w-full object-cover rounded-lg" />
                  </div>
                )}
                {app.id_photo_url && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{adminT("admin.ui.0883")}</p>
                    <DocFilePreview value={app.id_photo_url} alt={adminT("admin.ui.0883")} className="h-24 w-full object-cover rounded-lg" />
                  </div>
                )}
                {app.vehicle_photo_url && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{adminT("admin.ui.0778")}</p>
                    <DocFilePreview value={app.vehicle_photo_url} alt={adminT("admin.ui.0778")} className="h-24 w-full object-cover rounded-lg" />
                  </div>
                )}
              </div>
            </div>
          ))}
          {applications.length === 0 && (
            <p className="text-center text-gray-400 py-12 bg-white rounded-xl border">{adminT("admin.ui.0884")}</p>
          )}
        </section>
      )}

      {tab === 'couriers' && (
        <section>
          <div className="bg-white rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="p-3">{adminT("admin.ui.0885")}</th>
                  <th className="p-3">{adminT("admin.ui.0466")}</th>
                  <th className="p-3">{adminT("admin.ui.0089")}</th>
                  <th className="p-3">{adminT("admin.ui.0886")}</th>
                </tr>
              </thead>
              <tbody>
                {couriers.map((c) => (
                  <tr key={c.user_id} className="border-t">
                    <td className="p-3 font-medium">{c.name || c.user_id}</td>
                    <td className="p-3">{c.phone || '—'}</td>
                    <td className="p-3">{c.online ? adminT("admin.ui.0887") : adminT("admin.ui.0888")}</td>
                    <td className="p-3">{c.deliveries_count}</td>
                  </tr>
                ))}
                {couriers.length === 0 && (
                  <tr><td colSpan={4} className="p-6 text-center text-gray-400">{adminT("admin.ui.0889")}</td></tr>
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
                <div className="min-w-0">
                  <p className="font-semibold">#{t.id} {adminT("admin.ui.0890")}{t.source_id}</p>
                  <p className="text-sm text-gray-500 break-words max-w-md">{t.pickup_address} → {t.dropoff_address}</p>
                  {t.total_amount != null && <p className="text-sm font-medium mt-1">{formatTenge(t.total_amount)}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${st.color}`}>{st.label}</span>
                  {t.status === 'pending' && (
                    <Button size="sm" variant="outline" onClick={() => markReady(t.id)}>
                      {adminT("admin.ui.0891")} </Button>
                  )}
                </div>
              </div>
            );
          })}
          {tasks.length === 0 && <p className="text-center text-gray-400 py-8">{adminT("admin.ui.0892")}</p>}
        </section>
      )}
    </div>
  );
}
