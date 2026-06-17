import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DRIVER_STATUS_FLOW,
  formatTenge,
  taxiApi,
  TAXI_STATUS_LABELS,
  type DriverCabinet,
  type TaxiRide,
} from '@/lib/taxiApi';
import { ensureLocationPermission, requestCurrentPosition } from '@/lib/geolocation';
import { playTaxiNewOrderSound, unlockTaxiSound } from '@/lib/taxiDriverSound';
import {
  Car,
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
import DriverDocUpload from '@/components/taxi/DriverDocUpload';
import StorageImg from '@/components/StorageImg';

export default function CabinetDriver() {
  const [data, setData] = useState<DriverCabinet | null>(null);
  const [loading, setLoading] = useState(true);
  const [togglingOnline, setTogglingOnline] = useState(false);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [decliningId, setDecliningId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [carMake, setCarMake] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carNumber, setCarNumber] = useState('');
  const [carColor, setCarColor] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [licenseUrl, setLicenseUrl] = useState('');
  const [techPassportUrl, setTechPassportUrl] = useState('');
  const [carPhotoUrl, setCarPhotoUrl] = useState('');
  const knownOrderIds = useRef<Set<number>>(new Set());
  const ordersInitialized = useRef(false);

  const canWork = Boolean(data?.profile.verified && data?.profile.documents_status === 'verified');

  const load = useCallback(async () => {
    try {
      const cab = await taxiApi.driverCabinet();
      setData(cab);
      setCarMake(cab.profile.car_make || '');
      setCarModel(cab.profile.car_model || '');
      setCarNumber(cab.profile.car_number || '');
      setCarColor(cab.profile.car_color || '');
      setPhone(cab.profile.phone || '');
      setPhotoUrl(cab.profile.photo_url || '');
      setLicenseUrl(cab.profile.license_photo_url || '');
      setTechPassportUrl(cab.profile.tech_passport_photo_url || '');
      setCarPhotoUrl(cab.profile.car_photo_url || '');
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка загрузки кабинета'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!data?.profile.online) {
      knownOrderIds.current = new Set();
      ordersInitialized.current = false;
      return;
    }
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data?.profile.online, load]);

  useEffect(() => {
    if (!data?.profile.online || data.active_ride) return;
    const currentId = data.offered_order?.id ?? data.available_orders[0]?.id;
    if (!currentId) return;
    const ids = new Set([currentId, ...data.available_orders.map((o) => o.id)]);
    if (!ordersInitialized.current) {
      knownOrderIds.current = ids;
      ordersInitialized.current = true;
      return;
    }
    let hasNew = false;
    for (const id of ids) {
      if (!knownOrderIds.current.has(id)) hasNew = true;
    }
    if (hasNew) {
      playTaxiNewOrderSound();
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const latest = data.offered_order ?? data.available_orders[0];
        new Notification('Новый заказ', {
          body: latest ? `${latest.from_address} → ${latest.to_address}` : 'Появился новый заказ',
        });
      }
    }
    knownOrderIds.current = ids;
  }, [data?.available_orders, data?.offered_order, data?.profile.online, data?.active_ride]);

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
          await taxiApi.updateLocation(coords.lat, coords.lng).catch(() => {});
        }
      } catch {
        // GPS optional while on line — errors are silent
      }
    };

    void (async () => {
      await ensureLocationPermission();
      if (cancelled) return;
      await tick();
      interval = setInterval(() => void tick(), data?.active_ride || data?.offered_order ? 10000 : 20000);
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [data?.profile.online, data?.active_ride, data?.offered_order]);

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
      await taxiApi.setOnline(next);
      toast.success(next ? 'Вы на линии' : 'Вы offline');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    } finally {
      setTogglingOnline(false);
    }
  }

  async function declineOrder(ride: TaxiRide) {
    setDecliningId(ride.id);
    try {
      await taxiApi.declineRide(ride.id);
      toast.success('Заказ пропущен');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    } finally {
      setDecliningId(null);
    }
  }

  async function acceptOrder(ride: TaxiRide) {
    setAcceptingId(ride.id);
    try {
      await taxiApi.acceptRide(ride.id);
      toast.success('Заказ принят!');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Не удалось принять'));
    } finally {
      setAcceptingId(null);
    }
  }

  async function advanceStatus(ride: TaxiRide) {
    const flow = DRIVER_STATUS_FLOW[ride.status];
    if (!flow) return;
    setUpdatingId(ride.id);
    try {
      await taxiApi.updateRideStatus(ride.id, flow.next);
      toast.success('Статус обновлён');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      await taxiApi.updateDriverProfile({
        car_make: carMake,
        car_model: carModel,
        car_number: carNumber,
        car_color: carColor,
        phone,
        photo_url: photoUrl,
        license_photo_url: licenseUrl,
        tech_passport_photo_url: techPassportUrl,
        car_photo_url: carPhotoUrl,
      });
      toast.success('Профиль сохранён');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center text-gray-600">
          Кабинет водителя недоступен. Убедитесь, что у вас роль «водитель».
        </div>
      </Layout>
    );
  }

  const { profile, offered_order, available_orders, active_ride, order_history, earnings } = data;
  const pendingCount = (offered_order ? 1 : 0) + available_orders.length;

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gray-900 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-4xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-yellow-400 overflow-hidden flex items-center justify-center shrink-0">
                {profile.photo_url ? (
                  <StorageImg src={profile.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Car className="h-6 w-6 text-gray-900" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Кабинет водителя</h1>
                <p className="text-white/50 text-sm">
                  <Link to="/cabinet" className="hover:text-white/80 underline underline-offset-2">Личный кабинет</Link>
                  {' · '}
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                    {profile.rating?.toFixed(1)} · {profile.rides_count} поездок
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
                    : 'bg-yellow-400 hover:bg-yellow-500 text-gray-900'
                }`}
              >
                {togglingOnline ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Power className="h-4 w-4 mr-2" />
                )}
                {profile.online ? 'На линии' : 'Выйти на линию'}
              </Button>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8 space-y-6">
          {!canWork && (
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-amber-900 text-sm space-y-1">
              {profile.documents_status === 'submitted' ? (
                <p>📋 Документы на модерации. После проверки администратором вы сможете выйти на линию.</p>
              ) : profile.documents_status === 'rejected' ? (
                <p>❌ Модерация отклонена. {profile.documents_note || 'Загрузите все документы заново.'}</p>
              ) : (
                <p>⏳ Загрузите фото, права, техпаспорт и фото автомобиля — затем дождитесь модерации.</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Заработок', value: formatTenge(earnings), icon: Wallet },
              { label: 'На линии', value: profile.online ? 'Да' : 'Нет', icon: Power },
              { label: 'Заказов', value: String(pendingCount), icon: MapPin },
              { label: 'Рейтинг', value: profile.rating?.toFixed(1) || '5.0', icon: Star },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                <Icon className="h-4 w-4 text-gray-400 mb-2" />
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-lg font-bold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          {active_ride && (
            <div className="rounded-2xl bg-yellow-50 border-2 border-yellow-300 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900">Активная поездка #{active_ride.id}</h2>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${TAXI_STATUS_LABELS[active_ride.status]?.color || ''}`}>
                  {TAXI_STATUS_LABELS[active_ride.status]?.label}
                </span>
              </div>
              <p className="text-sm text-gray-700">{active_ride.from_address}</p>
              <p className="text-sm text-gray-500">→ {active_ride.to_address}</p>
              <p className="font-bold text-xl">{formatTenge(active_ride.estimated_price)}</p>
              {active_ride.passenger_phone && (
                <a href={`tel:${active_ride.passenger_phone}`} className="flex items-center gap-2 text-sm text-blue-600">
                  <Phone className="h-4 w-4" /> {active_ride.passenger_name} · {active_ride.passenger_phone}
                </a>
              )}
              {DRIVER_STATUS_FLOW[active_ride.status] && (
                <Button
                  className="w-full h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
                  disabled={updatingId === active_ride.id}
                  onClick={() => advanceStatus(active_ride)}
                >
                  {updatingId === active_ride.id ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  {DRIVER_STATUS_FLOW[active_ride.status].label}
                </Button>
              )}
            </div>
          )}

          {!active_ride && profile.online && offered_order && (
            <div className="rounded-2xl bg-gradient-to-br from-yellow-300 to-amber-400 border-2 border-yellow-500 p-5 space-y-4 shadow-lg animate-pulse">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-gray-900 text-lg">🚕 Новый заказ для вас!</h2>
                <span className="text-sm font-bold bg-gray-900 text-yellow-400 px-3 py-1 rounded-full">
                  {offered_order.offer_seconds_left ?? 15} сек
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900">{offered_order.from_address}</p>
              <p className="text-sm text-gray-800">→ {offered_order.to_address}</p>
              <p className="text-2xl font-black text-gray-900">{formatTenge(offered_order.estimated_price)}</p>
              <div className="flex gap-2">
                <Button
                  className="flex-1 h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
                  disabled={acceptingId === offered_order.id}
                  onClick={() => acceptOrder(offered_order)}
                >
                  {acceptingId === offered_order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Принять'}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-5 rounded-xl border-gray-900 text-gray-900 font-bold bg-white/80"
                  disabled={decliningId === offered_order.id}
                  onClick={() => declineOrder(offered_order)}
                >
                  {decliningId === offered_order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Пропустить'}
                </Button>
              </div>
            </div>
          )}

          {!active_ride && profile.online && (
            <div className="space-y-3">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Navigation className="h-4 w-4 text-yellow-500" />
                Другие заказы ({available_orders.length})
              </h2>
              {available_orders.length === 0 ? (
                <div className="rounded-2xl bg-white border border-gray-100 p-8 text-center text-gray-500">
                  <Car className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                  Ожидаем новые заказы…
                </div>
              ) : (
                available_orders.map((order) => (
                  <div key={order.id} className="rounded-2xl bg-white border border-gray-100 p-5 shadow-sm space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">#{order.id}</p>
                        <p className="text-sm text-gray-600 mt-1">{order.from_address}</p>
                        <p className="text-sm text-gray-400">→ {order.to_address}</p>
                      </div>
                      <p className="text-xl font-black text-gray-900">{formatTenge(order.estimated_price)}</p>
                    </div>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>{order.distance_km} км</span>
                      {order.passenger_phone && <span>· {order.passenger_phone}</span>}
                    </div>
                    <Button
                      className="w-full h-11 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold"
                      disabled={acceptingId === order.id}
                      onClick={() => acceptOrder(order)}
                    >
                      {acceptingId === order.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Принять заказ
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-900">Документы и верификация</h2>
            <DriverDocUpload
              photoUrl={photoUrl}
              licenseUrl={licenseUrl}
              techPassportUrl={techPassportUrl}
              carPhotoUrl={carPhotoUrl}
              onChange={(field, value) => {
                if (field === 'photo_url') setPhotoUrl(value);
                if (field === 'license_photo_url') setLicenseUrl(value);
                if (field === 'tech_passport_photo_url') setTechPassportUrl(value);
                if (field === 'car_photo_url') setCarPhotoUrl(value);
              }}
            />
            <Button variant="outline" className="rounded-xl w-full" disabled={savingProfile} onClick={saveProfile}>
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Сохранить документы
            </Button>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-4">
            <h2 className="font-bold text-gray-900">Автомобиль</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input value={carMake} onChange={(e) => setCarMake(e.target.value)} placeholder="Марка (Toyota)" className="rounded-xl" />
              <Input value={carModel} onChange={(e) => setCarModel(e.target.value)} placeholder="Модель (Camry)" className="rounded-xl" />
              <Input value={carNumber} onChange={(e) => setCarNumber(e.target.value)} placeholder="Госномер" className="rounded-xl" />
              <Input value={carColor} onChange={(e) => setCarColor(e.target.value)} placeholder="Цвет" className="rounded-xl" />
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" className="rounded-xl sm:col-span-2" />
            </div>
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={savingProfile}
              onClick={saveProfile}
            >
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Сохранить
            </Button>
          </div>

          <div className="rounded-2xl bg-white border border-gray-100 p-5">
            <h2 className="font-bold text-gray-900 mb-3">История ({order_history.length})</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {order_history.slice(0, 20).map((r) => (
                <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                  <div>
                    <span className="text-gray-400">#{r.id}</span>
                    <span className="ml-2 text-gray-700">{r.to_address?.slice(0, 30)}…</span>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatTenge(r.final_price ?? r.estimated_price)}</p>
                    <p className="text-xs text-gray-400">{TAXI_STATUS_LABELS[r.status]?.label || r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
