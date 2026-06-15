import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import TaxiLiveMap from '@/components/taxi/TaxiLiveMap';
import StorageImg from '@/components/StorageImg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  formatTenge,
  taxiApi,
  TAXI_STATUS_LABELS,
  type TaxiRide,
} from '@/lib/taxiApi';
import {
  ArrowLeft,
  Bell,
  Car,
  Clock,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

const RATING_LABELS = ['', 'Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично!'];

function notifyPassenger(title: string, body: string) {
  toast.success(title, { description: body, duration: 8000 });
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {
      /* ignore */
    }
  }
}

export default function TaxiRide() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const rideId = parseInt(id || '0', 10);
  const [ride, setRide] = useState<TaxiRide | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const prevStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!rideId) return;
    try {
      const data = await taxiApi.getRide(rideId);
      setRide(data);
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Поездка не найдена'));
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    load();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, [load]);

  useEffect(() => {
    if (!ride || ride.status === 'completed' || ride.status === 'cancelled') return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [ride?.status, load]);

  useEffect(() => {
    if (!ride) return;
    const prev = prevStatus.current;
    if (prev && prev !== ride.status) {
      if (ride.status === 'accepted') {
        notifyPassenger('Водитель назначен', 'Машина уже едет к вам');
      } else if (ride.status === 'driver_arrived') {
        notifyPassenger('Водитель подъехал!', 'Выходите — машина на месте');
      } else if (ride.status === 'in_progress') {
        notifyPassenger('Поездка началась', 'Приятной дороги!');
      } else if (ride.status === 'completed') {
        notifyPassenger('Поездка завершена', 'Оцените водителя');
      }
    }
    prevStatus.current = ride.status;
  }, [ride?.status]);

  async function handleCancel() {
    if (!ride) return;
    setCancelling(true);
    try {
      await taxiApi.cancelRide(ride.id, 'Отменено пассажиром');
      toast.success('Поездка отменена');
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Не удалось отменить'));
    } finally {
      setCancelling(false);
    }
  }

  async function handleRate() {
    if (!ride || rating < 1) return;
    setSubmittingRating(true);
    try {
      await taxiApi.rateRide(ride.id, rating, ratingComment);
      toast.success('Спасибо за оценку!');
      await load();
    } catch (e: unknown) {
      toast.error(String((e as Error)?.message || 'Ошибка'));
    } finally {
      setSubmittingRating(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
        </div>
      </Layout>
    );
  }

  if (!ride) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-gray-600">Поездка не найдена</p>
          <Button className="mt-4" onClick={() => navigate('/taxi')}>Заказать такси</Button>
        </div>
      </Layout>
    );
  }

  const statusInfo = TAXI_STATUS_LABELS[ride.status] || { label: ride.status, color: 'bg-gray-100', emoji: '🚕' };
  const canCancel = ['pending', 'accepted'].includes(ride.status);
  const isDone = ride.status === 'completed' || ride.status === 'cancelled';
  const driverPoint =
    ride.tracking?.driver_lat != null && ride.tracking?.driver_lng != null
      ? { lat: ride.tracking.driver_lat, lng: ride.tracking.driver_lng }
      : null;
  const trackTarget = ride.status === 'in_progress' ? 'dropoff' as const : 'pickup' as const;

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-50">
        <div className="bg-gray-900 px-4 py-4 flex items-center gap-3">
          <button type="button" onClick={() => navigate('/taxi')} className="text-white/70 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-white font-bold">Поездка #{ride.id}</p>
            <p className="text-white/50 text-xs">{statusInfo.emoji} {statusInfo.label}</p>
          </div>
          <button type="button" onClick={load} className="text-white/70 hover:text-white p-2">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto max-w-lg px-4 py-5 space-y-4 -mt-1">
          {ride.status === 'driver_arrived' && (
            <div className="rounded-2xl bg-green-500 text-white p-5 shadow-lg shadow-green-500/30 animate-pulse">
              <div className="flex items-center gap-3">
                <Bell className="h-8 w-8 shrink-0" />
                <div>
                  <p className="text-lg font-bold">Водитель на месте!</p>
                  <p className="text-green-100 text-sm">Выходите — машина ждёт вас</p>
                </div>
              </div>
            </div>
          )}

          {ride.tracking?.eta_label && !isDone && ride.status !== 'pending' && (
            <div className="rounded-2xl bg-yellow-400 px-5 py-4 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-gray-900" />
                <div>
                  <p className="text-xs font-medium text-gray-800 uppercase tracking-wide">Прибытие</p>
                  <p className="text-xl font-black text-gray-900">{ride.tracking.eta_label}</p>
                </div>
              </div>
              {driverPoint && <span className="text-2xl">🚕</span>}
            </div>
          )}

          <TaxiLiveMap
            from={ride.from_lat ? { lat: ride.from_lat, lng: ride.from_lng! } : null}
            to={ride.to_lat ? { lat: ride.to_lat, lng: ride.to_lng! } : null}
            driver={driverPoint}
            trackTarget={trackTarget}
            height="260px"
          />

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <div className="h-3 w-3 rounded-full bg-yellow-400 ring-4 ring-yellow-100" />
                <div className="w-0.5 flex-1 bg-gray-200 my-1 min-h-[28px]" />
                <div className="h-3 w-3 rounded-full bg-gray-900 ring-4 ring-gray-100" />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase">Откуда</p>
                  <p className="font-medium text-gray-900">{ride.from_address}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase">Куда</p>
                  <p className="font-medium text-gray-900">{ride.to_address}</p>
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Стоимость</p>
                <p className="text-2xl font-black text-gray-900">{formatTenge(ride.final_price ?? ride.estimated_price)}</p>
              </div>
              {ride.distance_km != null && (
                <p className="text-sm text-gray-500 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {ride.distance_km} км
                </p>
              )}
            </div>
          </div>

          {ride.driver && (
            <div className="rounded-2xl bg-white border border-yellow-200 shadow-sm p-5">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-2xl bg-yellow-100 overflow-hidden flex items-center justify-center shrink-0">
                  {ride.driver.photo_url ? (
                    <StorageImg src={ride.driver.photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Car className="h-8 w-8 text-yellow-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 text-lg">{ride.driver.name}</p>
                  <p className="text-sm text-gray-600 truncate">
                    {[ride.driver.car_make, ride.driver.car_model, ride.driver.car_color].filter(Boolean).join(' ')}
                  </p>
                  {ride.driver.car_number && (
                    <p className="text-sm font-mono font-bold bg-gray-100 inline-block px-2 py-0.5 rounded mt-1">
                      {ride.driver.car_number}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-sm">
                    <span className="flex items-center gap-1 text-yellow-700 font-semibold">
                      <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                      {ride.driver.rating?.toFixed(1) ?? '5.0'}
                    </span>
                    {ride.driver.rides_count != null && (
                      <span className="text-gray-400">{ride.driver.rides_count} поездок</span>
                    )}
                  </div>
                </div>
                {ride.driver.phone && (
                  <a
                    href={`tel:${ride.driver.phone}`}
                    className="h-14 w-14 rounded-2xl bg-gray-900 flex items-center justify-center text-white hover:bg-gray-800 shrink-0"
                  >
                    <Phone className="h-6 w-6" />
                  </a>
                )}
              </div>
            </div>
          )}

          {ride.status === 'pending' && (
            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-5 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-blue-900 font-semibold">Ищем водителя…</p>
              <p className="text-blue-700/70 text-sm mt-1">Обычно 2–5 минут</p>
            </div>
          )}

          {canCancel && (
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
              disabled={cancelling}
              onClick={handleCancel}
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
              Отменить поездку
            </Button>
          )}

          {ride.status === 'completed' && ride.rating == null && (
            <div className="rounded-2xl bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-300 p-6 space-y-4 shadow-lg">
              <div className="text-center">
                <p className="text-2xl font-black text-gray-900">Как прошла поездка?</p>
                <p className="text-gray-500 text-sm mt-1">Ваша оценка помогает району</p>
              </div>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`p-2 rounded-xl transition-all ${rating >= n ? 'scale-110' : 'opacity-40'}`}
                  >
                    <Star className={`h-10 w-10 ${rating >= n ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-center font-semibold text-yellow-800">{RATING_LABELS[rating]}</p>
              )}
              <Input
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Комментарий (необязательно)"
                className="rounded-xl bg-white"
              />
              <Button
                className="w-full h-12 rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold text-base"
                disabled={rating < 1 || submittingRating}
                onClick={handleRate}
              >
                {submittingRating ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Отправить оценку'}
              </Button>
            </div>
          )}

          {ride.status === 'completed' && ride.rating != null && (
            <div className="rounded-2xl bg-green-50 border border-green-200 p-4 text-center text-green-800">
              Спасибо! Вы оценили поездку на {ride.rating} ★
            </div>
          )}

          {isDone && (
            <Button
              className="w-full h-12 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold"
              onClick={() => navigate('/taxi')}
            >
              Заказать новую поездку
            </Button>
          )}

          <p className="text-center text-xs text-gray-400 pb-6">
            <Link to="/cabinet" className="underline hover:text-gray-600">История поездок</Link> в личном кабинете
          </p>
        </div>
      </div>
    </Layout>
  );
}
