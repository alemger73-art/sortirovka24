import { useLanguage } from '@/contexts/LanguageContext';
import { useStoreTranslations } from '@/i18n/storeTranslations';
import { useCallback, useEffect, useState } from 'react';
import { bonusKinds, bonusNumber, ownerLoyalty, type LoyaltyRules } from '@/lib/loyalty';
import { getAPIBaseURL } from '@/lib/config';
import { getPartnerToken } from '@/lib/partnerAuthApi';
type Review = {
    id: number;
    customer_id: string;
    order_id: number;
    kind: string;
    reason: string;
};
type Overview = {
    totals: Record<string, number>;
    liability: number;
    customers: number;
    with_balance: number;
    review_count: number;
    reviews: Review[];
    rules: LoyaltyRules;
};
type Entry = {
    id: number;
    date: string;
    customer: string;
    phone: string;
    type: string;
    amount: number;
    order?: number;
    reason: string;
    expires?: string;
    actor?: string;
};
type Customer = {
    id: string;
    name: string;
    phone: string;
    balance: number;
};
const field = 'w-full rounded-xl border bg-background px-3 py-2.5 text-sm';
const labels: Record<string, string> = { auto_enroll: 'Включать бонусы новым клиентам', cashback_rate: 'Начисление за еду, %', max_spend_percent: 'Максимальное списание, %', welcome_amount: 'Бонус за первый заказ', welcome_days: 'Срок welcome, дней', regular_days: 'Срок остальных бонусов, дней', referral_amount: 'Награда за друга', referral_daily_limit: 'Рефералов в сутки до проверки', customer_daily_order_limit: 'Заказов в сутки до проверки', referral_enabled: 'Реферальная программа', earning_enabled: 'Начисление за заказы', spending_enabled: 'Списание в заказе' };
function day(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export default function OwnerLoyalty() {
    const st = useStoreTranslations();
    const {lang} = useLanguage();
    const locale = lang === "kz" ? "kk-KZ" : "ru-KZ";
    const [data, setData] = useState<Overview | null>(null), [entries, setEntries] = useState<Entry[]>([]), [settings, setSettings] = useState<LoyaltyRules | null>(null);
    const [start, setStart] = useState(() => day(new Date(Date.now() - 29 * 86400000))), [end, setEnd] = useState(() => day()), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const [query, setQuery] = useState(''), [customers, setCustomers] = useState<Customer[]>([]), [selected, setSelected] = useState(''), [adjustment, setAdjustment] = useState(''), [reason, setReason] = useState('');
    const [settingHistory, setSettingHistory] = useState<{
        id: number;
        date: string;
        actor: {
            id?: string;
        };
        old: Record<string, unknown>;
        new: Record<string, unknown>;
    }[]>([]);
    const [reviewReason, setReviewReason] = useState<Record<number, string>>({});
    const load = useCallback(async () => { try {
        const suffix = `?start=${start}&end=${end}`;
        const [v, h] = await Promise.all([ownerLoyalty<Overview>(suffix), ownerLoyalty<Entry[]>('/history' + suffix)]);
        setData(v);
        setEntries(h);
        setSettings(old => old || v.rules);
        setSettingHistory(await ownerLoyalty('/settings-history'));
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    } }, [start, end]);
    useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden)
        void load(); }, 30000); return () => clearInterval(timer); }, [load]);
    const act = async (work: () => Promise<unknown>, message: string) => { if (busy)
        return; setBusy(true); setError(''); setNotice(''); try {
        await work();
        setNotice(message);
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } };
    const preset = (days: number) => { setEnd(day()); setStart(day(new Date(Date.now() - (days - 1) * 86400000))); };
    const exportHistory = async () => { try {
        const partner = getPartnerToken('dam_alem');
        const token = location.pathname.startsWith('/partner/') ? partner : localStorage.getItem('_sp924_token') || localStorage.getItem('token') || partner;
        const r = await fetch(`${getAPIBaseURL()}/api/v1/dam-alem/loyalty/owner/export?start=${start}&end=${end}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok)
            throw new Error(st("Не удалось экспортировать историю"));
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dam-loyalty.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    catch (e) {
        setError((e as Error).message);
    } };
    return <div className="space-y-6" data-testid="owner-loyalty">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-bold">{st("Бонусы и возвращение клиентов")}</h2><p className="mt-1 text-sm text-muted-foreground">{st("Начисления, обязательства и история DAM ALEM 2.0")}</p></div><button className="rounded-xl border px-4 py-2.5 text-sm" onClick={exportHistory}>{st("Экспорт CSV")}</button></header>
    <div className="flex flex-wrap items-center gap-2">{[[st("Сегодня"), 1], [st("7 дней"), 7], [st("30 дней"), 30]].map(([label, days]) => <button key={st(String(label))} className="rounded-lg border px-3 py-2 text-sm" onClick={() => preset(Number(days))}>{st(String(label))}</button>)}<button className="rounded-lg border px-3 py-2 text-sm" onClick={() => { const d = new Date(); d.setDate(1); setStart(day(d)); setEnd(day()); }}>{st("Этот месяц")}</button><label className="flex items-center gap-2 text-sm">{st("С")}<input aria-label={st("Начало периода")} className={field} type="date" value={start} onChange={e => setStart(e.target.value)}/></label><label className="flex items-center gap-2 text-sm">{st("По")}<input aria-label={st("Конец периода")} className={field} type="date" value={end} onChange={e => setEnd(e.target.value)}/></label></div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}<button onClick={load} className="ml-3 underline">{st("Повторить")}</button></div>}{notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-800">{notice}</p>}
    {!data && !error && <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[1, 2, 3, 4].map(x => <div key={x} className="h-28 animate-pulse rounded-2xl bg-muted"/>)}</div>}
    {data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
                [st("Обязательства сейчас"), data.liability], [st("Начислено за период"), Number(data.totals.EARN || 0) + Number(data.totals.WELCOME || 0) + Number(data.totals.REFERRAL || 0)], [st("Списано"), -Number(data.totals.SPEND || 0)], [st("Истекло"), -Number(data.totals.EXPIRE || 0)], [st("За первый заказ"), data.totals.WELCOME], [st("За приглашения"), data.totals.REFERRAL], [st("Корректировки"), data.totals.MANUAL_ADJUSTMENT], [st("Возвраты / отмены начислений"), data.totals.REVERSAL]
            ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border bg-card p-4"><p className="text-xs text-muted-foreground">{st(String(label))}</p><p className="mt-2 text-2xl font-bold">{bonusNumber(value)} <span className="text-sm font-normal">₸</span></p></div>)}</div>
      <p className="text-sm text-muted-foreground">{st("Клиентов:")}{data.customers}{st("· С бонусами:")}{data.with_balance}{st("· Требуют проверки:")}{data.review_count}{st(". Обязательства показаны на текущий момент, операции — за выбранный период.")}</p>
      <section className="rounded-2xl border bg-card p-5"><h3 className="text-lg font-semibold">{st("Требует проверки")}</h3>{!data.reviews.length ? <p className="mt-2 text-sm text-muted-foreground">{st("Нет ожидающих решений")}</p> : data.reviews.map(r => <div key={r.id} className="mt-4 space-y-2 border-t pt-4"><p className="font-medium">{st(bonusKinds[r.kind])}{st("· Заказ №")}{r.order_id}</p><p className="text-sm text-muted-foreground">{r.reason}</p><input aria-label={`Решение по проверке ${r.id}`} placeholder={st("Причина решения")} value={reviewReason[r.id] || ''} onChange={e => setReviewReason({ ...reviewReason, [r.id]: e.target.value })} className={field}/><div className="flex gap-2">{[true, false].map(approved => <button key={String(approved)} disabled={busy || (reviewReason[r.id] || '').trim().length < 3} onClick={() => act(() => ownerLoyalty(`/reviews/${r.id}`, 'POST', { approved, reason: reviewReason[r.id] }), st("Решение сохранено"))} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">{approved ? st("Подтвердить начисление") : st("Отклонить")}</button>)}</div></div>)}</section>
      <details className="rounded-2xl border bg-card p-5"><summary className="cursor-pointer font-semibold">{st("Правила программы · версия")}{data.rules.version}</summary>{settings && <form className="mt-4 space-y-4" onSubmit={e => { e.preventDefault(); const clean = Object.fromEntries(Object.keys(labels).map(k => [k, settings[k as keyof LoyaltyRules]])); void act(() => ownerLoyalty('/settings', 'PATCH', clean), st("Настройки сохранены. Старые заказы сохраняют свои правила.")); }}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(labels).map(([key, label]) => <label key={key} className="space-y-1.5 text-sm"><span className="block">{st(String(label))}</span>{typeof settings[key as keyof LoyaltyRules] === 'boolean' ? <input type="checkbox" checked={Boolean(settings[key as keyof LoyaltyRules])} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} className="h-5 w-5 accent-emerald-600"/> : <input type="number" min={key.endsWith('days') ? 1 : 0} step={key.endsWith('days') || key.endsWith('limit') ? 1 : 0.01} max={key.endsWith('rate') || key.endsWith('percent') ? 100 : 100000} className={field} value={Number(settings[key as keyof LoyaltyRules])} onChange={e => setSettings({ ...settings, [key]: Number(e.target.value) })}/>}</label>)}</div><p className="text-xs text-muted-foreground">{st("1 бонус = 1 ₸. Изменения сохраняются в журнале и действуют для новых заказов. Порог проверки отправляет начисление владельцу, а не блокирует клиента автоматически.")}</p><button disabled={busy} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">{st("Сохранить правила")}</button></form>}</details>
      <details className="rounded-2xl border bg-card p-5"><summary className="cursor-pointer font-semibold">{st("Ручная корректировка")}</summary><div className="mt-4 flex gap-2"><input aria-label={st("Найти клиента")} placeholder={st("Имя или телефон клиента")} className={field} value={query} onChange={e => setQuery(e.target.value)}/><button className="rounded-xl border px-4" onClick={() => act(async () => setCustomers(await ownerLoyalty<Customer[]>('/customers?q=' + encodeURIComponent(query))), '')}>{st("Найти")}</button></div><form onSubmit={e => { e.preventDefault(); void act(() => ownerLoyalty('/adjustments', 'POST', { customer_id: selected, amount: Number(adjustment), reason, request_key: crypto.randomUUID() }), st("Корректировка записана в журнал.")); }} className="mt-3 grid gap-3 sm:grid-cols-2"><select aria-label={st("Клиент для корректировки")} required value={selected} onChange={e => setSelected(e.target.value)} className={field}><option value="">{st("Выберите клиента")}</option>{customers.map(c => <option key={c.id} value={c.id}>{c.name} · {c.phone} · {bonusNumber(c.balance)}</option>)}</select><input aria-label={st("Сумма корректировки")} required type="number" step="0.01" placeholder={st("Сумма: +500 или -500")} className={field} value={adjustment} onChange={e => setAdjustment(e.target.value)}/><input aria-label={st("Причина корректировки")} required minLength={3} placeholder={st("Обязательная причина")} className={field + ' sm:col-span-2'} value={reason} onChange={e => setReason(e.target.value)}/><button disabled={busy || !selected || !Number(adjustment)} className="rounded-xl bg-primary px-5 py-3 text-sm text-primary-foreground disabled:opacity-40">{st("Записать корректировку")}</button></form></details>
      <section className="rounded-2xl border bg-card p-5"><h3 className="text-lg font-semibold">{st("История операций")}</h3><p className="mb-3 text-xs text-muted-foreground">{st("Последние 100 операций. Полная история за период доступна в экспорте. Записи не удаляются.")}</p>{!entries.length ? <p className="py-6 text-center text-muted-foreground">{st("За этот период операций нет")}</p> : entries.map(e => <div key={e.id} className="flex items-start justify-between gap-3 border-t py-3"><div className="min-w-0"><p className="font-medium">{e.customer} <span className="text-xs font-normal text-muted-foreground">{e.phone}</span></p><p className="text-sm">{e.reason || st(bonusKinds[e.type])}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(e.date).toLocaleString(locale)}{e.order ? ` · №${e.order}` : ''}{e.actor ? ' · ' + st('Автор:') + ' ' + e.actor : ''}{e.expires ? ' · ' + st('До') + ' ' + new Date(e.expires).toLocaleDateString(locale) : ''}</p></div><strong className="shrink-0">{Number(e.amount) > 0 ? '+' : ''}{bonusNumber(e.amount)}</strong></div>)}</section>
    </>}
  <details className="rounded-xl border p-4"><summary className="cursor-pointer font-semibold">{st("История настроек")}</summary>{settingHistory.map(h => <div key={h.id} className="border-b py-3 text-sm"><p>{new Date(h.date).toLocaleString(locale)} · {h.actor?.id || st("Владелец")}</p>{Object.keys(h.new).filter(k => String(h.new[k]) !== String(h.old[k])).map(k => <p key={k}>{st(labels[k] || k)}: {String(h.old[k] ?? '—')} → {String(h.new[k])}</p>)}</div>)}</details></div>;
}
