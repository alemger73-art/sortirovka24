/**
 * Home page: DAM ALEM food delivery.
 * Menu categories with real dish photos (Бургеры, Пиццы, Закуски…) and a row of hit dishes with prices.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';

type Dish = { id: number; name: string; price: number; image: string; to: string };
type Cat = { slug: string; name: string; image: string };

/** Short names for the home page, in the order people look for food. */
const CATS: { slug: string; ru: string; kz: string }[] = [
  { slug: 'ufo', ru: 'Бургеры', kz: 'Бургерлер' },
  { slug: 'pizza-30', ru: 'Пиццы', kz: 'Пиццалар' },
  { slug: 'zakuski', ru: 'Закуски', kz: 'Тіскебасарлар' },
  { slug: 'vtorye-blyuda', ru: 'Горячее', kz: 'Ыстық тағам' },
  { slug: 'molochnye-kokteyli', ru: 'Коктейли', kz: 'Коктейльдер' },
  { slug: 'coffee', ru: 'Кофе', kz: 'Кофе' },
  { slug: 'hot-tea', ru: 'Чай', kz: 'Шай' },
  { slug: 'napitki', ru: 'Напитки', kz: 'Сусындар' },
];
const HIT_CATS = ['ufo', 'pizza-30', 'vtorye-blyuda', 'zakuski'];
const money = (v: number) => `${v.toLocaleString('ru-RU').replace(/,/g, ' ')} ₸`;

export default function HomeFood({ banners, heroImage }: { banners: any[]; heroImage: string }) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const [cats, setCats] = useState<Cat[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);

  useEffect(() => {
    let cancelled = false;
    const ttl = 5 * 60 * 1000;
    Promise.all([
      fetchWithCache('index_food_cats', () => withRetry(() => client.entities.food_categories.query({ query: { is_active: true }, sort: 'sort_order', limit: 100 })), ttl),
      fetchWithCache('index_food_items', () => withRetry(() => client.entities.food_items.query({ query: { is_active: true }, sort: 'sort_order', limit: 300 })), ttl),
    ]).then(([catRes, itemRes]: any[]) => {
      if (cancelled) return;
      const catRows: any[] = catRes?.data?.items ?? catRes?.items ?? [];
      const items: any[] = (itemRes?.data?.items ?? itemRes?.items ?? []).filter((i: any) => i.is_active !== false && i.available !== false && i.image_url && Number(i.price) > 0);
      const bySlug = new Map(catRows.filter((c) => c.is_active !== false && c.slug).map((c) => [c.slug, c]));
      const catOf = (slug: string) => bySlug.get(slug)?.id;

      setCats(CATS.flatMap((c) => {
        const id = catOf(c.slug);
        const photo = items.find((i) => i.category_id === id)?.image_url;
        return id && photo ? [{ slug: c.slug, name: kz ? c.kz : c.ru, image: photo }] : [];
      }));

      // Hits: dishes from the admin's food banners first, then combos, then burgers / pizzas / hot food in menu order.
      const bannerIds = banners.filter((b) => b.banner_type === 'food_delivery')
        .map((b) => Number(/product=(\d+)/.exec(String(b.button_url || b.link_url || ''))?.[1])).filter(Boolean);
      const hitCatIds = new Set(HIT_CATS.map(catOf).filter(Boolean));
      const ordered = [
        ...bannerIds.map((id) => items.find((i) => i.id === id)).filter(Boolean),
        ...items.filter((i) => /комбо|набор|сет/i.test(i.name)),
        ...items.filter((i) => hitCatIds.has(i.category_id)),
      ];
      const seen = new Set<number>();
      const hits: Dish[] = [];
      for (const i of ordered) {
        if (seen.has(i.id) || hits.length >= 12) continue;
        seen.add(i.id);
        hits.push({ id: i.id, name: String(i.name).trim(), price: Number(i.price), image: i.image_url, to: `/food#product=${i.id}` });
      }
      setDishes(hits);
    }).catch(() => { /* the section still shows the «Заказать» card */ });
    return () => { cancelled = true; };
  }, [banners, kz]);

  return (
    <section className="home-food" aria-label={tx('Доставка еды', 'Тамақ жеткізу')}>
      <div className="public-section-head">
        <div><span className="public-kicker">DAM ALEM 2.0</span><h2>{tx('Доставка еды', 'Тамақ жеткізу')}</h2></div>
        <Link to="/food">{tx('Всё меню', 'Барлық мәзір')}<ArrowRight size={18} /></Link>
      </div>

      {cats.length > 0 && (
        <nav aria-label={tx('Категории меню', 'Мәзір санаттары')} className="no-scrollbar -mx-4 mb-4 flex gap-3 overflow-x-auto px-4 md:mx-0 md:px-0">
          {cats.map((c) => (
            <Link key={c.slug} to={`/food?category=${c.slug}`} className="group flex w-[72px] shrink-0 flex-col items-center gap-1.5 text-center">
              <span className="h-[68px] w-[68px] overflow-hidden rounded-full bg-orange-50 ring-2 ring-orange-200 transition group-hover:ring-orange-400 dark:bg-slate-800 dark:ring-orange-500/40">
                <StorageImg objectKey={c.image} alt="" className="h-full w-full object-cover" />
              </span>
              <span className="text-[12px] font-medium leading-tight text-gray-800 dark:text-slate-200">{c.name}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <Link to="/food" className="relative flex w-[220px] shrink-0 items-end overflow-hidden rounded-2xl shadow-sm md:w-[300px]" style={{ minHeight: 236 }}>
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="relative p-4 text-white">
            <p className="text-lg font-extrabold leading-tight">{tx('Готовим после заказа', 'Тапсырыстан кейін дайындаймыз')}</p>
            <p className="mt-1 text-xs text-white/85">{tx('Привозим горячим по Сортировке', 'Сортировка бойынша ыстықтай жеткіземіз')}</p>
            <span className="mt-3 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold"><ShoppingBag className="h-4 w-4" />{tx('Заказать', 'Тапсырыс беру')}</span>
          </div>
        </Link>
        {dishes.map((d) => (
          <Link key={d.id} to={d.to} className="flex w-[150px] shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 md:w-[180px]">
            <div className="aspect-[1/1] bg-orange-50 dark:bg-slate-800"><StorageImg objectKey={d.image} alt={d.name} className="h-full w-full object-cover" /></div>
            <div className="flex flex-1 flex-col p-3">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-slate-100">{d.name}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{money(d.price)}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-lg font-bold leading-none text-white" aria-hidden>+</span>
              </div>
            </div>
          </Link>
        ))}
        <Link to="/food" className="flex w-[130px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-orange-300 bg-orange-50/60 p-4 text-center text-sm font-semibold text-orange-700 dark:border-orange-500/40 dark:bg-slate-900 dark:text-orange-300">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500 text-white"><ArrowRight className="h-5 w-5" /></span>
          {tx('Всё меню', 'Барлық мәзір')}
        </Link>
      </div>
    </section>
  );
}
