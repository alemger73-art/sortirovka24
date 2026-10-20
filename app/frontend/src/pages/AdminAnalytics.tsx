import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { getAPIBaseURL } from '@/lib/config';

type Top = { name: string; count: number };
type ErrorItem = { id: number; source: string; message: string; path?: string; count: number; visitors: number; browser?: string;
  status: string; first_seen?: string; last_seen?: string; stack?: string; note?: string; release?: string };
type Summary = {
  days: number; visitors: number; new_visitors: number; returning_visitors: number; logged_in_visitors: number; sessions: number;
  pageviews: number; pages_per_session: number; app_users: number;
  by_day: { day: string; visitors: number; pageviews: number }[]; hours: { hour: number; pageviews: number }[];
  sections: Top[]; pages: Top[]; sources: Top[]; devices: Top[]; platforms: Top[]; browsers: Top[];
  searches: Top[]; searches_without_results: Top[]; dishes_viewed: Top[]; dishes_added: Top[]; news_read: Top[];
  funnel: { step: string; visitors: number }[];
  orders: { count: number; sum: number; payment: Record<string, number>; method: Record<string, number> };
  app: { install_offered: number; install_clicked: number; installed: number; push_enabled: number };
  login: { opened: number; code_requested: number; logged_in: number };
  errors: ErrorItem[];
};

const LABELS: Record<string, string> = {
  mobile: 'Телефон', tablet: 'Планшет', desktop: 'Компьютер', other: 'Другое', android: 'Android', ios: 'iPhone', windows: 'Windows',
  mac: 'Mac', chrome: 'Chrome', safari: 'Safari', yandex: 'Яндекс', samsung: 'Samsung', instagram: 'Внутри Instagram',
  telegram: 'Внутри Telegram', whatsapp: 'Внутри WhatsApp', facebook: 'Внутри Facebook', opera: 'Opera', edge: 'Edge',
  xiaomi: 'Браузер Xiaomi', firefox: 'Firefox', kaspi_qr: 'Kaspi', halyk_qr: 'Halyk', cash: 'Наличные', delivery: 'Доставка',
  pickup: 'Самовывоз', dine_in: 'В заведении',
};
const label = (v: string) => LABELS[v] || v;

function token() {
  try { return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || ''; } catch { return ''; }
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getAPIBaseURL().replace(/\/$/, '')}/api/v1/site-analytics${path}`, {
    ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Войдите в админку заново' : `Ошибка ${res.status}`);
  return res.json();
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-slate-200 bg-white p-4 ${className}`}><h3 className="mb-3 font-semibold text-slate-900">{title}</h3>{children}</section>;
}
function Bars({ items, empty = 'Пока нет данных', fmt = (v: string) => v }: { items: Top[]; empty?: string; fmt?: (v: string) => string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...items.map(i => i.count), 1);
  return <ul className="space-y-2">{items.map(i => <li key={i.name} className="text-sm">
    <div className="flex justify-between gap-3"><span className="min-w-0 truncate text-slate-700" title={i.name}>{fmt(i.name)}</span><span className="tabular-nums font-semibold">{i.count}</span></div>
    <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${(i.count / max) * 100}%` }} /></div>
  </li>)}</ul>;
}
function Kpi({ value, title, hint }: { value: string | number; title: string; hint?: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{title}</p><p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>{hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}</div>;
}
const fromRecord = (r: Record<string, number>) => Object.entries(r).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

export default function AdminAnalytics() {
  const [days, setDays] = useState(1);
  const [tab, setTab] = useState<'stats' | 'errors'>('stats');
  const [data, setData] = useState<Summary | null>(null);
  const [errors, setErrors] = useState<ErrorItem[] | null>(null);
  const [showFixed, setShowFixed] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setProblem('');
    try {
      const [summary, list] = await Promise.all([api<Summary>(`/summary?days=${days}`), api<{ items: ErrorItem[] }>(`/errors?status=${showFixed ? 'all' : 'open'}`)]);
      setData(summary); setErrors(list.items);
    } catch (e) { setProblem((e as Error).message); }
    finally { setLoading(false); }
  }, [days, showFixed]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const t = window.setInterval(() => { if (!document.hidden) void load(); }, 60000); return () => clearInterval(t); }, [load]);

  async function setStatus(item: ErrorItem, status: 'known' | 'fixed' | 'new') {
    try { await api(`/errors/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); toast.success('Сохранено'); void load(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const maxDay = Math.max(1, ...(data?.by_day || []).map(d => d.visitors));
  const maxHour = Math.max(1, ...(data?.hours || []).map(h => h.pageviews));
  const firstStep = data?.funnel[0]?.visitors || 0;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold text-slate-900">Посещаемость и ошибки</h2>
        <p className="text-sm text-slate-500">Анонимно: без имён и телефонов. Обновляется каждую минуту, итог дня приходит в Telegram в 21:00.</p></div>
      <div className="flex items-center gap-2">
        {[[1, 'Сегодня'], [7, '7 дней'], [30, '30 дней']].map(([d, l]) => <button key={d} onClick={() => setDays(Number(d))} className={`min-h-10 rounded-xl px-3 text-sm font-semibold ${days === d ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`}>{l}</button>)}
        <button aria-label="Обновить" onClick={() => void load()} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button>
      </div>
    </div>
    <div className="flex gap-2">
      <button onClick={() => setTab('stats')} className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${tab === 'stats' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200'}`}>Статистика</button>
      <button onClick={() => setTab('errors')} className={`min-h-10 rounded-xl px-4 text-sm font-semibold ${tab === 'errors' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200'}`}>Ошибки{errors?.length ? ` · ${errors.filter(e => e.status !== 'fixed').length}` : ''}</button>
    </div>
    {problem && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{problem}</p>}

    {tab === 'stats' && data && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi title="Посетителей" value={data.visitors} hint={`новых ${data.new_visitors} · вернулись ${data.returning_visitors}`} />
        <Kpi title="Просмотров страниц" value={data.pageviews} hint={`${data.pages_per_session} стр. за визит · визитов ${data.sessions}`} />
        <Kpi title="Заказов с сайта" value={data.orders.count} hint={`на ${data.orders.sum.toLocaleString('ru-RU')} ₸`} />
        <Kpi title="Через приложение" value={data.app_users} hint={`вошли в аккаунт: ${data.logged_in_visitors}`} />
      </div>
      {data.days > 1 && <Card title="По дням (посетители)">
        <div className="flex h-36 items-end gap-1">{data.by_day.map(d => <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.visitors} посетителей, ${d.pageviews} просмотров`}>
          <span className="text-[10px] tabular-nums text-slate-500">{d.visitors}</span>
          <div className="w-full rounded-t bg-blue-500" style={{ height: `${(d.visitors / maxDay) * 100}%`, minHeight: 2 }} />
          <span className="text-[10px] text-slate-400">{d.day.slice(8)}</span></div>)}</div>
      </Card>}
      <Card title="Путь к заказу в Дам Алем — где люди уходят">
        <ul className="space-y-2">{data.funnel.map((f, i) => <li key={f.step} className="text-sm">
          <div className="flex justify-between"><span>{f.step}</span><span className="tabular-nums font-semibold">{f.visitors}{i > 0 && firstStep ? ` · ${Math.round((f.visitors / firstStep) * 100)}%` : ''}</span></div>
          <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-orange-500" style={{ width: `${firstStep ? (f.visitors / firstStep) * 100 : 0}%` }} /></div></li>)}</ul>
        {data.orders.count > 0 && <p className="mt-3 text-sm text-slate-600">Оплата: {fromRecord(data.orders.payment).map(x => `${label(x.name)} ${x.count}`).join(', ')} · Получение: {fromRecord(data.orders.method).map(x => `${label(x.name)} ${x.count}`).join(', ')}</p>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Что ищут на сайте"><Bars items={data.searches} empty="Поисков пока не было" /></Card>
        <Card title="❗ Искали и не нашли — чего людям не хватает"><Bars items={data.searches_without_results} empty="Все находили то, что искали" /></Card>
        <Card title="Чаще кладут в корзину"><Bars items={data.dishes_added} /></Card>
        <Card title="Чаще открывают блюда"><Bars items={data.dishes_viewed} /></Card>
        <Card title="Откуда пришли"><Bars items={data.sources} /></Card>
        <Card title="Какие разделы смотрят"><Bars items={data.sections} /></Card>
        <Card title="Популярные страницы"><Bars items={data.pages} /></Card>
        <Card title="Читают новости"><Bars items={data.news_read} /></Card>
        <Card title="Устройства"><Bars items={data.devices} fmt={label} /></Card>
        <Card title="Телефоны и браузеры"><Bars items={[...data.platforms, ...data.browsers]} fmt={label} /></Card>
        <Card title="Приложение и уведомления"><Bars items={[{ name: 'Предложили установить', count: data.app.install_offered }, { name: 'Нажали «Установить»', count: data.app.install_clicked }, { name: 'Установили', count: data.app.installed }, { name: 'Включили уведомления', count: data.app.push_enabled }]} /></Card>
        <Card title="Вход на сайт"><Bars items={[{ name: 'Открыли вход', count: data.login.opened }, { name: 'Запросили код', count: data.login.code_requested }, { name: 'Вошли', count: data.login.logged_in }]} /></Card>
      </div>
      <Card title="В какие часы заходят (по Алматы)">
        <div className="flex h-28 items-end gap-[3px]">{data.hours.map(h => <div key={h.hour} className="flex flex-1 flex-col items-center gap-1" title={`${h.hour}:00 — ${h.pageviews}`}>
          <div className="w-full rounded-t bg-emerald-500" style={{ height: `${(h.pageviews / maxHour) * 100}%`, minHeight: h.pageviews ? 2 : 0 }} />
          <span className="text-[9px] text-slate-400">{h.hour}</span></div>)}</div>
      </Card>
    </>}

    {tab === 'errors' && <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showFixed} onChange={e => setShowFixed(e.target.checked)} />Показать и исправленные</label>
      {errors && !errors.length && <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 font-semibold text-emerald-800"><CheckCircle2 className="h-5 w-5" />Ошибок нет</p>}
      {errors?.map(e => <article key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex min-w-0 items-start gap-2 font-semibold text-slate-900"><AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${e.status === 'new' ? 'text-red-500' : 'text-amber-500'}`} /><span className="break-words">{e.message}</span></p>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.status === 'new' ? 'bg-red-50 text-red-700' : e.status === 'fixed' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{e.status === 'new' ? 'Новая' : e.status === 'fixed' ? 'Исправлена' : 'Известна'}</span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{e.source === 'client' ? 'У посетителя' : 'На сервере'} · {e.path || '—'} · {e.browser || '—'} · {e.count} раз · затронуто людей: {e.visitors} · последний раз {e.last_seen ? new Date(e.last_seen).toLocaleString('ru-RU') : '—'}</p>
        {e.note && <p className="mt-1 text-sm text-slate-700">Заметка: {e.note}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setOpen(open === e.id ? null : e.id)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-sm">{open === e.id ? 'Скрыть детали' : 'Детали'}</button>
          {e.status !== 'known' && e.status !== 'fixed' && <button onClick={() => void setStatus(e, 'known')} className="min-h-9 rounded-lg border border-slate-200 px-3 text-sm">Известна, разбираемся</button>}
          {e.status !== 'fixed' && <button onClick={() => void setStatus(e, 'fixed')} className="min-h-9 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">Исправлена</button>}
        </div>
        {open === e.id && <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700">{e.stack || 'Нет подробностей'}</pre>}
      </article>)}
    </div>}
  </div>;
}
