import '@/styles/realEstate.css';
import { getStatusLabel, getPublicCategoryLabel } from '@/lib/api';
import { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import { client, withRetry, STATUS_LABELS, timeAgo, formatDate } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import {
  ChevronLeft, MapPin, Phone, MessageCircle, Clock, Send, Loader2, Home,
  Search, Eye, Share2, Sparkles, Heart, Plus, SlidersHorizontal, ArrowUpRight, Building2, ImageOff, X,
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
  defaultReExpiresAtIso,
  fetchRealEstateCategories,
  filterPublicRealEstate,
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
import { usePageSeo } from '@/hooks/usePageSeo';

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
  seller_type: string;
  agency_name: string;
  commission: string;
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
  function field(key: keyof ReFormState, label: string, options: { required?: boolean; placeholder?: string; type?: string; maxLength?: number } = {}) {
    return <label className="estate-field" htmlFor={`estate-${key}`}>
      <span>{label}{options.required && ' *'}</span>
      <input id={`estate-${key}`} type={options.type || 'text'} required={options.required}
        placeholder={options.placeholder} maxLength={options.maxLength}
        value={form[key]} onChange={e => setForm(previous => ({ ...previous, [key]: e.target.value }))} />
    </label>;
  }
  return <div className="estate-form-sections">
    <section className="estate-form-section">
      <header><span className="estate-step">01</span><div><h2>{t('realestate.design.object')}</h2><p>{t('realestate.design.objectHint')}</p></div></header>
      <label className="estate-field" htmlFor="estate-category"><span>{t('realestate.form.type')} *</span>
        <select id="estate-category" required value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
          <option value="">{t('realestate.form.selectType')}</option>
          {categories.map(cat => <option key={cat.id} value={cat.id}>{getPublicCategoryLabel(cat.name, t)}</option>)}
        </select>
      </label>
      {field('title', t('realestate.form.title'), { required: true, maxLength: 200, placeholder: t('realestate.form.titlePlaceholder') })}
      {field('address', t('realestate.district'), { placeholder: t('realestate.form.addressPlaceholder') })}
      <div className="estate-fields-grid">
        {field('price', t('realestate.form.price'), { placeholder: '15 000 000 ₸' })}
        {field('rooms', t('realestate.rooms'), { placeholder: '2' })}
        {field('area', `${t('realestate.area')} (${t('realestate.sqm')})`, { placeholder: '55' })}
        {field('floor_info', t('realestate.form.floor'), { placeholder: '3/9' })}
      </div>
      <label className="estate-field" htmlFor="estate-description"><span>{t('realestate.description')} *</span>
        <textarea id="estate-description" required maxLength={10000} rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
      </label>
    </section>
    <section className="estate-form-section">
      <header><span className="estate-step">02</span><div><h2>{t('realestate.gallery')}</h2><p>{t('realestate.design.photosHint')}</p></div></header>
      <MultiImageUpload value={galleryKeys} onChange={setGalleryKeys} folder="real-estate" maxImages={10} />
    </section>
    <section className="estate-form-section">
      <header><span className="estate-step">03</span><div><h2>{t('realestate.design.contacts')}</h2><p>{t('realestate.design.contactsHint')}</p></div></header>
      <fieldset className="estate-seller-choice"><legend>{t('realestate.seller.label')} *</legend>
        {(['owner', 'realtor'] as const).map(role => <label key={role} className={form.seller_type === role ? 'is-selected' : ''}>
          <input type="radio" name="seller_type" required value={role} checked={form.seller_type === role}
            onChange={() => setForm({ ...form, seller_type: role, agency_name: '', commission: '' })} />
          {role === 'owner' ? <Home size={19} /> : <Building2 size={19} />}{t(`realestate.seller.${role}`)}
        </label>)}
      </fieldset>
      {form.seller_type === 'realtor' && <div className="estate-fields-grid">
        {field('agency_name', t('realestate.seller.agency'), { maxLength: 120 })}
        {field('commission', t('realestate.seller.commission'), { maxLength: 120 })}
      </div>}
      <div className="estate-fields-grid">
        {field('author_name', t('realestate.form.author'))}
        {field('phone', t('realestate.form.phone'), { required: true, type: 'tel', placeholder: '+7…' })}
        {field('whatsapp', t('realestate.whatsapp'), { type: 'tel', placeholder: '+7…' })}
        {field('telegram', 'Telegram', { placeholder: '@username' })}
      </div>
    </section>
  </div>;
}

function EstatePhotoPlaceholder({ t }: { t: (key: string) => string }) {
  return <div className="estate-photo-placeholder"><ImageOff size={32} strokeWidth={1.3} /><span>{t('realestate.design.noPhoto')}</span></div>;
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
  const imgKey = getRealEstateCover(item) || '';
  const promoted = isRealEstatePromoted(item);
  const typeLabel = getPublicCategoryLabel(resolveReTypeLabel(item, categories), t);
  return <article className={`estate-card ${promoted ? 'estate-card-promoted' : ''}`}>
    <Link to={`/real-estate/${item.id}`} className="estate-card-photo" aria-label={item.title || t('realestate.title')}>
      {imgKey ? <StorageImg objectKey={imgKey} alt={item.title || ''} className="w-full h-full object-cover" /> : <EstatePhotoPlaceholder t={t} />}
      <span className="estate-photo-badge">{promoted && <Sparkles size={13} />}{typeLabel}</span>
    </Link>
    <button type="button" onClick={e => onToggleFavorite(e, item.id)} aria-label={t('realestate.favorites')} aria-pressed={isFav}
      className={`estate-heart ${isFav ? 'is-selected' : ''}`}><Heart size={20} fill={isFav ? 'currentColor' : 'none'} /></button>
    <div className="estate-card-body">
      <p className="estate-price">{item.price || t('realestate.design.priceUnknown')}</p>
      <Link to={`/real-estate/${item.id}`} className="estate-card-title">{item.title}</Link>
      {item.address && <p className="estate-address"><MapPin size={15} /><span>{item.address}</span></p>}
      <div className="estate-specs">
        {item.rooms && <span>{item.rooms} {t('realestate.form.roomsShort')}</span>}
        {item.area && <span>{item.area} {t('realestate.sqm')}</span>}
        {item.floor_info && <span>{t('realestate.form.floor')} {item.floor_info}</span>}
      </div>
      <footer><span>{item.seller_type ? t(`realestate.seller.${item.seller_type}`) : t('realestate.contactPerson')}</span><span>{timeAgo(item.created_at || '')}</span></footer>
    </div>
  </article>;
}

export function RealEstateList() {
  const { t } = useLanguage();
  const [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
    try {
      const res = await fetchWithCache(
        'real_estate_list_v2',
        () => withRetry(() => client.entities.real_estate.query({ sort: '-created_at', limit: 200 })),
        5 * 60 * 1000,
      );
      setItems(filterPublicRealEstate(res.data?.items || []));
    } catch (e) {
      setLoadError(true);
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

  const quickFilters = [
    { key: '', label: t('common.all') },
    { key: 'apartment', label: t('realestate.apartment') },
    { key: 'house', label: t('realestate.house') },
    { key: 'commercial', label: t('realestate.commercial') },
  ];

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (typeFilter && !(item.re_type || '').includes(typeFilter)) return false;
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
  const hasFilters = activeFilterCount > 0 || !!searchQuery || showFavoritesOnly;
  const invalidPrice = !!priceFrom && !!priceTo && Number(priceFrom) > Number(priceTo);
  function resetFilters() {
    setTypeFilter(''); setDealFilter(''); setRoomFilter(''); setPriceFrom(''); setPriceTo(''); setSearchQuery(''); setShowFavoritesOnly(false);
  }

  return <Layout><div className="estate-surface">
    <div className="estate-shell">
      <header className="estate-hero">
        <div><p className="estate-eyebrow"><MapPin size={14} />{t('realestate.design.eyebrow')}</p>
          <h1>{t('realestate.design.headline')}</h1><p className="estate-intro">{t('realestate.design.intro')}</p>
        </div>
        <div className="estate-hero-actions"><Link to="/real-estate/new" className="estate-button estate-button-primary"><Plus size={18} />{t('realestate.design.publish')}</Link>
          <Link to="/cabinet?tab=realEstate" className="estate-text-link">{t('realestate.myListings')}<ArrowUpRight size={16} /></Link>
        </div>
      </header>
      <section className="estate-search-panel" aria-label={t('realestate.filters')}>
        <div className="estate-deal-tabs" role="group" aria-label={t('realestate.dealType')}>
          {[['',t('common.all')],['sell',t('realestate.sell')],['rent',t('realestate.rent')],['need',t('realestate.need')]].map(([value,label]) =>
            <button key={value} type="button" aria-pressed={dealFilter === value} className={dealFilter === value ? 'is-selected' : ''} onClick={() => setDealFilter(value)}>{label}</button>)}
        </div>
        <div className="estate-search-row">
          <label className="estate-search"><Search size={20} /><input aria-label={t('realestate.searchPlaceholder')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('realestate.searchPlaceholder')} />
            {searchQuery && <button type="button" aria-label={t('realestate.design.reset')} onClick={() => setSearchQuery('')}><X size={18} /></button>}
          </label>
          <button type="button" className="estate-button estate-button-secondary" aria-expanded={showFilters} aria-controls="estate-filters" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal size={18} />{t('realestate.filters')}{activeFilterCount > 0 && <span className="estate-count">{activeFilterCount}</span>}
          </button>
        </div>
        {showFilters && <div id="estate-filters" className="estate-filter-grid">
          <label className="estate-field"><span>{t('realestate.rooms')}</span><select value={roomFilter} onChange={e => setRoomFilter(e.target.value)}><option value="">{t('realestate.any')}</option>{['1','2','3','4+'].map(r => <option key={r}>{r}</option>)}</select></label>
          <label className="estate-field"><span>{t('realestate.priceFrom')}</span><input type="number" min="0" inputMode="numeric" value={priceFrom} onChange={e => setPriceFrom(e.target.value)} /></label>
          <label className="estate-field"><span>{t('realestate.priceTo')}</span><input type="number" min="0" inputMode="numeric" aria-invalid={invalidPrice} value={priceTo} onChange={e => setPriceTo(e.target.value)} /></label>
          {invalidPrice && <p role="alert" className="estate-filter-error">{t('realestate.design.priceError')}</p>}
        </div>}
        <div className="estate-type-row"><div className="estate-chips">
          {quickFilters.map(f => <button key={f.key} type="button" aria-pressed={typeFilter === f.key} className={typeFilter === f.key ? 'is-selected' : ''} onClick={() => setTypeFilter(f.key)}>{f.label}</button>)}
        </div><button className={`estate-favorite-filter ${showFavoritesOnly ? 'is-selected' : ''}`} type="button" aria-pressed={showFavoritesOnly} onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}><Heart size={17} />{t('realestate.favorites')}{favorites.length > 0 && ` · ${favorites.length}`}</button></div>
      </section>
      <div className="estate-results-bar"><div><h2>{showFavoritesOnly ? t('realestate.favorites') : t('realestate.allListings')}<span>{loading ? '…' : filteredItems.length}</span></h2>
        {hasFilters && <button type="button" className="estate-text-link" onClick={resetFilters}><X size={14} />{t('realestate.design.reset')}</button>}
      </div><select aria-label={t('realestate.sort.new')} value={sortBy} onChange={e => setSortBy(e.target.value as RealEstateSort)}><option value="new">{t('realestate.sort.new')}</option><option value="price_asc">{t('realestate.sort.priceAsc')}</option><option value="price_desc">{t('realestate.sort.priceDesc')}</option></select></div>
      {loading ? <div className="estate-grid" aria-busy="true" aria-label={t('common.loading')}>{[1,2,3].map(i => <div key={i} className="estate-skeleton"><div /><span /><span /></div>)}</div>
      : loadError ? <div role="alert" className="estate-empty"><Home size={36} /><h2>{t('realestate.loadError')}</h2><button className="estate-button estate-button-primary" onClick={loadData}>{t('realestate.retry')}</button></div>
      : filteredItems.length ? <div className="estate-grid">{filteredItems.map(item => <ReListingCard key={item.id} item={item} categories={categories} favorites={favorites} onToggleFavorite={handleToggleFavorite} t={t} />)}</div>
      : <div className="estate-empty"><div className="estate-empty-icon">{showFavoritesOnly ? <Heart size={30} /> : <Building2 size={32} />}</div>
          <h2>{hasFilters ? t('realestate.noResults') : t('realestate.design.empty')}</h2>
          <p>{t(showFavoritesOnly ? 'realestate.design.favoritesHint' : hasFilters ? 'realestate.design.filteredHint' : 'realestate.design.emptyHint')}</p>
          {hasFilters ? <button type="button" className="estate-button estate-button-secondary" onClick={resetFilters}>{t('realestate.design.reset')}</button> : <Link className="estate-button estate-button-primary" to="/real-estate/new"><Plus size={18} />{t('realestate.design.publish')}</Link>}
        </div>}
    </div>
  </div></Layout>;
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
  const seoDescription = item
    ? [item.description, item.rooms && `${item.rooms} комн.`, item.area && `${item.area} м²`, item.price, item.address]
        .filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim().slice(0, 160)
    : '';

  usePageSeo({
    title: item?.title,
    description: seoDescription,
    image: item?.image_url,
    structuredData: item ? {
      '@context': 'https://schema.org',
      '@type': 'Residence',
      name: item.title,
      description: seoDescription,
      image: item.image_url || '/icon-512.png',
      address: item.address ? { '@type': 'PostalAddress', streetAddress: item.address, addressLocality: 'Караганда', addressCountry: 'KZ' } : undefined,
    } : null,
  });

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

  async function shareListing() {
    if (!item) return;
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: item.title || t('realestate.title'), url });
      else { await navigator.clipboard.writeText(url); toast.success(t('realestate.linkCopied')); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) toast.error(t('realestate.form.error')); }
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
  const typeLabel = getPublicCategoryLabel(resolveReTypeLabel(item, categories), t);

  return <Layout><div className="estate-surface estate-detail-page"><div className="estate-shell">
    <nav className="estate-detail-nav" aria-label={t('realestate.backToList')}><Link to="/real-estate"><ChevronLeft size={18} />{t('realestate.backToList')}</Link>
      <div><button type="button" className="estate-icon-button" onClick={shareListing} aria-label={t('realestate.design.share')}><Share2 size={19} /></button>
        <button type="button" className="estate-icon-button" onClick={toggleFav} aria-label={t('realestate.favorites')} aria-pressed={isFav}><Heart size={19} fill={isFav ? 'currentColor' : 'none'} /></button></div>
    </nav>
    <header className="estate-detail-heading"><p className="estate-eyebrow">{typeLabel}</p><h1>{item.title}</h1>
      {item.address && <p className="estate-address"><MapPin size={17} />{item.address}</p>}
    </header>
    <div className="estate-detail-grid"><div className="estate-detail-main">
      <section className="estate-gallery" aria-label={t('realestate.gallery')}><div className="estate-gallery-main">
        {galleryKeys.length ? <StorageImage objectKey={galleryKeys[activePhotoIdx] || galleryKeys[0]} alt={item.title || ''} className="w-full h-full object-cover" /> : <EstatePhotoPlaceholder t={t} />}
        {galleryKeys.length > 1 && <>
          <button type="button" className="estate-gallery-prev estate-icon-button" aria-label={t('realestate.design.previous')} onClick={() => setActivePhotoIdx(i => (i - 1 + galleryKeys.length) % galleryKeys.length)}><ChevronLeft size={21} /></button>
          <button type="button" className="estate-gallery-next estate-icon-button" aria-label={t('realestate.design.next')} onClick={() => setActivePhotoIdx(i => (i + 1) % galleryKeys.length)}><ChevronLeft size={21} className="rotate-180" /></button>
          <span className="estate-gallery-count">{activePhotoIdx + 1} / {galleryKeys.length}</span>
        </>}
      </div>{galleryKeys.length > 1 && <div className="estate-thumbnails">{galleryKeys.map((key,idx) => <button type="button" key={key} aria-label={`${t('realestate.design.photo')} ${idx + 1}`} aria-pressed={idx === activePhotoIdx} className={idx === activePhotoIdx ? 'is-selected' : ''} onClick={() => setActivePhotoIdx(idx)}><StorageImg objectKey={key} alt="" className="w-full h-full object-cover" /></button>)}</div>}</section>
      {(item.rooms || item.area || item.floor_info) && <section className="estate-detail-panel"><h2>{t('realestate.characteristics')}</h2><dl className="estate-characteristics">
        {item.rooms && <div><dt>{t('realestate.rooms')}</dt><dd>{item.rooms}</dd></div>}
        {item.area && <div><dt>{t('realestate.area')}</dt><dd>{item.area} {t('realestate.sqm')}</dd></div>}
        {item.floor_info && <div><dt>{t('realestate.form.floor')}</dt><dd>{item.floor_info}</dd></div>}
      </dl></section>}
      <section className="estate-detail-panel"><h2>{t('realestate.description')}</h2><p className="estate-description">{item.description || t('realestate.noDescription')}</p></section>
      <div className="estate-detail-meta"><span>№ {item.id}</span>{item.created_at && <span>{formatDate(item.created_at)}</span>}<span><Eye size={14} />{item.views_count || 0}</span></div>
    </div><aside className="estate-seller-panel"><div className="estate-detail-panel estate-seller-sticky">
      <p className="estate-price">{item.price || t('realestate.design.priceUnknown')}</p><hr />
      <h2>{item.author_name || t('realestate.contactPerson')}</h2>
      {item.seller_type && <p className="estate-seller-role">{t(`realestate.seller.${item.seller_type}`)}</p>}
      {item.agency_name && <p>{item.agency_name}</p>}
      {item.commission && <p className="estate-commission">{t('realestate.seller.commission')}: {item.commission}</p>}
      <div className="estate-seller-buttons">
        {item.phone ? <a className="estate-button estate-button-primary" href={`tel:${item.phone}`}><Phone size={18} />{t('realestate.call')}</a> : <p>{t('realestate.design.contactMissing')}</p>}
        {item.whatsapp && <a className="estate-button estate-button-secondary" href={`https://wa.me/${item.whatsapp.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} />WhatsApp</a>}
        {item.telegram && <a className="estate-text-link" href={`https://t.me/${item.telegram.replace('@','')}`} target="_blank" rel="noopener noreferrer"><Send size={16} />Telegram</a>}
      </div><SafetyAlert variant="announcement_detail" />
    </div></aside></div>
  </div></div></Layout>;
}

export function NewRealEstateForm() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [categories, setCategories] = useState<ReCategory[]>([]);
  const [form, setForm] = useState<ReFormState>({
    category_id: '', title: '', description: '', price: '', rooms: '', area: '',
    floor_info: '', address: '', phone: '', whatsapp: '', telegram: '', author_name: '', seller_type: '', agency_name: '', commission: '',
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
      await client.entities.real_estate.create({
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
      });
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
      <div className="estate-surface estate-form-page">
        <Link to="/real-estate" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> {t('common.back')}</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('realestate.form.createTitle')}</h1>
        <p className="text-gray-500 mb-6">{t('realestate.form.createDesc')}</p>
        <p className="estate-form-help">{t("realestate.design.formHint")}</p><SafetyAlert variant="real_estate_form" />
        <form onSubmit={handleSubmit} className="estate-form">
          <ReFormFields form={form} setForm={setForm} galleryKeys={galleryKeys} setGalleryKeys={setGalleryKeys} categories={categories} t={t} />
          <button type="submit" disabled={submitting || submitted} className="estate-button estate-button-primary estate-submit">
            {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('realestate.form.submitting')}</span> : t('realestate.design.moderation')}
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
    floor_info: '', address: '', phone: '', whatsapp: '', telegram: '', author_name: '', seller_type: '', agency_name: '', commission: '',
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
          seller_type: data.seller_type || '',
          agency_name: data.agency_name || '',
          commission: data.commission || '',
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
      <div className="estate-surface estate-form-page">
        <Link to="/cabinet?tab=realEstate" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"><ChevronLeft className="w-4 h-4" /> {t('realestate.myListings')}</Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('realestate.form.editTitle')}</h1>
        {status ? (
          <p className="text-sm text-gray-500 mb-2">
            {t('realestate.form.status')}: <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[status]?.color || 'bg-gray-100 text-gray-800'}`}>{getStatusLabel(status, t)}</span>
          </p>
        ) : null}
        {expiresAt ? <p className="text-sm text-gray-500 mb-4">{t('realestate.form.activeUntil')} {formatDate(expiresAt || "")}</p> : null}
        <p className="estate-form-help">{t("realestate.design.formHint")}</p><SafetyAlert variant="real_estate_form" />
        <form onSubmit={handleSubmit} className="estate-form">
          <ReFormFields form={form} setForm={setForm} galleryKeys={galleryKeys} setGalleryKeys={setGalleryKeys} categories={categories} t={t} />
          <button type="submit" disabled={submitting} className="estate-button estate-button-primary estate-submit">
            {submitting ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> {t('realestate.form.saving')}</span> : t('realestate.form.save')}
          </button>
        </form>
      </div>
    </Layout>
  );
}
