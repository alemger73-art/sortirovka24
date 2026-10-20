/**
 * Home page: DAM ALEM food delivery with real dish photos and prices.
 * Replaces the old «Магазины района» + «Спецпредложения» blocks that repeated the same generic picture.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';

type Offer = { key: string; to: string; title: string; image?: string; price?: number; badge?: string };

export default function HomeFood({ banners, heroImage }: { banners: any[]; heroImage: string }) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const [offers, setOffers] = useState<Offer[]>([]);

  useEffect(() => {
    let cancelled = false;
    const food = banners.filter((b) => b.banner_type === 'food_delivery').slice(0, 6);
    Promise.all(food.map(async (b): Promise<Offer | null> => {
      const to = String(b.button_url || b.link_url || '/food');
      const productId = /product=(\d+)/.exec(to)?.[1];
      if (productId) {
        try {
          const res: any = await fetchWithCache(`index_food_${productId}`, () => withRetry(() => client.entities.food_items.get({ id: productId })), 5 * 60 * 1000);
          const p = res?.data ?? res;
          if (!p || p.is_active === false || p.available === false) return null;
          return { key: `b${b.id}`, to, title: p.name || b.title, image: p.image_url || b.image_url, price: Number(p.price) || undefined };
        } catch { return null; }
      }
      return { key: `b${b.id}`, to, title: b.title, image: b.image_url, badge: b.button_text };
    })).then((list) => { if (!cancelled) setOffers(list.filter(Boolean) as Offer[]); });
    return () => { cancelled = true; };
  }, [banners]);

  return (
    <section className="home-food" aria-label={tx('Доставка еды', 'Тамақ жеткізу')}>
      <div className="public-section-head">
        <div><span className="public-kicker">DAM ALEM 2.0</span><h2>{tx('Доставка еды', 'Тамақ жеткізу')}</h2></div>
        <Link to="/food">{tx('Всё меню', 'Барлық мәзір')}<ArrowRight size={18} /></Link>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <Link to="/food" className="relative flex w-[260px] shrink-0 items-end overflow-hidden rounded-2xl shadow-sm md:w-[340px]" style={{ minHeight: 200 }}>
          <img src={heroImage} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="relative p-4 text-white">
            <p className="text-xl font-extrabold leading-tight">{tx('Бургеры, пицца, сеты', 'Бургерлер, пицца, сеттер')}</p>
            <p className="mt-1 text-sm text-white/85">{tx('Готовим после заказа и привозим горячим', 'Тапсырыстан кейін дайындап, ыстықтай жеткіземіз')}</p>
            <span className="mt-3 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold"><ShoppingBag className="h-4 w-4" />{tx('Заказать', 'Тапсырыс беру')}</span>
          </div>
        </Link>
        {offers.map((o) => (
          <Link key={o.key} to={o.to} className="flex w-[160px] shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 md:w-[190px]">
            <div className="aspect-[1/1] bg-orange-50 dark:bg-slate-800">
              {o.image ? <StorageImg objectKey={o.image} alt={o.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl" aria-hidden>🍔</div>}
            </div>
            <div className="flex flex-1 flex-col p-3">
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-900 dark:text-slate-100">{o.title}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                {o.price ? <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{o.price.toLocaleString('ru-RU').replace(/,/g, ' ')} ₸</span> : <span className="text-xs text-orange-600">{o.badge}</span>}
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-lg font-bold text-white" aria-hidden>+</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
