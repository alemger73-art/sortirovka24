import { useState, useEffect } from 'react';
import { useSearchParams, useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry, MASTER_CATEGORIES, CATEGORY_ICONS, timeAgo } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { Star, Phone, MessageCircle, MapPin, CheckCircle, Clock, ChevronLeft, Search, Send, UserPlus, Shield, Zap, Award, Sparkles, Users, LayoutGrid, TrendingUp, AlertTriangle } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { pushCabinetItem, requireAuthDialog } from '@/lib/localAuth';

/* ─── Category gradient map ─── */
const CATEGORY_GRADIENTS: Record<string, string> = {
  'Сантехник': 'from-sky-400 to-blue-600',
  'Электрик': 'from-amber-400 to-orange-600',
  'Сварщик': 'from-orange-400 to-red-600',
  'Мебельщик': 'from-emerald-400 to-green-600',
  'Ремонт техники': 'from-violet-400 to-purple-600',
  'Грузчики': 'from-cyan-400 to-sky-600',
  'Ремонт квартир': 'from-rose-400 to-pink-600',
  'Окна и двери': 'from-teal-400 to-emerald-600',
  'Натяжные потолки': 'from-indigo-400 to-blue-600',
  'Разнорабочие': 'from-slate-400 to-gray-600',
};

const CATEGORY_BG: Record<string, string> = {
  'Сантехник': 'bg-sky-50 dark:bg-sky-950/40',
  'Электрик': 'bg-amber-50 dark:bg-amber-950/40',
  'Сварщик': 'bg-orange-50 dark:bg-orange-950/40',
  'Мебельщик': 'bg-emerald-50 dark:bg-emerald-950/40',
  'Ремонт техники': 'bg-violet-50 dark:bg-violet-950/40',
  'Грузчики': 'bg-cyan-50 dark:bg-cyan-950/40',
  'Ремонт квартир': 'bg-rose-50 dark:bg-rose-950/40',
  'Окна и двери': 'bg-teal-50 dark:bg-teal-950/40',
  'Натяжные потолки': 'bg-indigo-50 dark:bg-indigo-950/40',
  'Разнорабочие': 'bg-slate-50 dark:bg-slate-950/40',
};

/* ─── Star rating ─── */
function StarRating({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const stars = [];
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  const cls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  for (let i = 0; i < 5; i++) {
    if (i < full) {
      stars.push(<Star key={i} className={`${cls} text-amber-400 fill-amber-400`} />);
    } else if (i === full && hasHalf) {
      stars.push(
        <div key={i} className="relative">
          <Star className={`${cls} text-gray-200 dark:text-gray-700`} />
          <div className="absolute inset-0 overflow-hidden w-1/2">
            <Star className={`${cls} text-amber-400 fill-amber-400`} />
          </div>
        </div>
      );
    } else {
      stars.push(<Star key={i} className={`${cls} text-gray-200 dark:text-gray-700`} />);
    }
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

/* ============ MASTER CATALOG ============ */
export function MastersCatalog() {
  const [searchParams] = useSearchParams();
  const [masters, setMasters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadMasters();
  }, [selectedCategory]);

  async function loadMasters() {
    setLoading(true);
    const cacheKey = `masters_list_${selectedCategory || 'all'}`;
    try {
      const res = await fetchWithCache(cacheKey, () => {
        const query: any = {};
        if (selectedCategory) query.category = selectedCategory;
        return withRetry(() => client.entities.masters.query({ query, sort: '-rating', limit: 50 }));
      }, 5 * 60 * 1000);
      setMasters(res.data?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filtered = masters.filter(m =>
    !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.services?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const scrollToMasters = () => {
    document.getElementById('masters-grid')?.scrollIntoView({ behavior: 'smooth' });
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
            <span className="text-white/80 text-sm font-medium">Проверенные специалисты вашего района</span>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-6xl font-black text-white mb-4 leading-[1.1] tracking-tight">
            Нужен мастер?<br />
            <span className="bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-300 bg-clip-text text-transparent">
              Найдём за 2 минуты
            </span>
          </h1>
          <p className="text-lg md:text-xl text-white/50 mb-10 max-w-xl leading-relaxed">
            Проверенные специалисты Сортировки рядом с вами — сантехники, электрики, ремонт и многое другое
          </p>

          {/* ── Two main CTA buttons ── */}
          <div className="flex flex-wrap gap-4 mb-10">
            <button
              onClick={scrollToMasters}
              className="group inline-flex items-center gap-3 bg-white text-indigo-700 font-extrabold px-8 py-4 rounded-2xl shadow-2xl shadow-black/20 hover:shadow-3xl hover:shadow-black/30 transition-all duration-300 hover:-translate-y-1 text-base"
            >
              <Search className="w-5 h-5 group-hover:scale-110 transition-transform" />
              Найти мастера
            </button>
            <Link
              to="/masters/request"
              className="group inline-flex items-center gap-3 bg-gradient-to-r from-orange-500 to-red-500 text-white font-extrabold px-8 py-4 rounded-2xl shadow-2xl shadow-red-500/30 hover:shadow-3xl hover:shadow-red-500/40 transition-all duration-300 hover:-translate-y-1 text-base"
            >
              <AlertTriangle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              Срочно вызвать
            </Link>
          </div>

          {/* ── Search bar — large, prominent ── */}
          <div className="max-w-2xl">
            <div className="flex items-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/15 overflow-hidden ring-1 ring-white/20">
              <Search className="w-6 h-6 text-indigo-400 ml-6 flex-shrink-0" />
              <input
                type="text"
                placeholder="Например: сантехник, электрик, ремонт"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 px-5 py-5 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 bg-transparent outline-none text-base md:text-lg font-medium"
              />
            </div>
          </div>

          {/* ── Stats cards ── */}
          <div className="grid grid-cols-3 gap-3 md:gap-4 mt-10 max-w-lg">
            {[
              { icon: <Users className="w-5 h-5" />, num: `${masters.length || '...'}`, label: 'Мастеров', color: 'from-blue-400/20 to-blue-500/20 border-blue-400/20' },
              { icon: <LayoutGrid className="w-5 h-5" />, num: '10+', label: 'Категорий', color: 'from-purple-400/20 to-purple-500/20 border-purple-400/20' },
              { icon: <TrendingUp className="w-5 h-5" />, num: '4.8', label: 'Ср. рейтинг', color: 'from-amber-400/20 to-amber-500/20 border-amber-400/20' },
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
              <UserPlus className="w-4 h-4" /> Стать мастером
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          MAIN CONTENT
      ═══════════════════════════════════════════════════ */}
      <div className="bg-gray-50 dark:bg-gray-950 transition-colors duration-300 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 py-10">

          {/* ── Categories — tile cards, 2-3 per row ── */}
          <section className="mb-12">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">Выберите категорию</h2>
              {selectedCategory && (
                <button onClick={() => setSelectedCategory('')} className="text-sm text-indigo-600 dark:text-indigo-400 font-semibold hover:underline">
                  Сбросить фильтр
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {/* "All" tile */}
              <button
                onClick={() => setSelectedCategory('')}
                className={`group relative flex flex-col items-center gap-3 p-5 rounded-3xl transition-all duration-300 active:scale-[0.97] ${
                  !selectedCategory
                    ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-900/40 scale-[1.02]'
                    : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 shadow-md hover:shadow-xl hover:-translate-y-1 border border-gray-100 dark:border-gray-800'
                }`}
              >
                <span className={`text-3xl transition-transform duration-300 group-hover:scale-110 ${!selectedCategory ? 'drop-shadow-lg' : ''}`}>🔍</span>
                <span className="text-sm font-bold">Все мастера</span>
              </button>

              {MASTER_CATEGORIES.map(cat => {
                const isActive = selectedCategory === cat;
                const gradient = CATEGORY_GRADIENTS[cat] || 'from-gray-400 to-slate-600';
                const bg = CATEGORY_BG[cat] || 'bg-gray-50 dark:bg-gray-900';
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
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
                <p className="text-gray-400 dark:text-gray-500 mt-5 text-sm font-medium">Загружаем мастеров...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-24">
                <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-5">
                  <Search className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                </div>
                <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">Мастера не найдены</h3>
                <p className="text-gray-400 dark:text-gray-500 text-sm">Попробуйте изменить фильтры или поисковый запрос</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">
                    {selectedCategory || 'Все мастера'}
                    <span className="ml-2 text-base font-medium text-gray-400">({filtered.length})</span>
                  </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {filtered.map(master => {
                    const gradient = CATEGORY_GRADIENTS[master.category] || 'from-blue-500 to-indigo-500';
                    return (
                      <div
                        key={master.id}
                        className="group bg-white dark:bg-gray-900 rounded-3xl shadow-md hover:shadow-2xl transition-all duration-500 hover:-translate-y-1.5 border border-gray-100/80 dark:border-gray-800 overflow-hidden"
                      >
                        {/* Gradient accent bar */}
                        <div className={`h-1.5 bg-gradient-to-r ${gradient}`} />

                        <div className="p-6">
                          {/* Top row: avatar + info */}
                          <div className="flex items-start gap-5">
                            {/* Large avatar */}
                            <div className="relative flex-shrink-0">
                              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden shadow-lg ring-2 ring-gray-100 dark:ring-gray-800 group-hover:ring-indigo-200 dark:group-hover:ring-indigo-800 transition-all duration-300">
                                {master.photo_url ? (
                                  <StorageImg objectKey={master.photo_url} alt={master.name} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-4xl">{CATEGORY_ICONS[master.category] || '🔧'}</span>
                                )}
                              </div>
                              {/* Online dot */}
                              {master.available_today && (
                                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-green-500 rounded-full border-[3px] border-white dark:border-gray-900 flex items-center justify-center shadow-sm">
                                  <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse" />
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-extrabold text-gray-900 dark:text-white text-xl truncate">{master.name}</h3>
                                {master.verified && (
                                  <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-sm" title="Проверен">
                                    <CheckCircle className="w-4 h-4 text-white" />
                                  </div>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-2">{master.category}</p>

                              {/* Star rating — prominent */}
                              <div className="flex items-center gap-2.5">
                                <StarRating rating={Number(master.rating) || 0} size="sm" />
                                <span className="text-base font-black text-gray-900 dark:text-white">{master.rating}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">({master.reviews_count})</span>
                              </div>
                            </div>
                          </div>

                          {/* Badges row */}
                          <div className="flex flex-wrap gap-2 mt-4">
                            {Number(master.rating) >= 4.5 && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/30 px-3 py-1.5 rounded-full shadow-sm">
                                <Award className="w-3 h-3" /> Топ мастер
                              </span>
                            )}
                            {master.verified && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 px-3 py-1.5 rounded-full shadow-sm">
                                <Shield className="w-3 h-3" /> Проверен
                              </span>
                            )}
                            {master.district && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 px-3 py-1.5 rounded-full shadow-sm">
                                <MapPin className="w-3 h-3" /> Рядом
                              </span>
                            )}
                            {master.available_today && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 dark:text-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 px-3 py-1.5 rounded-full shadow-sm">
                                <Zap className="w-3 h-3" /> Свободен
                              </span>
                            )}
                          </div>

                          {/* Description */}
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 line-clamp-2 leading-relaxed">{master.description}</p>

                          {/* Meta */}
                          <div className="flex items-center gap-5 mt-3 text-xs text-gray-400 dark:text-gray-500 font-medium">
                            {master.experience_years && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> Стаж {master.experience_years} лет
                              </span>
                            )}
                            {master.district && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5" /> {master.district}
                              </span>
                            )}
                          </div>

                          {/* ── Action buttons — large, colorful ── */}
                          <div className="flex items-center gap-2.5 mt-6 pt-5 border-t border-gray-100 dark:border-gray-800">
                            <Link
                              to={`/masters/${master.id}`}
                              className="flex-1 text-center text-sm font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 px-4 py-3 rounded-2xl transition-all duration-300 hover:shadow-md"
                            >
                              Подробнее
                            </Link>
                            {master.whatsapp && (
                              <a
                                href={`https://wa.me/${master.whatsapp.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-5 py-3 rounded-2xl transition-all duration-300 hover:scale-[1.03] shadow-md hover:shadow-lg text-sm"
                                title="Написать"
                              >
                                <MessageCircle className="w-4 h-4" /> Написать
                              </a>
                            )}
                            {master.phone && (
                              <a
                                href={`tel:${master.phone}`}
                                onClick={e => e.stopPropagation()}
                                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-3 rounded-2xl transition-all duration-300 hover:scale-[1.03] shadow-md hover:shadow-lg text-sm"
                                title="Позвонить"
                              >
                                <Phone className="w-4 h-4" /> Звонок
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}

/* ============ MASTER DETAIL ============ */
export function MasterDetail() {
  const { id } = useParams();
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
        <p className="text-gray-400 dark:text-gray-500 mt-5 text-sm font-medium">Загрузка...</p>
      </div>
    </Layout>
  );

  if (!master) return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-5">
          <Search className="w-8 h-8 text-gray-300 dark:text-gray-600" />
        </div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">Мастер не найден</h2>
        <Link to="/masters" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-semibold text-sm">← Назад к каталогу</Link>
      </div>
    </Layout>
  );

  const gradient = CATEGORY_GRADIENTS[master.category] || 'from-blue-500 to-indigo-600';

  return (
    <Layout>
      {/* Gradient header */}
      <div className={`bg-gradient-to-br ${gradient} relative overflow-hidden`}>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -right-20 w-60 h-60 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-white/5 rounded-full blur-2xl" />
          <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-4 pt-8 pb-28">
          <Link to="/masters" className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white mb-6 transition-colors font-medium">
            <ChevronLeft className="w-4 h-4" /> Назад к каталогу
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-20 pb-12 relative z-20">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="p-6 md:p-10">
            {/* Avatar + Info */}
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="relative flex-shrink-0">
                <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center overflow-hidden shadow-xl ring-4 ring-white dark:ring-gray-900">
                  {master.photo_url ? (
                    <StorageImg objectKey={master.photo_url} alt={master.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-6xl">{CATEGORY_ICONS[master.category] || '🔧'}</span>
                  )}
                </div>
                {master.available_today && (
                  <div className="absolute -bottom-1.5 -right-1.5 w-9 h-9 bg-green-500 rounded-full border-4 border-white dark:border-gray-900 flex items-center justify-center shadow-md">
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                  </div>
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-3xl md:text-4xl font-black text-gray-900 dark:text-white">{master.name}</h1>
                  {master.verified && (
                    <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center shadow-md" title="Проверен">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                  )}
                </div>
                <p className="text-indigo-600 dark:text-indigo-400 font-bold text-lg mb-3">{master.category}</p>

                {/* Rating */}
                <div className="flex items-center gap-3 mb-5">
                  <StarRating rating={Number(master.rating) || 0} />
                  <span className="text-2xl font-black text-gray-900 dark:text-white">{master.rating}</span>
                  <span className="text-sm text-gray-400 dark:text-gray-500 font-medium">({master.reviews_count} отзывов)</span>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  {Number(master.rating) >= 4.5 && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Award className="w-4 h-4" /> Топ мастер
                    </span>
                  )}
                  {master.verified && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Shield className="w-4 h-4" /> Проверен
                    </span>
                  )}
                  {master.district && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 px-4 py-2 rounded-full shadow-sm">
                      <MapPin className="w-4 h-4" /> {master.district}
                    </span>
                  )}
                  {master.experience_years && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-700 dark:text-purple-300 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Clock className="w-4 h-4" /> Стаж: {master.experience_years} лет
                    </span>
                  )}
                  {master.available_today && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-700 dark:text-green-300 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 px-4 py-2 rounded-full shadow-sm">
                      <Zap className="w-4 h-4" /> Свободен сегодня
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="mt-10 space-y-8">
              <div>
                <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-3">О мастере</h3>
                <p className="text-gray-600 dark:text-gray-300 leading-relaxed text-base">{master.description}</p>
              </div>
              {master.services && (
                <div>
                  <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-3">Услуги</h3>
                  <div className="flex flex-wrap gap-2">
                    {master.services.split(',').map((s: string, i: number) => (
                      <span key={i} className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-4 py-2.5 rounded-2xl text-sm font-semibold">
                        {s.trim()}
                      </span>
                    ))}
                  </div>
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
                  <Phone className="w-5 h-5" /> Позвонить
                </a>
              )}
              {master.whatsapp && (
                <a
                  href={`https://wa.me/${master.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-3 bg-green-500 hover:bg-green-600 text-white font-extrabold px-8 py-4 rounded-2xl transition-all duration-300 hover:shadow-xl hover:shadow-green-200 dark:hover:shadow-green-900/30 hover:-translate-y-0.5 text-base"
                >
                  <MessageCircle className="w-5 h-5" /> Написать в WhatsApp
                </a>
              )}
              <Link
                to="/masters/request"
                className="flex-1 inline-flex items-center justify-center gap-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-extrabold px-8 py-4 rounded-2xl transition-all duration-300 hover:-translate-y-0.5 text-base"
              >
                <Send className="w-5 h-5" /> Оставить заявку
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ============ MASTER REQUEST FORM ============ */
export function MasterRequestForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ category: '', problem_description: '', address: '', phone: '', client_name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireAuthDialog(navigate)) return;
    if (!form.category || !form.problem_description || !form.phone) return;
    setSubmitting(true);
    try {
      await withRetry(() => client.entities.master_requests.create({
        data: { ...form, status: 'new', created_at: new Date().toISOString() }
      }));
      pushCabinetItem('masterRequests', {
        title: form.category,
        subtitle: form.problem_description.slice(0, 80),
      });
      setSuccess(true);
      client.apiCall.invoke({
        url: '/api/v1/telegram/notify/master-request',
        method: 'POST',
        data: {
          category: form.category,
          problem_description: form.problem_description,
          address: form.address,
          phone: form.phone,
          client_name: form.client_name,
        },
      }).catch((err: unknown) => console.warn('Telegram notification skipped:', err));
    } catch (e) {
      console.error(e);
      alert('Ошибка при отправке заявки');
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
          <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-3">Заявка отправлена!</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-base">Мастера увидят вашу заявку и свяжутся с вами.</p>
          <Link to="/" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-bold text-base">На главную</Link>
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
            <ChevronLeft className="w-4 h-4" /> Назад
          </Link>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Оставить заявку</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-base">Опишите проблему, и мастера свяжутся с вами</p>

          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-800 p-6 md:p-8 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Категория *</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputClass} required>
                <option value="">Выберите категорию</option>
                {MASTER_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Описание проблемы *</label>
              <textarea value={form.problem_description} onChange={e => setForm({ ...form, problem_description: e.target.value })} rows={4} className={`${inputClass} resize-none`} placeholder="Опишите что нужно сделать..." required />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Адрес</label>
              <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className={inputClass} placeholder="ул. Железнодорожная 15, кв. 8" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Ваше имя</label>
              <input type="text" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className={inputClass} placeholder="Ваше имя" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Телефон *</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} placeholder="+7 (700) 123-45-67" required />
            </div>
            <button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 hover:shadow-xl hover:-translate-y-0.5 text-base">
              {submitting ? 'Отправка...' : 'Отправить заявку'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}

/* ============ BECOME MASTER FORM ============ */
export function BecomeMasterForm() {
  const [form, setForm] = useState({ name: '', category: '', phone: '', whatsapp: '', district: 'Сортировка', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.category || !form.phone) return;
    setSubmitting(true);
    try {
      await withRetry(() => client.entities.become_master_requests.create({
        data: { ...form, status: 'pending', created_at: new Date().toISOString() }
      }));
      setSuccess(true);
      client.apiCall.invoke({
        url: '/api/v1/telegram/notify/become-master',
        method: 'POST',
        data: {
          name: form.name,
          category: form.category,
          phone: form.phone,
          whatsapp: form.whatsapp,
          district: form.district,
          description: form.description,
        },
      }).catch((err: unknown) => console.warn('Telegram notification skipped:', err));
    } catch (e) {
      console.error(e);
      alert('Ошибка при отправке заявки');
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
          <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-3">Заявка отправлена!</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-base">Мы рассмотрим вашу заявку и добавим вас в каталог мастеров.</p>
          <Link to="/" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 font-bold text-base">На главную</Link>
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
            <ChevronLeft className="w-4 h-4" /> Назад
          </Link>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Стать мастером</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8 text-base">Заполните форму, и мы добавим вас в каталог</p>

          <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-800 p-6 md:p-8 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Ваше имя *</label>
              <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Категория *</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputClass} required>
                <option value="">Выберите категорию</option>
                {MASTER_CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_ICONS[c]} {c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Телефон *</label>
              <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputClass} required />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">WhatsApp</label>
              <input type="tel" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Район работы</label>
              <input type="text" value={form.district} onChange={e => setForm({ ...form, district: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">О себе и услугах</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} className={`${inputClass} resize-none`} placeholder="Расскажите о своём опыте и услугах..." />
            </div>
            <button type="submit" disabled={submitting} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-extrabold py-4 rounded-2xl transition-all duration-300 disabled:opacity-50 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/30 hover:shadow-xl hover:-translate-y-0.5 text-base">
              {submitting ? 'Отправка...' : 'Отправить заявку'}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}