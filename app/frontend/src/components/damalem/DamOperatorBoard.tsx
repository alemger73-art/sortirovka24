import '@/i18n/adminTranslations'; // staff UI words (loaded only with this page)
import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Phone, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStoreTranslations } from '@/i18n/storeTranslations';
import { getPublicLocale } from '@/i18n/publicLocale';
import { foodOperations, type OperatorOrder, type OrderDetail } from '@/lib/foodOperations';
import { isDeliveryOrder, nextOrderStatus, nextStepLabel, operatorRunsDelivery, waitsForPayment } from '@/lib/damOrderSteps';

const PAYMENT: Record<string, string> = { cash: 'Наличными', kaspi_transfer: 'Kaspi переводом', kaspi_qr: 'Kaspi', halyk_qr: 'Halyk' };
/** How far along the order is, on the 4-segment bar. */
const PROGRESS: Record<string, number> = { new: 0, confirmed: 1, preparing: 1, ready: 2, in_progress: 3, done: 4 };
const PILL: Record<string, string> = {
  new: 'bg-[#E3261B] text-white',
  confirmed: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
  preparing: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
  ready: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
  in_progress: 'bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-100',
};

type Line = { name?: string; quantity?: number; price?: number; modTotal?: number };

function orderLines(raw: string): Line[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(line => line && typeof line === 'object') : [];
  } catch { return []; }
}

/** The operator's main screen: active orders, one big next-step button each. Everything else is in the full order card. */
export default function DamOperatorBoard({ openOrder }: { openOrder: (id: number) => void }) {
  const { t: adminT, lang } = useLanguage();
  const st = useStoreTranslations();
  const locale = getPublicLocale(lang);
  const money = (value: number) => `${Math.round(Number(value || 0)).toLocaleString(locale)} ₸`;
  const time = (value: string) => value ? new Date(value).toLocaleTimeString(locale, { timeZone: 'Asia/Almaty', hour: '2-digit', minute: '2-digit' }) : '';
  const [orders, setOrders] = useState<OperatorOrder[] | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<OperatorOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const load = useCallback(async () => {
    try {
      const data = await foodOperations<{ items: OperatorOrder[] }>('/orders?status=active&limit=50');
      setOrders(data.items);
      setError('');
      setOpenId(current => current ?? data.items.find(o => o.status === 'new')?.id ?? data.items[0]?.id ?? null);
    } catch (e) { setError((e as Error).message); }
  }, []);
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const loadDetail = useCallback(async (id: number) => {
    const data = await foodOperations<OrderDetail>(`/orders/${id}`);
    if (openIdRef.current === id) setDetail(data.order);
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 3000);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    setDetail(null);
    if (!openId) return;
    const refresh = () => { if (!document.hidden && !lock.current) void loadDetail(openId).catch(() => { /* the list stays usable */ }); };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => window.clearInterval(timer);
  }, [openId, loadDetail]);

  async function advance(order: OperatorOrder, target: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await foodOperations(`/orders/${order.id}`, 'PATCH', { expected_version: order.version || 0, status: target });
      await Promise.all([load(), loadDetail(order.id)]);
    } catch (e) { toast.error((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }

  /** The big button: a status change when the server allows one, otherwise the full card where the step is done. */
  function nextAction(order: OperatorOrder): { label: string; run: () => void; accent: boolean } | null {
    const target = nextOrderStatus(order);
    const card = (label: string) => ({ label, run: () => openOrder(order.id), accent: false });
    if (!target) return order.status === 'ready' && isDeliveryOrder(order) && !operatorRunsDelivery(order) ? card(st('Передать курьеру')) : null;
    if (target === 'preparing' && order.is_future_preorder) return card(st('Начать предзаказ раньше'));
    if (target === 'preparing' && waitsForPayment(order)) return card(st('Ждём оплату {0} — открыть', [PAYMENT[order.payment_method] || '']));
    return { label: st(nextStepLabel(order, target)), run: () => void advance(order, target), accent: order.status === 'new' };
  }

  if (!orders) return <p role={error ? 'alert' : 'status'} className="p-4">{error || st('Загружаем заказы…')}</p>;
  return <section aria-labelledby="dam-board-title" className="space-y-3" data-testid="dam-operator-board">
    <h2 id="dam-board-title" className="px-1 text-lg font-bold">{st('Новые заказы')}</h2>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-100">{error}</p>}
    {orders.length === 0 && <p className="rounded-2xl border bg-card p-6 text-center text-muted-foreground">{st('Новых заказов нет. Новый заказ появится здесь сам.')}</p>}
    {orders.map(listed => {
      const order = detail?.id === listed.id ? { ...listed, ...detail } : listed;
      const open = openId === order.id;
      const delivery = isDeliveryOrder(order);
      const action = open && detail?.id === order.id ? nextAction(order) : null;
      const progress = PROGRESS[order.status] ?? 0;
      const bonus = Number(order.bonus_discount_amount || 0);
      return <article key={order.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm" data-testid={`dam-board-order-${order.id}`}>
        <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : order.id)}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <span className="flex-1">
            <strong className="block text-base">№ {order.id}</strong>
            <span className="text-sm text-muted-foreground">{time(order.created_at)} · {delivery ? st('доставка') : order.delivery_method === 'dine_in' ? st('в зале') : st('самовывоз')} · {money(order.total_amount)}</span>
          </span>
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${PILL[order.status] || 'bg-muted'}`}>{adminT(`admin.dam.orderStatus.${order.status}`)}</span>
        </button>
        <div className="grid grid-cols-4 gap-1 px-4" aria-hidden="true">
          {[1, 2, 3, 4].map(n => <span key={n} className={`h-1.5 rounded-full ${progress >= n ? 'bg-foreground' : 'bg-muted'}`} />)}
        </div>
        {open && <div className="space-y-3 px-4 pb-4 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span><strong className="block text-lg">{order.customer_name || st('Клиент')}</strong><span className="text-sm text-muted-foreground">{order.customer_phone}</span></span>
            {order.customer_phone && <a href={`tel:${order.customer_phone.replace(/[^+\d]/g, '')}`}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-foreground px-4 font-bold">
              <Phone className="h-4 w-4" aria-hidden="true" />{st('Позвонить клиенту')}</a>}
          </div>
          <ul className="space-y-1.5 rounded-xl bg-muted/50 p-3" aria-label={st('Состав заказа')}>
            {orderLines(order.order_items).map((line, i) => <li key={i} className="flex justify-between gap-3">
              <span><strong>{Number(line.quantity || 1)} ×</strong> {line.name}</span>
              <span className="whitespace-nowrap text-muted-foreground">{money(((line.price || 0) + (line.modTotal || 0)) * (line.quantity || 1))}</span>
            </li>)}
          </ul>
          <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{delivery ? order.delivery_address : order.delivery_method === 'dine_in' ? st('В заведении') : st('Самовывоз')}</span></p>
          <p className="flex items-start gap-2"><Wallet className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span><strong>{st(PAYMENT[order.payment_method] || order.payment_method)} · {money(order.total_amount)}</strong>
              {' · '}{order.payment_status === 'paid' ? st('оплачено') : st('при получении')}
              {(bonus > 0 || order.cash_given_amount != null) && <span className="block text-sm text-muted-foreground">
                {bonus > 0 ? st('Списано бонусов: {0}', [money(bonus)]) : ''}{bonus > 0 && order.cash_given_amount != null ? ' · ' : ''}
                {order.cash_given_amount != null ? st('Сдача с {0}', [money(order.cash_given_amount)]) : ''}</span>}</span></p>
          {order.comment && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">{order.comment}</p>}
          {action && <button type="button" disabled={busy} onClick={action.run} data-testid="dam-board-next"
            className={`min-h-16 w-full rounded-2xl px-4 text-lg font-bold text-white disabled:opacity-60 ${action.accent ? 'bg-[#E3261B] hover:bg-[#C21F15]' : 'bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900'}`}>
            {action.label}</button>}
          {!action && detail?.id === order.id && order.status === 'in_progress' && !operatorRunsDelivery(order) && <p className="rounded-xl bg-sky-50 p-3 text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">{st('Заказ у курьера — доставку завершит курьер.')}</p>}
          <button type="button" onClick={() => openOrder(order.id)} className="min-h-11 w-full rounded-xl text-sm font-semibold underline">{st('Все детали заказа')}</button>
        </div>}
      </article>;
    })}
  </section>;
}
