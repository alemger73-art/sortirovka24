import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { accountApi } from '@/lib/accountApi';
import { humanizeApiError } from '@/lib/apiErrors';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  ORDER_SOURCE_LABELS,
  ORDER_SOURCE_PATHS,
  parseOrderItems,
  saveStoreRepeatOrder,
  type OrderSource,
} from '@/lib/orderRoutes';
import FoodOrderStatusBar from '@/components/damalem/FoodOrderStatusBar';
import { ArrowLeft, MapPin, Phone, RotateCcw, Store, UtensilsCrossed, Wine } from 'lucide-react';

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'payment.cash',
  kaspi_qr: 'payment.kaspiQr',
  halyk_qr: 'payment.halykQr',
};

const STORE_STATUS: Record<string, { key: string; color: string }> = {
  new: { key: 'cabinet.orderStatus.new', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-200' },
  in_progress: { key: 'cabinet.orderStatus.processing', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-200' },
  processing: { key: 'cabinet.orderStatus.processing', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-200' },
  done: { key: 'cabinet.orderStatus.done', color: 'bg-green-500/20 text-green-700 dark:text-green-200' },
  completed: { key: 'cabinet.orderStatus.done', color: 'bg-green-500/20 text-green-700 dark:text-green-200' },
  delivered: { key: 'cabinet.orderStatus.delivered', color: 'bg-green-500/20 text-green-700 dark:text-green-200' },
  cancelled: { key: 'cabinet.orderStatus.cancelled', color: 'bg-red-500/20 text-red-700 dark:text-red-200' },
};

function formatOrderDate(raw?: string | null) {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(raw);
  }
}

function StoreIcon({ type }: { type: string }) {
  if (type === 'food') return <UtensilsCrossed className="h-5 w-5 text-orange-500" />;
  if (type === 'volna') return <Wine className="h-5 w-5 text-violet-600" />;
  return <Store className="h-5 w-5 text-emerald-600" />;
}

export default function CabinetOrderDetail() {
  const { source = '', orderId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!source || !orderId) return;
    (async () => {
      setLoading(true);
      setError('');
      try {
        setOrder(await accountApi.orderDetail(source, orderId));
      } catch (e) {
        setError(humanizeApiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [source, orderId]);

  const items = parseOrderItems(order?.order_items);
  const type = String(order?.type || source);
  const isFood = type === 'food';
  const st = STORE_STATUS[order?.status || ''] || STORE_STATUS.new;
  const storePath = order?.store_path || ORDER_SOURCE_PATHS[type as OrderSource] || '/';
  const storeLabel = order?.store_label || ORDER_SOURCE_LABELS[type as OrderSource] || type;
  const address = order?.customer_address || order?.delivery_address;
  const payKey = order?.payment_method ? PAYMENT_LABELS[order.payment_method] : null;

  function repeatOrder() {
    if (isFood && order?.order_items) {
      try {
        sessionStorage.setItem('damalem_repeat_order', JSON.stringify({
          order_items: order.order_items,
          delivery_address: order.delivery_address,
          delivery_method: order.delivery_method,
        }));
      } catch { /* ignore */ }
      navigate('/food');
      return;
    }
    if (order?.order_items && type in ORDER_SOURCE_PATHS) {
      saveStoreRepeatOrder(type as OrderSource, order.order_items, address);
      navigate(`${storePath}?tab=cart`);
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link to="/cabinet?tab=orders" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> {t('cabinet.tab.orders')}
        </Link>

        {loading ? (
          <div className="rounded-2xl border bg-white p-8 text-center dark:bg-gray-900 dark:border-gray-800">
            <p className="text-gray-500">{t('common.loading')}</p>
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : order ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-white p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <StoreIcon type={type} />
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{storeLabel}</h1>
                    <p className="text-sm text-gray-500">№ {order.order_number || orderId}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${st.color}`}>
                  {t(st.key)}
                </span>
              </div>

              {isFood && order.status !== 'cancelled' && order.status !== 'done' ? (
                <div className="mt-4">
                  <FoodOrderStatusBar status={order.status || 'new'} />
                </div>
              ) : null}

              <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-slate-300">
                {order.created_at ? <p>{formatOrderDate(order.created_at)}</p> : null}
                {order.customer_name ? <p>{order.customer_name}</p> : null}
                {order.customer_phone ? (
                  <p className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{order.customer_phone}</p>
                ) : null}
                {address ? (
                  <p className="inline-flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />{address}</p>
                ) : null}
                {payKey ? <p>{t(payKey)}</p> : null}
                {order.comment ? <p className="text-gray-500 italic">{order.comment}</p> : null}
              </div>

              <p className="mt-4 text-2xl font-bold text-amber-600 dark:text-yellow-300">
                {Number(order.amount || 0).toLocaleString('ru-RU')} ₸
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={storePath}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Store className="h-4 w-4" /> В магазин
                </Link>
                {order.order_items ? (
                  <button
                    type="button"
                    onClick={repeatOrder}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                  >
                    <RotateCcw className="h-4 w-4" /> Заказать снова
                  </button>
                ) : null}
                {isFood && order.delivery_method === 'delivery' && !['done', 'cancelled', 'delivered'].includes(String(order.status)) && (
                  <Link
                    to={`/delivery/food/${order.order_number}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600/90 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <MapPin className="h-4 w-4" /> Отследить
                  </Link>
                )}
              </div>
            </div>

            {items.length > 0 && (
              <div className="rounded-2xl border bg-white p-6 shadow-sm dark:bg-gray-900 dark:border-gray-800">
                <h2 className="font-bold text-gray-900 dark:text-white mb-3">Состав заказа</h2>
                <ul className="space-y-2">
                  {items.map((item, idx) => {
                    const name = String(item.name || item.title || 'Позиция');
                    const qty = Number(item.qty ?? item.quantity ?? 1);
                    const price = Number(item.price ?? item.total ?? 0);
                    return (
                      <li key={idx} className="flex justify-between gap-3 text-sm border-b border-gray-100 dark:border-gray-800 pb-2 last:border-0">
                        <span className="text-gray-800 dark:text-slate-200">{name} × {qty}</span>
                        {price > 0 ? (
                          <span className="font-semibold shrink-0">{price.toLocaleString('ru-RU')} ₸</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
