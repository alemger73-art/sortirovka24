/** A partner's shop inside Сортировка 24: catalog with product cards, cart, order straight to the partner's Telegram. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { track } from '@/lib/analytics';
import { ArrowLeft, Check, Leaf, MessageCircle, Minus, Phone, Plus, Search, ShoppingBag, Truck, X } from 'lucide-react';
import Layout from '@/components/Layout';
import ProductSheet from '@/components/partner-shop/ProductSheet';
import { usePageSeo } from '@/hooks/usePageSeo';
import { phoneLink, whatsappLink } from '@/lib/directoryContent';
import { accountApi, getAccountToken } from '@/lib/accountApi';
import { cacheAccountProfile, getAccountPrefill, onAuthChanged } from '@/lib/localAuth';
import { money, partnerShop, sizeOf, type Shop, type ShopProduct } from '@/lib/partnerShop';

type Cart = Record<string, number>;
const cartKey = (slug: string) => `s24_shop_cart_${slug}`;

function loadCart(slug: string): Cart {
  try { return JSON.parse(localStorage.getItem(cartKey(slug)) || '{}') || {}; } catch { return {}; }
}
function saveCart(slug: string, cart: Cart) {
  try { localStorage.setItem(cartKey(slug), JSON.stringify(cart)); } catch { /* private mode: cart lives in memory */ }
}
const isFree = (price: string) => /бесплат/i.test(price);

export default function PartnerShop() {
  const { slug = '' } = useParams();
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Cart>(() => loadCart(slug));
  const [viewing, setViewing] = useState<ShopProduct | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '', zone: '', wanted: '', comment: '' });
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState('');
  const [done, setDone] = useState<{ id: number; total: number } | null>(null);

  useEffect(() => {
    let live = true;
    partnerShop.get(slug).then(s => { if (live) setShop(s); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [slug]);
  useEffect(() => saveCart(slug, cart), [slug, cart]);

  // A signed-in resident is not asked again: name, phone and the default address come from the account.
  useEffect(() => {
    let live = true;
    const apply = () => {
      const known = getAccountPrefill();
      setForm(f => ({ ...f, name: f.name || known.name, phone: f.phone || known.phone }));
      return known;
    };
    const known = apply();
    if (getAccountToken()) {
      if (!known.name || !known.phone) {
        accountApi.me().then(me => {
          if (live && me?.id) { cacheAccountProfile({ id: me.id, name: me.name, phone: me.phone, email: me.email, avatar: me.avatar }); apply(); }
        }).catch(() => { /* the fields stay editable */ });
      }
      accountApi.listAddresses().then(list => {
        const home = list.find(a => a.is_default) || list[0];
        if (live && home) setForm(f => ({ ...f, address: f.address || home.address }));
      }).catch(() => { /* typed by hand */ });
    }
    const stop = onAuthChanged(() => { apply(); });
    return () => { live = false; stop(); };
  }, []);
  usePageSeo({ title: shop ? `${shop.name} — заказать с доставкой, Сортировка 24` : undefined, description: shop?.headline, image: shop?.logo });

  const products = shop?.products || [];
  const bySku = useMemo(() => new Map(products.map(p => [p.sku, p])), [products]);
  const lines = Object.entries(cart).filter(([sku, qty]) => bySku.has(sku) && qty > 0).map(([sku, qty]) => ({ product: bySku.get(sku)!, qty }));
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.product.price, 0);
  const accent = shop?.accent || '#2f5a34';
  const needle = query.trim().toLowerCase();
  const visible = products.filter(p => (!category || p.category === category)
    && (!needle || `${p.name} ${p.kind || ''} ${p.category}`.toLowerCase().includes(needle)));
  useEffect(() => {
    if (needle.length < 3 || !products.length) return;
    const timer = window.setTimeout(() => track('search', { area: `магазин ${slug || ''}`.trim(), q: needle.slice(0, 60), results: visible.length }), 1500);
    return () => window.clearTimeout(timer);
  }, [needle, products.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const perCategory = useMemo(() => products.reduce<Record<string, number>>((m, p) => ({ ...m, [p.category]: (m[p.category] || 0) + 1 }), {}), [products]);
  const zone = shop?.delivery.find(z => z.name === form.zone);
  const freeZones = (shop?.delivery || []).filter(z => isFree(z.price)).map(z => z.name);

  const change = (sku: string, delta: number) => setCart(c => {
    const qty = Math.max(0, Math.min(20, (c[sku] || 0) + delta));
    const next = { ...c, [sku]: qty };
    if (!qty) delete next[sku];
    return next;
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!shop || sending) return;
    setFormError(''); setSending(true);
    try {
      const result = await partnerShop.order(slug, { ...form, items: lines.map(l => ({ sku: l.product.sku, qty: l.qty })) });
      setDone(result); setCart({});
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Не получилось отправить заказ');
    } finally { setSending(false); }
  }

  const input = 'w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base dark:border-gray-700 dark:bg-gray-900';
  const call = phoneLink(shop?.phone || ''), wa = whatsappLink(shop?.whatsapp || '');
  return <Layout><div className="mx-auto max-w-6xl px-4 pb-40 pt-3 sm:px-6">
    {error ? <div role="alert" className="mt-4 rounded-3xl border p-8 text-center">{error}</div> : !shop ? <p role="status" className="py-16 text-center text-gray-500">Загружаем каталог…</p> : <>
      <header className="flex items-center gap-2.5">
        <Link to="/" aria-label="На главную" className="-ml-2 flex h-11 w-9 shrink-0 items-center justify-center text-gray-500"><ArrowLeft className="h-5 w-5" /></Link>
        {shop.logo && <img src={shop.logo} alt="" className="h-10 w-10 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-700" />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-extrabold leading-tight sm:text-xl">{shop.name}</h1>
          <p className="truncate text-xs text-gray-500 sm:text-sm">{shop.hours || 'Заказ онлайн'}</p>
        </div>
        {call && <a href={call} aria-label="Позвонить в магазин" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" style={{ color: accent }}><Phone className="h-5 w-5" /></a>}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Написать в WhatsApp" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900" style={{ color: accent }}><MessageCircle className="h-5 w-5" /></a>}
      </header>

      <p className="mt-3 flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-white" style={{ background: accent }}>
        <Truck className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{freeZones.length > 0 ? `Бесплатная доставка: ${freeZones.join(', ')}` : 'Доставка до двери'} · оплата при получении</span>
      </p>

      <div className="mt-3">{/* not sticky: on a phone a pinned search covered the products */}
        <label className="relative block"><span className="sr-only">Поиск по каталогу</span>
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={`Поиск среди ${products.length} товаров`} className={`${input} pl-12`} />
        </label>
        <nav aria-label="Категории" className="scrollbar-hide -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          {['', ...shop.categories].map(c => <button key={c || 'all'} onClick={() => { setCategory(c); window.scrollTo({ top: 0 }); }} aria-pressed={category === c}
            className="shrink-0 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold dark:border-gray-700 dark:bg-gray-900"
            style={category === c ? { background: accent, borderColor: accent, color: '#fff' } : undefined}>{c || 'Все'}{c && <span aria-hidden="true" className="ml-1.5 opacity-60">{perCategory[c]}</span>}</button>)}
        </nav>
      </div>

      {visible.length === 0 && <p className="py-12 text-center text-gray-500">Ничего не нашли. Попробуйте другое слово или позвоните магазину — подскажут.</p>}
      {(category || needle ? [{ name: '', items: visible }] : shop.categories.map(c => ({ name: c, items: visible.filter(p => p.category === c) })))
        .filter(group => group.items.length).map(group => <section key={group.name || 'found'} aria-label={group.name || 'Товары'} className="mt-3">
          {group.name && <h2 className="mb-2 mt-4 flex items-baseline justify-between text-lg font-extrabold">{group.name}
            <button onClick={() => { setCategory(group.name); window.scrollTo({ top: 0 }); }} className="text-sm font-semibold" style={{ color: accent }}>Все {group.items.length}</button></h2>}
          <div className={group.name ? 'scrollbar-hide -mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-4' : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'}>
            {(group.name ? group.items.slice(0, 8) : group.items).map(p => <ProductCard key={p.sku} p={p} qty={cart[p.sku] || 0} accent={accent} rail={!!group.name}
              onOpen={() => setViewing(p)} onChange={d => change(p.sku, d)} />)}
          </div>
        </section>)}

      <ol className="mt-10 grid gap-2 text-sm sm:grid-cols-3" aria-label="Как заказать">
        {['Положите товары в корзину', 'Укажите адрес и удобное время', `${shop.name} позвонит, подтвердит и привезёт. Оплата при получении`].map((step, i) =>
          <li key={step} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-white" style={{ background: accent }}>{i + 1}</span>{step}</li>)}
      </ol>

      <section className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Доставка">
        <div className="rounded-[22px] border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Truck className="h-5 w-5" style={{ color: accent }} />Доставка</h2>
          <ul className="mt-3 divide-y divide-gray-100 text-sm dark:divide-gray-800">{shop.delivery.map(z => <li key={z.name} className="flex justify-between gap-3 py-2">
            <span>{z.name}</span><span className={isFree(z.price) ? 'font-semibold' : 'text-gray-500'} style={isFree(z.price) ? { color: accent } : undefined}>{z.price}</span></li>)}</ul>
        </div>
        <div className="rounded-[22px] p-5" style={{ background: `${accent}14` }}>
          <h2 className="text-lg font-bold">Оплата и вопросы</h2>
          {shop.delivery_note && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{shop.delivery_note}</p>}
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">Не знаете, что выбрать в подарок или для тёмной комнаты? Позвоните — магазин подскажет.</p>
        </div>
      </section>

      {count > 0 && !open && !viewing && <button onClick={() => setOpen(true)} className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl px-5 py-4 font-semibold text-white shadow-xl md:bottom-6" style={{ background: accent }}>
        <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />Корзина · {count}</span><span>{money(total)}</span></button>}

      {viewing && <ProductSheet product={viewing} accent={accent} qty={cart[viewing.sku] || 0} onChange={d => change(viewing.sku, d)}
        onClose={() => setViewing(null)} onCart={() => { setViewing(null); setOpen(true); }} />}

      {open && <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Оформление заказа" onClick={() => setOpen(false)}>
        <div className="shop-sheet max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white p-5 dark:bg-gray-950 sm:rounded-[28px]" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{done ? 'Заказ отправлен' : 'Ваш заказ'}</h2><button aria-label="Закрыть" onClick={() => { setOpen(false); setDone(null); }} className="flex h-10 w-10 items-center justify-center"><X className="h-5 w-5" /></button></div>
          {done ? <div className="py-6 text-center">
            <Check className="mx-auto h-12 w-12" style={{ color: accent }} />
            <p className="mt-4 text-lg font-semibold">Заказ №{done.id} на {money(done.total)} передан в {shop.name}</p>
            <p className="mt-2 text-gray-500">Магазин позвонит вам, чтобы подтвердить заказ и время доставки. Оплата — магазину при получении.</p>
          </div> : <form onSubmit={submit} className="mt-4 space-y-3">
            <ul className="divide-y rounded-2xl border dark:divide-gray-800 dark:border-gray-800">{lines.map(l => <li key={l.product.sku} className="flex items-center gap-3 p-3">
              {l.product.image && <img src={l.product.image} alt="" className="h-12 w-10 shrink-0 rounded-lg object-cover" />}
              <span className="min-w-0 flex-1 text-sm">{l.product.name}</span>
              <span className="flex items-center gap-1"><button type="button" aria-label="Меньше" onClick={() => change(l.product.sku, -1)} className="flex h-8 w-8 items-center justify-center rounded-lg border"><Minus className="h-3 w-3" /></button><span className="w-6 text-center text-sm">{l.qty}</span><button type="button" aria-label="Больше" onClick={() => change(l.product.sku, 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border"><Plus className="h-3 w-3" /></button></span>
              <span className="w-20 text-right text-sm font-semibold">{money(l.qty * l.product.price)}</span></li>)}</ul>
            <p className="flex justify-between text-lg font-bold"><span>Итого</span><span>{money(total)}</span></p>
            <label className="block text-sm font-medium">Имя<input required minLength={2} maxLength={80} autoComplete="name" className={`${input} mt-1`} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="block text-sm font-medium">Телефон<input required type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7XX XXX XX XX" className={`${input} mt-1`} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
            {shop.delivery.length > 0 && <label className="block text-sm font-medium">Район доставки<select required className={`${input} mt-1`} value={form.zone} onChange={e => setForm({ ...form, zone: e.target.value })}>
              <option value="">Выберите район</option>{shop.delivery.map(z => <option key={z.name} value={z.name}>{z.name}{z.price ? ` — ${z.price}` : ''}</option>)}</select></label>}
            {zone?.price && <p className="text-sm text-gray-500">Доставка: {zone.price}</p>}
            <label className="block text-sm font-medium">Адрес<input required minLength={2} maxLength={250} autoComplete="street-address" placeholder="Улица, дом, квартира" className={`${input} mt-1`} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></label>
            <label className="block text-sm font-medium">Когда удобно<input maxLength={80} placeholder="Например: сегодня после 15:00" className={`${input} mt-1`} value={form.wanted} onChange={e => setForm({ ...form, wanted: e.target.value })} /></label>
            <label className="block text-sm font-medium">Пожелание<textarea maxLength={300} rows={2} placeholder="Например: на подарок" className={`${input} mt-1`} value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} /></label>
            {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
            <button disabled={sending || !lines.length} className="min-h-12 w-full rounded-2xl font-semibold text-white disabled:opacity-60" style={{ background: accent }}>{sending ? 'Отправляем…' : `Отправить заказ · ${money(total)}`}</button>
            <p className="text-center text-xs text-gray-500">Заказ уйдёт в {shop.name}. Магазин сам позвонит и примет оплату.</p>
          </form>}
        </div>
      </div>}
    </>}
  </div></Layout>;
}

type CardProps = { p: ShopProduct; qty: number; accent: string; rail: boolean; onOpen: () => void; onChange: (delta: number) => void };

function ProductCard({ p, qty, accent, rail, onOpen, onChange }: CardProps) {
  return <article className={`group flex flex-col overflow-hidden rounded-[20px] border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 ${rail ? 'w-[44vw] max-w-[200px] shrink-0 snap-start sm:w-auto sm:max-w-none' : ''}`}>
    <button onClick={onOpen} className="relative block aspect-[4/5] overflow-hidden bg-[#eef2ee] text-left dark:bg-gray-800" aria-label={`Подробнее: ${p.name}`}>
      {p.image ? <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <span className="flex h-full items-center justify-center text-4xl">🪴</span>}
      {p.easy && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-gray-900"><Leaf className="h-3 w-3" style={{ color: accent }} />Неприхотливое</span>}
    </button>
    <div className="flex flex-1 flex-col p-3">
      <p className="text-lg font-extrabold leading-none">{money(p.price)}</p>
      <h3 className="mt-1.5 line-clamp-2 text-sm leading-snug"><button onClick={onOpen} className="text-left">{p.name}</button></h3>
      {sizeOf(p) && <p className="mt-1 text-xs text-gray-500">{sizeOf(p)}</p>}
      <div className="mt-auto pt-2">
        {qty ? <div className="flex items-center justify-between rounded-xl border-2" style={{ borderColor: accent }}>
          <button aria-label={`Убрать ${p.name}`} onClick={() => onChange(-1)} className="flex h-10 w-10 items-center justify-center"><Minus className="h-4 w-4" /></button>
          <span className="font-bold" aria-live="polite">{qty}</span>
          <button aria-label={`Добавить ещё ${p.name}`} onClick={() => onChange(1)} className="flex h-10 w-10 items-center justify-center"><Plus className="h-4 w-4" /></button>
        </div> : <button onClick={() => onChange(1)} className="min-h-10 w-full rounded-xl text-sm font-semibold text-white" style={{ background: accent }}>В корзину</button>}
      </div>
    </div>
  </article>;
}
