import { Capacitor, registerPlugin } from '@capacitor/core';
import { getPublicLanguage } from '@/i18n/publicLocale';
import { workflowTranslations as labels } from '@/i18n/workflowTranslations';
import { parseOrderItems, orderLineQuantity, orderLineTotal } from '@/lib/orderRoutes';
import { isSameDamAlemBrand } from './damAlem';
import { createReceiptData, renderReceiptHtml, escapePrint, type PrintableOrder } from './damReceipt';
export { escapePrint, type PrintableOrder } from './damReceipt';

const ReceiptPrinter = registerPlugin<{print(options: {html: string; title: string; paperWidthMm?: number; paperHeightMm?: number}): Promise<void>}>('ReceiptPrinter');
let printInProgress = false;

/** Fit the roll to the rendered document, including QR. No fixed A4/blank tail. */
export function fitReceiptPage(doc: Document): number {
  const receipt = doc.querySelector<HTMLElement>('.receipt');
  if (!receipt) throw new Error('Шаблон чека не загружен');
  const heightMm = Math.ceil(receipt.getBoundingClientRect().height * 25.4 / 96) + 2;
  const style = doc.createElement('style'); style.id = 'receipt-paper-size';
  style.textContent = `@page{size:58mm ${heightMm}mm;margin:0}`;
  doc.getElementById(style.id)?.remove(); doc.head.appendChild(style);
  return heightMm;
}

async function dispatchPrint(title: string, html: string, thermal = false) {
  if (printInProgress) return;
  printInProgress = true;
  let frame: HTMLIFrameElement | undefined;
  try {
    const native = Capacitor.isNativePlatform();
    if (native && !Capacitor.isPluginAvailable('ReceiptPrinter')) throw new Error(labels['workflow.printUpdate'][getPublicLanguage()]);
    // Measure the exact same HTML for browser and native, in an isolated frame.
    document.getElementById('receipt-print-frame')?.remove();
    frame = document.createElement('iframe'); frame.id = 'receipt-print-frame'; frame.title = title;
    Object.assign(frame.style, {position: 'fixed', left: '-10000px', top: '0', width: thermal ? '58mm' : '80mm', height: '1px', border: '0'});
    const loaded = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Не удалось подготовить печать')), 10000);
      frame!.onload = () => {window.clearTimeout(timer); resolve();};
      frame!.onerror = () => {window.clearTimeout(timer); reject(new Error('Не удалось загрузить чек'));};
    });
    frame.srcdoc = html; document.body.appendChild(frame); await loaded;
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !win) throw new Error('Печать недоступна');
    await doc.fonts.ready;
    const height = thermal ? fitReceiptPage(doc) : undefined;
    if (native) {
      await ReceiptPrinter.print({html: '<!doctype html>' + doc.documentElement.outerHTML, title,
        ...(thermal ? {paperWidthMm: 58, paperHeightMm: height} : {})});
      frame.remove();
    } else {
      win.addEventListener('afterprint', () => frame?.remove(), {once: true});
      win.focus(); win.print();
    }
  } catch (error) { frame?.remove(); throw error; }
  finally { printInProgress = false; }
}

// Payroll/general documents retain their existing layout and printer defaults.
export async function printDocument(title: string, content: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapePrint(title)}</title><style>@page{size:auto;margin:8mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#000;background:#fff;max-width:76mm;margin:0 auto}h1{font-size:18px}h2{font-size:15px}p{margin:6px 0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px 2px;border-bottom:1px dashed #aaa;vertical-align:top;overflow-wrap:anywhere}td:last-child,th:last-child{text-align:right;white-space:nowrap}small{font-size:10px}hr{border:0;border-top:1px dashed #777}</style></head><body>${content}</body></html>`;
  await dispatchPrint(title, html);
}

export async function printOrder(order: PrintableOrder) {
  const brand = order.restaurant_name || order.store_label;
  if (!brand || isSameDamAlemBrand(brand)) {
    const data = createReceiptData(order);
    await dispatchPrint(`Заказ №${data.number} · DAM ALEM 2.0`, renderReceiptHtml(data), true);
    return;
  }
  // Other businesses using the shared legacy courier print keep their branding.
  const lang = getPublicLanguage(), t = (key: keyof typeof labels) => labels[key][lang];
  const total = Number(order.total_amount ?? order.amount ?? 0);
  const received = Number(order.paid_amount ?? (order.payment_status === 'paid' ? total : 0));
  const title = `${t('workflow.receipt')} №${order.order_number ?? order.id}`;
  const rows = parseOrderItems(order.order_items).map(line => `<tr><td>${escapePrint(line.name || line.title)}<br><small>${escapePrint(orderLineQuantity(line))} × ${escapePrint(Number(line.price || 0) + Number(line.modTotal || 0))} ₸</small></td><td>${escapePrint(orderLineTotal(line))} ₸</td></tr>`).join('');
  await printDocument(title, `<h1>${escapePrint(brand)}</h1><h2>${escapePrint(title)}</h2><p>${escapePrint(order.created_at ? new Date(order.created_at).toLocaleString(lang === 'kz' ? 'kk-KZ' : 'ru-RU') : '')}</p><p>${escapePrint(order.customer_name)} ${escapePrint(order.customer_phone)}</p><p>${escapePrint(order.delivery_method === 'dine_in' ? t('workflow.onsite') : order.delivery_method === 'pickup' ? t('workflow.pickup') : order.delivery_address || order.dropoff_address)}</p><table>${rows}</table><h2>${escapePrint(t('workflow.total'))}: ${total} ₸</h2><p>${escapePrint(t('workflow.received'))}: ${received} ₸</p><p>${escapePrint(t(received > total ? 'workflow.refund' : 'workflow.due'))}: ${Math.abs(total - received)} ₸</p><hr><small>${escapePrint(t('workflow.nonFiscal'))}</small>`);
}
