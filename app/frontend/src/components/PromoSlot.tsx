/**
 * One quiet, native-looking promo card for our own services and partners (DAM ALEM, Кровля 365…).
 *
 * Rules so it is noticed but never annoying:
 *  - at most one card per page, placed where people already read (after a news story, inside the ads feed);
 *  - DAM ALEM is chosen around meal times and shows a real dish with its price for that time of day;
 *  - roofing partner is chosen when the page is about building / repairs / services;
 *  - otherwise the two take turns, so the same card is not shown again and again;
 *  - «×» hides that promo for 3 days on this device;
 *  - views, clicks and closes go to the site statistics (promo_view / promo_click / promo_close).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle, Phone, X } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { phoneLink, whatsappLink } from '@/lib/directoryContent';
import { track } from '@/lib/analytics';

export type PromoKind = 'dam' | 'partner';
const HIDE_KEY = 's24_promo_hidden';
const TURN_KEY = 's24_promo_turn';
const HIDE_DAYS = 3;
export const BUILD_WORDS = /(кровл|крыш|ремонт|строит|стройк|фасад|водосток|сайдинг|профнастил|металлочереп|утепл|мастер|услуг|шатыр|құрылыс|жөндеу)/i;

function hidden(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(HIDE_KEY) || '{}') || {}; } catch { return {}; }
}
function isHidden(key: string) { return (hidden()[key] || 0) > Date.now(); }
function hide(key: string) {
  try { localStorage.setItem(HIDE_KEY, JSON.stringify({ ...hidden(), [key]: Date.now() + HIDE_DAYS * 864e5 })); } catch { /* storage off */ }
}
function nextTurn(): PromoKind {
  try {
    const last = sessionStorage.getItem(TURN_KEY) as PromoKind | null;
    const next: PromoKind = last === 'dam' ? 'partner' : 'dam';
    sessionStorage.setItem(TURN_KEY, next);
    return next;
  } catch { return Math.random() < 0.5 ? 'dam' : 'partner'; }
}

/** Almaty time of day decides what food to suggest. */
function daypart(): 'morning' | 'lunch' | 'afternoon' | 'evening' | 'night' {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Almaty' }).format(new Date()));
  if (h >= 7 && h < 11) return 'morning';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 15 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}
const mealTime = () => ['lunch', 'evening'].includes(daypart());

const DAY_COPY = {
  morning: { ru: 'Кофе и завтрак с доставкой', kz: 'Кофе мен таңғы ас жеткізу', cats: ['coffee', 'hot-tea'] },
  lunch: { ru: 'Обед с доставкой — готовим после заказа', kz: 'Түскі ас жеткізу — тапсырыстан кейін дайындаймыз', cats: ['ufo', 'vtorye-blyuda', 'pizza-30'] },
  afternoon: { ru: 'Перекусить? Привезём горячим', kz: 'Тамақтанып алу керек пе? Ыстықтай жеткіземіз', cats: ['ufo', 'zakuski', 'molochnye-kokteyli'] },
  evening: { ru: 'Ужин домой — бургеры и пицца', kz: 'Үйге кешкі ас — бургер мен пицца', cats: ['pizza-30', 'ufo'] },
  night: { ru: 'Бургеры и пицца с доставкой', kz: 'Бургер мен пицца жеткізу', cats: ['ufo', 'pizza-30'] },
};

type Dish = { id: number; name: string; price: number; image: string };

async function pickDish(cats: string[]): Promise<Dish | null> {
  const ttl = 5 * 60 * 1000;
  const [catRes, itemRes]: any[] = await Promise.all([
    fetchWithCache('index_food_cats', () => withRetry(() => client.entities.food_categories.query({ query: { is_active: true }, sort: 'sort_order', limit: 100 })), ttl),
    fetchWithCache('index_food_items', () => withRetry(() => client.entities.food_items.query({ query: { is_active: true }, sort: 'sort_order', limit: 300 })), ttl),
  ]);
  const catRows: any[] = catRes?.data?.items ?? catRes?.items ?? [];
  const ids = new Set(catRows.filter((c) => cats.includes(c.slug)).map((c) => c.id));
  const items: any[] = (itemRes?.data?.items ?? itemRes?.items ?? []).filter((i: any) => i.is_active !== false && i.available !== false && i.image_url && Number(i.price) > 0);
  const pool = items.filter((i) => ids.has(i.category_id));
  const list = pool.length ? pool : items;
  if (!list.length) return null;
  const i = list[Math.floor(Math.random() * Math.min(list.length, 8))];
  return { id: i.id, name: String(i.name).trim(), price: Number(i.price), image: i.image_url };
}

export default function PromoSlot({ placement, context = '', prefer, className = '' }: {
  placement: string; context?: string; prefer?: PromoKind; className?: string;
}) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const { isEnabled } = useModules();
  const [dish, setDish] = useState<Dish | null>(null);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [closed, setClosed] = useState(false);
  const seen = useRef(false);
  const ref = useRef<HTMLDivElement>(null);

  // Decide once per page view.
  const kind = useMemo<PromoKind | null>(() => {
    const damOk = isEnabled('food') && !isHidden('dam');
    const partnerOk = isEnabled('business') && !isHidden('partner');
    if (!damOk && !partnerOk) return null;
    if (!damOk) return 'partner';
    if (!partnerOk) return 'dam';
    if (prefer) return prefer;
    if (BUILD_WORDS.test(context)) return 'partner';
    if (mealTime()) return 'dam';
    return nextTurn();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const part = daypart();
  useEffect(() => {
    let live = true;
    if (kind === 'dam') pickDish(DAY_COPY[part].cats).then((d) => { if (live) setDish(d); }).catch(() => {});
    if (kind === 'partner') partnerProfiles.list().then((r) => {
      const list = r.items.filter((p) => p.published);
      if (live) setPartner(list.find((p) => p.slug === 'krovlya-365') || list[0] || null);
    }).catch(() => {});
    return () => { live = false; };
  }, [kind, part]);

  const ready = !closed && ((kind === 'dam' && dish) || (kind === 'partner' && partner));
  const promoName = kind === 'dam' ? 'dam_alem' : partner?.slug || 'partner';

  // Count a view only when the card is really on screen.
  useEffect(() => {
    if (!ready || seen.current || !ref.current) return;
    const el = ref.current;
    const mark = () => { if (!seen.current) { seen.current = true; track('promo_view', { promo: promoName, placement }); } };
    if (typeof IntersectionObserver === 'undefined') { mark(); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { mark(); io.disconnect(); } }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [ready, promoName, placement]);

  if (!ready) return null;
  const click = (action: string) => () => track('promo_click', { promo: promoName, placement, action });
  const close = () => { hide(kind!); setClosed(true); track('promo_close', { promo: promoName, placement }); };
  const shell = `relative flex gap-3 overflow-hidden rounded-2xl border p-3 shadow-sm ${className}`;
  const closeBtn = (
    <button type="button" onClick={close} aria-label={kz ? 'Жасыру' : 'Скрыть'} className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/10">
      <X className="h-4 w-4" />
    </button>
  );

  if (kind === 'dam' && dish) {
    const copy = DAY_COPY[part];
    return (
      <div ref={ref} data-promo="dam" className={`${shell} border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 dark:border-orange-500/30 dark:from-orange-500/10 dark:to-amber-500/5`}>
        {closeBtn}
        <Link to={`/food#product=${dish.id}`} onClick={click('photo')} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-orange-100">
          <StorageImg objectKey={dish.image} alt={dish.name} className="h-full w-full object-cover" />
        </Link>
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-300">DAM ALEM 2.0 · {kz ? 'жеткізу' : 'доставка'}</p>
          <p className="mt-0.5 text-[15px] font-bold leading-snug text-gray-900 dark:text-slate-100">{kz ? copy.kz : copy.ru}</p>
          <p className="mt-0.5 truncate text-sm text-gray-600 dark:text-slate-300">{dish.name} · <b>{dish.price.toLocaleString('ru-RU').replace(/,/g, ' ')} ₸</b></p>
          <Link to={`/food#product=${dish.id}`} onClick={click('order')} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600">
            {kz ? 'Тапсырыс беру' : 'Заказать'} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const p = partner!;
  const phone = phoneLink(p.phone);
  const wa = whatsappLink(p.whatsapp);
  return (
    <div ref={ref} data-promo="partner" className={`${shell} border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900`}>
      {closeBtn}
      <Link to={`/partners/${p.slug}`} onClick={click('photo')} className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
        {(p.cover || p.logo) && <StorageImg objectKey={p.cover || p.logo} alt={p.name} className="h-full w-full object-cover" />}
      </Link>
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{kz ? 'Жоба серіктесі' : 'Партнёр'} · {p.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[15px] font-bold leading-snug text-gray-900 dark:text-slate-100">{p.headline}</p>
        {p.offer && <p className="mt-0.5 line-clamp-1 text-sm text-emerald-700 dark:text-emerald-300">{p.offer}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Link to={`/partners/${p.slug}`} onClick={click('more')} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900">
            {kz ? 'Толығырақ' : 'Подробнее'} <ArrowRight className="h-4 w-4" />
          </Link>
          {phone && <a href={phone} onClick={click('call')} aria-label={kz ? 'Қоңырау шалу' : 'Позвонить'} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 dark:border-slate-600 dark:text-slate-200"><Phone className="h-4 w-4" /></a>}
          {wa && <a href={wa} onClick={click('whatsapp')} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp" className="flex h-8 w-8 items-center justify-center rounded-lg border border-green-200 text-green-600"><MessageCircle className="h-4 w-4" /></a>}
        </div>
      </div>
    </div>
  );
}
