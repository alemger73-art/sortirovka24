/** Home page: fresh ads in a swipeable row, «Подать» in the heading and kinds as line-icon chips. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, Gift, ImageIcon, Plus, Tag, Wrench } from 'lucide-react';
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
    <section className="home-ads a-section" aria-label={tx('Объявления', 'Хабарландырулар')}>
      <div className="a-head">
        <div><span className="a-kicker">{tx('Барахолка района', 'Аудан базары')}</span><h2>{tx('Объявления', 'Хабарландырулар')}</h2></div>
        <Link to="/announcements" className="a-more">{tx('Все', 'Барлығы')}<ArrowRight size={15} /></Link>
      </div>
      <nav aria-label={tx('Разделы объявлений', 'Хабарландыру бөлімдері')} className="a-kinds">
        {TILES.map(({ key, title, Icon }) => (
          <Link key={key} to={`/announcements?type=${key}`} className="a-kind"><span><Icon size={22} strokeWidth={1.8} /></span>{kz ? title.kz : title.ru}</Link>
        ))}
      </nav>
      <div className="a-scroll">
        <Link to="/announcements/new" onClick={() => track('ad_home_post')} data-testid="home-ad-post" className="a-post">
          <span><Plus size={20} strokeWidth={2.2} /></span>
          <span><strong>{tx('Подать объявление', 'Хабарландыру беру')}</strong><small>{tx('Бесплатно, за минуту', 'Тегін, бір минутта')}</small></span>
        </Link>
        {ads.map((ad) => {
          const k = kindOf(ad);
          const cover = getAnnouncementCover(ad);
          const price = formatAdPrice(ad.price);
          return (
            <Link key={ad.id} ref={seen(Number(ad.id))} to={`/announcements/${ad.id}`} className="a-card a-ad">
              <span className="a-ad-img">{cover ? <StorageImg objectKey={cover} alt={ad.title} className="h-full w-full object-cover" /> : <ImageIcon size={28} strokeWidth={1.5} aria-label={k ? (kz ? k.title.kz : k.title.ru) : ''} />}</span>
              <span className="a-ad-body"><b>{price || (k ? (kz ? k.title.kz : k.title.ru) : '')}</b><span>{ad.title}</span></span>
            </Link>
          );
        })}
        {loaded && ads.length === 0 && (
          <p className="a-empty" style={{ flex: 'none', width: 220, margin: 0 }}>{tx('Здесь появятся объявления соседей. Станьте первым!', 'Мұнда көршілердің хабарландырулары шығады. Бірінші болыңыз!')}</p>
        )}
      </div>
    </section>
  );
}
