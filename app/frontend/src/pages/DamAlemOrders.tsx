import PrintReceiptButton from '@/components/PrintReceiptButton';
import OrderReceiptEditor from '@/components/damalem/OrderReceiptEditor';
import { useLanguage } from '@/contexts/LanguageContext';
import { getPublicLocale } from '@/i18n/publicLocale';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { foodBusiness, foodOperations, type OperatorOrder, type OrderDetail } from '@/lib/foodOperations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';



function getNotifyLabels(adminT: (key: string) => string) {
const notifyLabels: Record<string, string> = { pending: adminT('admin.dam.final.128'), sending: adminT('admin.dam.final.129'), sent: adminT('admin.dam.final.130'), failed: adminT('admin.dam.final.131'), unknown: adminT('admin.dam.final.132'), none: adminT('admin.dam.final.133') };
return notifyLabels;
}
const next: Record<string, string> = { new: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'in_progress', in_progress: 'done' };

function Items({ raw }: { raw: string }) {
  const money = (value: number) => `${Number(value || 0).toLocaleString(locale)} ₸`;

  const { t: adminT, lang } = useLanguage();
  const locale = getPublicLocale(lang);

  let items: { name?: string; quantity?: number; price?: number; modTotal?: number; modifiers?: { name?: string }[] }[] = [];
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) items = parsed.filter(x => x && typeof x === 'object'); } catch { /* legacy malformed order */ }
  return <div className="divide-y">{items.length ? items.map((item, i) => <div key={i} className="flex justify-between gap-3 py-3 text-sm"><span className="break-words">{item.name || adminT('admin.dam.final.049')} × {Number(item.quantity || 1).toLocaleString(locale)}{Array.isArray(item.modifiers) && item.modifiers.length > 0 && <small className="block text-muted-foreground">{item.modifiers.map(m => m?.name).filter(Boolean).join(', ')}</small>}</span><strong className="shrink-0">{money(((item.price || 0) + (item.modTotal || 0)) * (item.quantity || 1))}</strong></div>) : <p>{adminT('admin.dam.final.134')}</p>}</div>;
}

export default function DamAlemOrders() {
  const money = (value: number) => `${Number(value || 0).toLocaleString(locale)} ₸`;

  const date = (value: string) => value ? new Date(value).toLocaleString(locale, { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  const { t: adminT, lang } = useLanguage();
  const locale = getPublicLocale(lang);
  const notifyLabels = getNotifyLabels(adminT);
  const orderLabels: Record<string, string> = {
    new: adminT('admin.dam.orderStatus.new'),
    confirmed: adminT('admin.dam.orderStatus.confirmed'),
    preparing: adminT('admin.dam.orderStatus.preparing'),
    ready: adminT('admin.dam.orderStatus.ready'),
    in_progress: adminT('admin.dam.orderStatus.in_progress'),
    done: adminT('admin.dam.orderStatus.done'),
    cancelled: adminT('admin.dam.orderStatus.cancelled'),
  };
  const orderStatusClass: Record<string, string> = {
    new: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-100',
    confirmed: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100',
    preparing: 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-100',
    ready: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100',
    in_progress: 'bg-blue-100 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100',
    done: 'bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
    cancelled: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-200',
  };


  const sourceLabels: Record<string, string> = {app: adminT('pos.sourceApp'), operator: adminT('pos.sourceOperator'), whatsapp: 'WhatsApp', instagram: 'Instagram'};
  const [source, setSource] = useState('');
  const [queueCounts, setQueueCounts] = useState<Record<string, number>>({});
  const [summary, setSummary] = useState<{daily?: {created: number; order_total: number}; counts: Record<string, number>; unpaid: number; notification_errors: number} | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [receiptEditor, setReceiptEditor] = useState<'manual' | 'edit' | null>(null);
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get('order')) || null;
  const requestedStatus = params.get('status') ?? 'active';
  const [rows, setRows] = useState<OperatorOrder[]>([]), [total, setTotal] = useState(0);
  const [status, setStatus] = useState(requestedStatus), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [lastLoaded, setLastLoaded] = useState('');
  const [detail, setDetail] = useState<OrderDetail | null>(null), [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [address, setAddress] = useState(''), [reason, setReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false), [editing, setEditing] = useState(false);
  const lock = useRef(false), generation = useRef(0);
  const latestInteraction = useRef({ selected, editing, cancelOpen, busy });
  latestInteraction.current = { selected, editing: editing || !!receiptEditor, cancelOpen, busy };
  useEffect(() => { setStatus(requestedStatus); setPage(0); }, [requestedStatus]);
  useEffect(() => {
    if (selected) return;
    let alive = true;
    const refresh = () => { void foodBusiness<{daily?: {created: number; order_total: number}; counts: Record<string, number>; unpaid: number; notification_errors: number}>('/today').then(v => {if (alive) {setSummary(v); setSummaryError(false);}}).catch(() => {if (alive) setSummaryError(true);}); };
    refresh(); const timer = setInterval(refresh, 15000);
    return () => {alive = false; clearInterval(timer);};
  }, [selected]);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void foodOperations<Record<string, number>>('/order-counts').then(value => { if (alive) setQueueCounts(value); }).catch(() => undefined); };
    refresh(); const timer = window.setInterval(refresh, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  const load = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const data = await foodOperations<{ items: OperatorOrder[]; total: number }>(`/orders?status=${status}&source=${source}&q=${encodeURIComponent(search)}&skip=${page * 30}`);
      if (gen !== generation.current) return;
      setRows(data.items); setTotal(data.total); setError(''); setLastLoaded(new Date().toISOString());
    } catch (e) { if (gen === generation.current) setError((e as Error).message); }
    finally { if (gen === generation.current) setLoading(false); }
  }, [status, source, search, page]);
  useEffect(() => { setLoading(true); const timer = window.setTimeout(load, 250); return () => { clearTimeout(timer); generation.current++; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 3000); return () => clearInterval(timer); }, [load]);
  const refreshDetail = useCallback(async (automatic = false) => {
    if (!selected) return;
    const data = await foodOperations<OrderDetail>(`/orders/${selected}`);
    const latest = latestInteraction.current;
    if (latest.selected !== selected || (automatic && (latest.editing || latest.cancelOpen || latest.busy))) return;
    setDetail(data); setDetailError(''); return data;
  }, [selected]);
  useEffect(() => {
    let alive = true; setDetail(null); setDetailError(''); setEditing(false); setCancelOpen(false); setReason('');
    if (selected) foodOperations<OrderDetail>(`/orders/${selected}`).then(data => { if (alive) { setDetail(data); setNote(data.order.operator_note || ''); setAddress(data.order.delivery_address || ''); } }).catch(e => { if (alive) setDetailError(e.message); });
    return () => { alive = false; };
  }, [selected]);
  useEffect(() => {
    if (!selected || editing || cancelOpen || busy) return;
    const timer = window.setInterval(() => { if (!document.hidden) void refreshDetail(true).catch(e => { if (latestInteraction.current.selected === selected) setDetailError(e.message); }); }, 3000);
    return () => clearInterval(timer);
  }, [selected, editing, cancelOpen, busy, refreshDetail]);
  async function change(values: Record<string, unknown>) {
    if (!detail || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await foodOperations(`/orders/${detail.order.id}`, 'PATCH', { expected_version: detail.order.version || 0, ...values });
      await refreshDetail(); await load(); setEditing(false); setCancelOpen(false); toast.success(adminT('admin.dam.final.135'));
    } catch (e) { toast.error((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function retry(eventId: number, unknown: boolean) {
    if (lock.current) return;
    if (unknown && !window.confirm(adminT('admin.dam.final.136'))) return;
    lock.current = true; setBusy(true);
    try { await foodOperations(`/orders/${selected}/notifications/${eventId}/retry`, 'POST'); await refreshDetail(); toast.success(adminT('admin.dam.final.137')); }
    catch (e) { toast.error((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const order = detail?.order;
  const isDelivery = ['delivery', 'доставка'].includes(order?.delivery_method || '');
  const closed = order && ['done', 'cancelled'].includes(order.status);
  const target = isDelivery && ['ready', 'in_progress'].includes(order?.status || '') ? '' : order?.status === 'ready' && !isDelivery ? 'done' : next[order?.status || ''];
  const statusTabs = [
    { key: '', label: adminT('admin.dam.final.149'), count: queueCounts.all, style: 'border-slate-300 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100' },
    { key: 'new', label: orderLabels.new, count: queueCounts.new, style: 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/50 dark:text-red-100' },
    { key: 'working', label: adminT('pos.working'), count: queueCounts.working, style: 'border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100' },
    { key: 'ready', label: adminT('admin.dam.queue.readyPickup'), count: queueCounts.ready, style: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100' },
    { key: 'courier', label: adminT('admin.dam.queue.waitCourier'), count: queueCounts.courier, style: 'border-violet-300 bg-violet-50 text-violet-900 dark:bg-violet-950/50 dark:text-violet-100' },
    { key: 'in_progress', label: orderLabels.in_progress, count: queueCounts.in_progress, style: 'border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100' },
    { key: 'done', label: orderLabels.done, count: queueCounts.done, style: 'border-slate-300 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100' },
  ];
  return <div className="space-y-5 min-w-0">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-bold">{adminT('admin.dam.final.138')}</h3><p className="text-sm text-muted-foreground">{adminT('pos.live')} {lastLoaded ? adminT('admin.dam.final.140').replace('{0}', () => String(new Date(lastLoaded).toLocaleTimeString(locale))) : adminT('admin.dam.final.141')}</p></div><Button variant="outline" onClick={() => void load()}>{adminT('admin.dam.final.142')}</Button></div>
    <Button onClick={() => setReceiptEditor('manual')}>{adminT('workflow.manual')}</Button>
    {receiptEditor && <OrderReceiptEditor order={receiptEditor === 'edit' ? order : undefined} onClose={() => setReceiptEditor(null)} onSaved={id => {const manual = receiptEditor === 'manual'; setReceiptEditor(null); const p = new URLSearchParams(params); if (manual) {setStatus('active'); setSource(''); setSearch(''); setPage(0); p.set('status','active');} p.set('section','orders'); p.set('order',String(id)); setParams(p); void load(); if (id === selected) void refreshDetail().catch(e => toast.error(e.message));}} />}
    <p className="rounded-xl bg-blue-50 dark:bg-blue-950/40 p-3 text-sm text-blue-900 dark:text-blue-100">{adminT('workflow.queueHelp')}</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-red-800">{error}  {adminT('admin.dam.final.144')}</p>}
    <div className="flex flex-wrap gap-3"><Input aria-label={adminT('admin.dam.final.145')} className="min-w-0 flex-1 basis-64" placeholder={adminT('admin.dam.final.146')} value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><select aria-label={adminT('admin.dam.final.147')} className="rounded-lg border p-2 bg-background max-w-full" value={status} onChange={e => { setStatus(e.target.value); setPage(0); const p = new URLSearchParams(params); p.set('status', e.target.value); setParams(p); }}><option value="working">{adminT('pos.working')}</option><option value="courier">{adminT('pos.courier')}</option><option value="active">{adminT('pos.active')}</option><option value="">{adminT('admin.dam.final.149')}</option>{Object.entries(orderLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label={adminT('pos.source')} className="rounded-lg border p-2 bg-background max-w-full" value={source} onChange={e => {setSource(e.target.value); setPage(0);}}><option value="">{adminT('pos.allSources')}</option>{Object.entries(sourceLabels).filter(([key]) => ['app','operator'].includes(key)).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <nav aria-label={adminT('admin.dam.final.147')} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">{statusTabs.map(tab => <button key={tab.key} aria-pressed={status === tab.key} className={`relative min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition ${tab.style} ${status === tab.key ? 'ring-2 ring-primary ring-offset-2 dark:ring-offset-slate-950' : 'hover:-translate-y-0.5'} ${tab.key === 'new' && Number(tab.count) > 0 ? 'animate-pulse' : ''}`} onClick={() => {setStatus(tab.key); setPage(0); const p = new URLSearchParams(params); p.set('status',tab.key); setParams(p);}}><span>{tab.label}</span><strong className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-background/80 px-1.5 py-0.5 text-xs shadow-sm">{Number(tab.count || 0).toLocaleString(locale)}</strong>{tab.key === 'courier' && Number(queueCounts.courier_assigned) > 0 && <small className="mt-1 block font-normal">{adminT('admin.dam.queue.courierAssigned')}: {queueCounts.courier_assigned}</small>}</button>)}</nav>
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,1fr)_minmax(0,1.6fr)]">
      <section className="min-w-0 space-y-2" aria-label={adminT('admin.dam.final.150')}>
        {loading && <p role="status">{adminT('admin.dam.final.151')}</p>}
        {!loading && !error && !rows.length && <p className="rounded-xl border p-6">{adminT('admin.dam.final.152')}</p>}
        {rows.map(o => <button key={o.id} disabled={busy} onClick={() => { const p = new URLSearchParams(params); p.set('section', 'orders'); p.set('order', String(o.id)); setParams(p); }} className={`w-full rounded-xl border p-4 text-left ${selected === o.id ? 'border-red-400 bg-red-50 dark:bg-red-950/30' : 'bg-card hover:bg-muted/50'}`}><span className="flex flex-wrap justify-between gap-2"><strong>№{o.id} · {money(o.total_amount)}</strong><span className={`text-xs rounded-full px-2 py-1 ${orderStatusClass[o.status] || 'bg-muted'}`}>{orderLabels[o.status] || o.status}</span></span><span className="block mt-2 break-words">{o.customer_name || adminT('admin.dam.final.024')} · {o.delivery_method === 'dine_in' ? adminT('workflow.onsite') : o.delivery_method === 'pickup' ? adminT('admin.dam.final.025') : adminT('admin.dam.final.026')}</span><span className="block my-2 text-xs font-medium text-primary">{sourceLabels[o.order_source || ''] || adminT('pos.sourceUnknown')}</span><span className="text-xs text-muted-foreground">{date(o.created_at)}</span></button>)}
        <div className="flex flex-wrap gap-2 items-center pt-3"><Button variant="outline" disabled={!page || loading} onClick={() => setPage(p => p - 1)}>{adminT('admin.dam.final.153')}</Button><span className="text-sm">{(total ? page * 30 + 1 : 0).toLocaleString(locale)}–{Math.min((page + 1) * 30, total).toLocaleString(locale)}  {adminT('admin.dam.final.154')} {total.toLocaleString(locale)}</span><Button variant="outline" disabled={(page + 1) * 30 >= total || loading} onClick={() => setPage(p => p + 1)}>{adminT('admin.dam.final.155')}</Button></div>
      </section>
      <section className="min-w-0 rounded-2xl border bg-card p-4 sm:p-6 space-y-4" aria-label={adminT('admin.dam.final.156')}>
        {!selected && <div className="space-y-4"><h3 className="text-xl font-bold">{adminT('pos.summary')}</h3><p className="text-sm text-muted-foreground">{adminT('pos.summaryHint')}</p>{summaryError && <p role="alert">{adminT('pos.summaryError')}</p>}{summary?.counts && <div className="grid grid-cols-2 gap-3">{[['new',summary.counts.new || 0,orderLabels.new],['working',(summary.counts.confirmed || 0)+(summary.counts.preparing || 0),adminT('pos.working')],['ready',summary.counts.ready || 0,orderLabels.ready],['in_progress',summary.counts.in_progress || 0,orderLabels.in_progress]].map(([key,count,label]) => <button key={key} className="rounded-xl border bg-muted/40 p-4 text-left" onClick={() => {setStatus(String(key));setSource('');setSearch('');setPage(0); const p = new URLSearchParams(params);p.set('status',String(key));setParams(p);}}><strong className="block text-2xl">{count}</strong><span className="text-sm">{label}</span></button>)}</div>}{summary?.daily && <div className="rounded-xl border p-4 space-y-2"><p>{adminT('pos.dayOrders')}: <strong>{summary.daily.created}</strong></p><p className="text-sm">{adminT('pos.dayTotal')}: <strong>{money(summary.daily.order_total)}</strong></p></div>}{summary && <p className="text-sm text-muted-foreground">{adminT('pos.unpaid')}: {summary.unpaid ?? '—'} · {adminT('pos.telegramErrors')}: {summary.notification_errors ?? '—'}</p>}</div>}
        {selected && !detail && !detailError && <p>{adminT('admin.dam.final.158')}</p>}
        {detailError && <p role="alert">{detailError}</p>}
        {order && <><div className="flex flex-wrap gap-3 justify-between"><h3 className="font-bold text-xl">{adminT('admin.dam.final.159')}{order.id}</h3><Button variant="outline" disabled={busy || editing || cancelOpen} onClick={() => { void refreshDetail().catch(e => toast.error(e.message)); }}>{adminT('admin.dam.final.160')}</Button></div>
          <p className="text-sm text-primary">{sourceLabels[order.order_source || ''] || adminT('pos.sourceUnknown')} · {date(order.created_at)}</p>
          <p className="font-semibold">{orderLabels[order.status] || order.status} · {order.delivery_method === 'dine_in' ? adminT('workflow.onsite') : order.delivery_method === 'pickup' ? adminT('admin.dam.final.025') : adminT('admin.dam.final.026')}</p>
          <div className="space-y-2 break-words"><p>{order.customer_name}</p><a className="text-blue-700 underline block" href={`tel:${(order.customer_phone || '').replace(/[^+\d]/g, '')}`}>{order.customer_phone}</a>{isDelivery && <p>{order.delivery_address}</p>}{order.comment && <p className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3">{adminT('admin.dam.final.161')} {order.comment}</p>}</div>
          {!closed && !['in_progress'].includes(order.status) && <Button variant="outline" disabled={busy} onClick={() => setReceiptEditor('edit')}>{adminT('workflow.edit')}</Button>}
          {isDelivery && <div className={`rounded-xl border p-4 text-sm space-y-2 ${detail.delivery?.status === 'delivered' ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30' : detail.delivery?.courier_name ? 'border-blue-300 bg-blue-50 dark:bg-blue-950/30' : 'border-violet-300 bg-violet-50 dark:bg-violet-950/30'}`}><p className="font-bold">{detail.delivery?.status === 'delivered' ? adminT('admin.dam.queue.delivered') : detail.delivery?.status === 'on_the_way' ? adminT('admin.dam.queue.onWay') : detail.delivery?.status === 'picked_up' ? adminT('admin.dam.queue.pickedUp') : detail.delivery?.courier_name ? adminT('admin.dam.queue.courierAssigned') : adminT('admin.dam.queue.noCourier')}</p>{detail.delivery?.courier_name && <p>{detail.delivery.courier_name}</p>}{detail.delivery?.courier_phone && <a className="block font-medium underline" href={`tel:${detail.delivery.courier_phone.replace(/[^+\d]/g, '')}`}>{adminT('admin.dam.queue.courierPhone')}: {detail.delivery.courier_phone}</a>}{order.status === 'ready' && !detail.delivery?.courier_name && <p>{adminT('workflow.courierNext')}</p>}</div>}
          {order.paid_amount != null && <div className="text-sm"><p>{adminT('workflow.received')}: {money(order.paid_amount)}</p><p>{adminT(order.paid_amount > order.total_amount ? 'workflow.refund' : 'workflow.due')}: {money(Math.abs(order.total_amount - order.paid_amount))}</p></div>}
          <PrintReceiptButton order={order} />
          <Items raw={order.order_items} /><p className="text-lg font-bold">{adminT('admin.dam.final.162')} {money(order.total_amount)}</p><p>{adminT('admin.dam.final.163')} {({ cash: adminT('admin.dam.final.006'), kaspi_qr: 'Kaspi QR', halyk_qr: 'Halyk QR' } as Record<string, string>)[order.payment_method] || order.payment_method || adminT('admin.dam.final.164')} · {order.payment_status === 'paid' ? adminT('admin.dam.final.165') : adminT('admin.dam.final.166')}</p>
          {!closed && <div className="flex flex-wrap gap-2">{target && <Button className="min-h-12 px-5" disabled={busy} onClick={() => void change({ status: target })}>{target === 'done' ? !isDelivery ? adminT('admin.dam.final.167') : adminT('admin.dam.final.168') : ({confirmed: adminT('pos.accept'), preparing: adminT('pos.kitchen'), ready: adminT('pos.ready')} as Record<string,string>)[target] || orderLabels[target]}</Button>}{order.payment_status !== 'paid' && <Button variant="outline" disabled={busy} onClick={() => void change({ payment_status: 'paid' })}>{adminT('admin.dam.final.169')}</Button>}<Button variant="outline" disabled={busy} onClick={() => setCancelOpen(!cancelOpen)}>{adminT('admin.dam.final.170')}</Button></div>}
          {order.status === 'done' && order.payment_status !== 'paid' && <Button disabled={busy} onClick={() => void change({ payment_status: 'paid' })}>{adminT('admin.dam.final.169')}</Button>}
          {cancelOpen && <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 space-y-2"><label className="block">{adminT('admin.dam.final.171')}<Input aria-label={adminT('admin.dam.final.171')} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><p className="text-sm">{adminT('admin.dam.final.172')}</p><Button disabled={busy || !reason.trim()} onClick={() => void change({ status: 'cancelled', cancellation_reason: reason.trim() })}>{adminT('admin.dam.final.173')}</Button></div>}
          {order.cancellation_reason && <p className="text-red-700">{adminT('admin.dam.final.174')} {order.cancellation_reason}</p>}
          {order.operator_note && !editing && <p className="rounded-xl bg-muted/50 p-3 break-words">{adminT('admin.dam.final.175')} {order.operator_note}</p>}
          <Button variant="outline" disabled={busy} onClick={() => { setEditing(!editing); setNote(order.operator_note || ''); setAddress(order.delivery_address || ''); }}>{adminT('admin.dam.final.176')}{!closed && isDelivery ? adminT('admin.dam.final.177') : ''}</Button>
          {editing && <fieldset disabled={busy} className="space-y-3"><label className="block">{adminT('admin.dam.final.178')}<textarea aria-label={adminT('admin.dam.final.178')} maxLength={2000} className="w-full rounded-lg border p-3" value={note} onChange={e => setNote(e.target.value)} /></label>{!closed && isDelivery && <label className="block">{adminT('admin.dam.final.179')}<Input value={address} maxLength={1000} onChange={e => setAddress(e.target.value)} /></label>}<Button onClick={() => void change({ operator_note: note, ...(!closed && isDelivery ? { delivery_address: address } : {}) })}>{adminT('admin.dam.final.180')}</Button></fieldset>}
          <div className="border-t pt-4"><h4 className="font-semibold mb-3">{adminT('admin.dam.final.181')}</h4>{!detail?.events.length && <p className="text-sm text-muted-foreground">{adminT('admin.dam.final.182')}</p>}{detail?.events.map(event => <div key={event.id} className="py-3 border-b text-sm space-y-1 break-words"><p>{event.message}</p><p className="text-muted-foreground">{date(event.created_at)} · {event.actor}</p><p>{notifyLabels[event.notification] || event.notification}</p>{event.error && <p className="text-red-700">{event.error}</p>}{['failed', 'unknown', 'pending'].includes(event.notification) && <Button variant="outline" size="sm" disabled={busy} onClick={() => void retry(event.id, event.notification === 'unknown')}>{adminT('admin.dam.final.183')}</Button>}</div>)}</div>
        </>}
      </section>
    </div>
  </div>;
}
