import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry, STATUS_LABELS, timeAgo, formatDate } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import {
  ChevronLeft, MapPin, Phone, MessageCircle, Clock, Send, Loader2, Home,
  Search, Eye, Share2, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import StorageImg from '@/components/StorageImg';
import { StorageImage } from '@/components/ImageUpload';
import MultiImageUpload from '@/components/MultiImageUpload';
import { requireAuthDialog, getAccountPrefill, getCurrentUser } from '@/lib/localAuth';
import { accountApi } from '@/lib/accountApi';
import {
  type ReCategory,
  type RealEstateListing,
  type RealEstateSort,
  RE_FALLBACK_IMAGES,
  RE_HERO_IMG,
  defaultReExpiresAtIso,
  dealTypeForReType,
  fetchRealEstateCategories,
  filterPublicRealEstate,
  formatExpiryLabel,
  getRealEstateCover,
  isRealEstatePromoted,
  loadReFavorites,
  reTypeForCategory,
  resolveReTypeLabel,
  saveReFavorites,
  sortRealEstateListings,
  toggleReFavorite,
} from '@/lib/realEstate';
import { useLanguage } from '@/contexts/LanguageContext';
import SafetyAlert from '@/components/SafetyAlert';

type ReFormState = {
  category_id: string;
  title: string;
  description: string;
  price: string;
  rooms: string;
  area: string;
  floor_info: string;
  address: string;
  phone: string;
  whatsapp: string;
  telegram: string;
  author_name: string;
};

function ReFormFields({
  form,
  setForm,
  galleryKeys,
  setGalleryKeys,
  categories,
  t,
}: {
  form: ReFormState;
  setForm: React.Dispatch<React.SetStateAction<ReFormState>>;
  galleryKeys: string;
  setGalleryKeys: (v: string) => void;
  categories: ReCategory[];
  t: (key: string) => string;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.form.type')} *</label>
        <select
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          required
        >
          <option value="">{t('realestate.form.selectType')}</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.icon ? `${cat.icon} ` : ''}{cat.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.form.title')} *</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          placeholder={t('realestate.form.titlePlaceholder')}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.description')} *</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
          required
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.form.price')}</label>
          <input type="text" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="15 000 000 ₸" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.rooms')}</label>
          <input type="text" value={form.rooms} onChange={(e) => setForm({ ...form, rooms: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.area')} ({t('realestate.sqm')})</label>
          <input type="text" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="55" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.form.floor')}</label>
          <input type="text" value={form.floor_info} onChange={(e) => setForm({ ...form, floor_info: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="3/9" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.district')}</label>
          <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder={t('realestate.form.addressPlaceholder')} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.form.phone')} *</label>
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.whatsapp')}</label>
          <input type="tel" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Telegram</label>
          <input type="text" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" placeholder="@username" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.form.author')}</label>
        <input type="text" value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{t('realestate.gallery')}</label>
        <MultiImageUpload value={galleryKeys} onChange={setGalleryKeys} folder="real-estate" maxImages={10} />
      </div>
    </>
  );
}

function ReListingCard({
  item,
  categories,
  favorites,
  onToggleFavorite,
  t,
}: {
  item: RealEstateListing;
  categories: ReCategory[];
  favorites: number[];
  onToggleFavorite: (e: React.MouseEvent, id: number) => void;
  t: (key: string) => string;
}) {
  const isFav = favorites.includes(item.id);
  const fallbackSrc = RE_FALLBACK_IMAGES[item.id % RE_FALLBACK_IMAGES.length];
  const imgKey = getRealEstateCover(item) || '';
  const hasStorageImg = Boolean(imgKey);
  const deal = dealTypeForReType(item.re_type);
  const promoted = isRealEstatePromoted(item);
  const typeLabel = resolveReTypeLabel(item, categories);

  return (
    <Link
      to={`/real-estate/${item.id}`}
      className={`bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group block ${promoted ? 'ring-2 ring-amber-300/80' : ''}`}
    >
      <div className="h-52 bg-gray-100 relative overflow-hidden">
        {hasStorageImg ? (
          <StorageImg objectKey={imgKey} alt={item.title || ''} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        ) : (
          <img src={fallbackSrc} alt={item.title || ''} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {promoted ? (
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg bg-amber-400 text-amber-950 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> TOP
            </span>
          ) : null}
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg ${
            deal === 'sell' ? 'bg-emerald-500 text-white' : deal === 'rent' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {typeLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => onToggleFavorite(e, item.id)}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isFav ? 'bg-red-500 text-white scale-110' : 'bg-white/90 backdrop-blur-sm text-gray-400 hover:text-red-500 hover:bg-white'
          }`}
        >
          <svg className="w-4.5 h-4.5" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </button>
        {item.gallery_images ? (
          <span className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
            📷 {item.gallery_images.split(',').filter((k) => k.trim()).length}
          </span>
        ) : null}
        {item.price ? (
          <div className="absolute bottom-3 left-3">
            <span className="bg-white/95 backdrop-blur-sm text-gray-900 font-extrabold text-base px-3 py-1.5 rounded-xl shadow-lg">{item.price}</span>
          </div>
        ) : null}
      </div>
      <div className="p-4">
        <h3 className="font-bold text-gray-900 text-[15px] leading-tight line-clamp-1 group-hover:text-emerald-700 transition-colors">{item.title}</h3>
        {item.address ? (
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{item.address}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {item.rooms ? <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-lg">{item.rooms} {t('realestate.form.roomsShort')}</span> : null}
          {item.area ? <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-lg">{item.area} {t('realestate.sqm')}</span> : null}
          {item.floor_info ? <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-lg">{item.floor_info}</span> : null}
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <span className="flex items-center gap-1 text-xs text-gray-400"><Eye className="w-3.5 h-3.5" /> {item.views_count || 0}</span>
          <span className="text-[10px] text-gray-300 ml-auto">{timeAgo(item.created_at || '')}</span>
        </div>
      </div>
    </Link>
  );
}

export function RealEstateList() {
  const { t } = useLanguage();
  const [items, setItems] = useState<RealEstateListing[]>([]);
  const [categories, setCategories] = useState<ReCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [dealFilter, setDealFilter] = useState('');
  const [roomFilter, setRoomFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priceFrom, setPriceFrom] = useState('');
  const [priceTo, setPriceTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<RealEstateSort>('new');
  const [favorites, setFavorites] = useState<number[]>(() => loadReFavorites());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    fetchRealEstateCategories().then(setCategories).catch(() => setCategories([]));
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetchWithCache(
        'real_estate_list_v2',
        () => withRetry(() => client.entities.real_estate.query({ sort: '-created_at', limit: 200 })),
        5 * 60 * 1000,
      );
      setItems(filterPublicRealEstate(res.data?.items || []));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleToggleFavorite(e: React.MouseEvent, id: number) {
    e.preventDefault();
    e.stopPropagation();
    setFavorites(toggleReFavorite(id));
  }

  const quickFilters = useMemo(() => [
    { key: '', label: t('common.all'), icon: '🏠' },
    { key: 'sell_apartment', label: t('realestate.apartment'), icon: '🏢' },
    { key: 'sell_house', label: t('realestate.house'), icon: '🏡' },
    { key: 'rent_apartment', label: t('realestate.rent'), icon: '🔑' },
    { key: 'commercial', label: t('realestate.commercial'), icon: '🏪' },
  ], [t]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (typeFilter && item.re_type !== typeFilter) return false;
      if (dealFilter === 'sell' && !item.re_type?.startsWith('sell')) return false;
      if (dealFilter === 'rent' && !item.re_type?.startsWith('rent')) return false;
      if (dealFilter === 'need' && !item.re_type?.startsWith('need')) return false;
      if (roomFilter) {
        if (roomFilter === '4+') {
          if (parseInt(item.rooms || '0', 10) < 4) return false;
        } else if (item.rooms !== roomFilter) return false;
      }
      if (priceFrom) {
        const p = parseInt((item.price || '').replace(/\D/g, ''), 10);
        if (!p || p < parseInt(priceFrom, 10)) return false;
      }
      if (priceTo) {
        const p = parseInt((item.price || '').replace(/\D/g, ''), 10);
        if (!p || p > parseInt(priceTo, 10)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (
          !(item.title || '').toLowerCase().includes(q)
          && !(item.address || '').toLowerCase().includes(q)
          && !(item.description || '').toLowerCase().includes(q)
        ) return false;
      }
      if (showFavoritesOnly && !favorites.includes(item.id)) return false;
      return true;
    });
    return sortRealEstateListings(filtered, sortBy);
  }, [items, typeFilter, dealFilter, roomFilter, priceFrom, priceTo, searchQuery, showFavoritesOnly, favorites, sortBy]);

  const activeFilterCount = [typeFilter, dealFilter, roomFilter, priceFrom, priceTo].filter(Boolean).length;

  return (
    <Layout>
      <div className="bg-[#f8f9fa] min-h-screen">
        <section className="relative overflow-hidden">
          <div className="absolute inset-0">
            <img src={RE_HERO_IMG} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/80 via-emerald-800/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-20">
            <div className="max-w-xl">
              <span className="bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full">🏠 {t('realestate.title')}</span>
              <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mt-3">{t('realestate.heroTitle')}</h1>
              <p className="text-white/70 text-base md:text-lg mt-3">{t('realestate.heroSubtitle')}</p>
              <Link to="/cabinet?tab=realEstate" className="inline-flex items-center gap-2 mt-5 text-sm font-medium text-emerald-100 hover:text-white transition-colors">
                {t('realestate.myListings')} →
              </Link>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 -mt-7 relative z-10">
          <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 p-4 md:p-5">
            <div className="flex gap-3 items-center flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('realestate.searchPlaceholder')}
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 rounded-xl border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as RealEstateSort)}
                className="px-4 py-3 bg-gray-50 rounded-xl border-0 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                <option value="new">{t('realestate.sort.new')}</option>
                <option value="price_asc">{t('realestate.sort.priceAsc')}</option>
                <option value="price_desc">{t('realestate.sort.priceDesc')}</option>
              </select>
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  showFilters || activeFilterCount > 0 ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-200' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border-2 border-transparent'
                }`}
              >
                {t('realestate.filters')}
                {activeFilterCount > 0 ? <span className="w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{activeFilterCount}</span> : null}
              </button>
              <Link to="/real-estate/new" className="hidden sm:flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all shadow-md shadow-emerald-200/50">
                <Home className="w-4 h-4" /> {t('realestate.publish')}
              </Link>
            </div>
            {showFilters ? (
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{t('realestate.dealType')}</label>
                  <select value={dealFilter} onChange={(e) => setDealFilter(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm">
                    <option value="">{t('common.all')}</option>
                    <option value="sell">{t('realestate.sell')}</option>
                    <option value="rent">{t('realestate.rent')}</option>
                    <option value="need">{t('realestate.need')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{t('realestate.rooms')}</label>
                  <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm">
                    <option value="">{t('realestate.any')}</option>
                    {['1', '2', '3', '4+'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{t('realestate.priceFrom')}</label>
                  <input type="number" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm" />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1 block">{t('realestate.priceTo')}</label>
                  <input type="number" value={priceTo} onChange={(e) => setPriceTo(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 rounded-xl border-0 text-sm" />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pt-6 pb-24">
          <div className="flex gap-2.5 overflow-x-auto pb-4 mb-2 scrollbar-hide -mx-4 px-4">
            {quickFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setTypeFilter(f.key === typeFilter ? '' : f.key)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                  typeFilter === f.key ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200/40 scale-105' : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
                }`}
              >
                {f.icon} {f.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                showFavoritesOnly ? 'bg-red-500 text-white shadow-lg shadow-red-200/40' : 'bg-white text-gray-600 hover:bg-gray-50 shadow-sm'
              }`}
            >
              ❤️ {t('realestate.favorites')} {favorites.length > 0 ? `(${favorites.length})` : ''}
            </button>
          </div>

          <Link to="/real-estate/new" className="sm:hidden flex items-center justify-center gap-2 bg-emerald-600 text-white w-full py-3 rounded-xl text-sm font-semibold mb-5">
            <Home className="w-4 h-4" /> {t('realestate.publish')}
          </Link>

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900">{showFavoritesOnly ? t('realestate.favorites') : t('realestate.allListings')}</h2>
            <span className="text-sm text-gray-400">{filteredItems.length} {t('realestate.listingsCount')}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">{t('common.loading')}</div>
          ) : filteredItems.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredItems.map((item) => (
                <ReListingCard key={item.id} item={item} categories={categories} favorites={favorites} onToggleFavorite={handleToggleFavorite} t={t} />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
              <Home className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">{t('realestate.noResults')}</p>
              <Link to="/real-estate/new" className="mt-4 inline-block text-emerald-600 font-semibold text-sm">{t('realestate.publishFirst')}</Link>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export function RealEstateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [item, setItem] = useState<RealEstateListing | null>(null);
  const [categories, setCategories] = useState<ReCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [isFav, setIsFav] = useState(false);

  useEffect(() => {
    fetchRealEstateCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithCache(
          `real_estate_detail_v2_${id}`,
          () => withRetry(() => client.entities.real_estate.get({ id: id! })),
          2 * 60 * 1000,
        );
        setItem(res.data);
        setIsFav(loadReFavorites().includes(res.data?.id));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function toggleFav() {
    if (!item) return;
    const next = toggleReFavorite(item.id);
    setIsFav(next.includes(item.id));
  }

  function shareListing() {
    if (!item) return;
    const url = window.location.href;
    if (navigator.share) {
      void navigator.share({ title: item.title || t('realestate.title'), url });
    } else {
      void navigator.clipboard.writeText(url);
      toast.success(t('realestate.linkCopied'));
    }
  }

  function getGalleryKeys(): string[] {
    if (!item) return [];
    const keys: string[] = [];
    if (item.image_url) keys.push(item.image_url);
    if (item.gallery_images) {
      item.gallery_images.split(',').forEach((k) => {
        const trimmed = k.trim();
        if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
      });
    }
    return keys;
  }

  if (loading) {
    return <Layout><div className="flex items-center justify-center min-h-[60vh] text-gray-500">{t('common.loading')}</div></Layout>;
  }

  if (!item) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <p className="text-gray-500">{t('realestate.notFound')}</p>
          <Link to="/real-estate" className="text-emerald-600 font-medium text-sm mt-3 inline-block">← {t('realestate.backToList')}</Link>
        </div>
      </Layout>
    );
  }

  const galleryKeys = getGalleryKeys();
  const deal = dealTypeForReType(item.re_type);
  const fallbackSrc = RE_FALLBACK_IMAGES[(item.id || 0) % RE_FALLBACK_IMAGES.length];
  const typeLabel = resolveReTypeLabel(item, categories);

  return (
    <Layout>
      <div className="bg-[#f8f9fa] min-h-screen pb-28">
        <div className="max-w-4xl mx-auto px-4 pt-4 pb-2 flex items-center justify-between">
          <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium">
            <ChevronLeft className="w-4 h-4" /> {t('common.back')}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={shareListing} className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center text-gray-500 hover:text-emerald-600"><Share2 className="w-4 h-4" /></button>
            <button type="button" onClick={toggleFav} className={`w-9 h-9 rounded-full shadow-sm flex items-center justify-center ${isFav ? 'bg-red-500 text-white' : 'bg-white text-gray-400'}`}>
              <svg className="w-4 h-4" fill={isFav ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </button>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-4 mb-6">
          <div className="relative rounded-2xl overflow-hidden bg-gray-100 shadow-lg">
            <div className="aspect-[16/9]">
              {galleryKeys.length > 0 ? (
                <StorageImage objectKey={galleryKeys[activePhotoIdx] || galleryKeys[0]} alt={item.title || ''} className="w-full h-full object-cover" />
              ) : (
                <img src={fallbackSrc} alt={item.title || ''} className="w-full h-full object-cover" />
              )}
            </div>
            {galleryKeys.length > 1 ? (
              <>
                <button type="button" onClick={() => setActivePhotoIdx((i) => (i - 1 + galleryKeys.length) % galleryKeys.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
                <button type="button" onClick={() => setActivePhotoIdx((i) => (i + 1) % galleryKeys.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/80 rounded-full flex items-center justify-center"><ChevronLeft className="w-5 h-5 rotate-180" /></button>
              </>
            ) : null}
            <div className="absolute bottom-4 left-4 flex gap-2">
              <span className={`text-xs font-bold px-3 py-1.5 rounded-full shadow-lg ${deal === 'sell' ? 'bg-emerald-500 text-white' : deal === 'rent' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'}`}>{typeLabel}</span>
              <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-black/50 text-white flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {item.views_count || 0}</span>
            </div>
          </div>
          {galleryKeys.length > 1 ? (
            <div className="flex gap-2 mt-3 overflow-x-auto">
              {galleryKeys.map((key, idx) => (
                <button key={idx} type="button" onClick={() => setActivePhotoIdx(idx)} className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden ${idx === activePhotoIdx ? 'ring-2 ring-emerald-500' : 'opacity-60'}`}>
                  <StorageImg objectKey={key} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="max-w-4xl mx-auto px-4 space-y-5">
          <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
            {item.price ? <p className="text-2xl md:text-3xl font-extrabold text-emerald-600 mb-2">{item.price}</p> : null}
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">{item.title}</h1>
            {item.address ? (
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500"><MapPin className="w-4 h-4" /><span>{item.address}</span></div>
            ) : null}
            <p className="text-xs text-gray-400 mt-2">{item.created_at ? formatDate(item.created_at) : ''}</p>
          </div>

          {(item.rooms || item.area || item.floor_info) ? (
            <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
              <h2 className="font-bold text-gray-900 mb-4">{t('realestate.characteristics')}</h2>
              <div className="grid grid-cols-3 gap-4">
                {item.rooms ? <div className="text-center bg-gray-50 rounded-xl p-4"><p className="text-lg font-bold">{item.rooms}</p><p className="text-xs text-gray-400">{t('realestate.rooms')}</p></div> : null}
                {item.area ? <div className="text-center bg-gray-50 rounded-xl p-4"><p className="text-lg font-bold">{item.area} {t('realestate.sqm')}</p><p className="text-xs text-gray-400">{t('realestate.area')}</p></div> : null}
                {item.floor_info ? <div className="text-center bg-gray-50 rounded-xl p-4"><p className="text-lg font-bold">{item.floor_info}</p><p className="text-xs text-gray-400">{t('realestate.form.floor')}</p></div> : null}
              </div>
            </div>
          ) : null}

          <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
            <h2 className="font-bold text-gray-900 mb-3">{t('realestate.description')}</h2>
            {(item.description || t('realestate.noDescription')).split('\n').map((p, i) => (
              <p key={i} className="text-gray-600 leading-relaxed mb-3 text-sm">{p}</p>
            ))}
          </div>

          {item.author_name ? (
            <div className="bg-white rounded-2xl shadow-sm p-5 md:p-6">
              <h2 className="font-bold text-gray-900 mb-3">{t('realestate.contactPerson')}</h2>
              <p className="font-semibold">{item.author_name}</p>
            </div>
          ) : null}

          <SafetyAlert variant="announcement_detail" />
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-gray-200 z-40 safe-area-bottom">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            {item.price ? <div className="hidden sm:block mr-auto"><p className="text-lg font-extrabold text-emerald-600">{item.price}</p></div> : null}
            <a href={`tel:${item.phone}`} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl text-sm font-bold"><Phone className="w-4 h-4" /> {t('realestate.call')}</a>
            {item.whatsapp ? (
              <a href={`https://wa.me/${item.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl text-sm font-bold"><MessageCircle className="w-4 h-4" /> {t('realestate.whatsapp')}</a>
            ) : null}
            {item.telegram ? (
              <a href={`https://t.me/${item.telegram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 bg-blue-500 text-white px-5 py-3 rounded-xl text-sm font-bold"><Send className="w-4 h-4" /> Telegram</a>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export function NewRealEstateForm() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [categories, setCategories] = useState<ReCategory[]>([]);
  const [form, setForm] = useState<ReFormState>({
    category_id: '', title: '', description: '', price: '', rooms: '', area: '',
    floor_info: '', address: '', phone: '', whatsapp: '', telegram: '', author_name: '',
  });
  const [galleryKeys, setGalleryKeys] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchRealEstateCategories().then(setCategories).catch(() => setCategories([]));
    const prefill = getAccountPrefill();
    if (prefill.name || prefill.phone) {
      setForm((f) => ({ ...f, author_name: f.author_name || prefill.name, phone: f.phone || prefill.phone }));
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireAuthDialog(navigate)) return;
    if (!form.category_id || !form.title || !form.description || !form.phone) return;
    if (submitted) return;
    setSubmitting(true);
    setSubmitted(true);
    try {
      const accountUser = getCurrentUser();
      const categoryId = Number(form.category_id);
      const cat = categories.find((c) => c.id === categoryId);
      const re_type = reTypeForCategory(cat, categoryId);
      const firstImage = galleryKeys.split(',').map((k) => k.trim()).find(Boolean) || null;
      await withRetry(() => client.entities.real_estate.create({
        data: {
          ...form,
          category_id: Number.isFinite(categoryId) ? categoryId : undefined,
          re_type,
          user_id: accountUser?.id,
          active: true,
          status: 'pending',
          gallery_images: galleryKeys,
          image_url: firstImage,
          expires_at: defaultReExpiresAtIso(30),
          created_at: new Date().toISOString(),
        },
      }));
      setSuccess(true);
    } catch (err) {
      console.error(err);
      toast.error(t('realestate.form.error'));
      setSubmitted(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"><Clock className="w-8 h-8 text-emerald-600" /></div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('realestate.form.successTitle')}</h2>
          <p className="text-gray-500 mb-6">{t('realestate.form.successDesc')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/cabinet?tab=realEstate" className="text-emerald-600 font-medium">{t('realestate.myListings')}</Link>
            <Link to="/real-estate" className="text-emerald-600 font-medium">{t('realestate.backToList')}</Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link to="/real-estate" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> {t('common.back')}</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('realestate.form.createTitle')}</h1>
        <p className="text-gray-500 mb-6">{t('realestate.form.createDesc')}</p>
        <SafetyAlert variant="real_estate_form" />
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4 mt-4">
          <ReFormFields form={form} setForm={setForm} galleryKeys={galleryKeys} setGalleryKeys={setGalleryKeys} categories={categories} t={t} />
          <button type="submit" disabled={submitting || submitted} className="w-full bg-emerald-600 text-white font-medium py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('realestate.form.submitting')}</span> : t('realestate.publish')}
          </button>
        </form>
      </div>
    </Layout>
  );
}

export function EditRealEstateForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [categories, setCategories] = useState<ReCategory[]>([]);
  const [form, setForm] = useState<ReFormState>({
    category_id: '', title: '', description: '', price: '', rooms: '', area: '',
    floor_info: '', address: '', phone: '', whatsapp: '', telegram: '', author_name: '',
  });
  const [galleryKeys, setGalleryKeys] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    fetchRealEstateCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    accountApi.getMyRealEstate(Number(id))
      .then((data) => {
        setForm({
          category_id: data.category_id ? String(data.category_id) : '',
          title: data.title || '',
          description: data.description || '',
          price: data.price || '',
          rooms: data.rooms || '',
          area: data.area || '',
          floor_info: data.floor_info || '',
          address: data.address || '',
          phone: data.phone || '',
          whatsapp: data.whatsapp || '',
          telegram: data.telegram || '',
          author_name: data.author_name || '',
        });
        setGalleryKeys(data.gallery_images || '');
        setStatus(data.status || '');
        setExpiresAt(data.expires_at || '');
      })
      .catch((err) => {
        console.error(err);
        toast.error(t('realestate.form.loadError'));
        navigate('/cabinet?tab=realEstate');
      })
      .finally(() => setLoading(false));
  }, [id, navigate, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !form.category_id || !form.title || !form.description || !form.phone) return;
    setSubmitting(true);
    try {
      const categoryId = Number(form.category_id);
      const cat = categories.find((c) => c.id === categoryId);
      await accountApi.updateMyRealEstate(Number(id), {
        ...form,
        category_id: Number.isFinite(categoryId) ? categoryId : undefined,
        re_type: reTypeForCategory(cat, categoryId),
        gallery_images: galleryKeys,
      });
      toast.success(t('realestate.form.saved'));
      navigate('/cabinet?tab=realEstate');
    } catch (err) {
      console.error(err);
      toast.error(t('realestate.form.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <Layout><div className="max-w-lg mx-auto px-4 py-12 text-center text-gray-400">{t('common.loading')}</div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-4 py-8">
        <Link to="/cabinet?tab=realEstate" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> {t('realestate.myListings')}</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('realestate.form.editTitle')}</h1>
        {status ? (
          <p className="text-sm text-gray-500 mb-2">
            {t('realestate.form.status')}: <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[status]?.color || 'bg-gray-100 text-gray-800'}`}>{STATUS_LABELS[status]?.label || status}</span>
          </p>
        ) : null}
        {expiresAt ? <p className="text-sm text-gray-500 mb-4">{t('realestate.form.activeUntil')} {formatExpiryLabel(expiresAt)}</p> : null}
        <SafetyAlert variant="real_estate_form" />
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4 mt-4">
          <ReFormFields form={form} setForm={setForm} galleryKeys={galleryKeys} setGalleryKeys={setGalleryKeys} categories={categories} t={t} />
          <button type="submit" disabled={submitting} className="w-full bg-emerald-600 text-white font-medium py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('realestate.form.saving')}</span> : t('realestate.form.save')}
          </button>
        </form>
      </div>
    </Layout>
  );
}
