/** A partner's shop inside Сортировка 24: catalog by category, cart, order straight to the partner's Telegram. */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Clock, Minus, Plus, ShoppingBag, Truck, X } from 'lucide-react';
import Layout from '@/components/Layout';
import { usePageSeo } from '@/hooks/usePageSeo';
import { money, partnerShop, type Shop, type ShopProduct } from '@/lib/partnerShop';

type Cart = Record<string, number>;
const cartKey = (slug: string) => `s24_shop_cart_${slug}`;

function loadCart(slug: string): Cart {
  try { return JSON.parse(localStorage.getItem(cartKey(slug)) || '{}') || {}; } catch { return {}; }
}
function saveCart(slug: string, cart: Cart) {
  try { localStorage.setItem(cartKey(slug), JSON.stringify(cart)); } catch { /* private mode: cart lives in memory */ }
}
function sizeOf(p: ShopProduct) {
  return [p.height_cm && `высота ${p.height_cm} см`, p.pot_cm && `горшок ⌀${p.pot_cm} см`].filter(Boolean).join(' · ');
}

export default function PartnerShop() {
  const { slug = '' } = useParams();
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [cart, setCart] = useState<Cart>(() => loadCart(slug));
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
  usePageSeo({ title: shop ? `${shop.name} — заказать с доставкой, Сортировка 24` : undefined, description: shop?.headline, image: shop?.logo });

  const bySku = useMemo(() => new Map((shop?.products || []).map(p => [p.sku, p])), [shop]);
  const lines = Object.entries(cart).filter(([sku, qty]) => bySku.has(sku) && qty > 0).map(([sku, qty]) => ({ product: bySku.get(sku)!, qty }));
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + l.qty * l.product.price, 0);
  const accent = shop?.accent || '#2f5a34';
  const visible = (shop?.products || []).filter(p => !category || p.category === category);
  const zone = shop?.delivery.find(z => z.name === form.zone);

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
  return <Layout><div className="mx-auto max-w-5xl px-4 pb-32 pt-5 sm:px-6">
    <Link to="/partners" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-gray-500"><ArrowLeft className="h-4 w-4" />Партнёры района</Link>
    {error ? <div role="alert" className="rounded-3xl border p-8 text-center">{error}</div> : !shop ? <p role="status" className="py-16 text-center text-gray-500">Загружаем каталог…</p> : <>
      <header className="rounded-[2rem] p-5 sm:p-7" style={{ background: `${accent}14` }}>
        <div className="flex items-center gap-4">
          {shop.logo && <img src={shop.logo} alt="" className="h-16 w-16 shrink-0 rounded-full border border-white object-cover shadow-sm" />}
          <div className="min-w-0"><p className="text-xs font-semibold" style={{ color: accent }}>Партнёр Сортировка 24</p><h1 className="text-2xl font-extrabold sm:text-3xl">{shop.name}</h1></div>
        </div>
        {shop.headline && <p className="mt-4 max-w-2xl text-gray-700 dark:text-gray-200">{shop.headline}</p>}
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {shop.hours && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 dark:bg-gray-900"><Clock className="h-4 w-4" />{shop.hours}</span>}
          {shop.delivery.filter(z => /бесплат/i.test(z.price)).length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 dark:bg-gray-900"><Truck className="h-4 w-4" />Бесплатно: {shop.delivery.filter(z => /бесплат/i.test(z.price)).map(z => z.name).join(', ')}</span>}
        </div>
      </header>

      <nav aria-label="Категории" className="sticky top-14 z-10 -mx-4 mt-4 flex gap-2 overflow-x-auto bg-white/95 px-4 py-3 backdrop-blur dark:bg-gray-950/95">
        {['', ...shop.categories].map(c => <button key={c || 'all'} onClick={() => setCategory(c)} aria-pressed={category === c}
          className="shrink-0 rounded-full border px-4 py-2 text-sm font-semibold" style={category === c ? { background: accent, borderColor: accent, color: '#fff' } : undefined}>{c || 'Все'}</button>)}
      </nav>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map(p => {
          const qty = cart[p.sku] || 0;
          return <article key={p.sku} className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="aspect-[4/5] bg-gray-50 dark:bg-gray-800">{p.image ? <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl">🪴</div>}</div>
            <div className="flex flex-1 flex-col p-3">
              <h3 className="text-sm font-semibold leading-snug">{p.name}</h3>
              {sizeOf(p) && <p className="mt-1 text-xs text-gray-500">{sizeOf(p)}</p>}
              <p className="mt-auto pt-2 text-base font-bold">{money(p.price)}</p>
              {qty ? <div className="mt-2 flex items-center justify-between rounded-xl border" style={{ borderColor: accent }}>
                <button aria-label={`Убрать ${p.name}`} onClick={() => change(p.sku, -1)} className="flex h-10 w-10 items-center justify-center"><Minus className="h-4 w-4" /></button>
                <span className="font-semibold" aria-live="polite">{qty}</span>
                <button aria-label={`Добавить ещё ${p.name}`} onClick={() => change(p.sku, 1)} className="flex h-10 w-10 items-center justify-center"><Plus className="h-4 w-4" /></button>
              </div> : <button onClick={() => change(p.sku, 1)} className="mt-2 min-h-10 rounded-xl text-sm font-semibold text-white" style={{ background: accent }}>В корзину</button>}
            </div>
          </article>;
        })}
      </div>
      {shop.delivery_note && <p className="mt-8 rounded-2xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">{shop.delivery_note}</p>}

      {count > 0 && !open && <button onClick={() => setOpen(true)} className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md items-center justify-between rounded-2xl px-5 py-4 font-semibold text-white shadow-xl" style={{ background: accent }}>
        <span className="flex items-center gap-2"><ShoppingBag className="h-5 w-5" />Корзина · {count}</span><span>{money(total)}</span></button>}

      {open && <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Оформление заказа" onClick={() => setOpen(false)}>
        <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-gray-950 sm:rounded-3xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{done ? 'Заказ отправлен' : 'Ваш заказ'}</h2><button aria-label="Закрыть" onClick={() => { setOpen(false); setDone(null); }} className="flex h-10 w-10 items-center justify-center"><X className="h-5 w-5" /></button></div>
          {done ? <div className="py-6 text-center">
            <Check className="mx-auto h-12 w-12" style={{ color: accent }} />
            <p className="mt-4 text-lg font-semibold">Заказ №{done.id} на {money(done.total)} передан в {shop.name}</p>
            <p className="mt-2 text-gray-500">Магазин позвонит вам, чтобы подтвердить заказ и время доставки. Оплата — магазину при получении.</p>
          </div> : <form onSubmit={submit} className="mt-4 space-y-3">
            <ul className="divide-y rounded-2xl border">{lines.map(l => <li key={l.product.sku} className="flex items-center gap-3 p-3">
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
