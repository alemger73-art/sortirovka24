import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import StorageImg from '@/components/StorageImg';
import { StorageGallery } from '@/components/MultiImageUpload';
import StarRating from '@/components/masters/StarRating';
import {
  client, withRetry, SALON_CATEGORIES, salonCategoryIcon, salonCategoryGradient, sortSalons,
} from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import {
  Phone, MessageCircle, MapPin, Clock, ChevronLeft, ChevronRight, Search,
  Sparkles, BadgeCheck, Instagram, Navigation, Scissors,
} from 'lucide-react';

const PAGE_SIZE = 24;

interface Salon {
  id: number | string;
  name?: string;
  category?: string;
  address?: string;
  district?: string;
  phone?: string;
  whatsapp?: string;
  instagram?: string;
  description?: string;
  services?: string;
  working_hours?: string;
  price_from?: string;
  photo_url?: string;
  gallery_images?: string;
  rating?: number;
  reviews_count?: number;
  verified?: boolean;
  featured?: boolean;
  sort_order?: number | null;
}

function waLink(num?: string) {
  if (!num) return '';
  const clean = num.replace(/\D/g, '');
  return clean ? `https://wa.me/${clean}` : '';
}

function instaLink(handle?: string) {
  if (!handle) return '';
  const clean = handle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '').trim();
  return clean ? `https://instagram.com/${clean}` : '';
}

function mapsLink(address?: string, name?: string) {
  const q = [name, address].filter(Boolean).join(', ');
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function parseServices(services?: string, limit = 99): string[] {
  if (!services) return [];
  return services.split(/[,\n]/).map(s => s.trim()).filter(Boolean).slice(0, limit);
}

/* ============ SALON CARD ============ */
function SalonCard({ salon }: { salon: Salon }) {
  const gradient = salonCategoryGradient(salon.category);
  const rating = Number(salon.rating) || 0;
  const wa = waLink(salon.whatsapp);

  return (
    <article className="group flex flex-col rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md hover:border-pink-200 dark:hover:border-pink-900 transition-all duration-200 overflow-hidden">
      {/* Cover */}
      <Link to={`/salons/${salon.id}`} className="relative block aspect-[16/10] overflow-hidden">
        {salon.photo_url ? (
          <StorageImg objectKey={salon.photo_url} alt={salon.name || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
            <span className="text-5xl opacity-90">{salonCategoryIcon(salon.category)}</span>
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
          {salon.featured && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-pink-600/90 backdrop-blur px-2 py-1 rounded-full shadow">
              <Sparkles className="w-3 h-3" /> Рекомендуем
            </span>
          )}
          {salon.verified && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-blue-600/90 backdrop-blur px-2 py-1 rounded-full shadow">
              <BadgeCheck className="w-3 h-3" /> Проверен
            </span>
          )}
        </div>
        {salon.price_from && (
          <span className="absolute bottom-2 right-2 text-[11px] font-bold text-gray-900 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full shadow">
            от {salon.price_from}
          </span>
        )}
      </Link>

      {/* Info */}
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Link to={`/salons/${salon.id}`}>
              <h3 className="font-bold text-gray-900 dark:text-white text-sm truncate">{salon.name}</h3>
            </Link>
            <p className="text-xs text-pink-600 dark:text-pink-400 font-medium mt-0.5">
              {salonCategoryIcon(salon.category)} {salon.category}
            </p>
          </div>
          {rating > 0 && (
            <div className="flex flex-col items-end flex-shrink-0">
              <div className="flex items-center gap-1">
                <StarRating rating={rating} size="sm" />
                <span className="text-xs font-bold text-gray-900 dark:text-white">{rating.toFixed(1)}</span>
              </div>
              {salon.reviews_count ? <span className="text-[10px] text-gray-400">({salon.reviews_count})</span> : null}
            </div>
          )}
        </div>

        {(salon.address || salon.district) && (
          <div className="flex items-start gap-1 mt-2 text-[11px] text-gray-500 dark:text-gray-400">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-1">{salon.address || salon.district}</span>
          </div>
        )}
        {salon.working_hours && (
          <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{salon.working_hours}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          {salon.phone && (
            <a href={`tel:${salon.phone}`} className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-xl transition-colors">
              <Phone className="w-3.5 h-3.5" /> Позвонить
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 px-3 py-2 rounded-xl transition-colors">
              <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
            </a>
          )}
          <Link to={`/salons/${salon.id}`} className="inline-flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-pink-600 dark:hover:text-pink-400 px-1.5 py-2">
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ============ SALONS CATALOG ============ */
export function SalonsCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [salons, setSalons] = useState<Salon[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') || '');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [debouncedQ, setDebouncedQ] = useState(searchParams.get('q') || '');

  const setCategory = (cat: string) => {
    setSelectedCategory(cat);
    const next = new URLSearchParams(searchParams);
    if (cat) next.set('category', cat);
    else next.delete('category');
    setSearchParams(next, { replace: true });
  };

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
    loadSalons(false);
  }, [selectedCategory, debouncedQ]);

  async function loadSalons(append = false) {
    if (!append) setLoading(true);
    else setLoadingMore(true);
    const skip = append ? salons.length : 0;
    const cacheKey = `salons_list_${selectedCategory || 'all'}_${debouncedQ || ''}_${skip}`;
    try {
      const res = await fetchWithCache(cacheKey, () => {
        const query: Record<string, string> = {};
        if (selectedCategory) query.category = selectedCategory;
        if (debouncedQ) query.q = debouncedQ;
        return withRetry(() => client.entities.salons.query({
          query: (selectedCategory || debouncedQ) ? query : undefined,
          sort: 'sort_order',
          skip,
          limit: PAGE_SIZE,
        }));
      }, append ? 0 : 5 * 60 * 1000);
      const items = sortSalons(res.data?.items || []);
      setListTotal(res.data?.total ?? items.length);
      setSalons(prev => (append ? sortSalons([...prev, ...items]) : items));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  const scrollToGrid = () => document.getElementById('salons-grid')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <Layout>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-pink-600 via-rose-600 to-fuchsia-700">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-80 h-80 bg-pink-400/20 rounded-full blur-[100px]" />
          <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-fuchsia-300/10 rounded-full blur-[80px]" />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 pt-10 pb-12 md:pt-14 md:pb-14">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl rounded-full px-4 py-1.5 border border-white/15 mb-4">
            <Scissors className="w-4 h-4 text-pink-100" />
            <span className="text-white/90 text-sm font-medium">Салоны красоты</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2 leading-tight">
            Красота рядом с домом
          </h1>
          <p className="text-base text-white/70 mb-7 max-w-lg">
            Парикмахерские, барбершопы, маникюр, косметология и СПА. Выбирайте салон и записывайтесь напрямую — по телефону или в WhatsApp.
          </p>
          <div className="max-w-xl">
            <div className="flex items-center bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl shadow-black/15 overflow-hidden ring-1 ring-white/20">
              <Search className="w-5 h-5 text-pink-600 ml-5 flex-shrink-0" />
              <input
                type="text"
                placeholder="Поиск: салон, услуга, район…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') scrollToGrid(); }}
                className="flex-1 px-4 py-4 text-gray-800 placeholder:text-gray-400 bg-transparent outline-none text-base font-medium"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="bg-gray-50 dark:bg-gray-950 min-h-[50vh]">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {/* Category chips */}
          <section className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Категории</h2>
              {selectedCategory && (
                <button type="button" onClick={() => setCategory('')} className="text-xs text-pink-600 dark:text-pink-400 font-semibold hover:underline">
                  Сбросить
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin -mx-1 px-1">
              <button
                type="button"
                onClick={() => setCategory('')}
                className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full border transition-colors ${
                  !selectedCategory
                    ? 'bg-pink-600 text-white border-pink-600'
                    : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-pink-300'
                }`}
              >
                ✨ Все салоны
              </button>
              {SALON_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat === selectedCategory ? '' : cat)}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full border transition-colors ${
                    selectedCategory === cat
                      ? 'bg-pink-600 text-white border-pink-600'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-pink-300'
                  }`}
                >
                  <span>{salonCategoryIcon(cat)}</span> {cat}
                </button>
              ))}
            </div>
          </section>

          {/* Grid */}
          <section id="salons-grid">
            {loading ? (
              <div className="text-center py-16">
                <div className="inline-block w-10 h-10 border-[3px] border-pink-200 border-t-pink-600 rounded-full animate-spin" />
                <p className="text-gray-400 mt-4 text-sm">Загружаем салоны…</p>
              </div>
            ) : salons.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800">
                <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-pink-50 dark:bg-pink-950/40 flex items-center justify-center">
                  <Scissors className="w-7 h-7 text-pink-400" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">Салоны не найдены</h3>
                <p className="text-xs text-gray-500 mb-4 max-w-sm mx-auto">Попробуйте изменить категорию или поисковый запрос.</p>
                {(selectedCategory || debouncedQ) && (
                  <button onClick={() => { setCategory(''); setSearchQuery(''); }} className="text-xs font-bold text-pink-600 hover:underline">
                    Показать все
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-white">
                    {selectedCategory || 'Все салоны'}
                    <span className="ml-1.5 font-normal text-gray-400">({listTotal})</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {salons.map(s => <SalonCard key={s.id} salon={s} />)}
                </div>
                {salons.length < listTotal && (
                  <div className="mt-6 text-center">
                    <button
                      type="button"
                      onClick={() => loadSalons(true)}
                      disabled={loadingMore}
                      className="text-sm font-semibold text-pink-600 hover:text-pink-700 disabled:opacity-50"
                    >
                      {loadingMore ? 'Загрузка…' : 'Показать ещё'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}

/* ============ SALON DETAIL ============ */
export function SalonDetail() {
  const { id } = useParams();
  const [salon, setSalon] = useState<Salon | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSalon(); }, [id]);

  async function loadSalon() {
    setLoading(true);
    try {
      const res = await fetchWithCache(`salon_detail_${id}`, () => withRetry(() => client.entities.salons.get({ id: id! })), 5 * 60 * 1000);
      setSalon(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const services = useMemo(() => parseServices(salon?.services), [salon?.services]);

  if (loading) return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="inline-block w-12 h-12 border-4 border-pink-200 dark:border-pink-800 border-t-pink-600 rounded-full animate-spin" />
        <p className="text-gray-400 mt-5 text-sm font-medium">Загружаем салон…</p>
      </div>
    </Layout>
  );

  if (!salon) return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-5">
          <Scissors className="w-8 h-8 text-gray-300 dark:text-gray-600" />
        </div>
        <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">Салон не найден</h2>
        <Link to="/salons" className="text-pink-600 dark:text-pink-400 hover:text-pink-700 font-semibold text-sm">← Все салоны</Link>
      </div>
    </Layout>
  );

  const gradient = salonCategoryGradient(salon.category);
  const rating = Number(salon.rating) || 0;
  const wa = waLink(salon.whatsapp);
  const insta = instaLink(salon.instagram);
  const maps = mapsLink(salon.address, salon.name);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-4 pb-28 md:pb-8">
        <Link to="/salons" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 mb-4">
          <ChevronLeft className="w-4 h-4" /> Все салоны
        </Link>

        {/* Cover */}
        <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-sm">
          <div className="relative aspect-[16/9]">
            {salon.photo_url ? (
              <StorageImg objectKey={salon.photo_url} alt={salon.name || ''} className="w-full h-full object-cover" />
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                <span className="text-6xl opacity-90">{salonCategoryIcon(salon.category)}</span>
              </div>
            )}
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              {salon.featured && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-pink-600/90 backdrop-blur px-2.5 py-1 rounded-full shadow">
                  <Sparkles className="w-3 h-3" /> Рекомендуем
                </span>
              )}
              {salon.verified && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-blue-600/90 backdrop-blur px-2.5 py-1 rounded-full shadow">
                  <BadgeCheck className="w-3 h-3" /> Проверен
                </span>
              )}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 px-5 py-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">{salon.name}</h1>
            <p className="text-sm text-pink-600 dark:text-pink-400 font-medium mt-0.5">
              {salonCategoryIcon(salon.category)} {salon.category}
            </p>
            {rating > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <StarRating rating={rating} size="sm" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">{rating.toFixed(1)}</span>
                {salon.reviews_count ? <span className="text-xs text-gray-400">({salon.reviews_count} отзывов)</span> : null}
              </div>
            )}

            {/* Meta chips */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {salon.working_hours && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                  <Clock className="w-3 h-3" /> {salon.working_hours}
                </span>
              )}
              {salon.district && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full">
                  <MapPin className="w-3 h-3" /> {salon.district}
                </span>
              )}
              {salon.price_from && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-pink-700 dark:text-pink-300 bg-pink-50 dark:bg-pink-950/40 px-2.5 py-1 rounded-full">
                  от {salon.price_from}
                </span>
              )}
            </div>

            {/* Desktop actions */}
            <div className="hidden md:flex flex-wrap gap-2 mt-4">
              {salon.phone && (
                <a href={`tel:${salon.phone}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2.5 rounded-xl">
                  <Phone className="w-4 h-4" /> Позвонить
                </a>
              )}
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 px-4 py-2.5 rounded-xl">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              )}
              {insta && (
                <a href={insta} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-gradient-to-r from-fuchsia-500 to-pink-600 px-4 py-2.5 rounded-xl">
                  <Instagram className="w-4 h-4" /> Instagram
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-4">
          {salon.description && (
            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">О салоне</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{salon.description}</p>
            </section>
          )}

          {services.length > 0 && (
            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Услуги и цены</h2>
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {services.map((s, i) => (
                  <li key={i} className="py-2 text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                    <span className="text-pink-500 mt-0.5">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {salon.gallery_images && (
            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">Галерея</h2>
              <StorageGallery keys={salon.gallery_images} className="grid grid-cols-2 sm:grid-cols-3 gap-2" />
            </section>
          )}

          {(salon.address || maps) && (
            <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Адрес</h2>
              {salon.address && (
                <p className="text-sm text-gray-600 dark:text-gray-300 flex items-start gap-2">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5 text-pink-500" /> {salon.address}
                </p>
              )}
              {maps && (
                <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-sm font-bold text-pink-600 dark:text-pink-400 hover:underline">
                  <Navigation className="w-4 h-4" /> Открыть на карте
                </a>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-4 py-3 safe-area-pb">
        <div className="flex gap-2 max-w-2xl mx-auto">
          {salon.phone && (
            <a href={`tel:${salon.phone}`} className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-blue-600 py-3 rounded-xl">
              <Phone className="w-4 h-4" /> Позвонить
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-green-600 py-3 rounded-xl">
              <MessageCircle className="w-4 h-4" /> WhatsApp
            </a>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center w-12 bg-gray-100 dark:bg-gray-800 rounded-xl" title="На карте">
              <Navigation className="w-4 h-4 text-gray-600 dark:text-gray-300" />
            </a>
          )}
        </div>
      </div>
    </Layout>
  );
}
