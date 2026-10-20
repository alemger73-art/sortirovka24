/** Home page: fresh ads in a swipeable row + a big «Подать бесплатно» card and quick filters. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { filterPublicAnnouncements, getAnnouncementCover } from '@/lib/announcements';
import { AD_FILTERS, formatAdPrice, kindOf } from '@/lib/adKinds';
import { track } from '@/lib/analytics';

const QUICK = ['sell', 'job', 'services', 'free'];

export default function HomeAds() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const tx = (ru: string, k: string) => (kz ? k : ru);
  const [ads, setAds] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchWithCache('index_ads', () => withRetry(() => client.entities.announcements.query({ sort: '-created_at', limit: 30 })), 60 * 1000)
      .then((res: any) => setAds(filterPublicAnnouncements(res?.data?.items ?? res?.items ?? []).slice(0, 10)))
      .catch(() => setAds([]))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <section className="home-ads" aria-label={tx('Объявления', 'Хабарландырулар')}>
      <div className="public-section-head">
        <div><span className="public-kicker">{tx('Барахолка района', 'Аудан базары')}</span><h2>{tx('Объявления', 'Хабарландырулар')}</h2></div>
        <Link to="/announcements">{tx('Все объявления', 'Барлығы')}<ArrowRight size={18} /></Link>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        <Link to="/announcements/new" onClick={() => track('ad_home_post')} data-testid="home-ad-post"
          className="flex w-[150px] shrink-0 flex-col justify-between rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md md:w-[190px]">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/25"><Plus className="h-6 w-6" /></span>
          <span>
            <span className="block text-lg font-bold leading-tight">{tx('Подать объявление', 'Хабарландыру беру')}</span>
            <span className="mt-1 block text-xs text-white/90">{tx('Бесплатно, за минуту', 'Тегін, бір минутта')}</span>
          </span>
        </Link>
        {ads.map((ad) => {
          const k = kindOf(ad);
          const cover = getAnnouncementCover(ad);
          const price = formatAdPrice(ad.price);
          return (
            <Link key={ad.id} to={`/announcements/${ad.id}`} className="w-[150px] shrink-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 md:w-[190px]">
              <div className="relative aspect-[1/1] bg-amber-50 dark:bg-slate-800">
                {cover ? <StorageImg objectKey={cover} alt={ad.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-4xl opacity-70" aria-hidden>{k?.emoji || '📢'}</div>}
                {k && <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-gray-800">{k.emoji} {kz ? k.title.kz : k.title.ru}</span>}
              </div>
              <div className="p-2.5">
                {price && <p className="text-sm font-bold text-gray-900 dark:text-slate-100">{price}</p>}
                <p className="line-clamp-2 text-xs leading-snug text-gray-700 dark:text-slate-300">{ad.title}</p>
              </div>
            </Link>
          );
        })}
        {loaded && ads.length === 0 && (
          <div className="flex w-[220px] shrink-0 items-center rounded-2xl border border-dashed border-amber-300 bg-white p-4 text-sm text-gray-600 dark:bg-slate-900 dark:text-slate-300">
            {tx('Здесь появятся объявления соседей. Станьте первым!', 'Мұнда көршілердің хабарландырулары шығады. Бірінші болыңыз!')}
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {AD_FILTERS.filter((f) => QUICK.includes(f.key)).map((f) => (
          <Link key={f.key} to={`/announcements?type=${f.key}`} className="rounded-full border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {f.emoji} {kz ? f.title.kz : f.title.ru}
          </Link>
        ))}
      </div>
    </section>
  );
}
