import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { foodOperations, orderLabels, type OperatorOrder, type OrderDetail } from '@/lib/foodOperations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const date = (value: string) => value ? new Date(value).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const money = (value: number) => `${Number(value || 0).toLocaleString('ru-RU')} ₸`;
const notifyLabels: Record<string, string> = { pending: 'В очереди Telegram', sending: 'Отправляется', sent: 'Доставлено в Telegram', failed: 'Ошибка Telegram', unknown: 'Отправка не подтверждена', none: 'Запись в журнале' };
const next: Record<string, string> = { new: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'in_progress', in_progress: 'done' };

function Items({ raw }: { raw: string }) {
  let items: { name?: string; quantity?: number; price?: number; modTotal?: number; modifiers?: { name?: string }[] }[] = [];
  try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) items = parsed.filter(x => x && typeof x === 'object'); } catch { /* legacy malformed order */ }
  return <div className="divide-y">{items.length ? items.map((item, i) => <div key={i} className="flex justify-between gap-3 py-3 text-sm"><span className="break-words">{item.name || 'Блюдо'} × {item.quantity || 1}{Array.isArray(item.modifiers) && item.modifiers.length > 0 && <small className="block text-gray-500">{item.modifiers.map(m => m?.name).filter(Boolean).join(', ')}</small>}</span><strong className="shrink-0">{money(((item.price || 0) + (item.modTotal || 0)) * (item.quantity || 1))}</strong></div>) : <p>Состав не удалось прочитать. Уточните заказ у клиента.</p>}</div>;
}

export default function DamAlemOrders() {
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get('order')) || null;
  const [rows, setRows] = useState<OperatorOrder[]>([]), [total, setTotal] = useState(0);
  const [status, setStatus] = useState('active'), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [lastLoaded, setLastLoaded] = useState('');
  const [detail, setDetail] = useState<OrderDetail | null>(null), [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(false), [note, setNote] = useState(''), [address, setAddress] = useState(''), [reason, setReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false), [editing, setEditing] = useState(false);
  const lock = useRef(false), generation = useRef(0);
  const latestInteraction = useRef({ selected, editing, cancelOpen, busy });
  latestInteraction.current = { selected, editing, cancelOpen, busy };
  const load = useCallback(async () => {
    const gen = ++generation.current;
    try {
      const data = await foodOperations<{ items: OperatorOrder[]; total: number }>(`/orders?status=${status}&q=${encodeURIComponent(search)}&skip=${page * 30}`);
      if (gen !== generation.current) return;
      setRows(data.items); setTotal(data.total); setError(''); setLastLoaded(new Date().toLocaleTimeString('ru-RU')); 
    } catch (e) { if (gen === generation.current) setError((e as Error).message); }
    finally { if (gen === generation.current) setLoading(false); }
  }, [status, search, page]);
  useEffect(() => { setLoading(true); const timer = window.setTimeout(load, 250); return () => { clearTimeout(timer); generation.current++; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15000); return () => clearInterval(timer); }, [load]);
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
    const timer = window.setInterval(() => { if (!document.hidden) void refreshDetail(true).catch(e => { if (latestInteraction.current.selected === selected) setDetailError(e.message); }); }, 15000);
    return () => clearInterval(timer);
  }, [selected, editing, cancelOpen, busy, refreshDetail]);
  async function change(values: Record<string, unknown>) {
    if (!detail || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      await foodOperations(`/orders/${detail.order.id}`, 'PATCH', { expected_version: detail.order.version || 0, ...values });
      await refreshDetail(); await load(); setEditing(false); setCancelOpen(false); toast.success('Заказ обновлён');
    } catch (e) { toast.error((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  async function retry(eventId: number, unknown: boolean) {
    if (lock.current) return;
    if (unknown && !window.confirm('Проверьте канал: сообщение могло уже прийти. Повторная отправка может создать копию. Отправить ещё раз?')) return;
    lock.current = true; setBusy(true);
    try { await foodOperations(`/orders/${selected}/notifications/${eventId}/retry`, 'POST'); await refreshDetail(); toast.success('Уведомление поставлено в очередь'); }
    catch (e) { toast.error((e as Error).message); } finally { lock.current = false; setBusy(false); }
  }
  const order = detail?.order;
  const closed = order && ['done', 'cancelled'].includes(order.status);
  const target = order?.status === 'ready' && order.delivery_method === 'pickup' ? 'done' : next[order?.status || ''];
  return <div className="space-y-5 min-w-0">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-xl font-bold">Заказы DAM ALEM</h3><p className="text-sm text-gray-500">Обновление каждые 15 секунд · {lastLoaded ? `Проверено в ${lastLoaded}` : 'Загрузка'}</p></div><Button variant="outline" onClick={() => void load()}>Обновить список</Button></div>
    <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Все заказы сохраняются здесь. Telegram — дополнительное уведомление. Оплату отмечайте после проверки поступления денег.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error} Показанные данные могут быть устаревшими.</p>}
    <div className="flex flex-wrap gap-3"><Input aria-label="Поиск заказов" className="min-w-0 flex-1 basis-64" placeholder="Номер заказа, имя, телефон или адрес" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /><select aria-label="Статус заказов" className="rounded-lg border p-2 max-w-full" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="active">В работе</option><option value="">Все заказы</option>{Object.entries(orderLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,1fr)_minmax(0,1.6fr)]">
      <section className="min-w-0 space-y-2" aria-label="Список заказов">
        {loading && <p role="status">Загружаем заказы…</p>}
        {!loading && !error && !rows.length && <p className="rounded-xl border p-6">По выбранному фильтру заказов нет.</p>}
        {rows.map(o => <button key={o.id} disabled={busy} onClick={() => { const p = new URLSearchParams(params); p.set('section', 'orders'); p.set('order', String(o.id)); setParams(p); }} className={`w-full rounded-xl border p-4 text-left ${selected === o.id ? 'border-red-400 bg-red-50' : 'bg-white hover:bg-gray-50'}`}><span className="flex flex-wrap justify-between gap-2"><strong>№{o.id} · {money(o.total_amount)}</strong><span className="text-xs rounded-full bg-gray-100 px-2 py-1">{orderLabels[o.status] || o.status}</span></span><span className="block mt-2 break-words">{o.customer_name || 'Клиент'} · {o.delivery_method === 'pickup' ? 'Самовывоз' : 'Доставка'}</span><span className="text-xs text-gray-500">{date(o.created_at)}</span></button>)}
        <div className="flex flex-wrap gap-2 items-center pt-3"><Button variant="outline" disabled={!page || loading} onClick={() => setPage(p => p - 1)}>Назад</Button><span className="text-sm">{total ? page * 30 + 1 : 0}–{Math.min((page + 1) * 30, total)} из {total}</span><Button variant="outline" disabled={(page + 1) * 30 >= total || loading} onClick={() => setPage(p => p + 1)}>Далее</Button></div>
      </section>
      <section className="min-w-0 rounded-2xl border bg-white p-4 sm:p-6 space-y-4" aria-label="Карточка заказа">
        {!selected && <p className="text-gray-500">Выберите заказ, чтобы посмотреть состав и начать обработку.</p>}
        {selected && !detail && !detailError && <p>Загружаем карточку…</p>}
        {detailError && <p role="alert">{detailError}</p>}
        {order && <><div className="flex flex-wrap gap-3 justify-between"><h3 className="font-bold text-xl">Заказ №{order.id}</h3><Button variant="outline" disabled={busy || editing || cancelOpen} onClick={() => { void refreshDetail().catch(e => toast.error(e.message)); }}>Обновить карточку</Button></div>
          <p className="font-semibold">{orderLabels[order.status] || order.status} · {order.delivery_method === 'pickup' ? 'Самовывоз' : 'Доставка'}</p>
          <div className="space-y-2 break-words"><p>{order.customer_name}</p><a className="text-blue-700 underline block" href={`tel:${(order.customer_phone || '').replace(/[^+\d]/g, '')}`}>{order.customer_phone}</a>{order.delivery_method !== 'pickup' && <p>{order.delivery_address}</p>}{order.comment && <p className="rounded-xl bg-amber-50 p-3">Комментарий клиента: {order.comment}</p>}</div>
          <Items raw={order.order_items} /><p className="text-lg font-bold">Итого {money(order.total_amount)}</p><p>Оплата: {({ cash: 'Наличные', kaspi_qr: 'Kaspi QR', halyk_qr: 'Halyk QR' } as Record<string, string>)[order.payment_method] || order.payment_method || 'Не указана'} · {order.payment_status === 'paid' ? 'Получена' : 'Ожидается'}</p>
          {!closed && <div className="flex flex-wrap gap-2">{target && <Button disabled={busy} onClick={() => void change({ status: target })}>{target === 'done' ? order.delivery_method === 'pickup' ? 'Выдан клиенту' : 'Доставлен клиенту' : orderLabels[target]}</Button>}{order.payment_status !== 'paid' && <Button variant="outline" disabled={busy} onClick={() => void change({ payment_status: 'paid' })}>Подтвердить получение оплаты</Button>}<Button variant="outline" disabled={busy} onClick={() => setCancelOpen(!cancelOpen)}>Отменить заказ</Button></div>}
          {cancelOpen && <div className="rounded-xl bg-red-50 p-3 space-y-2"><label className="block">Причина отмены<Input aria-label="Причина отмены" maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><p className="text-sm">При полученной оплате возврат нужно оформить отдельно. Эта кнопка не возвращает деньги.</p><Button disabled={busy || !reason.trim()} onClick={() => void change({ status: 'cancelled', cancellation_reason: reason.trim() })}>Подтвердить отмену</Button></div>}
          {order.cancellation_reason && <p className="text-red-700">Причина отмены: {order.cancellation_reason}</p>}
          {order.operator_note && !editing && <p className="rounded-xl bg-gray-50 p-3 break-words">Заметка оператора: {order.operator_note}</p>}
          <Button variant="outline" disabled={busy} onClick={() => { setEditing(!editing); setNote(order.operator_note || ''); setAddress(order.delivery_address || ''); }}>Заметка{!closed && order.delivery_method !== 'pickup' ? ' и адрес' : ''}</Button>
          {editing && <fieldset disabled={busy} className="space-y-3"><label className="block">Заметка для сотрудников<textarea aria-label="Заметка для сотрудников" maxLength={2000} className="w-full rounded-lg border p-3" value={note} onChange={e => setNote(e.target.value)} /></label>{!closed && order.delivery_method !== 'pickup' && <label className="block">Адрес доставки<Input value={address} maxLength={1000} onChange={e => setAddress(e.target.value)} /></label>}<Button onClick={() => void change({ operator_note: note, ...(!closed && order.delivery_method !== 'pickup' ? { delivery_address: address } : {}) })}>Сохранить изменения</Button></fieldset>}
          <div className="border-t pt-4"><h4 className="font-semibold mb-3">История заказа</h4>{!detail?.events.length && <p className="text-sm text-gray-500">Для старых заказов история начнётся с первого изменения.</p>}{detail?.events.map(event => <div key={event.id} className="py-3 border-b text-sm space-y-1 break-words"><p>{event.message}</p><p className="text-gray-500">{date(event.created_at)} · {event.actor}</p><p>{notifyLabels[event.notification] || event.notification}</p>{event.error && <p className="text-red-700">{event.error}</p>}{['failed', 'unknown', 'pending'].includes(event.notification) && <Button variant="outline" size="sm" disabled={busy} onClick={() => void retry(event.id, event.notification === 'unknown')}>Повторить уведомление</Button>}</div>)}</div>
        </>}
      </section>
    </div>
  </div>;
}
