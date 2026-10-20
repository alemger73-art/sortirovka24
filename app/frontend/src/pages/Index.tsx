import { formatPublicText } from '@/i18n/publicLocale';
import { getStatusLabel, getPublicCategoryLabel } from '@/lib/api';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry, warmupBackend, resetWarmup, STATUS_LABELS, timeAgo, formatDate } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { LEGAL_OPERATOR } from '@/content/legal';
import { preloadCriticalImages, preloadImagesOnIdle, extractImageUrls } from '@/lib/imageCache';
import { resolveImageSrc } from '@/lib/storage';
import { prefetchFromIndex } from '@/lib/prefetch';
import {
  Wrench, AlertTriangle, Megaphone, ChevronRight,
  MapPin, Phone as PhoneIcon, Clock, Briefcase,
  Home, ShoppingBag, Utensils, FileText, BookOpen,
  ArrowRight, ArrowUpRight, Send, Building2, HardHat, Users, Coffee,
  Shield, Heart, Siren, Landmark, Store, Cross, Scissors, Wine
} from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import PromoBannerMedia from '@/components/PromoBannerMedia';
import PartnerSpotlight from '@/components/PartnerSpotlight';
import '@/styles/portal-public.css';
import { moduleForPath } from '@/config/modules';
import VolnaImage from '@/components/volna/VolnaImage';
import { VOLNA_INDEX_IMAGE } from '@/lib/volnaImages';
import Hero from '@/components/landing/Hero';
import { useSupportSettings } from '@/hooks/useSupportSettings';
import { useModules, moduleEnabled } from '@/hooks/useModules';
import type { ModuleKey } from '@/config/modules';

/* ─── CDN Images ─── */
const HERO_IMG = 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505696/legacy-images/9ee7277f8db9a4a5521e.png';
const FOOD_IMG = 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505694/legacy-images/0bdca3ab9d92dc7a772a.png';
const MASTERS_IMG = 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505698/legacy-images/e9af3e8091e7803d0d09.png';
const REALESTATE_IMG = 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505700/legacy-images/4bc25cf2db9751b93b92.png';
const ANNOUNCEMENTS_IMG = 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505692/legacy-images/743b887a044471e15970.png';
const JOBS_IMG = 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505712/legacy-images/9988f5adf2ac15925759.png';
const GASTRONOM_IMG = 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&h=800&fit=crop';
const PRORAB_IMG = 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=600&h=800&fit=crop';
const SALONS_IMG = 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&h=800&fit=crop';
const PHARMACY_IMG = 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&h=800&fit=crop';

/* ─── Types ─── */
interface Category { id: number; name: string; slug: string; cat_type: string; icon: string; description: string; parent_id: number | null; sort_order: number; show_on_main: boolean; is_active: boolean; }

/* ─── Animated counter ─── */
function AnimatedNumber({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0;
        const step = Math.max(1, Math.floor(target / 40));
        const timer = setInterval(() => {
          start += step;
          if (start >= target) { start = target; clearInterval(timer); }
          setVal(start);
        }, 30);
        obs.disconnect();
      }
    }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{val}{suffix}</span>;
}

/* ─── Section header ─── */
function SectionHeader({ title, accentColor = 'from-blue-500 to-indigo-600', linkTo, linkText }: {
  title: string; accentColor?: string; linkTo?: string; linkText?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`w-1.5 h-8 shrink-0 bg-gradient-to-b ${accentColor} rounded-full`} />
        <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {linkTo && (
        <Link to={linkTo} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 text-sm font-semibold flex min-h-[44px] items-center gap-1">
          {linkText} <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

export default function Index() {
  const { t: publicT } = useLanguage();
  const { t, lang, localized } = useLanguage();
  const { promoEnabled: supportPromoEnabled } = useSupportSettings();
  const { isEnabled } = useModules();

  const [news, setNews] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const visibleOffers = banners.filter(b => {
    if (!['promo', 'food_delivery'].includes(b.banner_type)) return false;
    const target = String(b.button_url || b.link_url || '');
    const module = moduleForPath(target);
    return (!module || isEnabled(module)) && (b.banner_type !== 'food_delivery' || isEnabled('food'));
  }).slice(0, 2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isStale, setIsStale] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const autoRetryCountRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Preload critical above-the-fold CDN images immediately
  useEffect(() => {
    preloadCriticalImages([HERO_IMG, FOOD_IMG, MASTERS_IMG]);
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
    };
  }, []);

  // Preload dynamic images from API data (banners, news) during idle time
  useEffect(() => {
    const resolveUrl = (key: string) => resolveImageSrc(key);
    const allItems = [...banners, ...news];
    if (allItems.length > 0) {
      const urls = extractImageUrls(allItems, resolveUrl);
      if (urls.length > 0) preloadImagesOnIdle(urls, 3);
    }
  }, [banners, news]);

  const loadData = useCallback(async (isManualRetry = false) => {
    setLoading(true);
    setError('');
    setIsStale(false);
    if (isManualRetry) setRetrying(true);

    // Fire-and-forget warmup — does NOT block data loading
    warmupBackend();

    const CACHE_TTL = Capacitor.isNativePlatform() ? 5 * 60 * 1000 : 60 * 1000;

    const cachedQuery = (key: string, queryFn: () => Promise<any>) =>
      fetchWithCache(`index_${key}`, () => withRetry(queryFn), CACHE_TTL);

    try {
      // Load all data in parallel — no gate, no sequential fallback
      const results = await Promise.allSettled([
        cachedQuery('news', () => client.entities.news.query({ query: { published: true }, sort: '-created_at', limit: 6 })),
        // Disabled modules are not requested at all (avoids 404 noise and wasted traffic).
        moduleEnabled('complaints').then(on => on ? cachedQuery('complaints', () => client.entities.complaints.query({ sort: '-created_at', limit: 3 })) : { items: [] }),
        moduleEnabled('jobs').then(on => on ? cachedQuery('jobs', () => client.entities.jobs.query({ query: { active: true }, sort: '-created_at', limit: 3 })) : { items: [] }),
        cachedQuery('banners', () => client.entities.banners.query({ query: { active: true }, sort: '-created_at', limit: 50 })),
      ]);

      const extract = (r: PromiseSettledResult<any>): any[] => {
        try {
          if (r.status !== 'fulfilled') return [];
          const val = r.value;
          if (!val || typeof val !== 'object') return [];
          const items = val?.data?.items ?? val?.items ?? [];
          return Array.isArray(items) ? items : [];
        } catch {
          return [];
        }
      };

      setNews(extract(results[0]));
      setComplaints(extract(results[1]));
      setJobs(extract(results[2]));
      setBanners(extract(results[3]));

      setLoading(false);
      if (isManualRetry) setRetrying(false);

      const failedCount = results.filter(r => r.status === 'rejected').length;
      const hasAnyData = results.some(r => {
        if (r.status !== 'fulfilled') return false;
        const items = r.value?.data?.items;
        return Array.isArray(items) && items.length > 0;
      });

      if (failedCount === results.length && !hasAnyData) {
        if (autoRetryCountRef.current < 3) {
          autoRetryCountRef.current++;
          const delay = 3000 + 2000 * autoRetryCountRef.current;
          setError(formatPublicText(publicT, "public.common.retryAttempt", { v0: t('common.error'), v1: autoRetryCountRef.current }));
          setLoading(false);
          setRetrying(false);
          autoRetryTimerRef.current = setTimeout(() => loadData(), delay);
          return;
        }
        setError(t('common.error'));
      } else if (failedCount > 0 && hasAnyData) {
        autoRetryCountRef.current = 0;
        setIsStale(true);
      } else {
        autoRetryCountRef.current = 0;
      }
    } catch {
      if (autoRetryCountRef.current < 3) {
        autoRetryCountRef.current++;
        const delay = 3000 + 2000 * autoRetryCountRef.current;
        setError(formatPublicText(publicT, "public.common.retryAttempt", { v0: t('common.loadError'), v1: autoRetryCountRef.current }));
        setLoading(false);
        setRetrying(false);
        autoRetryTimerRef.current = setTimeout(() => loadData(), delay);
        return;
      }
      setError(t('common.loadError'));
    } finally {
      setLoading(false);
      setRetrying(false);
      prefetchFromIndex();
    }
  }, [t, publicT]);

  const dateLocale = lang === 'kz' ? 'kk-KZ' : 'ru-RU';

  /* ─── Quick Actions config (filtered by enabled modules) ─── */
  const quickActions = ([
    { icon: Utensils, labelKey: 'quick.orderFood', to: '/food', color: 'bg-orange-500', lightBg: 'bg-orange-50 dark:bg-orange-900/20', module: 'food' },
    { icon: Store, labelKey: 'quick.gastronom', to: '/gastronom', color: 'bg-emerald-600', lightBg: 'bg-emerald-50 dark:bg-emerald-900/20', module: 'gastronom' },
    { icon: Wine, labelKey: 'quick.volna', to: '/volna', color: 'bg-violet-700', lightBg: 'bg-violet-50 dark:bg-violet-900/20', module: 'volna' },
    { icon: HardHat, labelKey: 'quick.prorab', to: '/prorab', color: 'bg-amber-600', lightBg: 'bg-amber-50 dark:bg-amber-900/20', module: 'prorab' },
    { icon: Cross, labelKey: 'quick.pharmacy', to: '/apteka', color: 'bg-teal-600', lightBg: 'bg-teal-50 dark:bg-teal-900/20', module: 'pharmacy' },
    { icon: Wrench, labelKey: 'quick.findMaster', to: '/masters', color: 'bg-blue-500', lightBg: 'bg-blue-50 dark:bg-blue-900/20', module: 'masters' },
    { icon: Scissors, labelKey: 'quick.salons', to: '/salons', color: 'bg-pink-500', lightBg: 'bg-pink-50 dark:bg-pink-900/20', module: 'salons' },
    { icon: FileText, labelKey: 'nav.news', to: '/news', color: 'bg-blue-500', lightBg: 'bg-blue-50 dark:bg-blue-900/20', module: 'news' },
    { icon: AlertTriangle, labelKey: 'quick.fileComplaint', to: '/complaints/new', color: 'bg-red-500', lightBg: 'bg-red-50 dark:bg-red-900/20', module: 'complaints' },
    { icon: Megaphone, labelKey: 'quick.postAd', to: '/announcements/new', color: 'bg-amber-500', lightBg: 'bg-amber-50 dark:bg-amber-900/20', module: 'announcements' },
    { icon: Briefcase, labelKey: 'quick.findJob', to: '/jobs', color: 'bg-purple-500', lightBg: 'bg-purple-50 dark:bg-purple-900/20', module: 'jobs' },
    { icon: BookOpen, labelKey: 'quick.openDirectory', to: '/directory', color: 'bg-teal-500', lightBg: 'bg-teal-50 dark:bg-teal-900/20', module: 'directory' },
  ] as { icon: typeof Utensils; labelKey: string; to: string; color: string; lightBg: string; module: ModuleKey }[]).filter(a => isEnabled(a.module));

  /* ─── Popular Categories config (filtered by enabled modules) ─── */
  const popularCategories = ([
    { labelKey: 'categories.masters', to: '/masters', img: MASTERS_IMG, module: 'masters' },
    { labelKey: 'categories.salons', to: '/salons', img: SALONS_IMG, module: 'salons' },
    { labelKey: 'categories.realEstate', to: '/real-estate', img: REALESTATE_IMG, module: 'real_estate' },
    { labelKey: 'categories.announcements', to: '/announcements', img: ANNOUNCEMENTS_IMG, module: 'announcements' },
    { labelKey: 'categories.jobs', to: '/jobs', img: JOBS_IMG, module: 'jobs' },
  ] as { labelKey: string; to: string; img: string; module: ModuleKey }[]).filter(c => isEnabled(c.module));



  return (
    <Layout>
      <div className="portal-home"><Hero />

      <div className="bg-[#f5f5f7] dark:bg-gray-950 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">

          {isEnabled('news') && <section className="home-news" aria-label={lang === 'kz' ? 'Жаңалықтар' : 'Новости'}>
            <div className="public-section-head"><div><span className="public-kicker">{lang === 'kz' ? 'Жаңасы' : 'Свежее'}</span><h2>{lang === 'kz' ? 'Жаңалықтар' : 'Новости'}</h2></div><Link to="/news">{lang === 'kz' ? 'Барлық жаңалықтар' : 'Все новости'}<ArrowRight size={18} /></Link></div>
            {news.length ? <div className="home-news-grid">{news.slice(0,3).map(item => <Link key={item.id} to={`/news/${item.id}`} className="home-news-card"><div className="home-news-image">{item.image_url ? <StorageImg objectKey={item.image_url} alt="" className="h-full w-full object-cover" /> : <FileText size={36} />}</div><div className="home-news-copy"><div className="home-news-meta"><span>{getPublicCategoryLabel(item.category,t)}</span><time>{formatDate(item.created_at,lang)}</time></div><h3>{localized(item,'title')}</h3>{item.short_description && <p>{localized(item,'short_description')}</p>}<span className="home-news-read">{lang === 'kz' ? 'Жаңалықты оқу' : 'Читать'}<ArrowUpRight size={17} /></span></div></Link>)}</div> : <p className="home-news-empty">{loading ? (lang === 'kz' ? 'Жаңалықтар жүктелуде…' : 'Новости загружаются…') : (lang === 'kz' ? 'Әзірге жаңалық жоқ.' : 'Новые публикации скоро появятся здесь.')}</p>}
          </section>}
          {isEnabled('business') && <PartnerSpotlight />}

          {/* ═══════════════════════════════════════════
              1b. МАГАЗИНЫ РАЙОНА — DAM ALEM 2.0 рядом с остальными
          ═══════════════════════════════════════════ */}
          {(isEnabled('food') || isEnabled('gastronom') || isEnabled('volna') || isEnabled('prorab') || isEnabled('pharmacy')) && (
          <section>
            <SectionHeader title={t('shops.title')} accentColor="from-orange-500 to-red-600" />
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 md:gap-4">
              {isEnabled('food') && (
                <Link
                  to="/food"
                  className="group relative col-span-2 overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 min-h-[168px] md:min-h-[200px] flex items-end"
                >
                  <img src={FOOD_IMG} alt={t('shops.alemFood')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                  <div className="relative z-10 p-4 md:p-5 w-full">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-orange-200 bg-orange-500/40 backdrop-blur-sm px-2.5 py-1 rounded-full">{t('shops.alemFoodTag')}</span>
                    <h3 className="mt-2 text-xl md:text-2xl font-black text-white tracking-tight">{t('shops.alemFood')}</h3>
                    <p className="mt-1 text-sm text-white/80">{t('shops.alemFoodDesc')}</p>
                  </div>
                </Link>
              )}
              {isEnabled('gastronom') && (
                <Link to="/gastronom" className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 min-h-[168px] md:min-h-[200px] flex items-end">
                  <img src={GASTRONOM_IMG} alt={t('categories.gastronom')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <div className="relative z-10 p-4 w-full">
                    <h3 className="font-bold text-white text-sm md:text-base">{t('categories.gastronom')}</h3>
                    <p className="text-white/70 text-xs mt-0.5">{t('shops.gastronomDesc')}</p>
                  </div>
                </Link>
              )}
              {isEnabled('volna') && (
                <Link to="/volna" className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 min-h-[168px] md:min-h-[200px] flex items-end">
                  <VolnaImage src={VOLNA_INDEX_IMAGE} kind="category" alt={t('categories.volna')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <div className="relative z-10 p-4 w-full">
                    <h3 className="font-bold text-white text-sm md:text-base">{t('categories.volna')}</h3>
                    <p className="text-white/70 text-xs mt-0.5">{t('shops.volnaDesc')}</p>
                  </div>
                </Link>
              )}
              {isEnabled('prorab') && (
                <Link to="/prorab" className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 min-h-[168px] md:min-h-[200px] flex items-end">
                  <img src={PRORAB_IMG} alt={t('categories.construction')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <div className="relative z-10 p-4 w-full">
                    <h3 className="font-bold text-white text-sm md:text-base">{t('categories.construction')}</h3>
                    <p className="text-white/70 text-xs mt-0.5">{t('shops.prorabDesc')}</p>
                  </div>
                </Link>
              )}
              {isEnabled('pharmacy') && (
                <Link to="/apteka" className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5 min-h-[168px] md:min-h-[200px] flex items-end">
                  <img src={PHARMACY_IMG} alt={t('categories.pharmacy')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  <div className="relative z-10 p-4 w-full">
                    <h3 className="font-bold text-white text-sm md:text-base">{t('categories.pharmacy')}</h3>
                    <p className="text-white/70 text-xs mt-0.5">{t('shops.pharmacyDesc')}</p>
                  </div>
                </Link>
              )}
            </div>
          </section>
          )}

          {/* ═══════════════════════════════════════════
              2. ПОПУЛЯРНЫЕ КАТЕГОРИИ (primary block — main visual entry)
          ═══════════════════════════════════════════ */}
          {popularCategories.length > 0 && (
          <section>
            <SectionHeader title={t('categories.title')} accentColor="from-blue-500 to-indigo-600" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
              {popularCategories.map(cat => (
                <Link
                  key={cat.labelKey}
                  to={cat.to}
                  className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 aspect-[4/5] flex items-end"
                >
                  {cat.module === 'volna' ? (
                    <VolnaImage
                      src={cat.img}
                      kind="category"
                      alt={t(cat.labelKey)}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                  ) : (
                    <img src={cat.img} alt={t(cat.labelKey)} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="relative z-10 p-4 w-full">
                    <h3 className="font-bold text-white text-sm md:text-base">{t(cat.labelKey)}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>
          )}

          {/* ═══════════════════════════════════════════
              3. БЫСТРЫЕ ДЕЙСТВИЯ (secondary — compact helper block)
          ═══════════════════════════════════════════ */}
          {quickActions.length > 0 && (
          <section>
            <SectionHeader title={t('quick.title')} accentColor="from-orange-500 to-red-500" />
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {quickActions.map(action => (
                <Link
                  key={action.labelKey}
                  to={action.to}
                  className="group bg-white dark:bg-gray-900 rounded-2xl p-3 md:p-4 shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 flex flex-col items-center text-center border border-gray-100 dark:border-gray-800"
                >
                  <div className={`${action.color} w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300 mb-2`}>
                    <action.icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-white text-xs leading-tight">{t(action.labelKey)}</h3>
                </Link>
              ))}
            </div>
          </section>
          )}



          {/* ═══════════════════════════════════════════
              4. Акции: только актуальные предложения включённых сервисов
          ═══════════════════════════════════════════ */}
          {visibleOffers.length > 0 && (
          <section>
            <SectionHeader title={t('specials.title')} accentColor="from-amber-500 to-orange-500" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dynamic banners from database (admin-managed) */}
              {visibleOffers.length > 0 && (
                visibleOffers.map((b, idx) => {
                  const accentColors = [
                    { tag: 'bg-orange-500/30 text-orange-300', border: '' },
                    { tag: 'bg-blue-500/30 text-blue-300', border: '' },
                    { tag: 'bg-emerald-500/30 text-emerald-300', border: '' },
                    { tag: 'bg-purple-500/30 text-purple-300', border: '' },
                  ];
                  const accent = accentColors[idx % accentColors.length];
                  const linkTo = String(b.button_url || b.link_url || '').trim();
                  const isInternal = linkTo.startsWith('/') && !linkTo.startsWith('//') && !linkTo.includes('\\');
                  const isExternal = /^https?:\/\//i.test(linkTo);

                  const bannerContent = (
                    <div className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 min-h-44 md:min-h-52 flex items-end ring-1 ring-black/5">
                      <PromoBannerMedia
                        imageUrl={b.image_url}
                        title={b.title}
                        alt={b.title || ''}
                        priority={idx < 2}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_55%)]" />
                      <div className="relative z-10 p-5">
                        {b.button_text && (
                          <span className={`text-xs font-bold backdrop-blur-sm px-3 py-1 rounded-full ${accent.tag}`}>{b.button_text}</span>
                        )}
                        {b.title && <h3 className="text-lg font-extrabold text-white mt-2">{b.title}</h3>}
                        {b.subtitle && <p className="text-white/70 text-sm mt-1">{b.subtitle}</p>}
                      </div>
                    </div>
                  );

                  return isInternal ? (
                    <Link key={b.id} to={linkTo}>{bannerContent}</Link>
                  ) : isExternal ? (
                    <a key={b.id} href={linkTo} target="_blank" rel="noopener noreferrer">{bannerContent}</a>
                  ) : <div key={b.id}>{bannerContent}</div>;
                })
              )}

            </div>
          </section>
          )}

          {/* ═══════════════════════════════════════════
              6. ЖАЛОБЫ ЖИТЕЛЕЙ (3 cards with status)
          ═══════════════════════════════════════════ */}
          {isEnabled('complaints') && complaints.length > 0 && (
            <section>
              <SectionHeader title={t('complaints.title')} accentColor="from-red-500 to-rose-600" linkTo="/complaints" linkText={t('complaints.all')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {complaints.slice(0, 3).map(c => {
                  const st = STATUS_LABELS[c.status] || STATUS_LABELS.new;
                  return (
                    <div key={c.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full">{c.category}</span>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.color}`}>{getStatusLabel(c.status, t)}</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 font-medium">{c.description}</p>
                      <div className="flex items-center gap-1 mt-3 text-xs text-gray-400 dark:text-gray-500">
                        <MapPin className="w-3.5 h-3.5" /> {c.address || t('complaints.noAddress')}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-5">
                <Link to="/complaints/new" className="text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 px-5 py-2.5 rounded-xl transition-colors shadow-sm min-h-[44px] flex items-center">
                  {t('complaints.file')}
                </Link>
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════
              7. ВАКАНСИИ РАЙОНА (3 cards)
          ═══════════════════════════════════════════ */}
          {isEnabled('jobs') && jobs.length > 0 && (
            <section>
              <SectionHeader title={t('jobs.title')} accentColor="from-purple-500 to-indigo-600" linkTo="/jobs" linkText={t('jobs.all')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobs.slice(0, 3).map(job => (
                  <div key={job.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center flex-shrink-0">
                        <Briefcase className="w-5 h-5 text-purple-500" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{job.job_title}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{job.employer}</p>
                      </div>
                    </div>
                    {job.salary && <p className="text-purple-600 dark:text-purple-400 font-extrabold text-lg">{job.salary}</p>}
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      {job.schedule && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {job.schedule}</span>}
                      {job.district && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {job.district}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════
              8. ПОДДЕРЖКА ПРОЕКТА (ненавязчивый блок)
          ═══════════════════════════════════════════ */}
          {supportPromoEnabled && (
          <section>
            <Link
              to="/support"
              className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 block border border-rose-100 dark:border-rose-900/40"
            >
              <div className="bg-gradient-to-r from-rose-50 via-white to-blue-50 dark:from-rose-950/30 dark:via-gray-900 dark:to-blue-950/30 p-5 md:p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center flex-shrink-0">
                      <Heart className="w-5 h-5 text-rose-500" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40 px-2.5 py-0.5 rounded-full">
                        {t('footer.aboutProject')}
                      </span>
                      <h3 className="text-base md:text-lg font-bold text-gray-900 dark:text-white mt-2">{t('support.bannerTitle')}</h3>
                      <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('support.bannerDesc')}</p>
                    </div>
                  </div>
                  <span className="hidden sm:flex items-center gap-1 text-sm font-semibold text-rose-600 dark:text-rose-400 flex-shrink-0 group-hover:gap-2 transition-all">
                    {t('support.bannerLink')}
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </Link>
          </section>
          )}

          {/* ═══════════════════════════════════════════
              9. ИСТОРИЯ СОРТИРОВКИ
          ═══════════════════════════════════════════ */}
          {isEnabled('history') && (
          <section>
            <Link
              to="/history"
              className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 block"
            >
              <div className="bg-gradient-to-r from-indigo-900 via-blue-800 to-indigo-900 p-6 md:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-indigo-300 bg-indigo-500/30 backdrop-blur-sm px-3 py-1 rounded-full">{publicT("public.Index.text202")}</span>
                    <h3 className="text-lg md:text-xl font-extrabold text-white mt-3">{publicT("public.Index.text203")}</h3>
                    <p className="text-white/60 text-sm mt-1">{publicT("public.Index.text204")}</p>
                  </div>
                  <ChevronRight className="w-8 h-8 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>
              </div>
            </Link>
          </section>
          )}

        </div>
      </div>

      {/* ═══════════════════════════════════════════
          Support telephone
      ═══════════════════════════════════════════ */}
      <a
        href={`tel:${LEGAL_OPERATOR.phoneHref}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6 z-40 bg-green-500 hover:bg-green-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all duration-300 group"
        title={t('footer.contacts')}
      >
        <PhoneIcon className="w-6 h-6 transition-transform" />
      </a>
      </div>
    </Layout>
  );
}