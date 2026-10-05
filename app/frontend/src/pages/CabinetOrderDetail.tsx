import CustomerOrderReceipt from '@/components/cabinet/CustomerOrderReceipt';
import CustomerReceiptHistory from '@/components/cabinet/CustomerReceiptHistory';
import OrderReceiptEditor from '@/components/damalem/OrderReceiptEditor';
import {scheduleLabel} from '@/components/damalem/PreorderFields';
import { foodOrderStatusKey } from '@/lib/foodOrderStatus';
import { getPublicLocale } from '@/i18n/publicLocale';
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
  if (!raw || Number.isNaN(new Date(raw).getTime())) return '';
  try {
    return new Date(raw).toLocaleString(getPublicLocale(), {
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
  const { t: publicT, lang } = useLanguage();
  const label = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  const { source = '', orderId = '' } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{mode: 'edit' | 'request'; order: any} | null>(null);

  useEffect(() => {
    if (!source || !orderId) return;
    let alive = true;
    setEditor(null);
    setOrder(null);
    (async () => {
      setLoading(true);
      setError('');
      try {
        const result = await accountApi.orderDetail(source, orderId);
        if (alive) setOrder((previous: any) => previous && source === 'food' && (previous.version || 0) > (result.version || 0) ? previous : result);
      } catch (e) {
        if (alive) setError(humanizeApiError(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    const refresh = async () => {
      if (document.hidden) return;
      try { const result = await accountApi.orderDetail(source, orderId); if (alive) {setOrder((previous: any) => previous && source === 'food' && (previous.version || 0) > (result.version || 0) ? previous : result); setError('');} }
      catch (e) {if (alive) setError(humanizeApiError(e));}
    };
    const timer = window.setInterval(() => void refresh(), 3000);
    window.addEventListener('focus', refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [source, orderId]);

  const items = parseOrderItems(order?.order_items);
  const type = String(order?.type || source);
  const isFood = type === 'food';
  const st = STORE_STATUS[order?.status || ''] || STORE_STATUS.new;
  const storePath = ORDER_SOURCE_PATHS[type as OrderSource] || '/';
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
      } catch { setError(t('cabinet.repeatFailed')); return; }
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
      <div className="mx-auto min-w-0 max-w-2xl break-words px-4 py-8">
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <StoreIcon type={type} />
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{storeLabel}</h1>
                    <p className="text-sm text-gray-500">№ {order.order_number || orderId}</p>
                  </div>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 ${st.color}`}>
                  {isFood ? t(foodOrderStatusKey(order.status || 'new', order.delivery_method)) : t(st.key)}
                </span>
              </div>

              {isFood && order.status !== 'cancelled' && order.status !== 'done' ? (
                <div className="mt-4">
                  <>{order.scheduled_for&&<p className="rounded-xl bg-sky-50 p-3 text-sky-950">Предзаказ: {scheduleLabel(order.scheduled_for)}</p>}<FoodOrderStatusBar status={order.status || 'new'} deliveryMethod={order.delivery_method} /></>
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
                {Number(order.amount || 0).toLocaleString(getPublicLocale())} ₸
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={storePath}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <Store className="h-4 w-4" /> {publicT("public.CabinetOrderDetail.text45")} </Link>
                {items.length > 0 && ['food', 'volna', 'gastronom', 'pharmacy', 'prorab'].includes(type) ? (
                  <button
                    type="button"
                    onClick={repeatOrder}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
                  >
                    <RotateCcw className="h-4 w-4" /> {publicT("public.CabinetOrderDetail.text46")} </button>
                ) : null}

              </div>
            </div>

            {isFood && <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-sm text-muted-foreground">{t('workflow.live')}</p>
              {!!order.receipt_revision && <p className="font-semibold text-orange-700 dark:text-orange-300">{t('workflow.changed')} · {formatOrderDate(order.receipt_updated_at)}</p>}
              {order.paid_amount > 0 && <><p>{t('workflow.received')}: {order.paid_amount} ₸</p><p>{t(order.paid_amount > order.amount ? 'workflow.refund' : 'workflow.due')}: {Math.abs(order.amount - order.paid_amount)} ₸</p></>}
              {(order.can_edit_receipt || order.can_request_receipt_change) && <button type="button" className="rounded-xl border px-4 py-3 font-semibold hover:bg-muted" onClick={() => setEditor({mode: order.can_edit_receipt ? 'edit' : 'request', order: {...order, id: Number(order.food_order_id || order.order_number || orderId), total_amount: order.amount}})}>{order.can_edit_receipt ? label('Изменить состав заказа', 'Тапсырыс құрамын өзгерту') : label('Запросить изменение', 'Өзгертуге өтініш')}</button>}
              {order.can_edit_receipt && <p className="text-xs text-muted-foreground">{label('Доступно до принятия оператором. Новую сумму покажем перед сохранением.', 'Оператор қабылдағанға дейін қолжетімді. Сақтамас бұрын жаңа сома көрсетіледі.')}</p>}
              {order.can_edit_receipt && order.can_request_receipt_change && <button type="button" className="text-sm underline" onClick={() => setEditor({mode: 'request', order: {...order, id: Number(order.food_order_id || order.order_number || orderId), total_amount: order.amount}})}>{label('Попросить оператора изменить заказ', 'Оператордан тапсырысты өзгертуді сұрау')}</button>}
            </div>}

            <CustomerOrderReceipt order={order} />
            {isFood && <CustomerReceiptHistory changes={order.receipt_changes || []} orderNumber={Number(order.order_number || orderId)} />}
          </div>
        ) : null}
      </div>
      {editor && <OrderReceiptEditor order={editor.order} customerMode={editor.mode} onClose={() => setEditor(null)} onSaved={() => {
        setEditor(null);
        void accountApi.orderDetail(source, orderId).then(result => setOrder((previous: any) => previous && (previous.version || 0) > (result.version || 0) ? previous : result)).catch(e => setError(humanizeApiError(e)));
      }} />}
    </Layout>
  );
}
