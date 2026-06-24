import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { resolveImageSrc } from '@/lib/storage';
import { getAccountPrefill } from '@/lib/localAuth';
import { type SavedAddress } from '@/lib/accountApi';
import SavedAddressBar from '@/components/SavedAddressBar';
import StoreProfileTab from '@/components/StoreProfileTab';
import {
  fetchVolnaCatalog,
  getCachedVolnaCatalog,
  fetchVolnaDeliveryQuote,
  createVolnaOrder,
  type VolnaCategory,
  type VolnaProduct,
  type VolnaSettings,
} from '@/lib/volnaApi';
import { parseDeliveryZones, type DeliveryQuote } from '@/lib/gastronomDelivery';
import { GeolocationError, ensureLocationPermission, requestCurrentPosition } from '@/lib/geolocation';
import {
  isLoyaltyEnabled,
  parseLoyaltyGifts,
  resolveLoyaltyGift,
} from '@/lib/gastronomLoyalty';
import DeliveryAddressPicker from '@/components/gastronom/DeliveryAddressPicker';
import GastronomSideMenu from '@/components/gastronom/GastronomSideMenu';
import GastronomPortalBar from '@/components/gastronom/GastronomPortalBar';
import LoyaltyGiftBanner from '@/components/gastronom/LoyaltyGiftBanner';
import CatalogCategoryStrip from '@/components/gastronom/CatalogCategoryStrip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Menu, ShoppingCart, MapPin, Clock, ChevronDown, Plus, Minus, X,
  Home, LayoutGrid, Heart, User, Truck, ShieldCheck, CreditCard, CheckCircle2,
  Wine, Sparkles, Zap, Loader2, AlertCircle, Gift,
} from 'lucide-react';
import { toast } from 'sonner';

const HERO_IMG =
  'https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=900&h=560&fit=crop';
const PROMO_IMG =
  'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&h=320&fit=crop';

interface CartLine {
  product: VolnaProduct;
  qty: number;
}

type Tab = 'home' | 'catalog' | 'cart' | 'favorites' | 'profile';
const TAB_IDS: Tab[] = ['home', 'catalog', 'cart', 'favorites', 'profile'];

function parseTab(raw: string | null): Tab {
  return TAB_IDS.includes(raw as Tab) ? (raw as Tab) : 'home';
}

const NAV_ITEMS: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Витрина' },
  { id: 'catalog', icon: LayoutGrid, label: 'Каталог' },
  { id: 'cart', icon: ShoppingCart, label: 'Корзина' },
  { id: 'favorites', icon: Heart, label: 'Избранное' },
  { id: 'profile', icon: User, label: 'Профиль' },
];

const PRODUCT_GRID =
  'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4 lg:gap-5';
const PAGE_X = 'px-4 sm:px-6 lg:px-8 xl:px-10';
const CATALOG_SIDEBAR =
  'hidden lg:block lg:sticky lg:top-36 lg:self-start space-y-1 rounded-2xl border border-violet-100 bg-white p-3 shadow-sm';

const PAYMENT_LABELS: Record<'cash' | 'kaspi_qr' | 'halyk_qr', string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
};

const CART_KEY = 'volna_cart_qty';
const FAV_KEY = 'volna_favorites';
const AGE_KEY = 'volna_age_21';
const ADDR_KEY = 'volna_delivery_address';

function isAgeConfirmed(): boolean {
  try {
    return localStorage.getItem(AGE_KEY) === '1';
  } catch {
    return false;
  }
}

function imgSrc(url: string) {
  if (!url) return '';
  return resolveImageSrc(url) || url;
}

function loadCartQty(): Record<number, number> {
  try {
    const raw = localStorage.getItem(CART_KEY) ?? localStorage.getItem('volna_cart');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<number, number>;
  } catch { /* ignore */ }
  return {};
}

function loadFavorites(): number[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadSavedAddress(): string {
  try {
    return localStorage.getItem(ADDR_KEY) || '';
  } catch {
    return '';
  }
}

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}

export default function Volna() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<VolnaCategory[]>([]);
  const [products, setProducts] = useState<VolnaProduct[]>([]);
  const [settings, setSettings] = useState<VolnaSettings>({
    default_address: 'ул. Жекибаева 129',
    delivery_time: 'Доставка 30–60 мин',
    min_order: '3000',
    hero_title: 'VOLNA — алкоголь с доставкой по Сортировке',
    store_name: 'VOLNA',
    store_tagline: 'магазин алкогольных напитков · 21+',
  });
  const [cartQty, setCartQty] = useState<Record<number, number>>(loadCartQty);
  const [favorites, setFavorites] = useState<number[]>(loadFavorites);
  const [ageConfirmed, setAgeConfirmed] = useState(isAgeConfirmed);
  const [ageGateOpen, setAgeGateOpen] = useState(!isAgeConfirmed());

  const activeTab = parseTab(searchParams.get('tab'));
  const checkoutOpen = searchParams.get('checkout') === '1';
  const menuOpen = searchParams.get('menu') === '1';
  const productIdFromUrl = Number(searchParams.get('product') || 0);

  const patchSearch = useCallback((patch: (p: URLSearchParams) => void, replace = false) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      patch(next);
      return next;
    }, { replace });
  }, [setSearchParams]);

  const setActiveTab = useCallback((tab: Tab, replace = false) => {
    patchSearch((p) => {
      if (tab === 'home') p.delete('tab');
      else p.set('tab', tab);
      p.delete('checkout');
      p.delete('product');
      p.delete('menu');
    }, replace);
  }, [patchSearch]);

  const selectTabFromMenu = useCallback((tab: Tab) => {
    patchSearch((p) => {
      if (tab === 'home') p.delete('tab');
      else p.set('tab', tab);
      p.delete('checkout');
      p.delete('product');
      p.delete('menu');
    }, true);
  }, [patchSearch]);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [address, setAddress] = useState(loadSavedAddress);
  const [addressEditing, setAddressEditing] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<{
    id: number; name: string; phone: string; address: string;
    payment: string; total: number; storeName: string; giftTitle?: string;
  } | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const [addressFormCollapsed, setAddressFormCollapsed] = useState(false);
  const quoteRequestId = useRef(0);
  const addressPickerRef = useRef<HTMLDivElement>(null);
  const geoPromptStarted = useRef(false);

  const heroImage = settings.hero_image_url || HERO_IMG;
  const promoImage = settings.promo_image_url || PROMO_IMG;

  const selectedProduct = useMemo(
    () => (productIdFromUrl ? products.find((p) => p.id === productIdFromUrl) ?? null : null),
    [productIdFromUrl, products],
  );

  const applyCatalog = useCallback((data: {
    categories: VolnaCategory[];
    products: VolnaProduct[];
    settings: VolnaSettings;
  }) => {
    setCategories(data.categories || []);
    setProducts(data.products || []);
    setSettings((prev) => ({ ...prev, ...(data.settings || {}) }));
    if (data.settings?.default_address) {
      setAddress((a) => a || data.settings.default_address);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    const cached = getCachedVolnaCatalog();
    if (cached) {
      applyCatalog(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchVolnaCatalog(!!cached);
      applyCatalog(data);
    } catch (e) {
      console.error(e);
      if (!cached) toast.error('Не удалось загрузить каталог VOLNA');
    } finally {
      setLoading(false);
    }
  }, [applyCatalog]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(cartQty)); }, [cartQty]);
  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => {
    const prefill = getAccountPrefill();
    if (prefill.name) setName((v) => v || prefill.name);
    if (prefill.phone) setPhone((v) => v || prefill.phone);
  }, []);

  const cart = useMemo(() =>
    Object.entries(cartQty)
      .map(([id, qty]) => {
        if (qty <= 0) return null;
        const product = products.find((p) => p.id === Number(id));
        return product ? { product, qty } : null;
      })
      .filter(Boolean) as CartLine[],
  [cartQty, products]);

  const cartCount = useMemo(() => cart.reduce((a, c) => a + c.qty, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((a, c) => a + c.qty * c.product.price, 0), [cart]);
  const hasDeliveryZones = useMemo(
    () => parseDeliveryZones(settings.delivery_zones).length > 0,
    [settings.delivery_zones],
  );
  const deliveryFee = useMemo(() => {
    if (hasDeliveryZones) return deliveryQuote?.available ? deliveryQuote.delivery_fee : 0;
    return Number(settings.delivery_fee || 0);
  }, [hasDeliveryZones, deliveryQuote, settings.delivery_fee]);
  const orderTotal = subtotal + deliveryFee;
  const minOrder = Number(settings.min_order || 0);
  const loyaltyGifts = useMemo(
    () => (isLoyaltyEnabled(settings) ? parseLoyaltyGifts(settings.loyalty_gifts) : []),
    [settings],
  );
  const loyaltyGift = useMemo(() => resolveLoyaltyGift(subtotal, loyaltyGifts), [subtotal, loyaltyGifts]);
  const effectiveAddress = address.trim() || settings.default_address?.trim() || '';
  const deliveryReady = !hasDeliveryZones || (
    deliveryQuote?.available === true && !deliveryQuote?.location_warning && !deliveryQuoteLoading
  );

  const popularProducts = useMemo(
    () => products.filter((p) => p.is_popular).slice(0, 8),
    [products],
  );

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory) list = list.filter((p) => p.category_id === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  const favoriteProducts = useMemo(
    () => products.filter((p) => favorites.includes(p.id)),
    [products, favorites],
  );

  const runDeliveryQuote = useCallback(async (
    body: { address?: string; lat?: number; lng?: number },
    options?: { notify?: boolean; fillAddress?: boolean },
  ) => {
    const reqId = ++quoteRequestId.current;
    setDeliveryQuoteLoading(true);
    setDeliveryQuoteError(null);
    try {
      const quote = await fetchVolnaDeliveryQuote(body);
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(quote);
      if (options?.fillAddress && quote.display_address) setAddress(quote.display_address);
      if (quote.location_warning) {
        setDeliveryQuoteError(quote.location_warning);
        if (options?.notify) toast.warning(quote.location_warning);
      } else if (!quote.available) {
        const msg = quote.message || 'Доставка по этому адресу недоступна';
        setDeliveryQuoteError(msg);
        if (options?.notify) toast.error(msg);
      }
    } catch (e) {
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(null);
      const msg = e instanceof Error ? e.message : 'Не удалось рассчитать доставку';
      setDeliveryQuoteError(msg);
      if (options?.notify) toast.error(msg);
    } finally {
      if (reqId === quoteRequestId.current) setDeliveryQuoteLoading(false);
    }
  }, []);

  const findByAddress = useCallback((addr?: string) => {
    const target = (addr ?? effectiveAddress).trim();
    if (target.length < 5) {
      toast.info('Введите улицу и номер дома');
      setAddressEditing(true);
      return;
    }
    if (addr) setAddress(addr);
    void runDeliveryQuote({ address: target }, { notify: true });
  }, [effectiveAddress, runDeliveryQuote]);

  const requestGeolocation = useCallback(async () => {
    setDeliveryQuoteLoading(true);
    try {
      const coords = await requestCurrentPosition();
      await runDeliveryQuote({ lat: coords.lat, lng: coords.lng }, { notify: true, fillAddress: true });
    } catch {
      toast.error('Не удалось получить GPS. Введите адрес вручную.');
      setDeliveryQuoteLoading(false);
    }
  }, [runDeliveryQuote]);

  useEffect(() => {
    if (geoPromptStarted.current || !ageConfirmed) return;
    geoPromptStarted.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        if ((await ensureLocationPermission()) === 'granted') await requestGeolocation();
      })();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [ageConfirmed, requestGeolocation]);

  function confirmAge() {
    localStorage.setItem(AGE_KEY, '1');
    setAgeConfirmed(true);
    setAgeGateOpen(false);
  }

  function rejectAge() {
    setAgeGateOpen(false);
    toast.error('VOLNA доступен только лицам старше 21 года');
  }

  function addProduct(product: VolnaProduct) {
    setCartQty((prev) => ({ ...prev, [product.id]: (prev[product.id] || 0) + 1 }));
    toast.success(`${product.name} в корзине`);
  }

  function changeQty(productId: number, delta: number) {
    setCartQty((prev) => {
      const next = { ...prev, [productId]: (prev[productId] || 0) + delta };
      if (next[productId] <= 0) delete next[productId];
      return next;
    });
  }

  function toggleFavorite(productId: number) {
    setFavorites((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    );
  }

  function selectCategory(catId: number | null) {
    setSelectedCategory(catId);
    setActiveTab('catalog');
  }

  async function submitOrder() {
    setSubmitting(true);
    const items = cart.map((c) => ({
      id: c.product.id,
      name: c.product.name,
      weight: c.product.weight,
      qty: c.qty,
      price: c.product.price,
      sum: c.qty * c.product.price,
    }));
    try {
      const created = await createVolnaOrder({
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_address: effectiveAddress,
        payment_method: payment,
        comment: comment.trim(),
        order_items: JSON.stringify(items),
        total_amount: orderTotal,
        delivery_lat: deliveryQuote?.lat,
        delivery_lng: deliveryQuote?.lng,
        delivery_zone_id: deliveryQuote?.zone_id,
        delivery_fee: deliveryFee,
      });
      setCartQty({});
      patchSearch((p) => p.delete('checkout'), true);
      setConfirmedOrder({
        id: created.id,
        name: name.trim(),
        phone: phone.trim(),
        address: effectiveAddress,
        payment: PAYMENT_LABELS[payment],
        total: orderTotal,
        storeName: settings.store_name || 'VOLNA',
        giftTitle: loyaltyGift?.title,
      });
      toast.success('Заказ принят! Мы свяжемся с вами.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось оформить заказ');
    } finally {
      setSubmitting(false);
    }
  }

  function ProductCard({ product }: { product: VolnaProduct }) {
    const inCart = cartQty[product.id] ?? 0;
    const isFav = favorites.includes(product.id);
    return (
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm border border-violet-100/80">
        <button
          type="button"
          onClick={() => patchSearch((p) => { p.set('product', String(product.id)); p.delete('menu'); })}
          className="relative aspect-[4/3] bg-violet-50/50 w-full block text-left"
        >
          <span className="absolute top-2 left-12 z-10 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">21+</span>
          {product.image_url ? (
            <img src={imgSrc(product.image_url)} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full items-center justify-center"><Wine className="h-10 w-10 text-violet-300" /></div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(product.id); }}
            className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
          >
            <Heart className={`h-4 w-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); addProduct(product); }}
            className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-700 active:scale-95 transition-all"
          >
            <Plus className="h-5 w-5" />
          </button>
          {inCart > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-violet-600 px-2 py-0.5 text-xs font-bold text-white">{inCart}</span>
          )}
        </button>
        <div className="p-3 md:p-4">
          <h3 className="font-semibold text-gray-900 text-sm md:text-base leading-tight line-clamp-2">{product.name}</h3>
          {product.weight && <p className="text-xs text-gray-400 mt-0.5">{product.weight}</p>}
          <p className="mt-1.5 font-bold text-violet-700 text-sm md:text-base">{formatMoney(product.price)}</p>
        </div>
      </div>
    );
  }

  /* ─── Age gate — блокирует весь магазин ─── */
  if (!ageConfirmed && ageGateOpen) {
    return (
      <Layout hideHeader hideBottomNav>
        <div className="min-h-screen bg-gradient-to-br from-[#0f0a1a] via-violet-950 to-indigo-950 flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-violet-500/20 border border-violet-400/30 mb-2">
              <Wine className="h-10 w-10 text-violet-300" />
            </div>
            <div>
              <p className="text-5xl font-black tracking-tight text-white mb-1">VOLNA</p>
              <p className="text-violet-300/80 text-sm uppercase tracking-[0.2em]">алкоголь · 21+</p>
            </div>
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 md:p-8 space-y-4">
              <p className="text-4xl font-bold text-amber-400">21+</p>
              <h1 className="text-xl font-bold text-white">Подтвердите возраст</h1>
              <p className="text-sm text-violet-200/70 leading-relaxed">
                Магазин алкогольных напитков VOLNA доступен только совершеннолетним.
                Продолжая, вы подтверждаете, что вам исполнилось 21 год.
              </p>
              <Button className="w-full h-12 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold" onClick={confirmAge}>
                Мне есть 21 год — войти
              </Button>
              <Button variant="outline" className="w-full border-white/20 text-violet-200 hover:bg-white/5 rounded-xl" onClick={rejectAge}>
                Мне нет 21 года
              </Button>
            </div>
            <p className="text-xs text-violet-400/50">Чрезмерное употребление алкоголя вредит вашему здоровью</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!ageConfirmed) {
    return (
      <Layout hideHeader hideBottomNav>
        <div className="min-h-screen bg-violet-950 flex items-center justify-center p-4">
          <Button onClick={() => setAgeGateOpen(true)} className="bg-violet-600">Вернуться к подтверждению возраста</Button>
        </div>
      </Layout>
    );
  }

  if (confirmedOrder) {
    return (
      <Layout hideHeader hideBottomNav>
        <GastronomPortalBar />
        <div className="min-h-screen bg-violet-50/30 px-4 py-8 pb-24">
          <div className="max-w-lg mx-auto space-y-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-violet-500 mx-auto" />
            <h1 className="text-2xl font-bold">Заказ принят!</h1>
            <p className="text-violet-700 font-semibold text-lg">№ {confirmedOrder.id}</p>
            <div className="bg-white rounded-3xl p-6 shadow-sm text-left space-y-2 text-sm">
              <p className="font-bold text-lg">{confirmedOrder.storeName}</p>
              <p>{confirmedOrder.name} · {confirmedOrder.phone}</p>
              <p className="flex gap-2"><MapPin className="h-4 w-4 shrink-0" />{confirmedOrder.address}</p>
              <p className="text-xl font-bold text-violet-700">{formatMoney(confirmedOrder.total)}</p>
            </div>
            <Button className="w-full bg-violet-600 hover:bg-violet-700 h-12 rounded-xl" onClick={() => { setConfirmedOrder(null); setActiveTab('home'); }}>
              Вернуться в VOLNA
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout hideHeader hideBottomNav>
      <GastronomSideMenu
        open={menuOpen}
        onClose={() => patchSearch((p) => p.delete('menu'), true)}
        items={NAV_ITEMS.map(({ id, icon, label }) => ({ id, label, icon, badge: id === 'cart' ? cartCount : undefined }))}
        activeId={activeTab}
        onSelect={(id) => selectTabFromMenu(id as Tab)}
        storeName={settings.store_name}
        storePhone={settings.store_phone}
      />
      <div className="min-h-screen bg-gradient-to-b from-violet-50/40 to-white pb-20 md:pb-8">
        <div className="max-w-7xl mx-auto">
          <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-violet-100 shadow-sm">
            <GastronomPortalBar />
            <div className={`flex items-center justify-between ${PAGE_X} py-3 gap-3`}>
              <button type="button" className="p-2 text-gray-600" onClick={() => patchSearch((p) => p.set('menu', '1'))}>
                <Menu className="h-5 w-5" />
              </button>
              <div className="text-center flex-1 min-w-0">
                <div className="flex items-center justify-center gap-1.5">
                  <Wine className="h-5 w-5 text-violet-600" />
                  <h1 className="text-xl md:text-2xl font-black tracking-wide text-violet-800">{settings.store_name || 'VOLNA'}</h1>
                </div>
                <p className="text-[10px] text-violet-400 uppercase tracking-widest">{settings.store_tagline}</p>
              </div>
              <button type="button" className="relative p-2" onClick={() => setActiveTab('cart')}>
                <ShoppingCart className="h-5 w-5 text-gray-600" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-violet-600 text-[10px] font-bold text-white flex items-center justify-center">{cartCount}</span>
                )}
              </button>
            </div>
            <button
              type="button"
              className={`flex items-center justify-between w-full ${PAGE_X} py-2 bg-violet-50/80 text-sm border-t border-violet-100`}
              onClick={() => setAddressEditing((v) => !v)}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin className="h-4 w-4 text-violet-600 shrink-0" />
                <span className="truncate">{effectiveAddress || 'Укажите адрес доставки'}</span>
              </div>
              <div className="flex items-center gap-1 text-gray-500 shrink-0">
                <Clock className="h-3.5 w-3.5" />
                <span className="text-xs">{settings.delivery_time}</span>
              </div>
            </button>
            {addressEditing && (
              <div className={`${PAGE_X} pb-3 bg-violet-50/80`}>
                <DeliveryAddressPicker
                  variant="compact"
                  address={address}
                  onAddressChange={setAddress}
                  hasDeliveryZones={hasDeliveryZones}
                  deliveryQuote={deliveryQuote}
                  loading={deliveryQuoteLoading}
                  error={deliveryQuoteError}
                  onFindByAddress={() => findByAddress()}
                  onFindByGps={requestGeolocation}
                />
              </div>
            )}
          </header>

          {loading ? (
            <div className={`${PAGE_X} py-8 grid grid-cols-2 gap-4`}>
              {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 rounded-2xl bg-violet-100 animate-pulse" />)}
            </div>
          ) : (
            <>
              {activeTab === 'home' && (
                <div className="space-y-6 pb-6">
                  {/* Hero */}
                  <div className={`${PAGE_X} mt-4`}>
                    <div className="relative overflow-hidden rounded-3xl shadow-xl">
                      <img src={imgSrc(heroImage)} alt="" className="w-full h-52 md:h-72 object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-violet-950/90 via-violet-900/40 to-transparent" />
                      <div className="absolute inset-0 p-6 flex flex-col justify-end">
                        <span className="text-amber-400 text-xs font-semibold uppercase tracking-wider mb-2">Сортировка · Караганда</span>
                        <h2 className="text-white font-black text-2xl md:text-3xl leading-tight mb-3">{settings.hero_title}</h2>
                        <div className="flex gap-6 mb-4">
                          {[
                            { icon: Sparkles, label: 'Премиум' },
                            { icon: Zap, label: '30–60 мин' },
                            { icon: ShieldCheck, label: '21+' },
                          ].map(({ icon: Icon, label }) => (
                            <div key={label} className="flex flex-col items-center gap-1">
                              <Icon className="h-4 w-4 text-violet-300" />
                              <span className="text-[10px] text-white/70">{label}</span>
                            </div>
                          ))}
                        </div>
                        <button type="button" onClick={() => setActiveTab('catalog')} className="w-full md:w-auto md:px-10 py-3 rounded-full bg-amber-400 text-violet-950 font-bold text-sm hover:bg-amber-300 transition-colors">
                          Выбрать напитки
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Marketing promos */}
                  <div className={`${PAGE_X} grid grid-cols-1 md:grid-cols-2 gap-3`}>
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-700 to-indigo-800 p-5 min-h-[120px]">
                      <img src={imgSrc(promoImage)} alt="" className="absolute right-0 top-0 h-full w-2/5 object-cover opacity-40 rounded-l-2xl" />
                      <Gift className="h-5 w-5 text-amber-300 mb-2" />
                      <p className="text-white font-bold text-base relative z-10">{settings.promo_title || 'Волна выходного'}</p>
                      <p className="text-violet-200 text-sm mt-1 relative z-10">{settings.promo_subtitle || '−10% на игристое в пт–сб'}</p>
                    </div>
                    <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 min-h-[120px]">
                      <Truck className="h-5 w-5 text-white/90 mb-2" />
                      <p className="text-white font-bold text-base">{settings.promo2_title || 'Бесплатная доставка'}</p>
                      <p className="text-amber-100 text-sm mt-1">{settings.promo2_subtitle || 'При заказе от 15 000 ₸'}</p>
                    </div>
                  </div>

                  {/* Categories */}
                  <div className={PAGE_X}>
                    <h2 className="font-bold text-gray-900 mb-3">Категории</h2>
                    <div className="flex gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-6 md:overflow-visible [scrollbar-width:none]">
                      {categories.map((cat) => (
                        <button key={cat.id} type="button" onClick={() => selectCategory(cat.id)} className="flex flex-col items-center shrink-0 w-20 md:w-auto group">
                          <div className="w-16 h-16 md:w-full md:aspect-square rounded-2xl overflow-hidden ring-2 ring-violet-100 group-hover:ring-violet-300 transition-all">
                            {cat.image_url ? (
                              <img src={imgSrc(cat.image_url)} alt={cat.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-violet-100 flex items-center justify-center"><Wine className="h-6 w-6 text-violet-400" /></div>
                            )}
                          </div>
                          <span className="text-[11px] md:text-sm text-gray-700 font-medium text-center mt-1.5 line-clamp-2">{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Popular */}
                  <div className={PAGE_X}>
                    <div className="flex justify-between items-center mb-3">
                      <h2 className="font-bold text-gray-900">Хиты продаж</h2>
                      <button type="button" onClick={() => setActiveTab('catalog')} className="text-violet-600 text-sm font-medium">Все →</button>
                    </div>
                    <div className={PRODUCT_GRID}>
                      {(popularProducts.length ? popularProducts : products.slice(0, 4)).map((p) => (
                        <ProductCard key={p.id} product={p} />
                      ))}
                    </div>
                  </div>

                  {/* Trust strip */}
                  <div className={`${PAGE_X} grid grid-cols-3 gap-2 py-4 border-t border-violet-100`}>
                    {[
                      { icon: Truck, title: 'Быстро', desc: 'от 30 мин' },
                      { icon: CreditCard, title: 'Kaspi / Halyk', desc: 'QR или наличные' },
                      { icon: Gift, title: 'Подарки', desc: 'от суммы заказа' },
                    ].map(({ icon: Icon, title, desc }) => (
                      <div key={title} className="text-center p-2">
                        <Icon className="h-5 w-5 text-violet-600 mx-auto mb-1" />
                        <p className="text-[10px] md:text-sm font-semibold text-gray-800">{title}</p>
                        <p className="text-[9px] text-gray-400">{desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'catalog' && (
                <div className={`${PAGE_X} py-4`}>
                  <Input placeholder="Поиск напитков..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="rounded-xl mb-4" />
                  <CatalogCategoryStrip
                    categories={categories}
                    selectedId={selectedCategory}
                    onSelectAll={() => setSelectedCategory(null)}
                    onSelectCategory={(id, _isAlcohol) => selectCategory(id)}
                  />
                  <div className={PRODUCT_GRID}>
                    {filteredProducts.map((p) => <ProductCard key={p.id} product={p} />)}
                  </div>
                  {filteredProducts.length === 0 && <p className="text-center text-gray-400 py-8">Ничего не найдено</p>}
                </div>
              )}

              {activeTab === 'cart' && (
                <div className={`${PAGE_X} py-4 ${cart.length ? 'pb-36' : ''}`}>
                  {cart.length === 0 ? (
                    <div className="text-center py-16">
                      <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 mb-4">Корзина пуста</p>
                      <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => setActiveTab('catalog')}>В каталог</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <SavedAddressBar currentAddress={address} onSelect={(s: SavedAddress) => { setAddress(s.address); void runDeliveryQuote(s.lat != null ? { address: s.address, lat: s.lat, lng: s.lng! } : { address: s.address }); }} accent="violet" />
                      <div ref={addressPickerRef} id="volna-delivery-address">
                        <DeliveryAddressPicker
                          address={address}
                          onAddressChange={setAddress}
                          hasDeliveryZones={hasDeliveryZones}
                          deliveryQuote={deliveryQuote}
                          loading={deliveryQuoteLoading}
                          error={deliveryQuoteError}
                          onFindByAddress={() => findByAddress()}
                          onFindByGps={requestGeolocation}
                          collapsed={addressFormCollapsed && deliveryReady}
                          onEdit={() => setAddressFormCollapsed(false)}
                          onContinueCheckout={() => patchSearch((p) => p.set('checkout', '1'))}
                        />
                      </div>
                      {cart.map(({ product, qty }) => (
                        <div key={product.id} className="flex gap-3 bg-white rounded-2xl p-3 border border-violet-100">
                          <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0">
                            {product.image_url && <img src={imgSrc(product.image_url)} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm truncate">{product.name}</p>
                            <p className="font-bold text-violet-700">{formatMoney(product.price)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => changeQty(product.id, -1)} className="h-8 w-8 rounded-full border flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                            <span className="font-semibold w-4 text-center">{qty}</span>
                            <button type="button" onClick={() => changeQty(product.id, 1)} className="h-8 w-8 rounded-full bg-violet-600 text-white flex items-center justify-center"><Plus className="h-3 w-3" /></button>
                          </div>
                        </div>
                      ))}
                      {loyaltyGifts.length > 0 && <LoyaltyGiftBanner subtotal={subtotal} gifts={loyaltyGifts} />}
                      <div className="bg-white rounded-2xl border p-4 space-y-2 sticky bottom-24 md:static">
                        <div className="flex justify-between font-bold text-lg">
                          <span>Итого</span>
                          <span className="text-violet-700">{formatMoney(orderTotal)}</span>
                        </div>
                        {minOrder > 0 && subtotal < minOrder && (
                          <p className="text-xs text-amber-600">Минимальный заказ: {formatMoney(minOrder)}</p>
                        )}
                        <Button
                          className="w-full h-12 bg-violet-600 hover:bg-violet-700 rounded-xl"
                          disabled={subtotal < minOrder || (hasDeliveryZones && !deliveryReady)}
                          onClick={() => patchSearch((p) => p.set('checkout', '1'))}
                        >
                          Оформить заказ
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'favorites' && (
                <div className={`${PAGE_X} py-4`}>
                  {favoriteProducts.length === 0 ? (
                    <p className="text-center text-gray-400 py-16">Добавьте напитки в избранное через ♥</p>
                  ) : (
                    <div className={PRODUCT_GRID}>{favoriteProducts.map((p) => <ProductCard key={p.id} product={p} />)}</div>
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <StoreProfileTab accentBg="bg-violet-600 hover:bg-violet-700" accentText="text-violet-600" />
              )}
            </>
          )}

          {/* Product modal */}
          {selectedProduct && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
              <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">
                <div className="relative aspect-[4/3]">
                  {selectedProduct.image_url && <img src={imgSrc(selectedProduct.image_url)} alt="" className="w-full h-full object-cover" />}
                  <button type="button" onClick={() => patchSearch((p) => p.delete('product'), true)} className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center"><X className="h-5 w-5" /></button>
                  <span className="absolute top-3 left-3 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">21+</span>
                </div>
                <div className="p-5 space-y-4">
                  <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                  <p className="text-2xl font-bold text-violet-700">{formatMoney(selectedProduct.price)}</p>
                  <Button className="w-full bg-violet-600 hover:bg-violet-700 h-12 rounded-xl" onClick={() => { addProduct(selectedProduct); patchSearch((p) => p.delete('product'), true); }}>
                    В корзину
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Checkout */}
          {checkoutOpen && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
              <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="font-bold text-lg">Оформление · VOLNA</h2>
                  <button type="button" onClick={() => patchSearch((p) => p.delete('checkout'), true)}><X className="h-5 w-5 text-gray-400" /></button>
                </div>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
                <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Телефон" />
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий" rows={2} />
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'kaspi_qr', 'halyk_qr'] as const).map((val) => (
                    <button key={val} type="button" onClick={() => setPayment(val)} className={`py-2 rounded-xl text-xs font-medium border ${payment === val ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200'}`}>
                      {PAYMENT_LABELS[val]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">При получении алкоголя (21+) потребуется документ.</p>
                <Button className="w-full h-12 bg-violet-600 hover:bg-violet-700 rounded-xl" onClick={() => void submitOrder()} disabled={submitting || !name.trim() || !phone.trim()}>
                  {submitting ? 'Отправка...' : `Подтвердить · ${formatMoney(orderTotal)}`}
                </Button>
              </div>
            </div>
          )}

          {/* Mobile nav */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-violet-100 safe-area-pb">
            <div className="flex">
              {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
                <button key={id} type="button" onClick={() => setActiveTab(id)} className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 ${activeTab === id ? 'text-violet-600' : 'text-gray-400'}`}>
                  <Icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{label}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>
      </div>
    </Layout>
  );
}
