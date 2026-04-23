import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry, warmupBackend, resetWarmup, STATUS_LABELS, timeAgo, formatDate } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { prefetchFromIndex } from '@/lib/prefetch';
import { preloadCriticalImages, preloadImagesOnIdle, extractImageUrls } from '@/lib/imageCache';
import { resolveImageSrc } from '@/lib/storage';
import {
  Wrench, AlertTriangle, Megaphone, ChevronRight, ChevronLeft,
  MapPin, Phone as PhoneIcon, Clock, Briefcase, Sun, Snowflake, Cloud, CloudRain,
  Home, ShoppingBag, Utensils, FileText, BookOpen,
  ArrowRight, Send, Building2, HardHat, Users, Coffee,
  Shield, Heart, Siren, Landmark
} from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import Hero from '@/components/landing/Hero';

/* ─── CDN Images ─── */
const HERO_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/ad8caa55-9593-448b-8f7a-39be84ed5053.png';
const FOOD_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png';
const MASTERS_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/b909034d-586a-4902-99f3-2abcf2e3c7d8.png';
const REALESTATE_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/d9cdc63f-9e09-4de5-b2eb-1c2ef0cb55ad.png';
const ANNOUNCEMENTS_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/802ce8b1-e55e-42b0-8b26-3ec0b903e7e7.png';
const JOBS_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-31/8bf31dae-761d-4fac-b012-f7172de4c9c1.png';
const BUSINESS_BANNER_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-31/5007abb2-2c10-46e9-9721-c83a5b9a7265.png';

/* ─── Types ─── */
interface Category { id: number; name: string; slug: string; cat_type: string; icon: string; description: string; parent_id: number | null; sort_order: number; show_on_main: boolean; is_active: boolean; }

/* ─── Weather icons ─── */
function WeatherIcon({ weatherMain, className }: { weatherMain: string; className?: string }) {
  const main = (weatherMain || '').toLowerCase();
  if (main.includes('snow')) return <Snowflake className={className} />;
  if (main.includes('rain') || main.includes('drizzle') || main.includes('thunderstorm')) return <CloudRain className={className} />;
  if (main.includes('cloud') || main.includes('mist') || main.includes('fog') || main.includes('haze')) return <Cloud className={className} />;
  return <Sun className={className} />;
}

function getWeatherIconColor(weatherMain: string): string {
  const main = (weatherMain || '').toLowerCase();
  if (main.includes('snow')) return 'text-blue-200';
  if (main.includes('rain') || main.includes('drizzle') || main.includes('thunderstorm')) return 'text-blue-300';
  if (main.includes('cloud') || main.includes('mist') || main.includes('fog') || main.includes('haze')) return 'text-gray-300';
  return 'text-amber-300';
}

function getWeatherTip(temp: number): string {
  if (temp < 0) return 'Одевайтесь теплее';
  if (temp <= 15) return 'Прохладно';
  return 'Отличная погода';
}

/* ─── Weather widget ─── */
function WeatherWidget() {
  const { t } = useLanguage();
  const [weather, setWeather] = useState<{
    temp: number | null;
    description: string;
    weather_main: string;
    city: string;
    success: boolean;
  }>({ temp: null, description: '', weather_main: '', city: 'Сортировка', success: false });
  const [visible, setVisible] = useState(false);

  const fetchWeather = useCallback(async () => {
    try {
      // Wait for backend warmup before attempting weather fetch
      // This prevents DNS/balancer resolve errors during cold starts
      await warmupBackend();

      const res = await withRetry(
        () => client.apiCall.invoke<any>({
          url: '/api/v1/weather',
          method: 'GET',
        }),
        4, // more retries since weather depends on backend being warm
        3000
      );
      const data = (res && typeof res === 'object' && 'data' in res) ? (res as any).data : res;
      if (data && data.success && data.temp !== null) {
        setWeather({
          temp: data.temp,
          description: data.description || '',
          weather_main: data.weather_main || '',
          city: 'Сортировка',
          success: true,
        });
        setVisible(true);
      }
    } catch {
      // Silently fail — widget just won't show
      // Schedule a delayed retry in case backend warms up later
      setTimeout(() => {
        fetchWeatherQuiet();
      }, 15000);
    }
  }, []);

  // Quiet retry that doesn't trigger further retries on failure
  const fetchWeatherQuiet = useCallback(async () => {
    try {
      const res = await withRetry(
        () => client.apiCall.invoke<any>({
          url: '/api/v1/weather',
          method: 'GET',
        }),
        2,
        3000
      );
      const data = (res && typeof res === 'object' && 'data' in res) ? (res as any).data : res;
      if (data && data.success && data.temp !== null) {
        setWeather({
          temp: data.temp,
          description: data.description || '',
          weather_main: data.weather_main || '',
          city: 'Сортировка',
          success: true,
        });
        setVisible(true);
      }
    } catch {
      // Final silent fail
    }
  }, []);

  useEffect(() => {
    // Delay initial weather fetch by 3s to let backend warmup start first
    const initialTimer = setTimeout(fetchWeather, 3000);
    const interval = setInterval(fetchWeather, 10 * 60 * 1000); // every 10 min
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchWeather]);

  if (!weather.success || weather.temp === null) {
    return (
      <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-2xl px-4 py-2.5 border border-white/20">
        <Sun className="w-5 h-5 text-amber-300 animate-pulse" />
        <div>
          <p className="text-white/40 text-sm font-bold leading-none">—°C</p>
          <p className="text-white/40 text-[10px] leading-tight">Сортировка</p>
        </div>
      </div>
    );
  }

  const iconColor = getWeatherIconColor(weather.weather_main);
  const tip = getWeatherTip(weather.temp);

  return (
    <div
      className={`flex items-center gap-2.5 bg-white/10 backdrop-blur-md rounded-2xl px-4 py-2.5 border border-white/20 transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
      }`}
    >
      <div className="transition-transform duration-500 hover:scale-110">
        <WeatherIcon weatherMain={weather.weather_main} className={`w-5 h-5 ${iconColor} transition-colors duration-500`} />
      </div>
      <div>
        <p className="text-white text-sm font-bold leading-none">
          {weather.temp > 0 ? '+' : ''}{weather.temp}°C
        </p>
        <p className="text-white/50 text-[10px] leading-tight mt-0.5">{tip}</p>
      </div>
    </div>
  );
}

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
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className={`w-1.5 h-8 bg-gradient-to-b ${accentColor} rounded-full`} />
        <h2 className="text-xl md:text-2xl font-extrabold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {linkTo && (
        <Link to={linkTo} className="text-blue-600 dark:text-blue-400 hover:text-blue-700 text-sm font-semibold flex items-center gap-1">
          {linkText} <ChevronRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}

export default function Index() {
  const { t, lang } = useLanguage();
  const [news, setNews] = useState<any[]>([]);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [banners, setBanners] = useState<any[]>([]);
  const [heroStats, setHeroStats] = useState<{ num: number; suffix: string; labelKey: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isStale, setIsStale] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const autoRetryCountRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newsScrollRef = useRef<HTMLDivElement>(null);

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

    const CACHE_TTL = 60 * 1000;

    const cachedQuery = (key: string, queryFn: () => Promise<any>) =>
      fetchWithCache(`index_${key}`, () => withRetry(queryFn), CACHE_TTL);

    try {
      // Load all data in parallel — no gate, no sequential fallback
      const results = await Promise.allSettled([
        cachedQuery('news', () => client.entities.news.query({ query: { published: true }, sort: '-created_at', limit: 6 })),
        cachedQuery('complaints', () => client.entities.complaints.query({ sort: '-created_at', limit: 3 })),
        cachedQuery('jobs', () => client.entities.jobs.query({ query: { active: true }, sort: '-created_at', limit: 3 })),
        cachedQuery('banners', () => client.entities.banners.query({ query: { active: true }, limit: 4 })),
        cachedQuery('homepage_stats', () => client.entities.homepage_stats.query({ limit: 1 })),
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

      // Stats logic
      const statsItems = extract(results[4]);
      const statsRow = statsItems.length > 0 ? statsItems[0] : null;
      const isAuto = statsRow ? (statsRow.is_auto === true || statsRow.is_auto === 'true') : true;

      if (isAuto) {
        try {
          const getTotal = (r: PromiseSettledResult<any>): number => {
            try {
              if (r.status !== 'fulfilled') return 0;
              const val = r.value;
              if (!val || typeof val !== 'object') return 0;
              const total = val?.data?.total ?? val?.total ?? 0;
              if (typeof total === 'number' && total > 0) return total;
              const items = val?.data?.items ?? val?.items;
              return Array.isArray(items) ? items.length : 0;
            } catch { return 0; }
          };
          const [mastersRes, adsRes, cafesRes] = await Promise.allSettled([
            cachedQuery('stats_masters_count', () => client.entities.masters.query({ limit: 1 })),
            cachedQuery('stats_ads_count', () => client.entities.announcements.query({ query: { active: true, status: 'approved' }, limit: 1 })),
            cachedQuery('stats_cafes_count', () => client.entities.food_categories.query({ limit: 1 })),
          ]);
          const mc = getTotal(mastersRes);
          const ac = getTotal(adsRes);
          const cc = getTotal(cafesRes);
          const autoStats: { num: number; suffix: string; labelKey: string }[] = [];
          if (mc > 0) autoStats.push({ num: mc, suffix: '+', labelKey: 'hero.masters' });
          if (ac > 0) autoStats.push({ num: ac, suffix: '+', labelKey: 'hero.announcements' });
          if (cc > 0) autoStats.push({ num: cc, suffix: '+', labelKey: 'hero.cafes' });
          setHeroStats(autoStats);
        } catch {
          setHeroStats([
            { num: 150, suffix: '+', labelKey: 'hero.masters' },
            { num: 500, suffix: '+', labelKey: 'hero.announcements' },
            { num: 50, suffix: '+', labelKey: 'hero.cafes' },
          ]);
        }
      } else if (statsRow) {
        const manualStats: { num: number; suffix: string; labelKey: string }[] = [];
        if ((statsRow.masters_count || 0) > 0) manualStats.push({ num: statsRow.masters_count, suffix: '+', labelKey: 'hero.masters' });
        if ((statsRow.ads_count || 0) > 0) manualStats.push({ num: statsRow.ads_count, suffix: '+', labelKey: 'hero.announcements' });
        if ((statsRow.cafes_count || 0) > 0) manualStats.push({ num: statsRow.cafes_count, suffix: '+', labelKey: 'hero.cafes' });
        setHeroStats(manualStats);
      } else {
        setHeroStats([
          { num: 150, suffix: '+', labelKey: 'hero.masters' },
          { num: 500, suffix: '+', labelKey: 'hero.announcements' },
          { num: 50, suffix: '+', labelKey: 'hero.cafes' },
        ]);
      }

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
          setError(`${t('common.error')} (попытка ${autoRetryCountRef.current}/3...)`);
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
        setError(`${t('common.loadError')} (попытка ${autoRetryCountRef.current}/3...)`);
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
  }, [t]);

  const dateLocale = lang === 'kz' ? 'kk-KZ' : 'ru-RU';

  /* ─── Quick Actions config (7 items) ─── */
  const quickActions = [
    { icon: Utensils, labelKey: 'quick.orderFood', to: '/food', color: 'bg-orange-500', lightBg: 'bg-orange-50 dark:bg-orange-900/20' },
    { icon: Wrench, labelKey: 'quick.findMaster', to: '/masters', color: 'bg-blue-500', lightBg: 'bg-blue-50 dark:bg-blue-900/20' },
    { icon: Shield, labelKey: 'quick.findInspector', to: '/inspectors', color: 'bg-indigo-500', lightBg: 'bg-indigo-50 dark:bg-indigo-900/20' },
    { icon: AlertTriangle, labelKey: 'quick.fileComplaint', to: '/complaints/new', color: 'bg-red-500', lightBg: 'bg-red-50 dark:bg-red-900/20' },
    { icon: Megaphone, labelKey: 'quick.postAd', to: '/announcements', color: 'bg-amber-500', lightBg: 'bg-amber-50 dark:bg-amber-900/20' },
    { icon: Briefcase, labelKey: 'quick.findJob', to: '/jobs', color: 'bg-purple-500', lightBg: 'bg-purple-50 dark:bg-purple-900/20' },
    { icon: BookOpen, labelKey: 'quick.openDirectory', to: '/directory', color: 'bg-teal-500', lightBg: 'bg-teal-50 dark:bg-teal-900/20' },
  ];

  /* ─── Popular Categories config (5 items — no Стройматериалы, all with images) ─── */
  const popularCategories = [
    { labelKey: 'categories.food', to: '/food', img: FOOD_IMG },
    { labelKey: 'categories.masters', to: '/masters', img: MASTERS_IMG },
    { labelKey: 'categories.realEstate', to: '/real-estate', img: REALESTATE_IMG },
    { labelKey: 'categories.announcements', to: '/announcements', img: ANNOUNCEMENTS_IMG },
    { labelKey: 'categories.jobs', to: '/jobs', img: JOBS_IMG },
  ];

  const scrollNews = (dir: 'left' | 'right') => {
    if (!newsScrollRef.current) return;
    const scrollAmount = 300;
    newsScrollRef.current.scrollBy({ left: dir === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
  };

  return (
    <Layout>
      <Hero />

      <div className="bg-[#f5f5f7] dark:bg-gray-950 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4 py-10 space-y-12">

          {/* ═══════════════════════════════════════════
              2. ПОПУЛЯРНЫЕ КАТЕГОРИИ (primary block — main visual entry)
          ═══════════════════════════════════════════ */}
          <section>
            <SectionHeader title={t('categories.title')} accentColor="from-blue-500 to-indigo-600" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5">
              {popularCategories.map(cat => (
                <Link
                  key={cat.labelKey}
                  to={cat.to}
                  className="group relative overflow-hidden rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 aspect-[4/5] flex items-end"
                >
                  <img src={cat.img} alt={t(cat.labelKey)} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="relative z-10 p-4 w-full">
                    <h3 className="font-bold text-white text-sm md:text-base">{t(cat.labelKey)}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              3. БЫСТРЫЕ ДЕЙСТВИЯ (secondary — compact helper block)
          ═══════════════════════════════════════════ */}
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

          {/* ═══════════════════════════════════════════
              4. СПЕЦПРЕДЛОЖЕНИЯ / БАННЕРЫ (dynamic from DB + static fallbacks)
          ═══════════════════════════════════════════ */}
          <section>
            <SectionHeader title={t('specials.title')} accentColor="from-amber-500 to-orange-500" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dynamic banners from database (admin-managed) */}
              {banners.length > 0 ? (
                banners.map((b, idx) => {
                  const accentColors = [
                    { tag: 'bg-orange-500/30 text-orange-300', border: '' },
                    { tag: 'bg-blue-500/30 text-blue-300', border: '' },
                    { tag: 'bg-emerald-500/30 text-emerald-300', border: '' },
                    { tag: 'bg-purple-500/30 text-purple-300', border: '' },
                  ];
                  const accent = accentColors[idx % accentColors.length];
                  const linkTo = b.button_url || '#';
                  const isInternal = linkTo.startsWith('/');

                  const bannerContent = (
                    <div className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 h-44 md:h-52 flex items-end">
                      {b.image_url ? (
                        <StorageImg objectKey={b.image_url} alt={b.title || ''} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-800 to-blue-900" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
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
                  ) : (
                    <a key={b.id} href={linkTo} target="_blank" rel="noopener noreferrer">{bannerContent}</a>
                  );
                })
              ) : (
                <>
                  {/* Fallback static banners when no DB banners loaded */}
                  <Link to="/food" className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 h-44 md:h-52 flex items-end">
                    <img src={FOOD_IMG} alt={t('banner.foodDelivery')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="relative z-10 p-5">
                      <span className="text-xs font-bold text-orange-300 bg-orange-500/30 backdrop-blur-sm px-3 py-1 rounded-full">{t('banner.promo')}</span>
                      <h3 className="text-lg font-extrabold text-white mt-2">{t('banner.foodDelivery')}</h3>
                      <p className="text-white/70 text-sm mt-1">{t('banner.foodDeliveryDesc')}</p>
                    </div>
                  </Link>
                  <Link to="/masters" className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 h-44 md:h-52 flex items-end">
                    <img src={MASTERS_IMG} alt={t('banner.findMaster')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="relative z-10 p-5">
                      <span className="text-xs font-bold text-blue-300 bg-blue-500/30 backdrop-blur-sm px-3 py-1 rounded-full">🛠 {t('nav.masters')}</span>
                      <h3 className="text-lg font-extrabold text-white mt-2">{t('banner.findMaster')}</h3>
                      <p className="text-white/70 text-sm mt-1">{t('banner.findMasterDesc')}</p>
                    </div>
                  </Link>
                </>
              )}

              {/* Static navigation banners (always shown) */}
              <Link to="/inspectors" className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 h-44 md:h-52 flex items-end">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-indigo-800 to-blue-900" />
                <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                <div className="absolute top-4 right-4 w-20 h-20 bg-white/5 rounded-full flex items-center justify-center">
                  <Shield className="w-10 h-10 text-white/20" />
                </div>
                <div className="relative z-10 p-5">
                  <span className="text-xs font-bold text-blue-200 bg-blue-500/30 backdrop-blur-sm px-3 py-1 rounded-full">🛡️ {t('banner.inspectorTag')}</span>
                  <h3 className="text-lg font-extrabold text-white mt-2">{t('banner.findInspector')}</h3>
                  <p className="text-white/70 text-sm mt-1">{t('banner.findInspectorDesc')}</p>
                </div>
              </Link>

              <Link to="/business" className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 h-44 md:h-52 flex items-end">
                <img src={BUSINESS_BANNER_IMG} alt={t('banner.getClients')} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="relative z-10 p-5">
                  <span className="text-xs font-bold text-emerald-300 bg-emerald-500/30 backdrop-blur-sm px-3 py-1 rounded-full">💼 {t('banner.forBusiness')}</span>
                  <h3 className="text-lg font-extrabold text-white mt-2">{t('banner.getClients')}</h3>
                  <p className="text-white/70 text-sm mt-1">{t('banner.getClientsDesc')}</p>
                </div>
              </Link>
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              5. НОВОСТИ СОРТИРОВКИ (horizontal scroll cards)
          ═══════════════════════════════════════════ */}
          <section>
            <SectionHeader title={t('news.title')} accentColor="from-blue-500 to-cyan-500" linkTo="/news" linkText={t('news.all')} />
            {news.length > 0 ? (
              <div className="relative">
                {/* Scroll buttons */}
                <button
                  onClick={() => scrollNews('left')}
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 z-10 bg-white dark:bg-gray-800 shadow-lg rounded-full w-9 h-9 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors hidden md:flex"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>
                <button
                  onClick={() => scrollNews('right')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 bg-white dark:bg-gray-800 shadow-lg rounded-full w-9 h-9 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors hidden md:flex"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                </button>

                <div
                  ref={newsScrollRef}
                  className="flex gap-4 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {news.map(item => (
                    <Link
                      key={item.id}
                      to={`/news/${item.id}`}
                      className="flex-shrink-0 w-[260px] sm:w-[280px] bg-white dark:bg-gray-900 rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden group border border-gray-100 dark:border-gray-800 snap-start"
                    >
                      {item.image_url ? (
                        <div className="h-36 overflow-hidden">
                          <StorageImg objectKey={item.image_url} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                        </div>
                      ) : (
                        <div className="h-36 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center">
                          <FileText className="w-10 h-10 text-blue-200 dark:text-blue-700" />
                        </div>
                      )}
                      <div className="p-4">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(item.created_at)}</span>
                        <h3 className="font-bold text-gray-900 dark:text-white text-sm line-clamp-2 mt-1">{item.title}</h3>
                        {item.short_description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 line-clamp-2">{item.short_description}</p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-2xl p-8 text-center border border-gray-100 dark:border-gray-800">
                <FileText className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400 dark:text-gray-500 text-sm">Новости загружаются...</p>
              </div>
            )}
          </section>

          {/* ═══════════════════════════════════════════
              6. ЖАЛОБЫ ЖИТЕЛЕЙ (3 cards with status)
          ═══════════════════════════════════════════ */}
          {complaints.length > 0 && (
            <section>
              <SectionHeader title={t('complaints.title')} accentColor="from-red-500 to-rose-600" linkTo="/complaints" linkText={t('complaints.all')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {complaints.slice(0, 3).map(c => {
                  const st = STATUS_LABELS[c.status] || STATUS_LABELS.new;
                  return (
                    <div key={c.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm p-5 hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-800">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 px-3 py-1 rounded-full">{c.category}</span>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${st.color}`}>{st.label}</span>
                      </div>
                      <p className="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 font-medium">{c.description}</p>
                      <div className="flex items-center gap-1 mt-3 text-xs text-gray-400 dark:text-gray-500">
                        <MapPin className="w-3.5 h-3.5" /> {c.address || t('complaints.noAddress')}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-5">
                <Link to="/complaints" className="text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 px-5 py-2.5 rounded-xl transition-colors shadow-sm border border-gray-200 dark:border-gray-700 min-h-[44px] flex items-center">
                  {t('complaints.all')}
                </Link>
                <Link to="/complaints/new" className="text-sm font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 px-5 py-2.5 rounded-xl transition-colors shadow-sm min-h-[44px] flex items-center">
                  {t('complaints.file')}
                </Link>
              </div>
            </section>
          )}

          {/* ═══════════════════════════════════════════
              7. ВАКАНСИИ РАЙОНА (3 cards)
          ═══════════════════════════════════════════ */}
          {jobs.length > 0 && (
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
              8. ИСТОРИЯ СОРТИРОВКИ
          ═══════════════════════════════════════════ */}
          <section>
            <Link
              to="/history"
              className="group relative overflow-hidden rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 block"
            >
              <div className="bg-gradient-to-r from-indigo-900 via-blue-800 to-indigo-900 p-6 md:p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-indigo-300 bg-indigo-500/30 backdrop-blur-sm px-3 py-1 rounded-full">📜 Хроника</span>
                    <h3 className="text-lg md:text-xl font-extrabold text-white mt-3">История Сортировки</h3>
                    <p className="text-white/60 text-sm mt-1">Узнайте об истории нашего района — от основания до наших дней</p>
                  </div>
                  <ChevronRight className="w-8 h-8 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                </div>
              </div>
            </Link>
          </section>

        </div>
      </div>

      {/* ═══════════════════════════════════════════
          FIXED WhatsApp Button
      ═══════════════════════════════════════════ */}
      <a
        href="https://wa.me/77001234567"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 bg-green-500 hover:bg-green-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all duration-300 group"
        title={t('common.whatsapp')}
      >
        <Send className="w-6 h-6 group-hover:rotate-12 transition-transform" />
      </a>
    </Layout>
  );
}