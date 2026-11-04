/** The partner's cabinet: orders with the customer's details, prices and stock, who receives orders in Telegram.
 *  Sign-in comes from the shop's Telegram bot («🛠 Кабинет магазина»): a one-time #code becomes a 30-day token. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, Copy, ExternalLink, LogOut, MapPin, MessageSquare, Phone, RefreshCw, Search, Send, Store } from 'lucide-react';
import Layout from '@/components/Layout';
import { money, shopCabinet, sizeOf, type Cabinet, type CabinetOrder, type CabinetProduct, type OrderStatus } from '@/lib/partnerShop';

const tokenKey = (slug: string) => `s24_shop_cabinet_${slug}`;
const readToken = (slug: string) => { try { return localStorage.getItem(tokenKey(slug)) || ''; } catch { return ''; } };
const writeToken = (slug: string, token: string) => { try { token ? localStorage.setItem(tokenKey(slug), token) : localStorage.removeItem(tokenKey(slug)); } catch { /* memory only */ } };
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const STATUS_STYLE: Record<OrderStatus, string> = {
  new: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100', accepted: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100',
  done: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100', cancelled: 'bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};
type Tab = 'orders' | 'products' | 'team';

export default function PartnerShopCabinet() {
  const { slug = '' } = useParams();
  const [token, setToken] = useState(() => readToken(slug));
  const [data, setData] = useState<Cabinet | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('orders');

  const signOut = useCallback((message = '') => { writeToken(slug, ''); setToken(''); setData(null); setError(message); }, [slug]);
  const load = useCallback(async () => {
    if (!token) return;
    try { setData(await shopCabinet.get(slug, token)); setError(''); }
    catch (e) { (e as { status?: number }).status === 401 ? signOut((e as Error).message) : setError((e as Error).message); }
  }, [slug, token, signOut]);

  useEffect(() => {  // a fresh sign-in link from the bot: #code=…
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname);
    shopCabinet.login(slug, code).then(r => { writeToken(slug, r.token); setToken(r.token); }).catch(e => setError(e.message));
  }, [slug]);
  useEffect(() => { load(); const timer = window.setInterval(load, 30000); return () => window.clearInterval(timer); }, [load]);

  const accent = data?.accent || '#2f5a34';
  return <Layout><div className="mx-auto max-w-4xl px-4 pb-28 pt-5 sm:px-6">
    {!token ? <SignIn error={error} /> : !data ? <p role="status" className="py-16 text-center text-gray-500">{error || 'Открываем кабинет…'}</p> : <>
      <header className="flex flex-wrap items-center gap-3">
        {data.logo && <img src={data.logo} alt="" className="h-12 w-12 rounded-full object-cover" />}
        <div className="min-w-0 flex-1"><p className="text-sm text-gray-500">Кабинет магазина</p><h1 className="truncate text-2xl font-extrabold">{data.name}</h1></div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Link to={`/shop/${slug}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold dark:border-gray-700"><Store className="h-4 w-4" />Открыть витрину</Link>
          <button onClick={() => signOut()} className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm text-gray-500 sm:ml-0"><LogOut className="h-4 w-4" />Выйти</button>
        </div>
      </header>
      {!data.enabled && <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">Витрина сейчас скрыта с сайта. Чтобы открыть её, напишите Сортировка 24.</p>}

      <dl className="mt-5 grid grid-cols-3 gap-2">
        <Stat label="Новые заказы" value={String(data.stats.new)} accent={data.stats.new ? accent : undefined} />
        <Stat label="Заказов за 30 дней" value={String(data.stats.month_orders)} />
        <Stat label="На сумму" value={money(data.stats.month_total)} />
      </dl>

      <nav className="mt-5 flex gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-gray-900" aria-label="Разделы кабинета">
        {([['orders', 'Заказы'], ['products', 'Товары'], ['team', 'Telegram']] as [Tab, string][]).map(([id, label]) =>
          <button key={id} onClick={() => setTab(id)} aria-pressed={tab === id}
            className={`min-h-11 flex-1 rounded-xl text-sm font-semibold ${tab === id ? 'bg-white shadow-sm dark:bg-gray-800' : 'text-gray-500'}`}>
            {label}{id === 'orders' && data.stats.new > 0 && <span className="ml-1.5 rounded-full px-1.5 text-xs text-white" style={{ background: accent }}>{data.stats.new}</span>}</button>)}
      </nav>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      {tab === 'orders' && <Orders data={data} slug={slug} token={token} accent={accent} onChange={o => setData({ ...data, orders: data.orders.map(x => x.id === o.id ? o : x), stats: { ...data.stats, new: data.orders.filter(x => (x.id === o.id ? o : x).status === 'new').length } })} onRefresh={load} />}
      {tab === 'products' && <Products data={data} slug={slug} token={token} accent={accent} onChange={p => setData({ ...data, products: data.products.map(x => x.sku === p.sku ? p : x) })} />}
      {tab === 'team' && <Team data={data} slug={slug} token={token} accent={accent} />}
    </>}
  </div></Layout>;
}

function SignIn({ error }: { error: string }) {
  return <div className="mx-auto max-w-md py-10 text-center">
    <Send className="mx-auto h-12 w-12 text-sky-500" />
    <h1 className="mt-4 text-2xl font-extrabold">Кабинет магазина</h1>
    {error && <p role="alert" className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <p className="mt-3 text-gray-600 dark:text-gray-300">Вход — через Telegram, куда приходят заказы. Откройте чат с ботом Сортировка 24 и нажмите «🛠 Кабинет магазина» (или напишите слово «Кабинет»). Бот пришлёт кнопку для входа.</p>
  </div>;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
    <dt className="text-xs text-gray-500">{label}</dt><dd className="mt-1 text-xl font-extrabold" style={accent ? { color: accent } : undefined}>{value}</dd></div>;
}

type Section = { data: Cabinet; slug: string; token: string; accent: string };

function Orders({ data, slug, token, accent, onChange, onRefresh }: Section & { onChange: (o: CabinetOrder) => void; onRefresh: () => void }) {
  const [filter, setFilter] = useState<OrderStatus | 'active'>('active');
  const [busy, setBusy] = useState(0);
  const [failed, setFailed] = useState('');
  const shown = data.orders.filter(o => filter === 'active' ? o.status === 'new' || o.status === 'accepted' : o.status === filter);
  async function move(order: CabinetOrder, status: OrderStatus) {
    setBusy(order.id); setFailed('');
    try { onChange(await shopCabinet.status(slug, token, order.id, status)); }
    catch (e) { setFailed(`Заказ №${order.id}: ${(e as Error).message}`); }
    finally { setBusy(0); }
  }
  return <section className="mt-4" aria-label="Заказы">
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {([['active', 'В работе'], ['done', 'Выполнены'], ['cancelled', 'Отменены']] as [typeof filter, string][]).map(([id, label]) =>
        <button key={id} onClick={() => setFilter(id)} aria-pressed={filter === id} className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold dark:border-gray-700"
          style={filter === id ? { background: accent, borderColor: accent, color: '#fff' } : undefined}>{label}</button>)}
      <button onClick={onRefresh} aria-label="Обновить" className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border dark:border-gray-700"><RefreshCw className="h-4 w-4" /></button>
    </div>
    {failed && <p role="alert" className="mt-2 text-sm text-red-600">{failed}</p>}
    {shown.length === 0 && <p className="py-10 text-center text-gray-500">{filter === 'active' ? 'Новых заказов пока нет. Они появятся здесь и в Telegram.' : 'Здесь пока пусто.'}</p>}
    <ul className="mt-3 space-y-3">{shown.map(o => <li key={o.id} className="rounded-[22px] border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold">Заказ №{o.id}</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[o.status]}`}>{data.statuses[o.status]}{o.accepted_by && o.status !== 'new' ? ` · ${o.accepted_by}` : ''}</span>
      </div>
      <p className="text-xs text-gray-500">{when(o.created_at)}</p>
      <ul className="mt-3 space-y-1 text-sm">{o.items.map(i => <li key={i.sku} className="flex justify-between gap-3"><span>{i.name} × {i.qty}</span><span className="shrink-0">{money(i.price * i.qty)}</span></li>)}</ul>
      <p className="mt-2 flex justify-between border-t pt-2 font-bold dark:border-gray-800"><span>Итого</span><span>{money(o.total)}</span></p>
      <div className="mt-3 space-y-1.5 text-sm">
        <p className="font-semibold">{o.name}</p>
        <a href={`tel:${o.phone}`} className="flex items-center gap-2 font-semibold" style={{ color: accent }}><Phone className="h-4 w-4" />{o.phone}</a>
        <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />{o.address}{o.zone && ` · ${o.zone}`}</p>
        {(o.wanted || o.comment) && <p className="flex items-start gap-2 text-gray-600 dark:text-gray-300"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />{[o.wanted, o.comment].filter(Boolean).join(' · ')}</p>}
      </div>
      {(o.status === 'new' || o.status === 'accepted') && <div className="mt-4 flex gap-2">
        {o.status === 'new'
          ? <button disabled={busy === o.id} onClick={() => move(o, 'accepted')} className="min-h-11 flex-1 rounded-xl font-semibold text-white disabled:opacity-60" style={{ background: accent }}>Принять</button>
          : <button disabled={busy === o.id} onClick={() => move(o, 'done')} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl font-semibold text-white disabled:opacity-60" style={{ background: accent }}><Check className="h-4 w-4" />Доставлен</button>}
        <button disabled={busy === o.id} onClick={() => move(o, 'cancelled')} className="min-h-11 rounded-xl border px-4 text-sm font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">Отменить</button>
      </div>}
      {o.status === 'cancelled' && <button onClick={() => move(o, 'new')} className="mt-3 text-sm font-semibold" style={{ color: accent }}>Вернуть в работу</button>}
    </li>)}</ul>
  </section>;
}

function Products({ data, slug, token, accent, onChange }: Section & { onChange: (p: CabinetProduct) => void }) {
  const [query, setQuery] = useState('');
  const [saved, setSaved] = useState('');
  const [failed, setFailed] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = useMemo(() => data.products.filter(p => !needle || `${p.name} ${p.category}`.toLowerCase().includes(needle)), [data.products, needle]);
  async function save(p: CabinetProduct, change: Partial<Pick<CabinetProduct, 'price' | 'active' | 'description'>>) {
    setFailed('');
    try { onChange(await shopCabinet.product(slug, token, p.sku, change)); setSaved(p.sku); window.setTimeout(() => setSaved(s => s === p.sku ? '' : s), 1500); }
    catch (e) { setFailed(`${p.name}: ${(e as Error).message}`); }
  }
  return <section className="mt-4" aria-label="Товары">
    <p className="text-sm text-gray-500">Цена сохраняется сама, как только вы выйдете из поля. «Нет в наличии» убирает товар с витрины, пока вы его не вернёте.</p>
    <label className="relative mt-3 block"><span className="sr-only">Поиск товара</span>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
      <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Найти товар" className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-12 pr-4 dark:border-gray-700 dark:bg-gray-900" />
    </label>
    {failed && <p role="alert" className="mt-2 text-sm text-red-600">{failed}</p>}
    <ul className="mt-3 divide-y divide-gray-100 rounded-[22px] border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
      {shown.map(p => <li key={p.sku} className={`flex gap-3 p-3 ${p.active ? '' : 'opacity-60'}`}>
        {p.image ? <img src={p.image} alt="" className="h-16 w-14 shrink-0 rounded-xl object-cover" /> : <div className="h-16 w-14 shrink-0 rounded-xl bg-gray-100 dark:bg-gray-800" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug">{p.name}</p>
          <p className="text-xs text-gray-500">{[p.category, sizeOf(p)].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-sm"><span className="sr-only">Цена {p.name}</span>
              <input type="number" inputMode="numeric" min={1} defaultValue={p.price} key={`${p.sku}-${p.price}`}
                onBlur={e => { const price = Number(e.target.value); if (price > 0 && price !== p.price) save(p, { price }); }}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-right font-semibold dark:border-gray-700 dark:bg-gray-950" />₸</label>
            <button onClick={() => save(p, { active: !p.active })} aria-pressed={p.active}
              className="min-h-9 rounded-lg border px-3 text-xs font-semibold dark:border-gray-700" style={p.active ? { color: accent, borderColor: accent } : undefined}>
              {p.active ? 'В наличии' : 'Нет в наличии'}</button>
            {saved === p.sku && <span className="flex items-center gap-1 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />Сохранено</span>}
          </div>
        </div>
      </li>)}
    </ul>
  </section>;
}

function Team({ data, slug, token, accent }: Section) {
  const [invite, setInvite] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  async function create() {
    setError('');
    try { setInvite((await shopCabinet.invite(slug, token)).url); } catch (e) { setError((e as Error).message); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { setCopied(false); }
  }
  return <section className="mt-4 space-y-4" aria-label="Telegram">
    <div className="rounded-[22px] border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h2 className="font-bold">Заказы получают в Telegram</h2>
      <ul className="mt-3 space-y-2">{data.telegram.map(p => <li key={p.linked_at + p.name} className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2"><Send className="h-4 w-4 text-sky-500" />{p.name}</span><span className="text-gray-500">с {when(p.linked_at)}</span></li>)}</ul>
    </div>
    <div className="rounded-[22px] p-4" style={{ background: `${accent}14` }}>
      <h2 className="font-bold">Добавить сотрудника</h2>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Создайте ссылку и отправьте её сотруднику. Он откроет её в Telegram, нажмёт «Старт» — и тоже начнёт получать заказы. Ссылка действует неделю.</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      {invite ? <div className="mt-3 flex gap-2">
        <input readOnly value={invite} aria-label="Ссылка для сотрудника" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-950" onFocus={e => e.target.select()} />
        <button onClick={copy} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white" style={{ background: accent }}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Скопировано' : 'Копировать'}</button>
        <a href={invite} target="_blank" rel="noopener noreferrer" aria-label="Открыть ссылку" className="flex h-11 w-11 items-center justify-center rounded-xl border dark:border-gray-700"><ExternalLink className="h-4 w-4" /></a>
      </div> : <button onClick={create} className="mt-3 min-h-11 rounded-xl px-4 font-semibold text-white" style={{ background: accent }}>Создать ссылку</button>}
    </div>
  </section>;
}
