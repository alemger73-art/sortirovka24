import { Capacitor, registerPlugin } from '@capacitor/core';
import { getPublicLanguage } from '@/i18n/publicLocale';
import { workflowTranslations as labels } from '@/i18n/workflowTranslations';
import { parseOrderItems, orderLineQuantity, orderLineTotal } from '@/lib/orderRoutes';

const ReceiptPrinter = registerPlugin<{print(options: {html: string; title: string}): Promise<void>}>('ReceiptPrinter');
export const escapePrint = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function printDocument(title: string, content: string) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapePrint(title)}</title><style>@page{size:auto;margin:8mm}*{box-sizing:border-box}body{font:13px Arial,sans-serif;color:#000;background:#fff;max-width:76mm;margin:0 auto}h1{font-size:18px}h2{font-size:15px}p{margin:6px 0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:5px 2px;border-bottom:1px dashed #aaa;vertical-align:top;overflow-wrap:anywhere}td:last-child,th:last-child{text-align:right;white-space:nowrap}small{font-size:10px}hr{border:0;border-top:1px dashed #777}</style></head><body>${content}</body></html>`;
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('ReceiptPrinter')) throw new Error(labels['workflow.printUpdate'][getPublicLanguage()]);
    await ReceiptPrinter.print({html, title}); return;
  }
  document.getElementById('receipt-print-frame')?.remove();
  const frame=document.createElement('iframe');frame.id='receipt-print-frame';frame.title=title;
  Object.assign(frame.style,{position:'fixed',left:'-10000px',top:'0',width:'1px',height:'1px',border:'0'});
  frame.srcdoc=html;
  await new Promise<void>((resolve,reject)=>{
    frame.onload=()=>{try {const win=frame.contentWindow;if(!win) throw new Error('Print unavailable');win.addEventListener('afterprint',()=>frame.remove(),{once:true});win.focus();win.print();resolve();}catch(e){frame.remove();reject(e);}};
    document.body.appendChild(frame);
  });
}

export type PrintableOrder = {id?: string | number; order_number?: string | number; total_amount?: number | null; amount?: number; order_items?: string | null; customer_name?: string | null; customer_phone?: string | null; delivery_address?: string | null; dropoff_address?: string | null; delivery_method?: string | null; paid_amount?: number | null; payment_status?: string | null; receipt_revision?: number | null; created_at?: string | null; restaurant_name?: string | null; store_label?: string | null; status?: string | null};
export async function printOrder(order: PrintableOrder) {
  const lang=getPublicLanguage();const t=(key:keyof typeof labels)=>labels[key][lang];
  const total=Number(order.total_amount ?? order.amount ?? 0);
  const received=Number(order.paid_amount ?? (order.payment_status==='paid' ? total : 0));
  const id=order.order_number ?? order.id;
  const title=`${t('workflow.receipt')} №${id}`;
  const rows=parseOrderItems(order.order_items).map(line=>`<tr><td>${escapePrint(line.name || line.title)}<br><small>${escapePrint(orderLineQuantity(line))} × ${escapePrint(Number(line.price || 0)+Number(line.modTotal || 0))} ₸</small></td><td>${escapePrint(orderLineTotal(line))} ₸</td></tr>`).join('');
  await printDocument(title,`<h1>${escapePrint(order.restaurant_name || order.store_label || 'DAM ALEM 2.0')}</h1><h2>${escapePrint(title)}</h2><p>${escapePrint(order.created_at ? new Date(order.created_at).toLocaleString(lang==='kz'?'kk-KZ':'ru-RU') : '')}</p>${order.receipt_revision ? `<p>${escapePrint(t('workflow.changed'))} · №${order.receipt_revision}</p>` : ''}<p>${escapePrint(order.customer_name)} ${escapePrint(order.customer_phone)}</p><p>${escapePrint(order.delivery_method === 'dine_in' ? t('workflow.onsite') : order.delivery_method === 'pickup' ? t('workflow.pickup') : order.delivery_address || order.dropoff_address)}</p><table>${rows}</table><h2>${escapePrint(t('workflow.total'))}: ${total} ₸</h2><p>${escapePrint(t('workflow.received'))}: ${received} ₸</p><p>${escapePrint(t(received>total?'workflow.refund':'workflow.due'))}: ${Math.abs(total-received)} ₸</p><hr><small>${escapePrint(t('workflow.nonFiscal'))}</small>`);
}
