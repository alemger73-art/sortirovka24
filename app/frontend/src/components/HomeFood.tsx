/**
 * Home page: DAM ALEM food delivery.
 * Menu categories with real dish photos (Бургеры, Пиццы, Закуски…) and a row of hit dishes with prices.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
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

const minutes = (hm: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(hm.trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
/** «11:00 – 22:30» → is the kitchen open now (Karaganda time) and until when. */
function kitchenNow(hours: string): { open: boolean; from: string; to: string } | null {
  const [from, to] = String(hours || '').split(/[–—-]/).map((x) => x.trim());
  const a = from ? minutes(from) : null, b = to ? minutes(to) : null;
  if (a == null || b == null) return null;
  const d = new Date(Date.now() + (new Date().getTimezoneOffset() + 300) * 60000);
  const now = d.getHours() * 60 + d.getMinutes();
  return { open: a < b ? now >= a && now < b : now >= a || now < b, from, to };
}

export default function HomeFood({ banners, heroImage }: { banners: any[]; heroImage: string }) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const [cats, setCats] = useState<Cat[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const ttl = 5 * 60 * 1000;
    Promise.all([
      fetchWithCache('index_food_cats', () => withRetry(() => client.entities.food_categories.query({ query: { is_active: true }, sort: 'sort_order', limit: 100 })), ttl),
      fetchWithCache('index_food_items', () => withRetry(() => client.entities.food_items.query({ query: { is_active: true }, sort: 'sort_order', limit: 300 })), ttl),
      fetchWithCache('index_food_settings', () => withRetry(() => client.entities.food_settings.query({ limit: 100 })), ttl).catch(() => null),
    ]).then(([catRes, itemRes, setRes]: any[]) => {
      if (cancelled) return;
      const rows: any[] = setRes?.data?.items ?? setRes?.items ?? [];
      setSettings(Object.fromEntries(rows.map((r) => [r.setting_key, String(r.setting_value ?? '')])));
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
      const combos = items.filter((i) => i.is_combo || /комбо|набор|сет/i.test(i.name));
      const ordered = [
        ...bannerIds.map((id) => items.find((i) => i.id === id)).filter(Boolean),
        ...combos,
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
    }).catch(() => { /* the block still offers «Открыть всё меню» */ });
    return () => { cancelled = true; };
  }, [banners, kz]);

  const kitchen = kitchenNow(settings.working_hours || '');
  return (
    <section className="home-food a-section a-food" aria-label={tx('Доставка еды DAM ALEM', 'DAM ALEM тамақ жеткізу')}>
      <div className="a-head">
        <div>
          <span className="a-kicker">DAM ALEM 2.0{kitchen ? ` · ${kitchen.open ? tx(`открыто до ${kitchen.to}`, `${kitchen.to} дейін ашық`) : tx(`откроемся в ${kitchen.from}`, `${kitchen.from}-де ашамыз`)}` : ''}</span>
          <h2>{tx('Доставка еды', 'Тамақ жеткізу')}</h2>
        </div>
        <Link to="/food" className="a-more">{tx('Всё меню', 'Барлық мәзір')}<ArrowRight size={15} /></Link>
      </div>
      {cats.length > 0 && (
        <nav aria-label={tx('Категории меню', 'Мәзір санаттары')} className="a-scroll a-cats">
          {cats.map((c) => (
            <Link key={c.slug} to={`/food?category=${c.slug}`} className="a-cat">
              <span><StorageImg objectKey={c.image} alt="" className="h-full w-full object-cover" /></span>
              <small>{c.name}</small>
            </Link>
          ))}
        </nav>
      )}
      <div className="a-scroll">
        {dishes.map((d) => (
          <Link key={d.id} to={d.to} className="a-card a-dish">
            <span className="a-dish-img"><StorageImg objectKey={d.image} alt={d.name} className="h-full w-full object-cover" /></span>
            <span className="a-dish-body">
              <span className="a-dish-name">{d.name}</span>
              <span className="a-dish-row"><b>{money(d.price)}</b><span className="a-plus" aria-hidden><Plus size={16} strokeWidth={2.4} /></span></span>
            </span>
          </Link>
        ))}
        {dishes.length === 0 && <Link to="/food" className="a-empty" style={{ flex: 'none', width: 220 }}>{tx('Откройте меню DAM ALEM', 'DAM ALEM мәзірін ашыңыз')}</Link>}
      </div>
    </section>
  );
}
