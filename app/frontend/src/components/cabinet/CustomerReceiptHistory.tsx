import CustomerOrderReceipt from './CustomerOrderReceipt';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPublicLocale } from '@/i18n/publicLocale';

type Snapshot = {items?: unknown; total_amount?: number; receipt?: {subtotal: number; service_fee: number; delivery_fee: number; discount: number} | null};
type Change = {kind?: string; revision?: number; actor_role?: string; created_at?: string; reason?: string; before?: Snapshot; after?: Snapshot};

export default function CustomerReceiptHistory({changes, orderNumber}: {changes: Change[]; orderNumber: number}) {
  const {lang} = useLanguage();
  const label = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  if (!changes.length) return null;
  return <details className="rounded-2xl border bg-card p-5">
    <summary className="cursor-pointer font-semibold">{label('История чеков и запросов', 'Чектер мен өтініштер тарихы')} ({changes.length})</summary>
    <div className="mt-4 space-y-4">{changes.map((change, index) => {
      const requested = change.kind === 'receipt_change_requested';
      const created = change.kind === 'receipt_created';
      const author = change.actor_role === 'customer' ? label('Клиент', 'Клиент') : change.actor_role === 'operator' || !change.actor_role ? label('Оператор', 'Оператор') : label('Система', 'Жүйе');
      const date = change.created_at && !Number.isNaN(new Date(change.created_at).getTime()) ? new Date(change.created_at).toLocaleString(getPublicLocale(lang)) : '';
      return <details key={`${change.created_at}-${index}`} className="rounded-xl border p-3">
        <summary className="cursor-pointer text-sm"><strong>{created ? label('Первоначальный чек', 'Бастапқы чек') : requested ? label('Запрос изменения · чек не изменён', 'Өзгерту өтініші · чек өзгерген жоқ') : `${label('Изменение чека', 'Чек өзгерісі')} №${change.revision}`}</strong><span className="mt-1 block text-muted-foreground">{author} · {date}</span></summary>
        {change.reason && <p className="my-3 text-sm">{change.reason}</p>}
        {requested && <p className="my-3 text-sm text-amber-700 dark:text-amber-300">{label('Это предложение клиента. Фактический состав указан в актуальном чеке.', 'Бұл клиенттің ұсынысы. Нақты құрам ағымдағы чекте көрсетілген.')}</p>}
        <div className="mt-3 space-y-4">{(['before', 'after'] as const).map(side => {
          const snapshot = change[side];
          if (!snapshot) return null;
          return <div key={side}><p className="mb-2 text-sm font-semibold">{created ? label('При оформлении', 'Рәсімдеу кезінде') : side === 'before' ? label('До изменения', 'Өзгеріске дейін') : requested ? label('Предложенный состав', 'Ұсынылған құрам') : label('После изменения', 'Өзгерістен кейін')}</p>
            <CustomerOrderReceipt order={{order_number: orderNumber, order_items: snapshot.items, amount: snapshot.total_amount, receipt: snapshot.receipt}} />
          </div>;
        })}</div>
      </details>;
    })}</div>
  </details>;
}
