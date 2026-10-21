/** Home page: fresh ads in a swipeable row, «Подать» in the heading and kinds as line-icon chips. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, ChevronRight, Gift, ImageIcon, Plus, Tag, Wrench } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { filterPublicAnnouncements, getAnnouncementCover } from '@/lib/announcements';
import { AD_FILTERS, formatAdPrice, kindOf } from '@/lib/adKinds';
import { track } from '@/lib/analytics';
import { adEvent, observeImpression } from '@/lib/adStats';

const watched = new WeakSet<Element>();
/** «Показы» for the owner's statistics: the card was really on screen. */
const seen = (id: number) => (el: HTMLAnchorElement | null) => {
  if (!el || watched.has(el)) return;
  watched.add(el);
  observeImpression(el, () => adEvent(id, 'impression'));
};

const KIND_ICONS: Record<string, typeof Tag> = { sell: Tag, job: Briefcase, services: Wrench, free: Gift };
const TILES = AD_FILTERS.filter((f) => KIND_ICONS[f.key]).map((f) => ({ ...f, Icon: KIND_ICONS[f.key] }));

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
    <section className="home-ads h2-section" aria-label={tx('Объявления', 'Хабарландырулар')}>
      <div className="h2-head">
        <h2>{tx('Объявления', 'Хабарландырулар')}</h2>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Link to="/announcements" className="h2-more">{tx('Все', 'Барлығы')}<ChevronRight size={16} /></Link>
          <Link to="/announcements/new" onClick={() => track('ad_home_post')} data-testid="home-ad-post" className="h2-post"><Plus size={16} strokeWidth={2.4} />{tx('Подать', 'Беру')}</Link>
        </span>
      </div>
      <nav aria-label={tx('Разделы объявлений', 'Хабарландыру бөлімдері')} className="h2-kinds">
        {TILES.map(({ key, title, Icon }) => (
          <Link key={key} to={`/announcements?type=${key}`} className="h2-card h2-kind"><Icon size={17} strokeWidth={1.8} />{kz ? title.kz : title.ru}</Link>
        ))}
      </nav>
      <div className="h2-scroll">
        {ads.map((ad) => {
          const k = kindOf(ad);
          const cover = getAnnouncementCover(ad);
          const price = formatAdPrice(ad.price);
          return (
            <Link key={ad.id} ref={seen(Number(ad.id))} to={`/announcements/${ad.id}`} className="h2-ad">
              <span className="h2-ad-img">{cover ? <StorageImg objectKey={cover} alt={ad.title} className="h-full w-full object-cover" /> : <ImageIcon size={28} strokeWidth={1.5} aria-label={k ? (kz ? k.title.kz : k.title.ru) : ''} />}</span>
              <b>{price || (k ? (kz ? k.title.kz : k.title.ru) : '')}</b>
              <span>{ad.title}</span>
            </Link>
          );
        })}
        {loaded && ads.length === 0 && (
          <p className="h2-empty">{tx('Здесь появятся объявления соседей. Станьте первым!', 'Мұнда көршілердің хабарландырулары шығады. Бірінші болыңыз!')}</p>
        )}
      </div>
    </section>
  );
}
