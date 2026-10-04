import { useStoreTranslations } from '@/i18n/storeTranslations';
import { useCallback, useEffect, useState } from 'react';
import { crmStaff, type CRMContact, type CRMProfile } from '@/lib/crm';
import { bonusNumber } from '@/lib/loyalty';
import { orderLabels } from '@/lib/foodOperations';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { scheduleLabel } from './PreorderFields';
export function CRMProfileDialog({ id, onClose, canManage = false }: {
    id: string | null;
    onClose: () => void;
    canManage?: boolean;
}) {
    const st = useStoreTranslations();
    const [data, setData] = useState<CRMProfile | null>(null), [error, setError] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
    const load = useCallback(async () => { if (!id)
        return; try {
        setData(await crmStaff<CRMProfile>('/customers/' + id));
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, [id]);
    useEffect(() => { setData(null); setNote(''); void load(); }, [load]);
    const [accessReason, setAccessReason] = useState('');
    const enroll = async () => { if (!data || busy)
        return; setBusy(true); try {
        await crmStaff('/customers/' + id + '/loyalty', 'PATCH', { enabled: !data.loyalty.enrolled, reason: accessReason });
        setAccessReason('');
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const save = async () => { if (!id || busy)
        return; setBusy(true); try {
        await crmStaff('/customers/' + id + '/notes', 'POST', { text: note });
        setNote('');
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    return <Dialog open={!!id} onOpenChange={open => { if (!open)
        onClose(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogTitle>{data?.name || st("Карточка клиента")}</DialogTitle><DialogDescription>{st("История и бонусы только DÄM ALEM. Заметки видны сотрудникам.")}</DialogDescription>{error && <p role="alert" className="text-red-600">{error}<button onClick={() => void load()} className="ml-2 underline">{st("Повторить")}</button></p>}{!data && !error && <p role="status">{st("Загрузка…")}</p>}{data && <div className="space-y-5"><a href={'tel:' + data.phone} className="text-lg font-medium underline">{data.phone}</a><div className="grid grid-cols-3 gap-2 rounded-xl bg-muted p-3 text-sm"><div>{st("Заказов")}<strong className="block text-xl">{data.orders_count}</strong></div><div>{st("Получено")}<strong className="block text-xl">{bonusNumber(data.paid_total)} ₸</strong></div><div>{st("Бонусы")}<strong className="block text-xl">{bonusNumber(data.loyalty.balance)}</strong></div></div><div><h3 className="font-semibold">{st("Адреса из заказов")}</h3>{data.addresses.length ? data.addresses.map(a => <p key={a} className="mt-1 text-sm">{a}</p>) : <p className="text-sm text-muted-foreground">{st("Адресов пока нет")}</p>}</div>{data.upcoming.length > 0 && <div><h3 className="font-semibold">{st("Предстоящие предзаказы")}</h3>{data.upcoming.map(o => <p key={o.id} className="mt-2 text-sm">№{o.id} · {scheduleLabel(o.scheduled_for)} · {bonusNumber(o.total_amount)} ₸</p>)}</div>}<div><h3 className="font-semibold">{st("Последние заказы")}</h3>{data.recent.length ? data.recent.map(o => <div key={o.id} className="flex justify-between gap-3 border-b py-3 text-sm"><div>№{o.id} · {orderLabels[o.status] || o.status}<p className="text-muted-foreground">{o.delivery_method === 'delivery' ? st("Доставка") : o.delivery_method === 'pickup' ? st("Самовывоз") : st("В заведении")} · {o.payment_status === 'paid' ? st("Оплачен") : st("Не оплачен")}{o.scheduled_for ? ' · ' + scheduleLabel(o.scheduled_for) : ''}</p></div><strong>{bonusNumber(o.total_amount)} ₸</strong></div>) : <p className="text-sm text-muted-foreground">{st("Нет заказов")}</p>}</div>{canManage && <div className="rounded-lg border p-3"><h3 className="font-semibold">{st("Бонусная программа:")}{data.loyalty.enrolled ? st("участвует") : st("не участвует")}</h3><Input aria-label={st("Причина изменения участия")} placeholder={st("Причина изменения участия")} value={accessReason} onChange={e => setAccessReason(e.target.value)}/><Button className="mt-2" variant="outline" disabled={busy || accessReason.trim().length < 3} onClick={() => void enroll()}>{data.loyalty.enrolled ? st("Отключить участие") : st("Включить участие")}</Button></div>}<CRMTimeline id={id!}/><div><h3 className="font-semibold">{st("Внутренние заметки")}</h3>{data.notes?.map(n => <div key={n.id} className="my-2 rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap"><p>{n.text}</p><p className="mt-1 text-xs text-muted-foreground">{n.author} · {new Date(n.created_at).toLocaleString('ru-KZ')}</p></div>)}<textarea aria-label={st("Внутренняя заметка")} className="mt-2 min-h-24 w-full rounded-lg border bg-background p-3" value={note} maxLength={1500} onChange={e => setNote(e.target.value)} placeholder={st("Например: звонить перед доставкой. Без паролей и платёжных реквизитов.")}/><Button disabled={busy || note.trim().length < 3} onClick={() => void save()}>{st("Сохранить заметку")}</Button></div></div>}</DialogContent></Dialog>;
}
export function CRMSearch({ query, onSelect }: {
    query: string;
    onSelect: (c: CRMContact) => void;
}) {
    const st = useStoreTranslations();
    const [rows, setRows] = useState<CRMContact[]>([]), [error, setError] = useState(''), [profile, setProfile] = useState<string | null>(null);
    useEffect(() => { let alive = true; setRows([]); setError(''); if (query.trim().length < 3)
        return; const timer = setTimeout(() => { void crmStaff<CRMContact[]>('/customers?q=' + encodeURIComponent(query)).then(r => { if (alive)
        setRows(r); }).catch(e => { if (alive)
        setError(e.message); }); }, 350); return () => { alive = false; clearTimeout(timer); }; }, [query]);
    return <div className="sm:col-span-2">{error && <p className="text-xs text-amber-700">{st("Поиск клиента временно недоступен. Контакты можно ввести вручную.")}</p>}{rows.length > 0 && <div className="rounded-xl border p-2"><p className="px-2 py-1 text-xs text-muted-foreground">{st("Клиенты DÄM ALEM")}</p>{rows.map(c => <div key={c.id} className="flex items-center gap-2"><button type="button" onClick={() => onSelect(c)} className="min-h-12 flex-1 rounded-lg p-2 text-left hover:bg-muted"><strong className="text-sm">{c.name}</strong><span className="ml-2 text-sm text-muted-foreground">{c.phone}</span></button><Button variant="outline" onClick={() => setProfile(c.id)}>{st("История")}</Button></div>)}</div>}<CRMProfileDialog id={profile} onClose={() => setProfile(null)}/></div>;
}
export default function OwnerCRM() {
    const st = useStoreTranslations();
    const [query, setQuery] = useState(''), [offset, setOffset] = useState(0), [rows, setRows] = useState<(CRMContact & {
        balance: number;
        registered: boolean;
        first_source: string;
        state: string;
    })[]>([]), [total, setTotal] = useState(0), [error, setError] = useState(''), [profile, setProfile] = useState<string | null>(null);
    useEffect(() => { let alive = true; const load = () => crmStaff<{
        total: number;
        items: typeof rows;
    }>(`/directory?q=${encodeURIComponent(query)}&offset=${offset}`).then(v => { if (alive) {
        setRows(v.items);
        setTotal(v.total);
        setError('');
    } }).catch(e => { if (alive)
        setError(e.message); }); const timer = setTimeout(() => void load(), 300); const poll = setInterval(() => { if (!document.hidden)
        void load(); }, 30000); return () => { alive = false; clearTimeout(timer); clearInterval(poll); }; }, [query, offset]);
    return <section className="space-y-4"><header><h2 className="text-2xl font-bold">{st("Клиенты DÄM ALEM")}</h2><p className="mt-1 text-sm text-muted-foreground">{st("Единая история заказов с сайта, от оператора и из будущего WhatsApp-канала.")}</p></header><Input aria-label={st("Поиск клиента")} placeholder={st("Имя или телефон")} value={query} onChange={e => { setQuery(e.target.value); setOffset(0); }}/>{error && <p role="alert" className="text-red-600">{error}</p>}<p className="text-sm text-muted-foreground">{st("Клиентов:")}{total}</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(c => <button type="button" key={c.id} onClick={() => setProfile(c.id)} className="rounded-xl border bg-card p-4 text-left hover:border-primary"><strong>{c.name}</strong><p className="mt-1 text-sm">{c.phone}</p><p className="mt-3 text-sm text-muted-foreground">{c.registered ? st("Аккаунт подключён") : st("Без аккаунта")}{st("· Бонусы:")}{bonusNumber(c.balance)}</p>{c.state === 'REVIEW' && <p className="mt-2 text-xs text-amber-700">{st("Связь аккаунта требует проверки")}</p>}</button>)}</div>{!rows.length && !error && <p className="rounded-xl border p-6 text-muted-foreground">{st("Клиенты не найдены. Новый клиент появится при первом заказе.")}</p>}<div className="flex gap-2"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>{st("Назад")}</Button><Button variant="outline" disabled={offset + 20 >= total} onClick={() => setOffset(offset + 20)}>{st("Далее")}</Button></div><CRMProfileDialog canManage id={profile} onClose={() => setProfile(null)}/></section>;
}
type TimelineItem = {
    kind: string;
    id: string;
    at: string;
    title: string;
    order_id?: string;
};
function CRMTimeline({ id }: {
    id: string;
}) {
    const st = useStoreTranslations();
    const [rows, setRows] = useState<TimelineItem[]>([]), [next, setNext] = useState<number | null>(0), [busy, setBusy] = useState(false), [error, setError] = useState(''), [opened, setOpened] = useState(false);
    useEffect(() => { setRows([]); setNext(0); setError(''); setOpened(false); }, [id]);
    const load = async () => { if (busy || next === null)
        return; setBusy(true); setError(''); try {
        const value = await crmStaff<{
            items: TimelineItem[];
            next_offset: number | null;
        }>(`/customers/${id}/timeline?offset=${next}`);
        setRows(v => [...v, ...value.items]);
        setNext(value.next_offset);
        setOpened(true);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    return <div className="rounded-xl border p-3"><h3 className="font-semibold">{st("Единая история клиента")}</h3><p className="mb-2 text-xs text-muted-foreground">{st("Заказы, статусы, бонусы, уведомления и изменения профиля в DÄM ALEM.")}</p>{rows.map(x => <div key={x.kind + ':' + x.id} className="border-b py-3 text-sm"><p className="whitespace-pre-wrap break-words">{x.title}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(x.at).toLocaleString('ru-KZ')}{x.order_id ? st(" · Заказ №") + x.order_id : ''}</p></div>)}{error && <p role="alert" className="my-2 text-sm text-red-600">{error}</p>}{next !== null && <Button variant="outline" className="mt-2" disabled={busy} onClick={() => void load()}>{busy ? st("Загрузка…") : opened ? st("Ещё события") : st("Открыть историю")}</Button>}{opened && !rows.length && <p className="text-sm text-muted-foreground">{st("Событий пока нет")}</p>}</div>;
}
