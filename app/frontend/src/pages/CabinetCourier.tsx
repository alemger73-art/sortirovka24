import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  COURIER_STATUS_FLOW,
  formatTenge,
  logisticsApi,
  LOGISTICS_STATUS_LABELS,
  type CourierCabinet,
  type LogisticsTask,
} from '@/lib/logisticsApi';
import { ensureLocationPermission, requestCurrentPosition } from '@/lib/geolocation';
import { playTaxiNewOrderSound, unlockTaxiSound } from '@/lib/taxiDriverSound';
import {
  Bike,
  Check,
  Loader2,
  MapPin,
  Navigation,
  Phone,
  Power,
  RefreshCw,
  Save,
  Star,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';

const VEHICLE_OPTIONS = [
  { id: 'bike', labelKey: 'courier.vehicleBike' },
  { id: 'car', labelKey: 'courier.vehicleCar' },
  { id: 'foot', labelKey: 'courier.vehicleFoot' },
];

export default function CabinetCourier() {
  const { t } = useLanguage();
  const [data, setData] = useState<CourierCabinet | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [vehicleType, setVehicleType] = useState('bike');
  const [phone, setPhone] = useState('');
  const knownTaskIds = useRef<Set<number>>(new Set());
  const tasksInitialized = useRef(false);

  const canWork = Boolean(data?.profile.verified);

  const load = useCallback(async () => {
    try {
      const cab = await logisticsApi.courierCabinet();
      setData(cab);
      setVehicleType(cab.profile.vehicle_type || 'bike');
      setPhone(cab.profile.phone || '');
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || t('courier.loadError')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.profile.online) {
      knownTaskIds.current = new Set();
      tasksInitialized.current = false;
      return;
    }
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data?.profile.online, load]);

  useEffect(() => {
    if (!data?.profile.online || data.active_task) return;
    const currentId = data.offered_task?.id ?? data.available_tasks[0]?.id;
    if (!currentId) return;
    const ids = new Set([currentId, ...data.available_tasks.map((t) => t.id)]);
    if (!tasksInitialized.current) {
      knownTaskIds.current = ids;
      tasksInitialized.current = true;
      return;
    }
    let hasNew = false;
    for (const id of ids) {
      if (!knownTaskIds.current.has(id)) hasNew = true;
    }
    if (hasNew) {
      playTaxiNewOrderSound();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const latest = data.offered_task ?? data.available_tasks[0];
        new Notification(t('courier.newDeliveryTitle'), {
          body: latest ? `${latest.pickup_address} → ${latest.dropoff_address}` : t('courier.newDeliveryBody'),
        });
      }
    }
    knownTaskIds.current = ids;
  }, [data?.available_tasks, data?.offered_task, data?.profile.online, data?.active_task]);

  useEffect(() => {
    if (!data?.profile.online) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      try {
        const coords = await requestCurrentPosition({
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 12000,
        });
        if (!cancelled) {
          await logisticsApi.updateLocation(coords.lat, coords.lng).catch(() => {});
        }
      } catch {
        /* GPS optional */
      }
    };

    void (async () => {
      await ensureLocationPermission();
      if (cancelled) return;
      await tick();
      interval = setInterval(() => void tick(), data?.active_task || data?.offered_task ? 10000 : 20000);
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [data?.profile.online, data?.active_task, data?.offered_task]);

  async function toggleOnline() {
    if (!data) return;
    setTogglingOnline(true);
    try {
      const next = !data.profile.online;
      if (next) {
        await unlockTaxiSound();
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          void Notification.requestPermission();
        }
      }
      await logisticsApi.setOnline(next);
      toast.success(next ? t('courier.online') : t('courier.offline'));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || t('courier.genericError')));
    } finally {
      setTogglingOnline(false);
    }
  }

  async function declineTask(task: LogisticsTask) {
    setDecliningId(task.id);
    try {
      await logisticsApi.declineTask(task.id);
      toast.success(t('courier.orderSkipped'));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || t('courier.genericError')));
    } finally {
      setDecliningId(null);
    }
  }

  async function acceptTask(task: LogisticsTask) {
    setAcceptingId(task.id);
    try {
      await logisticsApi.acceptTask(task.id);
      toast.success(t('courier.deliveryAccepted'));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || t('courier.acceptFailed')));
    } finally {
      setAcceptingId(null);
    }
  }

  async function advanceStatus(task: LogisticsTask) {
    const flow = COURIER_STATUS_FLOW[task.status];
    if (!flow) return;
    setUpdatingId(task.id);
    try {
      await logisticsApi.updateTaskStatus(task.id, flow.next);
      toast.success(t('courier.statusUpdated'));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || t('courier.genericError')));
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await logisticsApi.updateProfile({ vehicle_type: vehicleType, phone });
      toast.success(t('courier.profileSaved'));
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || t('courier.genericError')));
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-gray-600 dark:text-slate-300">
          {t('courier.unavailable')}
        </div>
      </Layout>
    );
  }

  const { profile, offered_task, available_tasks, active_task, task_history, earnings } = data;
  const pendingCount = (offered_task ? 1 : 0) + available_tasks.length;

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <div className="bg-orange-600 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-4xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-white overflow-hidden flex items-center justify-center shrink-0">
                {profile.photo_url ? (
                  <StorageImg src={profile.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Bike className="h-6 w-6 text-orange-600" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{t('courier.title')}</h1>
                <p className="text-white/70 text-sm">
                  <Link to="/cabinet" className="hover:text-white underline underline-offset-2">{t('cabinet.personalTitle')}</Link>
                  {' · '}
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-yellow-300 fill-yellow-300" />
                    {profile.rating?.toFixed(1)} · {profile.deliveries_count} {t('courier.deliveriesCount')}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} className="p-2.5 rounded-xl bg-white/10 text-white hover:bg-white/20">
                <RefreshCw className="h-4 w-4" />
              </button>
              <Button
                onClick={toggleOnline}
                disabled={togglingOnline || !canWork}
                className={`h-12 px-6 rounded-xl font-bold ${
                  profile.online
                    ? 'bg-green-500 hover:bg-green-600 text-white'
                    : 'bg-white hover:bg-orange-50 text-orange-700'
                }`}
              >
                {togglingOnline ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Power className="h-4 w-4 mr-2" />
                )}
                {profile.online ? t('courier.onlineStatus') : t('courier.goOnline')}
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 space-y-6">
          {!canWork && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-900 text-sm dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-200">
              {t('courier.waitVerify')}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: t('courier.statEarnings'), value: formatTenge(earnings), icon: Wallet },
              { label: t('courier.onlineStatus'), value: profile.online ? t('courier.yes') : t('courier.no'), icon: Power },
              { label: t('courier.statOrders'), value: String(pendingCount), icon: MapPin },
              { label: t('courier.statRating'), value: profile.rating?.toFixed(1) || '5.0', icon: Star },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm dark:bg-gray-900 dark:border-gray-800">
                <Icon className="h-4 w-4 text-gray-400 mb-2" />
                <p className="text-xs text-gray-500 dark:text-slate-400">{label}</p>
                <p className="text-lg font-bold text-gray-900 dark:text-white">{value}</p>
              </div>
            ))}
          </div>

          {active_task && (
            <div className="rounded-2xl bg-orange-50 border-2 border-orange-300 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">{t('courier.activeDelivery')} #{active_task.id}</h2>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${LOGISTICS_STATUS_LABELS[active_task.status]?.color || ''}`}>
                  {LOGISTICS_STATUS_LABELS[active_task.status]?.label}
                </span>
              </div>
              <p className="text-sm text-gray-700">📍 {active_task.pickup_address}</p>
              <p className="text-sm text-gray-500">→ {active_task.dropoff_address}</p>
              {active_task.delivery_fee != null && (
                <p className="font-bold text-xl">{formatTenge(active_task.delivery_fee)}</p>
              )}
              {active_task.customer_phone && (
                <a href={`tel:${active_task.customer_phone}`} className="flex items-center gap-2 text-sm text-blue-600">
                  <Phone className="h-4 w-4" /> {active_task.customer_name} · {active_task.customer_phone}
                </a>
              )}
              {COURIER_STATUS_FLOW[active_task.status] && (
                <Button
                  className="w-full h-12 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
                  disabled={updatingId === active_task.id}
                  onClick={() => advanceStatus(active_task)}
                >
                  {updatingId === active_task.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {COURIER_STATUS_FLOW[active_task.status].label}
                </Button>
              )}
            </div>
          )}

          {!active_task && profile.online && offered_task && (
            <div className="rounded-2xl bg-gradient-to-br from-orange-300 to-amber-400 border-2 border-orange-500 p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-gray-900 text-lg">{t('courier.newDelivery')}</h2>
                <span className="text-sm font-bold bg-gray-900 text-orange-300 px-3 py-1 rounded-full">
                  {offered_task.offer_seconds_left ?? 15} {t('courier.seconds')}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900">{offered_task.pickup_address}</p>
              <p className="text-sm text-gray-800">→ {offered_task.dropoff_address}</p>
              {offered_task.delivery_fee != null && (
                <p className="text-2xl font-black text-gray-900">{formatTenge(offered_task.delivery_fee)}</p>
              )}
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
                  disabled={acceptingId === offered_task.id}
                  onClick={() => acceptTask(offered_task)}
                >
                  {acceptingId === offered_task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t('courier.accept')}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-5 rounded-xl border-gray-900 text-gray-900 font-bold bg-white/80"
                  disabled={decliningId === offered_task.id}
                  onClick={() => declineTask(offered_task)}
                >
                  {decliningId === offered_task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t('courier.skip')}
                </Button>
              </div>
            </div>
          )}

          {!active_task && profile.online && available_tasks.length > 0 && !offered_task && (
            <div className="space-y-3">
              <h2 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Navigation className="h-4 w-4" /> {t('courier.availableDeliveries')}
              </h2>
              {available_tasks.map((task) => (
                <div key={task.id} className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm space-y-2 dark:bg-gray-900 dark:border-gray-800">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{task.pickup_address}</p>
                  <p className="text-sm text-gray-500 dark:text-slate-400">→ {task.dropoff_address}</p>
                  <Button
                    className="w-full h-10 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold"
                    disabled={acceptingId === task.id}
                    onClick={() => acceptTask(task)}
                  >
                    {acceptingId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t('courier.accept')}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-4 dark:bg-gray-900 dark:border-gray-800">
            <h2 className="font-bold text-gray-900 dark:text-white">{t('courier.profile')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">{t('courier.phone')}</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="rounded-xl dark:bg-gray-950 dark:border-gray-700 dark:text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">{t('courier.transport')}</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value)}
                  className="w-full h-10 rounded-xl border border-gray-200 px-3 text-sm dark:bg-gray-950 dark:border-gray-700 dark:text-white"
                >
                  {VEHICLE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>{t(v.labelKey)}</option>
                  ))}
                </select>
              </div>
            </div>
            <Button
              onClick={saveProfile}
              disabled={savingProfile}
              className="h-10 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-semibold"
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              {t('common.save')}
            </Button>
          </div>

          {task_history.length > 0 && (
            <div className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm dark:bg-gray-900 dark:border-gray-800">
              <h2 className="font-bold text-gray-900 dark:text-white mb-3">{t('courier.history')}</h2>
              <div className="space-y-2">
                {task_history.slice(0, 10).map((task) => (
                  <div key={task.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0 dark:border-gray-800">
                    <span className="text-gray-700 dark:text-slate-300 truncate max-w-[60%]">{task.dropoff_address}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${LOGISTICS_STATUS_LABELS[task.status]?.color || 'bg-gray-100'}`}>
                      {LOGISTICS_STATUS_LABELS[task.status]?.label || task.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
