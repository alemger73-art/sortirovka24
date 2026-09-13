import { useLanguage } from '@/contexts/LanguageContext';
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
import { invalidateTaxiEnabledCache } from '@/hooks/useTaxiEnabled';
import StorageImg from '@/components/StorageImg';
import DocFilePreview from '@/components/DocFilePreview';
import { resolveImageSrc, isPdf } from '@/lib/storage';
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
  const { t: adminT } = useLanguage();

  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<TaxiAdminStats | null>(null);
  const [rides, setRides] = useState<TaxiRide[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [applications, setApplications] = useState<DriverApplication[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [rideFilter, setRideFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
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
      setLoadError(true);
      toast.error(String(e?.message || adminT("admin.ui.0044")));
    } finally {
      setLoading(false);
    }
  }, [rideFilter, adminT]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const updated = await taxiApi.adminUpdateSettings(settings);
      setSettings(updated);
      invalidateTaxiEnabledCache();
      toast.success(adminT("admin.ui.0586"));
    } catch (e: any) {
      toast.error(String(e?.message || adminT("admin.ui.0486")));
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleServiceEnabled() {
    const next = settings.enabled === 'true' ? 'false' : 'true';
    setSettings({ ...settings, enabled: next });
    try {
      const updated = await taxiApi.adminUpdateSettings({ enabled: next });
      setSettings(updated);
      invalidateTaxiEnabledCache();
      toast.success(next === 'true' ? adminT("admin.ui.1146") : adminT("admin.ui.1147"));
    } catch (e: any) {
      toast.error(String(e?.message || adminT("admin.ui.0486")));
      await load();
    }
  }

  const serviceOn = settings.enabled === 'true';

  async function approveApp(userId: string) {
    try {
      await taxiApi.adminApproveApplication(userId);
      toast.success(adminT("admin.ui.1148"));
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || adminT("admin.ui.0486")));
    }
  }

  async function rejectApp(userId: string) {
    try {
      await taxiApi.adminRejectApplication(userId, adminT("admin.ui.1149"));
      toast.success(adminT("admin.ui.0876"));
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || adminT("admin.ui.0486")));
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Car; badge?: number }[] = [
    { id: 'stats', label: adminT("admin.ui.1150"), icon: Car },
    { id: 'rides', label: adminT("admin.ui.1151"), icon: RefreshCw },
    { id: 'applications', label: adminT("admin.ui.1152"), icon: ClipboardList, badge: stats?.pending_applications },
    { id: 'drivers', label: adminT("admin.ui.1153"), icon: Users },
    { id: 'settings', label: adminT("admin.ui.1154"), icon: Settings },
  ];

  if (loadError) return <div role="alert" className="rounded-xl border bg-white p-5 space-y-3"><p>{adminT("admin.ui.0879")}</p><Button onClick={() => void load()}>{adminT("admin.ui.0285")}</Button></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Car className="h-5 w-5 text-yellow-500" />
            {adminT("admin.ui.1155")} </h2>
          <p className="text-sm text-gray-500">{adminT("admin.ui.1156")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {adminT("admin.ui.0408")} </Button>
      </div>

      <div className={`rounded-2xl border px-4 py-4 flex flex-wrap items-center justify-between gap-3 ${serviceOn ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        <div>
          <p className={`font-bold ${serviceOn ? 'text-green-900' : 'text-amber-900'}`}>
            {serviceOn ? adminT("admin.ui.1157") : adminT("admin.ui.1158")}
          </p>
          <p className={`text-sm mt-0.5 ${serviceOn ? 'text-green-700' : 'text-amber-800'}`}>
            {serviceOn
              ? adminT("admin.ui.1159")
              : adminT("admin.ui.1160")}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleServiceEnabled}
          disabled={loading || !Object.keys(settings).length}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${serviceOn ? 'bg-green-500' : 'bg-gray-300'}`}
          title={serviceOn ? adminT("admin.ui.1161") : adminT("admin.ui.1162")}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform ${serviceOn ? 'left-7' : 'left-1'}`} />
        </button>
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
                { label: adminT("admin.ui.1163"), value: stats.total_rides },
                { label: adminT("admin.ui.1164"), value: stats.completed_rides },
                { label: adminT("admin.ui.1165"), value: stats.pending_rides },
                { label: adminT("admin.ui.1166"), value: stats.active_rides },
                { label: adminT("admin.ui.1167"), value: formatTenge(stats.revenue) },
                { label: adminT("admin.ui.1168"), value: stats.online_drivers },
                { label: adminT("admin.ui.1169"), value: stats.pending_applications ?? 0 },
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
                <p className="text-center py-10 text-gray-400 rounded-2xl bg-white border">{adminT("admin.ui.1170")}</p>
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
                        {(app.photo_url || app.license_photo_url || app.tech_passport_photo_url || app.car_photo_url) && (
                          <div className="flex flex-wrap gap-2 mt-3">
                            {[
                              { label: adminT("admin.ui.0882"), url: app.photo_url },
                              { label: adminT("admin.ui.1171"), url: app.license_photo_url },
                              { label: adminT("admin.ui.1172"), url: app.tech_passport_photo_url },
                              { label: adminT("admin.ui.0701"), url: app.car_photo_url },
                            ].filter((d) => d.url).map((d) => (
                              isPdf(d.url) ? (
                                <div
                                  key={d.label}
                                  className="block w-20 h-16 rounded-lg overflow-hidden border border-gray-200"
                                >
                                  <DocFilePreview value={d.url!} alt={d.label} className="w-full h-full" />
                                </div>
                              ) : (
                                <a
                                  key={d.label}
                                  href={resolveImageSrc(d.url!) || undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block w-20 h-16 rounded-lg overflow-hidden border border-gray-200"
                                >
                                  <StorageImg objectKey={d.url!} alt={d.label} className="w-full h-full object-cover" />
                                </a>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 items-end">
                        <p className="text-xs text-gray-400 max-w-[200px] text-right">
                          {adminT("admin.ui.1173")} </p>
                        <div className="flex gap-2">
                        <Button size="sm" className="bg-yellow-400 hover:bg-yellow-500 text-gray-900" onClick={() => approveApp(app.user_id)}>
                          <Check className="h-3.5 w-3.5 mr-1" /> {adminT("admin.ui.1174")} </Button>
                        <Button size="sm" variant="outline" onClick={() => rejectApp(app.user_id)}>
                          <X className="h-3.5 w-3.5 mr-1" /> {adminT("admin.ui.0072")} </Button>
                        </div>
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
                    {s ? TAXI_STATUS_LABELS[s]?.label || s : adminT("admin.ui.0132")}
                  </button>
                ))}
              </div>
              <div className="rounded-2xl bg-white border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">{adminT("admin.ui.1175")}</th>
                      <th className="px-4 py-3 text-left">{adminT("admin.ui.0466")}</th>
                      <th className="px-4 py-3 text-left">{adminT("admin.ui.0081")}</th>
                      <th className="px-4 py-3 text-left">{adminT("admin.ui.0089")}</th>
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
                {rides.length === 0 && <p className="text-center py-8 text-gray-400">{adminT("admin.ui.1176")}</p>}
              </div>
            </div>
          )}

          {tab === 'drivers' && (
            <div className="space-y-3">
              {drivers.length === 0 ? (
                <p className="text-center py-8 text-gray-400 rounded-2xl bg-white border">{adminT("admin.ui.1177")}</p>
              ) : (
                drivers.map((d) => (
                  <div key={d.user_id} className="rounded-2xl bg-white border p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{d.name || adminT("admin.ui.1178")}</p>
                      <p className="text-sm text-gray-500">{d.phone} · {[d.car_make, d.car_model, d.car_number].filter(Boolean).join(' ')}</p>
                      <p className="text-xs mt-1">
                        {d.is_online ? '🟢 Online' : '⚫ Offline'} · {d.rides_count} {adminT("admin.ui.1179")} {d.rating?.toFixed(1)} ·{' '}
                        {d.is_verified ? adminT("admin.ui.1180") : `📋 ${d.documents_status || adminT("admin.ui.1181")}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={d.is_verified ? 'outline' : 'default'}
                      className={!d.is_verified ? 'bg-yellow-400 hover:bg-yellow-500 text-gray-900' : ''}
                      onClick={async () => {
                        try {
                          await taxiApi.adminVerifyDriver(d.user_id, !d.is_verified);
                          toast.success(adminT("admin.ui.1182"));
                          load();
                        } catch (e: any) {
                          toast.error(String(e?.message));
                        }
                      }}
                    >
                      {d.is_verified ? adminT("admin.ui.1183") : adminT("admin.ui.1184")}
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'settings' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-white border p-5 space-y-4">
                <h3 className="font-bold text-gray-900">{adminT("admin.ui.1154")}</h3>
                {[
                  { key: 'base_fare', label: adminT("admin.ui.1185") },
                  { key: 'per_km', label: adminT("admin.ui.1186") },
                  { key: 'per_minute', label: adminT("admin.ui.1187") },
                  { key: 'min_fare', label: adminT("admin.ui.1188") },
                  { key: 'eta_minutes_per_km', label: adminT("admin.ui.1189") },
                ].map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500 block mb-1">{label}</label>
                    <Input value={settings[key] || ''} onChange={(e) => setSettings({ ...settings, [key]: e.target.value })} className="rounded-xl" />
                  </div>
                ))}
              </div>
              <div className="rounded-2xl bg-white border p-5 space-y-4">
                <h3 className="font-bold text-gray-900">{adminT("admin.ui.1190")}</h3>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{adminT("admin.ui.1191")}</label>
                  <Input value={settings.service_area || ''} onChange={(e) => setSettings({ ...settings, service_area: e.target.value })} className="rounded-xl" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">{adminT("admin.ui.1192")}</label>
                  <Input value={settings.max_radius_km || ''} onChange={(e) => setSettings({ ...settings, max_radius_km: e.target.value })} className="rounded-xl" />
                </div>
                <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                  <div>
                    <span className="text-sm font-medium block">{adminT("admin.ui.1157")}</span>
                    <span className="text-xs text-gray-500">{adminT("admin.ui.1193")}</span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleServiceEnabled}
                    className={`relative h-7 w-12 rounded-full transition-colors ${serviceOn ? 'bg-yellow-400' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${serviceOn ? 'left-5' : 'left-0.5'}`} />
                  </button>
                </div>
                <Button className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-xl" disabled={savingSettings} onClick={saveSettings}>
                  {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {adminT("admin.ui.0760")} </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
