import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import MasterCard from '@/components/masters/MasterCard';
import HowItWorks from '@/components/masters/HowItWorks';
import StarRating from '@/components/masters/StarRating';
import MasterReviews from '@/components/masters/MasterReviews';
import { CATEGORY_GRADIENTS, CATEGORY_BG, categoryGradient, categoryIcon, sortMasters } from '@/components/masters/mastersTheme';
import { client, withRetry, MASTER_CATEGORIES, CATEGORY_ICONS } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { Phone, MessageCircle, MapPin, CheckCircle, Clock, ChevronLeft, Search, Send, UserPlus, Shield, Zap, Award, Sparkles, Users, LayoutGrid, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { StorageGallery } from '@/components/MultiImageUpload';
import { requireAuthDialog, getAccountPrefill } from '@/lib/localAuth';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';

export { default as BecomeMasterForm } from '@/components/masters/BecomeMasterWizard';

const PAGE_SIZE = 24;

function telegramUrl(handle: string) {
  const clean = handle.replace(/^@/, '').trim();
  return clean ? `https://t.me/${clean}` : '';
}
/* ============ MASTER CATALOG ============ */
export function MastersCatalog() {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [masters, setMasters] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listTotal, setListTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [avgRating, setAvgRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(searchParams.get('q') || '');

  const setCategory = useCallback((cat: string) => {
    setSelectedCategory(cat);
    const next = new URLSearchParams(searchParams);
    if (cat) next.set('category', cat);
    else next.delete('category');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const cat = searchParams.get('category') || '';
    if (cat !== selectedCategory) setSelectedCategory(cat);
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(searchQuery.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const current = searchParams.get('q') || '';
    if (debouncedQ === current) return;
    const next = new URLSearchParams(searchParams);
    if (debouncedQ) next.set('q', debouncedQ);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  }, [debouncedQ]);

  useEffect(() => {
    loadMasters(false);
  }, [selectedCategory, debouncedQ]);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const res = await fetchWithCache('masters_stats_all', () =>
        withRetry(() => client.entities.masters.query({ sort: '-rating', limit: 200 })),
        5 * 60 * 1000,
      );
      const items = res.data?.items || [];
      setTotalCount(res.data?.total ?? items.length);
      if (items.length > 0) {
        const sum = items.reduce((acc: number, m: any) => acc + (Number(m.rating) || 0), 0);
        setAvgRating(Math.round((sum / items.length) * 10) / 10);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function loadMasters(append = false) {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    const skip = append ? masters.length : 0;
    const cacheKey = `masters_list_${selectedCategory || 'all'}_${debouncedQ || ''}_${skip}`;
    try {
      const res = await fetchWithCache(cacheKey, () => {
        const query: Record<string, string> = {};
        if (selectedCategory) query.category = selectedCategory;
        if (debouncedQ) query.q = debouncedQ;
        return withRetry(() => client.entities.masters.query({ query, sort: '-rating', skip, limit: PAGE_SIZE }));
      }, append ? 0 : 5 * 60 * 1000);
      const items = sortMasters(res.data?.items || []);
      setListTotal(res.data?.total ?? items.length);
      setMasters((prev) => (append ? sortMasters([...prev, ...items]) : items));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  async function loadMore() {
    if (loadingMore || masters.length >= listTotal) return;
    await loadMasters(true);
  }

  const displayMasters = masters;

  const scrollToMasters = () => {
    document.getElementById('masters-grid')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') scrollToMasters();
  };

  return (
    <Layout>
      {/* ═══════════════════════════════════════════════════
          HERO — Deep gradient, mobile-app feel
      ═══════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-indigo-800 to-purple-900 dark:from-slate-900 dark:via-indigo-950 dark:to-purple-950">
        {/* Decorative orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[120px]" />
          <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-blue-400/15 rounded-full blur-[100px]" />
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-indigo-300/10 rounded-full blur-[80px]" />
          {/* Subtle dot grid */}
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 pt-14 pb-16 md:pt-20 md:pb-24">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl rounded-full px-5 py-2 border border-white/15 mb-6 animate-fade-in">
            <Sparkles className="w-4 h-4 text-yellow-300" />
            <span className="text-white/80 text-sm font-medium">{t('masters.heroBadge')}</span>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-[1.1] tracking-tight">
            {t('masters.needMaster')}<br />
            <span className="bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-300 bg-clip-text text-transparent">
              {t('masters.findIn2min')}
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 mb-10 max-w-xl leading-relaxed">
            {t('masters.heroSubtitle')}
          </p>

          {/* ── Two main CTA buttons ── */}
          <div className="flex flex-wrap gap-4 mb-10">
            <button
              onClick={scrollToMasters}
              className="group inline-flex items-center gap-3 bg-white text-indigo-700 font-extrabold px-8 py-4 rounded-2xl shadow-2xl shadow-black/20 hover:shadow-3xl hover:shadow-black/30 transition-all duration-300 hover:-translate-y-1 text-base"
            >
              <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {t('quick.findMaster')}
            </button>
            <Link
              to="/masters/request"
              className="group inline-flex items-center gap-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-extrabold px-8 py-4 rounded-2xl shadow-2xl shadow-red-500/30 hover:shadow-3xl hover:shadow-red-500/40 transition-all duration-300 hover:-translate-y-1 text-base"
            >
              <AlertTriangle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              {t('masters.urgentCall')}
            </Link>
          </div>

          {/* ── Search bar — large, prominent ── */}
          <div className="max-w-2xl">
            <div className="flex items-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/15 overflow-hidden ring-1 ring-white/20">
              <Search className="w-6 h-6 text-indigo-400 ml-6 flex-shrink-0" />
              <input
                type="text"
                placeholder={t('masters.searchPlaceholder')}
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  const next = new URLSearchParams(searchParams);
                  if (e.target.value) next.set('q', e.target.value);
                  else next.delete('q');
                  setSearchParams(next, { replace: true });
                }}
                onKeyDown={handleSearchKeyDown}
                className="flex-1 px-5 py-5 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 bg-transparent outline-none text-base md:text-lg font-medium"
              />
            </div>
          </div>

          {/* ── Stats cards ── */}
          <div className="grid grid-cols-3 gap-3 md:gap-4 mt-10 max-w-lg">
            {[
              { icon: <Users className="w-5 h-5" />, num: totalCount ? `${totalCount}` : `${masters.length || '...'}`, label: t('masters.stats.masters'), color: 'from-blue-400/20 to-blue-500/20 border-blue-400/20' },
              { icon: <LayoutGrid className="w-5 h-5" />, num: `${MASTER_CATEGORIES.length}`, label: t('masters.stats.categories'), color: 'from-purple-400/20 to-purple-500/20 border-purple-400/20' },
              { icon: <TrendingUp className="w-5 h-5" />, num: avgRating?.toFixed(1) || '—', label: t('masters.stats.rating'), color: 'from-amber-400/20 to-amber-500/20 border-amber-400/20' },
            ].map(s => (
              <div key={s.label} className={`bg-gradient-to-br ${s.color} backdrop-blur-xl rounded-2xl p-4 border text-center`}>
                <div className="flex justify-center mb-2 text-white/70">{s.icon}</div>
                <p className="text-2xl md:text-3xl font-black text-white">{s.num}</p>
                <p className="text-white/40 text-xs mt-0.5 font-medium">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Secondary links */}
          <div className="flex flex-wrap gap-3 mt-8">
            <Link to="/masters/become" className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl text-white/80 font-semibold px-5 py-2.5 rounded-xl hover:bg-white/20 transition-all duration-300 border border-white/10 text-sm">
              <UserPlus className="w-4 h-4" /> {t('masters.becomeMaster')}
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════ */}
      <div className="bg-gray-50 dark:bg-gray-950 transition-colors duration-300 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-10">

          <HowItWorks />

          {/* ── Categories — tile cards, 2-3 per row ── */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">{t('masters.chooseCategory')}</h2>
              {selectedCategory && (
                <button onClick={() => setCategory('')} className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                  {t('masters.resetFilter')}
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* "All" tile */}
              <button
                onClick={() => setCategory('')}
                className={`group relative flex flex-col items-center gap-3 p-5 rounded-3xl transition-all duration-300 active:scale-[0.97] ${
                  !selectedCategory
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-900/40 scale-[1.02]'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 shadow-md hover:shadow-xl hover:-translate-y-1 border border-gray-100 dark:border-gray-800'
                }`}
              >
                <span className={`text-3xl transition-transform duration-300 group-hover:scale-110 ${!selectedCategory ? 'drop-shadow-lg' : ''}`}>🔍</span>
                <span className="text-sm font-bold">{t('masters.allMasters')}</span>
              </button>

              {MASTER_CATEGORIES.map(cat => {
                const isActive = selectedCategory === cat;
                const gradient = CATEGORY_GRADIENTS[cat] || 'from-gray-400 to-slate-600';
                const bg = CATEGORY_BG[cat] || 'bg-gray-50 dark:bg-gray-900';
                return (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat === selectedCategory ? '' : cat)}
                    className={`group relative flex flex-col items-center gap-3 p-5 rounded-3xl transition-all duration-300 active:scale-[0.97] ${
                      isActive
                        ? `bg-gradient-to-br ${gradient} text-white shadow-xl scale-[1.02]`
                        : `${bg} text-gray-700 dark:text-gray-300 shadow-md hover:shadow-xl hover:-translate-y-1 border border-gray-100 dark:border-gray-800`
                    }`}
                  >
                    <span className={`text-3xl transition-transform duration-300 group-hover:scale-110 ${isActive ? 'drop-shadow-lg' : ''}`}>
                      {CATEGORY_ICONS[cat]}
                    </span>
                    <span className="text-sm font-bold leading-tight text-center">{cat}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── Masters grid ── */}
          <section id="masters-grid">
            {loading ? (
              <div className="text-center py-24">
                <div className="inline-block w-14 h-14 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
                <p className="text-gray-400 dark:text-gray-500 mt-5 text-sm font-medium">{t('masters.loading')}</p>
              </div>
            ) : displayMasters.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-5">
                  <Search className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                </div>
                <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">{t('masters.notFound')}</h3>
                <p className="text-gray-400 dark:text-gray-500 text-sm mb-8 max-w-md mx-auto">{t('masters.tryOtherFilters')}</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <Link to="/masters/request" className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700 transition-colors">
                    {t('masters.emptyCtaRequest')}
                  </Link>
                  <Link to="/masters/become" className="inline-flex items-center gap-2 bg-white dark:bg-gray-900 text-indigo-600 font-bold px-6 py-3 rounded-2xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors">
                    <UserPlus className="w-4 h-4" /> {t('masters.becomeMaster')}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                  <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
                    {selectedCategory || t('masters.allMasters')}
                    <span className="ml-2 text-base font-medium text-gray-400">({listTotal})</span>
                  </h2>
                  {(selectedCategory || searchQuery) && (
                    <div className="flex flex-wrap gap-2">
                      {selectedCategory && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-full">
                          {CATEGORY_ICONS[selectedCategory]} {selectedCategory}
                        </span>
                      )}
                      {searchQuery && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-full">
                          «{searchQuery}»
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {displayMasters.map(master => (
                    <MasterCard key={master.id} master={master} />
                  ))}
                </div>
                {masters.length < listTotal && (
                  <div className="mt-8 text-center">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center justify-center bg-white dark:bg-gray-900 text-indigo-600 font-bold px-8 py-3 rounded-2xl border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 disabled:opacity-60 transition-colors"
                    >
                      {loadingMore ? t('masters.loading') : t('masters.loadMore')}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Become master CTA */}
          <section className="mt-16 mb-6">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 p-8 md:p-10 text-white shadow-2xl">
              <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div className="max-w-lg">
                  <h2 className="text-2xl md:text-3xl font-black mb-2">{t('masters.becomeCtaTitle')}</h2>
                  <p className="text-white/75 text-base leading-relaxed">{t('masters.becomeCtaDesc')}</p>
                </div>
                <Link
                  to="/masters/become"
                  className="inline-flex items-center justify-center gap-2 bg-white text-indigo-700 font-extrabold px-8 py-4 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all flex-shrink-0"
                >
                  {t('masters.becomeMaster')} <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}

/* ============ MASTER DETAIL ============ */
export function MasterDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const [master, setMaster] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMaster();
  }, [id]);

  async function loadMaster() {
    try {
      const res = await fetchWithCache(`master_detail_${id}`, () => withRetry(() => client.entities.masters.get({ id: id! })), 5 * 60 * 1000);
      setMaster(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="inline-block w-12 h-12 border-4 border-indigo-200 dark:border-indigo-800 border-t-indigo-600 dark:border-t-indigo-400 rounded-full animate-spin" />
        <p className="text-gray-400 dark:text-gray-500 mt-5 text-sm font-medium">{t('masters.loadingDetail')}</p>
      </div>
    </Layout>
  );

  if (!master) return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-5">
          <Search className="w-8 h-8 text-gray-300 dark:text-gray-600" />
        </div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">{t('masters.notFoundMaster')}</h2>
        <Link to="/masters" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-semibold text-sm">← {t('masters.backToCatalog')}</Link>
      </div>
    </Layout>
  );

  const gradient = categoryGradient(master.category);

  return (
    <Layout>
      {/* Cover header */}
      <div className={`relative h-52 md:h-64 overflow-hidden bg-gradient-to-br ${gradient}`}>
        {master.photo_url && (
          <StorageImg objectKey={master.photo_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {!master.photo_url && (
          <div className="absolute inset-0 flex items-center justify-center opacity-30">
            <span className="text-8xl">{categoryIcon(master.category)}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
        <div className="relative z-10 max-w-3xl mx-auto px-4 h-full flex flex-col justify-between py-6">
          <Link to="/masters" className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white font-medium w-fit">
            <ChevronLeft className="w-4 h-4" /> {t('masters.backToCatalog')}
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl md:text-4xl font-black text-white drop-shadow-lg">{master.name}</h1>
              {master.verified && <CheckCircle className="w-7 h-7 text-blue-300 drop-shadow" />}
              {master.available_today && (
                <span className="inline-flex items-center gap-1.5 bg-green-500/90 text-white text-xs font-bold px-3 py-1 rounded-full">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" /> {t('masters.availableToday')}
                </span>
              )}
            </div>
            <p className="text-white/90 font-semibold text-lg mt-1">{master.category}</p>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-8 pb-12 relative z-20">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6 md:p-10">
            {/* Rating + badges */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <StarRating rating={Number(master.rating) || 0} />
                <span className="text-2xl font-black text-gray-900 dark:text-white">{master.rating}</span>
                <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">({master.reviews_count} {t('masters.reviews')})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                  {Number(master.rating) >= 4.5 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Award className="w-4 h-4" /> {t('masters.topMaster')}
                    </span>
                  )}
                  {master.verified && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Shield className="w-4 h-4" /> {t('masters.verified')}
                    </span>
                  )}
                  {master.district && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 px-4 py-2 rounded-full shadow-sm">
                      <MapPin className="w-4 h-4" /> {master.district}
                    </span>
                  )}
                  {master.experience_years && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Clock className="w-4 h-4" /> {t('masters.experience').replace('{years}', String(master.experience_years))}
                    </span>
                  )}
                  {master.available_today && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Zap className="w-4 h-4" /> {t('masters.availableToday')}
                    </span>
                  )}
              </div>
            </div>

            {/* Details */}
            <div className="mt-10 space-y-8">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-3">{t('masters.aboutMaster')}</h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-base">{master.description}</p>
              </div>
              {master.services && (
                <div>
                  <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-3">{t('masters.services')}</h3>
                  <div className="flex flex-wrap gap-2">
                    {master.services.split(',').map((s: string, i: number) => (
                      <span key={i} className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-2xl text-sm font-semibold">
                        {s.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {master.gallery_images && (
                <div>
                  <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-3">{t('masters.gallery')}</h3>
                  <StorageGallery keys={master.gallery_images} className="grid grid-cols-2 sm:grid-cols-3 gap-3" />
                </div>
              )}
            </div>

            {/* CTA Buttons */}
            <div className="mt-10 pt-8 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row gap-3">
              {master.phone && (
                <a
                  href={`tel:${master.phone}`}
                  className="flex-1 inline-flex items-center justify-center gap-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-8 py-4 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-blue-200 dark:hover:shadow-blue-900/30 hover:-translate-y-0.5 text-base"
                >
                  <Phone className="w-5 h-5" /> {t('masters.call')}
                </a>
              )}
              {master.whatsapp && (
                <a
                  href={`https://wa.me/${master.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white font-extrabold px-8 py-4 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-green-200 dark:hover:shadow-green-900/30 hover:-translate-y-0.5 text-base"
                >
                  <MessageCircle className="w-5 h-5" /> {t('masters.writeWhatsapp')}
                </a>
              )}
              {master.telegram && telegramUrl(master.telegram) && (
                <a
                  href={telegramUrl(master.telegram)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-3 bg-sky-500 hover:bg-sky-600 text-white font-extrabold px-8 py-4 rounded-2xl transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 text-base"
                >
                  <Send className="w-5 h-5" /> {t('masters.writeTelegram')}
                </a>
              )}
              <Link
                to={`/masters/request?category=${encodeURIComponent(master.category || '')}&master_id=${master.id}&master_name=${encodeURIComponent(master.name || '')}`}
                className="flex-1 inline-flex items-center justify-center gap-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-extrabold px-8 py-4 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 text-base"
              >
                <Send className="w-5 h-5" /> {t('masters.leaveRequest')}
              </Link>
            </div>

            <MasterReviews
              masterId={Number(master.id)}
              onRatingChange={(avg, total) => {
                setMaster((m: any) => (m ? { ...m, rating: avg, reviews_count: total } : m));
              }}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ============ MASTER REQUEST FORM ============ */
export function MasterRequestForm() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const masterIdParam = searchParams.get('master_id');
  const masterNameParam = searchParams.get('master_name');
  const [form, setForm] = useState({
    category: searchParams.get('category') || '',
    problem_description: '',
    address: '',
    phone: '',
    client_name: '',
    master_id: masterIdParam ? Number(masterIdParam) : undefined as number | undefined,
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const prefill = getAccountPrefill();
    if (prefill.name || prefill.phone) {
      setForm((f) => ({
        ...f,
        client_name: f.client_name || prefill.name,
        phone: f.phone || prefill.phone,
      }));
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireAuthDialog(navigate)) return;
    if (!form.category || !form.problem_description || !form.phone) return;
    setSubmitting(true);
    try {
      await withRetry(() => client.entities.master_requests.create({
        data: {
          ...form,
          master_id: form.master_id || undefined,
          status: 'new',
          created_at: new Date().toISOString(),
        }
      }));
      setSuccess(true);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || t('masters.requestError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-24 text-center">
          <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-100 dark:shadow-green-900/20">
            <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-3">{t('masters.requestSuccess')}</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-base">{t('masters.requestSuccessDesc')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cabinet" className="inline-flex items-center justify-center bg-indigo-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-indigo-700">
              {t('masters.goToCabinet')}
            </Link>
            <Link to="/" className="inline-flex items-center justify-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-bold text-base px-6 py-3">
              {t('masters.backHome')}
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const inputClass = "w-full px-5 py-4 border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-base transition-all duration-200";

  return (
    <Layout>
      <div className="bg-gray-50 dark:bg-gray-950 min-h-screen transition-colors duration-300">
        <div className="max-w-lg mx-auto px-4 py-10">
          <Link to="/masters" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white mb-6 transition-colors font-medium">
            <ChevronLeft className="w-4 h-4" /> {t('masters.back')}
          </Link>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{t('masters.requestTitle')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-2 text-base">{t('masters.requestSubtitle')}</p>
          {masterNameParam && (
            <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-8">
              {t('masters.requestForMaster')}: {masterNameParam}
            </p>
          )}
          {!masterNameParam && <div className="mb-8" />}

          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-800 p-6 md:p-8 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('masters.fieldCategory')} *</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputClass} required>
                <option value="">{t('masters.selectCategory')}</option>
                {MASTER_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('masters.fieldProblem')} *</label>
              <textarea value={form.problem_description} onChange={e => setForm({ ...form, problem_description: e.target.value })} rows={4} className={`${inputClass} resize-none`} placeholder={t('masters.problemPlaceholder')} required />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('masters.fieldAddress')}</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputClass} placeholder={t('masters.addressPlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('masters.fieldName')}</label>
              <input type="text" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className={inputClass} placeholder={t('masters.fieldName')} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">{t('masters.fieldPhone')} *</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="+7 (700) 123-45-67" required />
            </div>
            <button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 hover:shadow-xl hover:-translate-y-0.5 text-base">
              {submitting ? t('masters.submitting') : t('masters.submitApplication')}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
