import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import TaxiLiveMap from '@/components/taxi/TaxiLiveMap';
import StorageImg from '@/components/StorageImg';
import { Button } from '@/components/ui/button';
import {
  formatTenge,
  logisticsApi,
  LOGISTICS_STATUS_LABELS,
  type LogisticsTask,
} from '@/lib/logisticsApi';
import {
  ArrowLeft,
  Bike,
  Clock,
  Loader2,
  MapPin,
  Phone,
  RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

function notifyCustomer(title: string, body: string) {
  toast.success(title, { description: body, duration: 8000 });
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {
      /* ignore */
    }
  }
}

export default function DeliveryTrack() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const foodOrderId = parseInt(orderId || '0', 10);
  const [task, setTask] = useState<LogisticsTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const prevStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!foodOrderId) return;
    try {
      const data = await logisticsApi.trackFoodOrder(foodOrderId);
      setTask(data);
      setNotFound(false);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [foodOrderId]);

  useEffect(() => {
    load();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, [load]);

  useEffect(() => {
    if (!task || task.status === 'delivered' || task.status === 'cancelled') return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [task?.status, load]);

  useEffect(() => {
    if (!task) return;
    const prev = prevStatus.current;
    if (prev && prev !== task.status) {
      if (task.status === 'assigned') {
        notifyCustomer('Курьер назначен', 'Курьер едет за вашим заказом');
      } else if (task.status === 'picked_up') {
        notifyCustomer('Заказ забран', 'Курьер везёт ваш заказ');
      } else if (task.status === 'on_the_way') {
        notifyCustomer('Курьер в пути', 'Скоро будем у вас');
      } else if (task.status === 'delivered') {
        notifyCustomer('Доставлено!', 'Приятного аппетита!');
      }
    }
    prevStatus.current = task.status;
  }, [task?.status]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      </Layout>
    );
  }

  if (notFound || !task) {
    return (
      <Layout>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-gray-600">Отслеживание доставки пока недоступно</p>
          <Button className="mt-4" onClick={() => navigate('/food')}>К меню</Button>
        </div>
      </Layout>
    );
  }

  const statusInfo = LOGISTICS_STATUS_LABELS[task.status] || { label: task.status, color: 'bg-gray-100', emoji: '📦' };
  const isDone = task.status === 'delivered' || task.status === 'cancelled';
  const courierPoint =
    task.tracking?.courier_lat != null && task.tracking?.courier_lng != null
      ? { lat: task.tracking.courier_lat, lng: task.tracking.courier_lng }
      : null;

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-100 px-4 py-4">
          <div className="mx-auto max-w-lg flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-2 rounded-xl hover:bg-gray-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="font-bold text-gray-900">Доставка #{foodOrderId}</h1>
              <p className="text-sm text-gray-500">{task.merchant_name || 'DAM ALEM'}</p>
            </div>
            <button onClick={load} className="ml-auto p-2 rounded-xl hover:bg-gray-100">
              <RefreshCw className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
          <div className={`rounded-2xl p-4 text-center ${statusInfo.color}`}>
            <span className="text-3xl">{statusInfo.emoji}</span>
            <p className="mt-2 font-bold text-lg">{statusInfo.label}</p>
            {task.tracking?.eta_label && !isDone && (
              <p className="text-sm mt-1 flex items-center justify-center gap-1">
                <Clock className="h-4 w-4" /> {task.tracking.eta_label}
              </p>
            )}
          </div>

          {(task.pickup_lat != null || task.dropoff_lat != null) && (
            <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm h-56">
              <TaxiLiveMap
                from={
                  task.pickup_lat != null && task.pickup_lng != null
                    ? { lat: task.pickup_lat, lng: task.pickup_lng, label: task.pickup_address }
                    : undefined
                }
                to={
                  task.dropoff_lat != null && task.dropoff_lng != null
                    ? { lat: task.dropoff_lat, lng: task.dropoff_lng, label: task.dropoff_address }
                    : undefined
                }
                driver={courierPoint}
                trackTarget={task.status === 'assigned' ? 'pickup' : 'dropoff'}
                height="100%"
              />
            </div>
          )}

          <div className="rounded-2xl bg-white border border-gray-100 p-4 space-y-3 shadow-sm">
            <div className="flex gap-2 text-sm">
              <MapPin className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Откуда</p>
                <p className="font-medium">{task.pickup_address}</p>
              </div>
            </div>
            <div className="flex gap-2 text-sm">
              <MapPin className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-gray-500 text-xs">Куда</p>
                <p className="font-medium">{task.dropoff_address}</p>
              </div>
            </div>
            {task.total_amount != null && (
              <p className="text-lg font-bold pt-2 border-t border-gray-50">{formatTenge(task.total_amount)}</p>
            )}
          </div>

          {task.courier && (
            <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center overflow-hidden">
                {task.courier.photo_url ? (
                  <StorageImg src={task.courier.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Bike className="h-6 w-6 text-orange-600" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-bold">{task.courier.name}</p>
                <p className="text-sm text-gray-500">⭐ {task.courier.rating?.toFixed(1) || '5.0'}</p>
              </div>
              {task.courier.phone && (
                <a href={`tel:${task.courier.phone}`} className="p-2.5 rounded-xl bg-green-50 text-green-700">
                  <Phone className="h-5 w-5" />
                </a>
              )}
            </div>
          )}

          {isDone && (
            <Link
              to="/food"
              className="flex h-12 w-full items-center justify-center rounded-2xl bg-orange-600 text-white font-bold"
            >
              Заказать ещё
            </Link>
          )}
        </div>
      </div>
    </Layout>
  );
}
