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
  const [combo, setCombo] = useState<Dish & { desc: string } | null>(null);
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
      const big = combos.find((i) => /дуэт|семейн|на двоих/i.test(i.name)) || combos[0];
      setCombo(big ? { id: big.id, name: String(big.name).trim(), price: Number(big.price), image: big.image_url, to: `/food#product=${big.id}`, desc: String(big.description || '').split(/[.—]/)[0].trim().slice(0, 70) } : null);
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
  const time = String(settings.delivery_time || '').trim();
  return (
    <section className="home-food h2-food" aria-label={tx('Доставка еды DAM ALEM', 'DAM ALEM тамақ жеткізу')}>
      <div className="h2-food-in">
        <div className="h2-food-top">
          <span className="h2-brand">DAM ALEM 2.0</span>
          {kitchen && <span className="h2-status"><i className={kitchen.open ? '' : 'off'} />{kitchen.open ? tx(`Открыто до ${kitchen.to}`, `${kitchen.to} дейін ашық`) : tx(`Закрыто · откроемся в ${kitchen.from}`, `Жабық · ${kitchen.from}-де ашамыз`)}</span>}
        </div>
        <h2>{tx('Доставка еды', 'Тамақ жеткізу')}</h2>
        <p className="h2-food-sub">{tx('Готовим после заказа', 'Тапсырыстан кейін дайындаймыз')}{time ? ` · ${time.replace(/\s*-\s*/, '–')}${/мин/.test(time) ? '' : tx(' мин', ' мин')}` : ''} · {tx('по Сортировке', 'Сортировка бойынша')}</p>
      </div>
      {cats.length > 0 && (
        <nav aria-label={tx('Категории меню', 'Мәзір санаттары')} className="h2-scroll">
          {cats.map((c) => (
            <Link key={c.slug} to={`/food?category=${c.slug}`} className="h2-cat">
              <span><StorageImg objectKey={c.image} alt="" className="h-full w-full object-cover" /></span>
              <small>{c.name}</small>
            </Link>
          ))}
        </nav>
      )}
      {combo && (
        <div className="h2-food-in">
          <Link to={combo.to} className="h2-combo">
            <StorageImg objectKey={combo.image} alt={combo.name} className="h-full w-full object-cover" />
            <span className="h2-combo-copy">
              <span><em>{tx('Выгодный набор', 'Тиімді жиынтық')}</em><strong>{combo.name}</strong></span>
              <span className="h2-combo-btn">{money(combo.price)} · {tx('Заказать', 'Тапсырыс')}</span>
            </span>
          </Link>
        </div>
      )}
      <div className="h2-scroll">
        {dishes.filter((d) => d.id !== combo?.id).map((d) => (
          <Link key={d.id} to={d.to} className="h2-dish">
            <span className="h2-dish-img"><StorageImg objectKey={d.image} alt={d.name} className="h-full w-full object-cover" /></span>
            <span className="h2-dish-name">{d.name}</span>
            <span className="h2-dish-row"><b>{money(d.price)}</b><span className="h2-plus" aria-hidden><Plus size={16} strokeWidth={2.4} /></span></span>
          </Link>
        ))}
      </div>
      <div className="h2-food-in">
        <Link to="/food" className="h2-food-all">{tx('Открыть всё меню', 'Барлық мәзірді ашу')}<ArrowRight size={16} /></Link>
      </div>
    </section>
  );
}
