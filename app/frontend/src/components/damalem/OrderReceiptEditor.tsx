import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPublicLocale } from '@/i18n/publicLocale';
import { foodOperations, type OperatorOrder } from '@/lib/foodOperations';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Line = {line_index?: number; id?: number; name?: string; price?: number; modTotal?: number; quantity: number; modifiers: {option_id: number; name?: string}[]};
type Product = {id: number; name: string; price: number; category_id?: number};
type Catalog = {products: Product[]; categories?: {id: number; name: string}[]; groups: {id: number; name: string; is_required: boolean; min_select: number; max_select: number}[]; options: {id: number; group_id: number; name: string; price: number}[]; links: {food_item_id: number; modifier_group_id: number}[]};
type Quote = {items: {name: string; quantity: number; sum: number}[]; total_amount: number; subtotal?: number; delivery_fee?: number; service_fee?: number; discount?: number; adjustment?: number; previous_total?: number; paid_amount?: number; amount_due?: number; refund_due?: number; gift_choices?: {id: string; title: string}[]; gift_required?: boolean};
type Customer = {name: string; addresses: string[]; recent_orders: {id: number; amount: number; status: string}[]};

export default function OrderReceiptEditor({order, onClose, onSaved}: {order?: OperatorOrder; onClose: () => void; onSaved: (id: number) => void}) {
  const {t, lang} = useLanguage();
  const money = (value: number) => `${Number(value || 0).toLocaleString(getPublicLocale(lang), {maximumFractionDigits: 2})} ₸`;
  const [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState('');
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [lines, setLines] = useState<Line[]>(() => {
    if (!order) return [];
    try { const parsed = JSON.parse(order.order_items); return Array.isArray(parsed) ? parsed.map((x, i) => ({...x, modifiers: x.modifiers || [], line_index: i})).filter(x => !x.is_gift) : []; } catch { return []; }
  });
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [address, setAddress] = useState('');
  const [method, setMethod] = useState('delivery'), [payment, setPayment] = useState('cash'), [comment, setComment] = useState('');
  const [reason, setReason] = useState(''), [search, setSearch] = useState(''), [category, setCategory] = useState<number | null>(null);
  const [quoteState, setQuoteState] = useState<{key: string; value: Quote} | null>(null), [busy, setBusy] = useState(false);
  const [calculating, setCalculating] = useState(false), [attempt, setAttempt] = useState(0);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [giftId, setGiftId] = useState(() => {try {return order ? JSON.parse(order.order_items).find((x: {is_gift?: boolean}) => x.is_gift)?.gift_id || '' : '';} catch {return '';}});
  const [customer, setCustomer] = useState<Customer | null>(null);
  const lock = useRef(false), quoteGeneration = useRef(0);
  useEffect(() => { let alive = true; foodOperations<Catalog>('/catalog').then(x => {if (alive) {setCatalog(x); setError('');}}).catch(e => {if (alive) setError(e.message);}); return () => {alive = false;}; }, [catalogAttempt]);
  useEffect(() => {
    let alive = true; setCustomer(null);
    if (order || phone.replace(/\D/g, '').length < 10) return;
    const timer = setTimeout(() => { void foodOperations<Customer>(`/customer?phone=${encodeURIComponent(phone)}`).then(v => {if (alive) setCustomer(v);}).catch(() => { /* Optional CRM lookup must not block taking the call. */ }); }, 500);
    return () => {alive = false; clearTimeout(timer);};
  }, [phone, order]);
  const payload = useMemo(() => ({selected_gift_id: giftId || undefined, items: lines.map(x => ({line_index: x.line_index, id: typeof x.id === 'number' ? x.id : undefined, quantity: x.quantity, modifiers: x.modifiers || []})),
    ...(order ? {expected_version: order.version || 0, reason} : {request_key: requestKey, customer_name: name.trim() || (method === 'dine_in' ? t('workflow.guest') : ''), customer_phone: phone, delivery_address: method === 'delivery' ? address : '', delivery_method: method, payment_method: payment, comment})}), [lines, giftId, order, reason, requestKey, name, phone, address, method, payment, comment, t]);
  const key = JSON.stringify(payload);
  const validOptions = lines.every(line => line.line_index != null || catalog?.groups.filter(g => catalog.links.some(l => l.food_item_id === line.id && l.modifier_group_id === g.id)).every(g => {
    const count = line.modifiers.filter(m => catalog.options.some(o => o.id === m.option_id && o.group_id === g.id)).length;
    return count >= Math.max(g.min_select || 0, g.is_required ? 1 : 0) && (!g.max_select || count <= g.max_select);
  }));
  const ready = !!catalog && lines.length > 0 && validOptions && lines.every(x => Number.isInteger(x.quantity) && x.quantity >= 1 && x.quantity <= 99) && (order ? reason.trim().length >= 3 : (method === 'dine_in' || (!!name.trim() && phone.replace(/\D/g, '').length >= 10)) && (method !== 'delivery' || !!address.trim()));
  const quote = quoteState?.key === key ? quoteState.value : null;
  const path = order ? `/orders/${order.id}/receipt` : '/manual';
  useEffect(() => {
    const gen = ++quoteGeneration.current;
    setError('');
    if (!ready) {setCalculating(false); return;}
    setCalculating(true);
    const timer = setTimeout(() => { void foodOperations<Quote>(path + '/quote', 'POST', JSON.parse(key)).then(value => {
      if (gen === quoteGeneration.current) setQuoteState({key, value});
    }).catch(e => {if (gen === quoteGeneration.current) {setQuoteState(null); setError(e.message);}}).finally(() => {if (gen === quoteGeneration.current) setCalculating(false);}); }, 350);
    return () => {clearTimeout(timer); quoteGeneration.current++;};
  }, [key, ready, path, attempt]);
  const groupsFor = (id?: number) => catalog?.groups.filter(g => catalog.links.some(l => l.food_item_id === id && l.modifier_group_id === g.id)) || [];
  function add(product: Product, separate = false) {
    const existing = lines.findIndex(x => x.id === product.id && x.line_index == null);
    if (existing >= 0 && !separate) {setLines(lines.map((x, i) => i === existing ? {...x, quantity: Math.min(99, x.quantity + 1)} : x)); return;}
    const defaults = groupsFor(product.id).flatMap(g => (catalog?.options.filter(o => o.group_id === g.id) || []).slice(0, Math.max(g.min_select || 0, g.is_required ? 1 : 0)).map(o => ({option_id: o.id})));
    setLines([...lines, {id: product.id, name: product.name, quantity: 1, modifiers: defaults}]);
  }
  function quantity(index: number, next: number) {if (Number.isInteger(next) && next >= 1 && next <= 99) setLines(lines.map((x, i) => i === index ? {...x, quantity: next} : x));}
  function option(index: number, groupId: number, optionId: number, checked: boolean) {
    const group = catalog?.groups.find(g => g.id === groupId);
    setLines(lines.map((x, i) => {
      if (i !== index) return x;
      const others = group?.max_select === 1 && checked ? x.modifiers.filter(m => !catalog?.options.some(o => o.id === m.option_id && o.group_id === groupId)) : x.modifiers.filter(m => m.option_id !== optionId);
      return {...x, modifiers: checked ? [...others, {option_id: optionId}] : others};
    }));
  }
  const unit = (line: Line) => line.line_index != null ? Number(line.price || 0) + Number(line.modTotal || 0) : Number(catalog?.products.find(x => x.id === line.id)?.price || 0) + line.modifiers.reduce((sum, m) => sum + Number(catalog?.options.find(o => o.id === m.option_id)?.price || 0), 0);
  const draftSubtotal = lines.reduce((sum, line) => sum + unit(line) * line.quantity, 0);
  async function save() {
    if (lock.current || !ready || !quote || calculating || quote.gift_required) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await foodOperations<OperatorOrder>(path, 'POST', {...payload, quoted_total: quote.total_amount});
      toast.success(`${t('workflow.saved')} №${result.id}`); onSaved(result.id);
    } catch (e) {setError((e as Error).message);}
    finally {lock.current = false; setBusy(false);}
  }
  const products = catalog?.products.filter(x => (category == null || x.category_id === category) && x.name.toLowerCase().includes(search.toLowerCase())) || [];
  const categories = (catalog?.categories || []).filter(c => catalog?.products.some(p => p.category_id === c.id));
  return <Dialog open onOpenChange={open => {if (!open && !busy) onClose();}}><DialogContent className="w-[calc(100%-1rem)] max-w-7xl max-h-[95dvh] overflow-y-auto p-4 sm:p-6"><DialogHeader><DialogTitle>{t(order ? 'workflow.edit' : 'workflow.manual')}</DialogTitle></DialogHeader>
    <fieldset disabled={busy} className="min-w-0 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,1fr)]">
      <section className="min-w-0 space-y-4">
        {!order && <div className="grid sm:grid-cols-2 gap-3 rounded-xl border p-4">
          <label>{t('workflow.name')}<Input value={name} maxLength={150} onChange={e => setName(e.target.value)} /></label>
          <label>{t(method === 'dine_in' ? 'workflow.optionalPhone' : 'workflow.phone')}<Input type="tel" value={phone} maxLength={32} onChange={e => setPhone(e.target.value)} /></label>
          {customer?.name && <div className="sm:col-span-2 text-sm rounded-lg bg-muted p-3"><Button type="button" variant="outline" onClick={() => {setName(customer.name); if (customer.addresses[0]) setAddress(customer.addresses[0]);}}>{t('pos.useCustomer')} · {customer.name}</Button><p className="mt-2">{t('pos.recentOrders')}: {customer.recent_orders.map(o => `№${o.id} · ${money(o.amount)}`).join('; ')}</p>{customer.addresses.length > 1 && <select aria-label={t('workflow.address')} value={address} className="w-full mt-2 rounded-lg border bg-background p-2" onChange={e => setAddress(e.target.value)}><option value="">{t('workflow.address')}</option>{customer.addresses.map(a => <option key={a}>{a}</option>)}</select>}</div>}
          <label>{t('workflow.method')}<select className="w-full border rounded-lg p-3 bg-background" value={method} onChange={e => setMethod(e.target.value)}><option value="delivery">{t('workflow.delivery')}</option><option value="pickup">{t('workflow.pickup')}</option><option value="dine_in">{t('workflow.onsite')}</option></select></label>
          <label>{t('workflow.payment')}<select className="w-full border rounded-lg p-3 bg-background" value={payment} onChange={e => setPayment(e.target.value)}><option value="cash">{t('workflow.cash')}</option><option value="kaspi_qr">Kaspi QR</option><option value="halyk_qr">Halyk QR</option></select></label>
          {method === 'delivery' && <label className="sm:col-span-2">{t('workflow.address')}<Input value={address} maxLength={1000} onChange={e => setAddress(e.target.value)} /></label>}
          <label className="sm:col-span-2">{t('workflow.comment')}<Input value={comment} maxLength={1000} onChange={e => setComment(e.target.value)} /></label>
        </div>}
        <label className="block">{t('workflow.search')}<Input value={search} onChange={e => setSearch(e.target.value)} /></label>
        <nav aria-label={t('pos.categories')} className="flex flex-wrap gap-2"><Button variant={category == null ? 'default' : 'outline'} onClick={() => setCategory(null)}>{t('pos.all')}</Button>{categories.map(c => <Button key={c.id} variant={category === c.id ? 'default' : 'outline'} onClick={() => setCategory(c.id)}>{c.name}</Button>)}</nav>
        {!catalog && <Button variant="outline" onClick={() => setCatalogAttempt(v => v + 1)}>{t('pos.reloadMenu')}</Button>}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:max-h-[55dvh] lg:overflow-y-auto p-1">{products.map(x => {
          const count = lines.filter(l => l.id === x.id).reduce((sum, l) => sum + l.quantity, 0);
          return <button type="button" key={x.id} onClick={() => add(x)} className={`min-h-28 rounded-xl border p-4 text-left flex flex-col justify-between gap-3 transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring ${count ? 'border-primary bg-primary/10' : 'bg-card'}`}><strong className="break-words">{x.name}</strong><span className="flex flex-wrap justify-between gap-2"><span>{money(x.price)}</span><span className="font-bold">{count ? `× ${count}` : '+'}</span></span></button>;
        })}</div>{catalog && !products.length && <p className="text-muted-foreground">{t('pos.noProducts')}</p>}
      </section>
      <aside className="min-w-0 rounded-2xl border bg-card p-4 space-y-4 lg:sticky lg:top-0 self-start">
        <h3 className="text-lg font-bold">{t('pos.basket')}</h3>
        {!lines.length && <p className="text-muted-foreground py-6">{t('pos.empty')}</p>}
        <div className="divide-y lg:max-h-[40dvh] lg:overflow-y-auto">{lines.map((line, i) => <div key={i} className="py-3 space-y-2">
          <div className="flex justify-between gap-3"><strong className="break-words">{line.name}</strong><strong className="shrink-0">{money(unit(line) * line.quantity)}</strong></div>
          <div className="flex flex-wrap gap-2 items-center"><span className="text-sm text-muted-foreground flex-1">{money(unit(line))}</span><Button aria-label={`${t('pos.less')} ${line.name}`} variant="outline" className="h-11 w-11 p-0" disabled={line.quantity <= 1} onClick={() => quantity(i, line.quantity - 1)}>−</Button><Input aria-label={`${t('workflow.quantity')} ${line.name}`} type="number" min={1} max={99} className="w-16 text-center h-11" value={line.quantity} onChange={e => quantity(i, Number(e.target.value))} /><Button aria-label={`${t('pos.more')} ${line.name}`} variant="outline" className="h-11 w-11 p-0" disabled={line.quantity >= 99} onClick={() => quantity(i, line.quantity + 1)}>+</Button><Button variant="ghost" onClick={() => setLines(lines.filter((_,j) => i !== j))}>{t('workflow.remove')}</Button></div>
          {line.line_index != null && line.modifiers.length > 0 && <p className="text-sm text-muted-foreground">{line.modifiers.map(m => m.name).filter(Boolean).join(', ')}</p>}
          {line.line_index == null && groupsFor(line.id).map(g => <fieldset key={g.id} className="rounded-lg border p-2"><legend className="text-sm">{g.name}{g.is_required || g.min_select > 0 ? ' *' : ''}</legend><div className="flex flex-wrap gap-2">{catalog?.options.filter(o => o.group_id === g.id).map(o => {
            const checked = line.modifiers.some(m => m.option_id === o.id);
            const count = line.modifiers.filter(m => catalog.options.some(x => x.id === m.option_id && x.group_id === g.id)).length;
            return <label key={o.id} className="text-sm flex gap-2 items-center rounded-lg bg-muted p-3"><input type={g.max_select === 1 && (g.is_required || g.min_select > 0) ? 'radio' : 'checkbox'} name={`line-${i}-group-${g.id}`} checked={checked} disabled={!checked && g.max_select > 1 && count >= g.max_select} onChange={e => option(i, g.id, o.id, e.target.checked)} />{o.name} +{money(o.price)}</label>;
          })}</div>{catalog && !products.length && <p className="text-muted-foreground">{t('pos.noProducts')}</p>}</fieldset>)}
          {line.line_index == null && groupsFor(line.id).length > 0 && <Button variant="outline" size="sm" onClick={() => {const product = catalog?.products.find(p => p.id === line.id); if (product) add(product, true);}}>{t('pos.variant')}</Button>}
        </div>)}</div>
        {order && <label className="block">{t('workflow.reason')}<Input value={reason} maxLength={500} placeholder={t('workflow.reasonHint')} onChange={e => setReason(e.target.value)} /></label>}
        {!!quote?.gift_choices?.length && <label className="block">{t('workflow.gift')}<select className="w-full border rounded-lg p-3 bg-background" value={quote.gift_choices.some(g => g.id === giftId) ? giftId : quote.gift_choices.length === 1 ? quote.gift_choices[0].id : ''} onChange={e => setGiftId(e.target.value)}><option value="">{t('workflow.chooseGift')}</option>{quote.gift_choices.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>}
        <div aria-live="polite" className="border-t pt-3 space-y-2"><p className="flex justify-between"><span>{t('pos.subtotal')}</span><span>{money(quote?.subtotal ?? draftSubtotal)}</span></p>
          {quote && <>{quote.delivery_fee != null && <p className="flex justify-between"><span>{t('workflow.delivery')}</span><span>{money(quote.delivery_fee)}</span></p>}{!!quote.service_fee && <p className="flex justify-between"><span>{t('pos.service')}</span><span>{money(quote.service_fee)}</span></p>}{!!quote.discount && <p className="flex justify-between"><span>{t('pos.discount')}</span><span>−{money(quote.discount)}</span></p>}{quote.adjustment != null && <p className="flex justify-between"><span>{t('pos.adjustment')}</span><span>{money(quote.adjustment)}</span></p>}<p className="text-xl font-bold flex justify-between"><span>{t('workflow.total')}</span><span>{money(quote.total_amount)}</span></p>{quote.paid_amount != null && <p>{t('workflow.received')}: {money(quote.paid_amount)}</p>}{!!quote.amount_due && <p>{t('workflow.due')}: {money(quote.amount_due)}</p>}{!!quote.refund_due && <p>{t('workflow.refund')}: {money(quote.refund_due)}</p>}</>}
          {!ready && <p className="text-sm text-muted-foreground">{t(order ? 'pos.editHint' : 'pos.fillHint')}</p>}{calculating && <p role="status">{t('pos.calculating')}</p>}
        </div>
        {error && <div role="alert" className="rounded-xl bg-destructive/10 text-destructive p-3"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(v => v + 1)}>{t('pos.retry')}</Button></div>}
        <Button className="w-full h-auto min-h-14 text-base whitespace-normal" disabled={busy || !ready || calculating || !quote || !!quote.gift_required} onClick={() => void save()}>{busy ? t('workflow.loading') : `${t(order ? 'workflow.confirm' : 'pos.create')}${quote ? ` — ${money(quote.total_amount)}` : ''}`}</Button>
        <Button className="w-full" variant="outline" onClick={onClose}>{t('workflow.cancel')}</Button>
      </aside>
    </fieldset>
  </DialogContent></Dialog>;
}
