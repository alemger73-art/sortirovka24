import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { foodOperations, type OperatorOrder } from '@/lib/foodOperations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Line = {line_index?: number; id?: number; name?: string; quantity: number; modifiers: {option_id: number}[]};
type Catalog = {products: {id: number; name: string; price: number}[]; groups: {id: number; name: string; is_required: boolean; min_select: number; max_select: number}[]; options: {id: number; group_id: number; name: string; price: number}[]; links: {food_item_id: number; modifier_group_id: number}[]};
type Quote = {items: {name: string; quantity: number; sum: number}[]; total_amount: number; previous_total?: number; paid_amount?: number; amount_due?: number; refund_due?: number};

export default function OrderReceiptEditor({order, onClose, onSaved}: {order?: OperatorOrder; onClose: () => void; onSaved: (id: number) => void}) {
  const {t} = useLanguage();
  const [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState('');
  const [lines, setLines] = useState<Line[]>(() => {
    if (!order) return [];
    try { return JSON.parse(order.order_items).map((x: any, i: number) => ({...x, line_index: i})).filter((x: any) => !x.is_gift); } catch { return []; }
  });
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [address, setAddress] = useState('');
  const [method, setMethod] = useState('delivery'), [payment, setPayment] = useState('cash'), [comment, setComment] = useState('');
  const [reason, setReason] = useState(''), [search, setSearch] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null), [busy, setBusy] = useState(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const lock = useRef(false);
  useEffect(() => { let alive = true; foodOperations<Catalog>('/catalog').then(x => {if (alive) setCatalog(x);}).catch(e => {if (alive) setError(e.message);}); return () => {alive = false;}; }, []);
  const invalidate = () => {setQuote(null); setError('');};
  const modify = (next: Line[]) => {setLines(next); invalidate();};
  const body = () => ({items: lines.map(x => ({line_index: x.line_index, id: typeof x.id === 'number' ? x.id : undefined, quantity: x.quantity, modifiers: x.modifiers || []})),
    ...(order ? {expected_version: order.version || 0, reason} : {request_key: requestKey, customer_name: name, customer_phone: phone, delivery_address: address, delivery_method: method, payment_method: payment, comment}), quoted_total: quote?.total_amount});
  async function submit(save: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const path = order ? `/orders/${order.id}/receipt` : '/manual';
      if (save) {
        const result = await foodOperations<OperatorOrder>(path, 'POST', body());
        toast.success(t('workflow.saved')); onSaved(result.id);
      } else setQuote(await foodOperations<Quote>(path + '/quote', 'POST', body()));
    } catch (e) {setError((e as Error).message); if (save) setQuote(null);}
    finally {lock.current = false; setBusy(false);}
  }
  return <Dialog open onOpenChange={open => {if (!open && !busy) onClose();}}><DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t(order ? 'workflow.edit' : 'workflow.manual')}</DialogTitle></DialogHeader>
    <fieldset disabled={busy} className="space-y-4 min-w-0">
      {!order && <div className="grid sm:grid-cols-2 gap-3">
        <label>{t('workflow.name')}<Input value={name} maxLength={150} onChange={e => {setName(e.target.value); invalidate();}} /></label>
        <label>{t('workflow.phone')}<Input type="tel" value={phone} maxLength={32} onChange={e => {setPhone(e.target.value); invalidate();}} /></label>
        <label>{t('workflow.method')}<select className="w-full border rounded-lg p-2 bg-background" value={method} onChange={e => {setMethod(e.target.value); invalidate();}}><option value="delivery">{t('workflow.delivery')}</option><option value="pickup">{t('workflow.pickup')}</option></select></label>
        <label>{t('workflow.payment')}<select className="w-full border rounded-lg p-2 bg-background" value={payment} onChange={e => {setPayment(e.target.value); invalidate();}}><option value="cash">{t('workflow.cash')}</option><option value="kaspi_qr">Kaspi QR</option><option value="halyk_qr">Halyk QR</option></select></label>
        {method === 'delivery' && <label className="sm:col-span-2">{t('workflow.address')}<Input value={address} maxLength={1000} onChange={e => {setAddress(e.target.value); invalidate();}} /></label>}
        <label className="sm:col-span-2">{t('workflow.comment')}<Input value={comment} maxLength={1000} onChange={e => {setComment(e.target.value); invalidate();}} /></label>
      </div>}
      <label className="block">{t('workflow.search')}<Input value={search} onChange={e => setSearch(e.target.value)} /></label>
      {!catalog && !error && <p>{t('workflow.loading')}</p>}
      <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">{catalog?.products.filter(x => x.name.toLowerCase().includes(search.toLowerCase())).map(x => <Button key={x.id} variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => modify([...lines, {id: x.id, name: x.name, quantity: 1, modifiers: []}])}>{x.name} · {x.price} ₸ +</Button>)}</div>
      <div className="divide-y">{lines.map((line, i) => <div key={i} className="py-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center"><strong className="flex-1 basis-32 break-words">{line.name || catalog?.products.find(x => x.id === line.id)?.name}</strong><Input aria-label={`${t('workflow.quantity')} ${line.name}`} type="number" min={1} max={99} className="w-20" value={line.quantity} onChange={e => modify(lines.map((x,j) => j === i ? {...x, quantity: Number(e.target.value)} : x))} /><Button variant="outline" size="sm" onClick={() => modify(lines.filter((_,j) => i !== j))}>{t('workflow.remove')}</Button></div>
        {line.line_index == null && catalog?.groups.filter(g => catalog.links.some(l => l.food_item_id === line.id && l.modifier_group_id === g.id)).map(g => <fieldset key={g.id} className="rounded-lg border p-2"><legend className="text-sm">{g.name}{g.is_required || g.min_select > 0 ? ' *' : ''}</legend><div className="flex flex-wrap gap-3">{catalog.options.filter(o => o.group_id === g.id).map(o => <label key={o.id} className="text-sm flex gap-2 items-center"><input type="checkbox" checked={line.modifiers.some(m => m.option_id === o.id)} onChange={e => modify(lines.map((x,j) => j !== i ? x : {...x, modifiers: e.target.checked ? [...x.modifiers, {option_id:o.id}] : x.modifiers.filter(m => m.option_id !== o.id)}))} />{o.name} +{o.price} ₸</label>)}</div></fieldset>)}
      </div>)}</div>
      {order && <><p className="text-sm text-muted-foreground">{t('workflow.pricingPolicy')}</p><label className="block">{t('workflow.reason')}<Input value={reason} maxLength={500} placeholder={t('workflow.reasonHint')} onChange={e => {setReason(e.target.value); invalidate();}} /></label></>}
      {error && <p role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">{error}</p>}
      {quote && <div aria-live="polite" className="rounded-xl border bg-muted/40 p-4 space-y-2">{quote.items.map((x,i) => <p key={i} className="flex justify-between gap-3 text-sm"><span>{x.name} × {x.quantity}</span><span className="shrink-0">{x.sum} ₸</span></p>)}{quote.previous_total != null && <p>{t('workflow.before')}: {quote.previous_total} ₸</p>}<p className="font-bold text-lg">{t('workflow.total')}: {quote.total_amount} ₸</p>{quote.paid_amount != null && <p>{t('workflow.received')}: {quote.paid_amount} ₸</p>}{!!quote.amount_due && <p>{t('workflow.due')}: {quote.amount_due} ₸</p>}{!!quote.refund_due && <p className="text-amber-700 dark:text-amber-300">{t('workflow.refund')}: {quote.refund_due} ₸</p>}<p className="text-sm text-muted-foreground">{t(order ? 'workflow.customerSees' : 'workflow.manualHint')}</p></div>}
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onClose}>{t('workflow.cancel')}</Button><Button disabled={!lines.length || (!!order && reason.trim().length < 3)} onClick={() => void submit(!!quote)}>{busy ? t('workflow.loading') : t(quote ? 'workflow.confirm' : 'workflow.calculate')}</Button></div>
    </fieldset>
  </DialogContent></Dialog>;
}
