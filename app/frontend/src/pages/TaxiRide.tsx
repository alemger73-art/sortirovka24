import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import TaxiMap from '@/components/taxi/TaxiMap';
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
  Car,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

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

  const load = useCallback(async () => {
    if (!rideId) return;
    try {
      const data = await taxiApi.getRide(rideId);
      setRide(data);
    } catch (e: any) {
      toast.error(String(e?.message || 'Поездка не найдена'));
    } finally {
      setLoading(false);
    }
  }, [rideId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ride || ride.status === 'completed' || ride.status === 'cancelled') return;
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [ride?.status, load]);

  async function handleCancel() {
    if (!ride) return;
    setCancelling(true);
    try {
      await taxiApi.cancelRide(ride.id, 'Отменено пассажиром');
      toast.success('Поездка отменена');
      await load();
    } catch (e: any) {
      toast.error(String(e?.message || 'Не удалось отменить'));
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
    } catch (e: any) {
      toast.error(String(e?.message || 'Ошибка'));
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

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gray-900 px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate('/taxi')} className="text-white/70 hover:text-white">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <p className="text-white font-bold">Поездка #{ride.id}</p>
            <p className="text-white/50 text-xs">{statusInfo.emoji} {statusInfo.label}</p>
          </div>
          <button onClick={load} className="text-white/70 hover:text-white p-2">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto max-w-lg px-4 py-5 space-y-4">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${statusInfo.color}`}>
            {statusInfo.emoji} {statusInfo.label}
          </span>

          <TaxiMap
            from={ride.from_lat ? { lat: ride.from_lat, lng: ride.from_lng! } : null}
            to={ride.to_lat ? { lat: ride.to_lat, lng: ride.to_lng! } : null}
            height="200px"
          />

          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm p-5 space-y-4">
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-3 w-3 rounded-full bg-yellow-400 ring-4 ring-yellow-100" />
                  <div className="w-0.5 flex-1 bg-gray-200 my-1 min-h-[24px]" />
                  <div className="h-3 w-3 rounded-full bg-gray-900 ring-4 ring-gray-100" />
                </div>
                <div className="flex-1 space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Откуда</p>
                    <p className="font-medium text-gray-900">{ride.from_address}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Куда</p>
                    <p className="font-medium text-gray-900">{ride.to_address}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-400">Стоимость</p>
                <p className="text-2xl font-black text-gray-900">
                  {formatTenge(ride.final_price ?? ride.estimated_price)}
                </p>
              </div>
              {ride.distance_km && (
                <div className="text-right">
                  <p className="text-xs text-gray-400">Расстояние</p>
                  <p className="font-semibold text-gray-700 flex items-center gap-1 justify-end">
                    <MapPin className="h-3.5 w-3.5" /> {ride.distance_km} км
                  </p>
                </div>
              )}
            </div>
          </div>

          {ride.driver && (
            <div className="rounded-2xl bg-yellow-50 border border-yellow-200 p-5">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-yellow-400 flex items-center justify-center">
                  <Car className="h-7 w-7 text-gray-900" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-gray-900">{ride.driver.name}</p>
                  <p className="text-sm text-gray-600">
                    {[ride.driver.car_make, ride.driver.car_model, ride.driver.car_color].filter(Boolean).join(' ')}
                  </p>
                  {ride.driver.car_number && (
                    <p className="text-sm font-mono font-bold text-gray-800 mt-0.5">{ride.driver.car_number}</p>
                  )}
                  {ride.driver.rating && (
                    <p className="text-xs text-yellow-700 flex items-center gap-1 mt-1">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" /> {ride.driver.rating.toFixed(1)}
                    </p>
                  )}
                </div>
                {ride.driver.phone && (
                  <a
                    href={`tel:${ride.driver.phone}`}
                    className="h-12 w-12 rounded-xl bg-gray-900 flex items-center justify-center text-white hover:bg-gray-800"
                  >
                    <Phone className="h-5 w-5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {ride.status === 'pending' && (
            <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-blue-900 font-medium">Ищем ближайшего водителя…</p>
              <p className="text-blue-700/70 text-sm mt-1">Обычно это занимает 2–5 минут</p>
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
            <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3">
              <p className="font-semibold text-gray-900">Оцените поездку</p>
              <div className="flex gap-2 justify-center">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`p-2 rounded-xl transition-colors ${rating >= n ? 'text-yellow-400' : 'text-gray-300'}`}
                  >
                    <Star className={`h-8 w-8 ${rating >= n ? 'fill-yellow-400' : ''}`} />
                  </button>
                ))}
              </div>
              <Input
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                placeholder="Комментарий (необязательно)"
                className="rounded-xl"
              />
              <Button
                className="w-full rounded-xl bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold"
                disabled={rating < 1 || submittingRating}
                onClick={handleRate}
              >
                Отправить оценку
              </Button>
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

          <p className="text-center text-xs text-gray-400">
            <Link to="/cabinet" className="underline hover:text-gray-600">История поездок</Link> в личном кабинете
          </p>
        </div>
      </div>
    </Layout>
  );
}
