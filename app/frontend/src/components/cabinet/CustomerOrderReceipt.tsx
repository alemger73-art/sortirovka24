import { useLanguage } from '@/contexts/LanguageContext';
import { getPublicLocale } from '@/i18n/publicLocale';
import { orderLineQuantity, orderLineTotal, parseOrderItems } from '@/lib/orderRoutes';

type ReceiptOrder = {
  order_items?: unknown;
  amount?: number;
  order_number?: number;
  store_label?: string;
  receipt?: { subtotal: number; service_fee: number; delivery_fee: number; discount: number } | null;
  paid_amount?: number;
  cash_given_amount?: number | null;
  change_amount?: number | null;
  status?: string;
};

export default function CustomerOrderReceipt({ order }: { order: ReceiptOrder }) {
  const { lang } = useLanguage();
  const label = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  const money = (value: unknown) => `${Number(value || 0).toLocaleString(getPublicLocale(), { maximumFractionDigits: 2 })} ₸`;
  const items = parseOrderItems(order.order_items);
  const totals = order.receipt;
  const row = (title: string, value: string) => <div className="flex justify-between gap-4"><span>{title}</span><span className="shrink-0 tabular-nums">{value}</span></div>;
  return <section aria-label={label('Чек заказа', 'Тапсырыс чегі')} className="rounded-2xl border bg-card p-5 text-foreground shadow-sm sm:p-6">
    <h2 className="text-lg font-bold">{label('Чек заказа', 'Тапсырыс чегі')} №{order.order_number}</h2>
    <p className="mt-1 text-xs text-muted-foreground">{label('Данные сохранённого заказа', 'Сақталған тапсырыс деректері')}</p>
    <ul className="my-5 divide-y divide-dashed">
      {items.map((item, index) => {
        const quantity = orderLineQuantity(item);
        const total = orderLineTotal(item);
        const hasPrice = ['line_total', 'sum', 'total', 'price'].some(key => item[key] != null && Number.isFinite(Number(item[key])) && Number(item[key]) >= 0);
        const components = parseOrderItems(item.combo_components);
        const modifiers = parseOrderItems(item.modifiers);
        return <li key={index} className="min-w-0 py-3">
          <div className="flex justify-between gap-3"><strong className="min-w-0 break-words">{String(item.name || item.title || label('Товар', 'Тауар'))}</strong><strong className="shrink-0 text-right tabular-nums">{hasPrice ? money(total) : label('Цена не сохранена', 'Баға сақталмаған')}</strong></div>
          <p className="mt-1 text-sm text-muted-foreground">{quantity}{hasPrice ? ` × ${money(total / quantity)}` : ''}{item.is_gift ? ` · ${label('Подарок', 'Сыйлық')}` : ''}</p>
          {components.length > 0 && <p className="mt-1 text-sm">{label('Состав', 'Құрамы')}: {components.map(part => `${String(part.name || '')}${part.quantity ? ` × ${part.quantity}` : ''}${part.group_name ? ` (${part.group_name})` : ''}${Number(part.surcharge) > 0 ? ` +${money(part.surcharge)}` : ''}`).join(', ')}</p>}
          {modifiers.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{label('Добавки к каждой порции', 'Әр порцияға қосымшалар')}</p>}
          {modifiers.map((modifier, idx) => <p key={idx} className="mt-1 text-sm text-muted-foreground">+ {String(modifier.name || modifier.title || '')}{Number(modifier.quantity) > 1 ? ` × ${modifier.quantity}` : ''}{Number(modifier.price) > 0 ? ` · ${money(modifier.price)} ${label('за шт.', 'данасына')}` : ''}</p>)}
        </li>;
      })}
    </ul>
    {!items.length && <p className="my-4 text-sm text-muted-foreground">{label('Состав этого заказа не сохранён.', 'Бұл тапсырыстың құрамы сақталмаған.')}</p>}
    <div className="space-y-2 border-t border-dashed pt-4 text-sm">
      {totals ? <>
        {row(label('Товары', 'Тауарлар'), money(totals.subtotal))}
        {row(label('Сервисный сбор', 'Қызмет ақысы'), money(totals.service_fee))}
        {row(label('Доставка', 'Жеткізу'), money(totals.delivery_fee))}
        {totals.discount > 0 && row(label('Скидки и бонусы', 'Жеңілдіктер мен бонустар'), `−${money(totals.discount)}`)}
      </> : <p className="text-xs text-muted-foreground">{label('Для этого заказа подробный расчёт не сохранён. Показана сохранённая итоговая сумма.', 'Бұл тапсырыстың толық есебі сақталмаған. Сақталған қорытынды сома көрсетілген.')}</p>}
      <div className="border-t border-dashed pt-3 text-lg font-bold">{row(label('Итого', 'Барлығы'), money(order.amount))}</div>
      {typeof order.paid_amount === 'number' && row(label('Получено в оплату', 'Төлем қабылданды'), money(order.paid_amount))}
      {order.status !== 'cancelled' && typeof order.paid_amount === 'number' && order.paid_amount < Number(order.amount) && row(label('Осталось оплатить', 'Төлеу қалды'), money(Number(order.amount) - order.paid_amount))}
      {typeof order.paid_amount === 'number' && order.paid_amount > Number(order.amount) && row(label('К возврату', 'Қайтарылатын сома'), money(order.paid_amount - Number(order.amount)))}
      {order.cash_given_amount != null && row(label('Наличными передано', 'Қолма-қол берілді'), money(order.cash_given_amount))}
      {order.change_amount != null && row(label('Сдача', 'Қайтарым'), money(order.change_amount))}
    </div>
  </section>;
}
