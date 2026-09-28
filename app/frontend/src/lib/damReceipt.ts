import qrcode from 'qrcode-generator';
import { DAM_ALEM_BRAND, DAM_ALEM_STOREFRONT_URL } from './damAlem';
import { parseOrderItems, orderLineQuantity, orderLineTotal } from './orderRoutes';

export type PrintableOrder = {
  loyalty_snapshot?: Record<string, unknown> | null;
  cash_given_amount?: number | null; change_amount?: number | null;
  id?: string | number; order_number?: string | number; total_amount?: number | null;
  amount?: number; order_items?: string | null; customer_name?: string | null;
  customer_phone?: string | null; delivery_address?: string | null; dropoff_address?: string | null;
  delivery_method?: string | null; paid_amount?: number | null; amount_due?: number | null;
  payment_status?: string | null; payment_method?: string | null; receipt_revision?: number | null;
  created_at?: string | null; restaurant_name?: string | null; store_label?: string | null;
  status?: string | null; comment?: string | null; scheduled_for?: string | null;
  pricing_snapshot?: string | null; promo_discount_amount?: number | null; bonus_discount_amount?: number | null;
};
export const escapePrint = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]!));
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const number = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return;
  const n = Number(value); return Number.isFinite(n) ? n : undefined;
};
const object = (value: unknown): Record<string, unknown> => {
  try { const v = typeof value === 'string' ? JSON.parse(value) : value;
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch { return {}; }
};
export const receiptMoney = (n: number) => `${new Intl.NumberFormat('ru-RU', {maximumFractionDigits: 2}).format(n)} ₸`;

export function receiptDate(raw?: string | null): string {
  if (!raw) return '';
  // Legacy backend timestamps are UTC but may lack the suffix.
  const iso = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', {timeZone: 'Asia/Almaty', day: '2-digit',
    month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(date).replace(', ', '   ');
}

// Presentation only: totals/payment facts always come from the order, never from
// fulfillment status or recalculating current menu prices/discount rules.
export function createReceiptData(order: PrintableOrder) {
  const snapshot = object(order.pricing_snapshot), breakdown = object(snapshot.breakdown);
  const lines = parseOrderItems(order.order_items).map(line => {
    const quantity = orderLineQuantity(line);
    const amount = number(line.sum) ?? orderLineTotal(line);
    const modifiers = (Array.isArray(line.modifiers) ? line.modifiers : []).flatMap(mod => {
      const name = typeof mod === 'string' ? text(mod) : text(object(mod).name) || text(object(mod).title);
      const details = object(mod);
      const count = number(details.quantity) || 1;
      const price = number(details.price);
      return name ? [name + (count > 1 ? ' ×' + count : '') + (price != null ? ' · ' + (price * count).toLocaleString('ru-RU') + ' ₸' : '')] : [];
    });
    const components = (Array.isArray(line.combo_components) ? line.combo_components : []).map(part => {
      const p = object(part);
      return (text(p.group_name) ? text(p.group_name) + ': ' : '') + text(p.name) + ' ×' + (number(p.quantity) || 1);
    });
    return { components, name: text(line.name) || text(line.title) || 'Позиция заказа', quantity,
      amount, unit: amount / quantity, gift: line.is_gift === true && amount === 0, modifiers };
  });
  const total = Math.max(0, number(order.total_amount) ?? number(order.amount) ?? 0);
  const paid = Math.max(0, number(order.paid_amount) ?? (order.payment_status === 'paid' ? total : 0));
  // Older order endpoints have no amount_due; this is a display fallback only.
  const due = Math.max(0, number(order.amount_due) ?? total - paid);
  const method = text(order.delivery_method).toLowerCase();
  const fulfillment = ['pickup', 'самовывоз'].includes(method) ? 'pickup'
    : ['dine_in', 'в заведении', 'на месте'].includes(method) ? 'dine_in' : 'delivery';
  const methodName = ({kaspi: 'KASPI', kaspi_qr: 'KASPI', halyk: 'HALYK', halyk_qr: 'HALYK', cash: 'НАЛИЧНЫЕ'} as Record<string, string>)[text(order.payment_method).toLowerCase()] || text(order.payment_method) || 'Не указан';
  const status = ({paid: 'ОПЛАЧЕНО', pending: 'НЕ ОПЛАЧЕНО', unpaid: 'НЕ ОПЛАЧЕНО',
    partial: 'ЧАСТИЧНО ОПЛАЧЕНО', refunded: 'ВОЗВРАТ ОПЛАТЫ'} as Record<string, string>)[text(order.payment_status)]
    || (due === 0 && paid > 0 ? 'ОПЛАЧЕНО' : paid > 0 ? 'ЧАСТИЧНО ОПЛАЧЕНО' : 'НЕ ОПЛАЧЕНО');
  const loyalty = object(order.loyalty_snapshot);
  return { loyaltyEarned: loyalty.finalized ? number(loyalty.bonus_earned) : undefined, loyaltyBalance: number(loyalty.balance_after), loyaltySpent: number(loyalty.bonus_spent) ?? number(order.bonus_discount_amount), number: String(order.order_number ?? order.id ?? ''), created: receiptDate(order.created_at),
    fulfillment, fulfillmentLabel: fulfillment === 'delivery' ? 'ДОСТАВКА' : fulfillment === 'pickup' ? 'САМОВЫВОЗ' : 'В ЗАВЕДЕНИИ',
    scheduled: receiptDate(order.scheduled_for), name: text(order.customer_name), phone: text(order.customer_phone),
    address: fulfillment === 'delivery' ? text(order.delivery_address) || text(order.dropoff_address) : '',
    cashGiven: order.payment_method === 'cash' ? number(order.cash_given_amount) : undefined,
    change: order.payment_method === 'cash' ? number(order.change_amount) : undefined,
    comment: text(order.comment), lines, total, paid, due, overpaid: Math.max(0, paid - total), methodName,
    paymentLabel: paid > 0 && due > 0 && order.payment_status !== 'refunded' ? 'ЧАСТИЧНО ОПЛАЧЕНО' : status,
    subtotal: number(breakdown.subtotal), discount: number(breakdown.discount)
      ?? (number(order.promo_discount_amount) ?? 0) + (number(order.bonus_discount_amount) ?? 0),
    deliveryFee: fulfillment === 'delivery' ? number(breakdown.delivery_fee) : undefined,
    serviceFee: number(breakdown.service_fee), promo: text(snapshot.promo_code),
  };
}
export type ReceiptData = ReturnType<typeof createReceiptData>;

export function createReceiptQr(): string {
  const code = qrcode(0, 'M');
  code.addData(DAM_ALEM_STOREFRONT_URL, 'Byte'); code.make();
  // Vector modules, 4-module quiet zone. No external image request or secret URL.
  return code.createSvgTag({cellSize: 4, margin: 16, scalable: true})
    .replace('<svg ', '<svg role="img" aria-label="Открыть меню DAM ALEM 2.0" shape-rendering="crispEdges" ');
}

export const RECEIPT_WIDTH_MM = 58;
export const receiptCss = `
@page{size:auto;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#000;width:58mm}
body{font:12px/1.35 ui-monospace,"Courier New",monospace;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.receipt{width:58mm;padding:3mm 5mm;overflow-wrap:anywhere}
h1,h2,p{margin:0}h1{font-size:21px;line-height:1.15;letter-spacing:-.6px}h2{font-size:18px;line-height:1.2}
.center{text-align:center}.tagline{font-size:12px;margin-top:1mm}.rule{border:0;border-top:1px dashed #000;margin:3mm 0}
.fulfillment{font-size:15px;font-weight:bold;margin:1mm 0}.date{font-size:11px;white-space:pre-wrap}
.customer p{margin:1mm 0;white-space:pre-line}.preorder{margin-top:3mm;font-weight:bold}
.section-title{font-weight:bold;text-align:center}.item{margin:3mm 0;break-inside:avoid}.item-name{font-weight:bold;font-size:13px}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:2mm;margin:1mm 0}.row>span:first-child{min-width:0}
.amount{white-space:nowrap;text-align:right;flex-shrink:0}.modifier{font-size:11px;padding-left:2mm;margin-top:.5mm}
.total{font-weight:bold;font-size:17px;gap:1mm}.due{font-weight:bold;font-size:13px}.payment{margin:3mm 0;break-inside:avoid}
.footer{break-inside:avoid;text-align:center}.qr{width:28mm;height:28mm;margin:3mm auto 2mm}.qr svg{display:block;width:28mm;height:28mm}
.qr-caption{font-size:11px}.footer-brand{font-weight:bold;margin-top:2mm}.disclaimer{font-size:9px;margin-top:3mm}
@media print{html,body{width:58mm;background:#fff!important;color:#000!important}.receipt{box-shadow:none}}
`;

export function renderReceiptHtml(data: ReceiptData): string {
  const e = escapePrint, money = (n: number) => e(receiptMoney(n));
  const row = (label: string, n: number, cls = '') => `<div class="row ${cls}"><span>${e(label)}</span><span class="amount">${money(n)}</span></div>`;
  const body = `<main class="receipt" aria-label="Клиентский чек">
    <header class="center"><h1>${DAM_ALEM_BRAND}</h1><p class="tagline">Вкусная еда рядом</p><hr class="rule">
    <h2>ЗАКАЗ${data.number ? ` №${e(data.number)}` : ''}</h2><p class="fulfillment">${data.fulfillmentLabel}</p>
    ${data.created ? `<p class="date">${e(data.created)}</p>` : ''}
    ${data.scheduled ? `<p class="preorder">ПРЕДЗАКАЗ<br>${data.fulfillment === 'delivery' ? 'ДОСТАВИТЬ К:' : data.fulfillment === 'pickup' ? 'ВЫДАТЬ К:' : 'ПОДАТЬ К:'}</p><p class="date">${e(data.scheduled)}</p>` : ''}</header>
    <hr class="rule"><section class="customer">${data.name ? `<p>Клиент: ${e(data.name)}</p>` : ''}${data.phone ? `<p>Тел: ${e(data.phone)}</p>` : ''}
    ${data.address ? `<p><b>Адрес:</b><br>${e(data.address)}</p>` : ''}${data.comment ? `<p><b>Комментарий:</b><br>${e(data.comment)}</p>` : ''}</section>
    <p class="section-title">СОСТАВ ЗАКАЗА</p><hr class="rule">
    ${data.lines.map(line => `<section class="item"><p class="item-name">${e(line.name)}</p><div class="row"><span>${e(line.quantity)}${line.quantity > 1 && !line.gift ? ` × ${money(line.unit)}` : ' шт'}</span><b class="amount">${line.gift ? 'ПОДАРОК' : money(line.amount)}</b></div>${line.components.map(component => `<p class="modifier">${e(component)}</p>`).join('')}${line.modifiers.map(mod => `<p class="modifier">${e(mod)}</p>`).join('')}</section>`).join('')}
    <hr class="rule"><section class="totals">${data.subtotal !== undefined ? row('Товары', data.subtotal) : ''}
    ${data.promo ? `<p>Промокод: ${e(data.promo)}</p>` : ''}${data.discount > 0 ? row('Скидка', -data.discount) : ''}
    ${data.deliveryFee !== undefined ? row('Доставка', data.deliveryFee) : ''}${data.serviceFee ? row('Сервисный сбор', data.serviceFee) : ''}
    <hr class="rule">${row('ИТОГО', data.total, 'total')}</section>
    <section class="payment"><p>Оплата: <b>${e(data.methodName)}</b></p><p>Статус: <b>${e(data.paymentLabel)}</b></p>
    ${data.paid > 0 ? row('Оплачено', data.paid) : ''}${row('К ПОЛУЧЕНИЮ', data.due, 'due')}
    ${data.cashGiven !== undefined ? row('Клиент даст', data.cashGiven) : ''}${data.change !== undefined ? row('ПОДГОТОВИТЬ СДАЧУ', data.change) : ''}
    ${data.overpaid > 0 ? row('Переплата', data.overpaid) : ''}</section><hr class="rule">
    <footer class="footer">${data.loyaltyEarned ? `<p>Начислено: +${escapePrint(data.loyaltyEarned)} бонусов</p>` : ''}${data.loyaltySpent ? `<p>Списано: −${escapePrint(data.loyaltySpent)} бонусов</p>` : ''}${data.loyaltyEarned && data.loyaltyBalance !== undefined ? `<p>Баланс после начисления: ${escapePrint(data.loyaltyBalance)} бонусов</p>` : ''}<p><b>Спасибо за ваш заказ!</b><br>Приятного аппетита!</p><div class="qr">${createReceiptQr()}</div>
    <p class="qr-caption">Сканируйте QR-код,<br>чтобы заказать снова</p><p class="footer-brand">${DAM_ALEM_BRAND}</p><p>sortirovka24.kz</p>
    <p class="disclaimer">Не является фискальным чеком</p><hr class="rule"></footer></main>`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Заказ ${e(data.number)} · ${DAM_ALEM_BRAND}</title><style>${receiptCss}</style></head><body>${body}</body></html>`;
}
