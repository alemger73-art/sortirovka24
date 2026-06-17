import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { resolveImageSrc } from '@/lib/storage';
import { getAccountPrefill } from '@/lib/localAuth';
import {
  fetchPharmacyCatalog,
  getCachedPharmacyCatalog,
  fetchDeliveryQuote,
  createPharmacyOrder,
  type PharmacyCategory,
  type PharmacyProduct,
  type PharmacySettings,
} from '@/lib/pharmacyApi';
import { parseDeliveryZones, type DeliveryQuote } from '@/lib/gastronomDelivery';
import { GeolocationError, ensureLocationPermission, requestCurrentPosition } from '@/lib/geolocation';
import {
  isLoyaltyEnabled,
  parseLoyaltyGifts,
  resolveLoyaltyGift,
} from '@/lib/gastronomLoyalty';
import PharmacyDeliveryAddressPicker from '@/components/pharmacy/PharmacyDeliveryAddressPicker';
import PharmacySideMenu from '@/components/pharmacy/PharmacySideMenu';
import GastronomPortalBar from '@/components/gastronom/GastronomPortalBar';
import LoyaltyGiftBanner from '@/components/gastronom/LoyaltyGiftBanner';
import PharmacyCategoryStrip from '@/components/pharmacy/PharmacyCategoryStrip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Menu, Search, ShoppingCart, MapPin, Clock, ChevronDown, Plus, Minus, X,
  Home, LayoutGrid, Heart, User, Truck, ShieldCheck, CreditCard, CheckCircle2,
  Cross, Zap, Loader2, AlertCircle, Stethoscope, FileText, Pill, Percent,
} from 'lucide-react';
import { toast } from 'sonner';

const HERO_IMG =
  'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800&h=500&fit=crop';
const RX_IMG =
  'https://images.unsplash.com/photo-1631549916768-4119b2e5f926?w=600&h=300&fit=crop';

interface CartLine {
  product: PharmacyProduct;
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

/** Подбор по симптому/потребности — задаёт поисковый запрос. */
const SYMPTOMS: { emoji: string; label: string; query: string }[] = [
  { emoji: '🤒', label: 'Температура', query: 'парацетамол' },
  { emoji: '🤧', label: 'Простуда', query: 'простуда' },
  { emoji: '😣', label: 'Боль', query: 'обезболивающее' },
  { emoji: '💊', label: 'Витамины', query: 'витамин' },
  { emoji: '🫃', label: 'ЖКТ', query: 'жкт' },
  { emoji: '🩹', label: 'Первая помощь', query: 'пластырь' },
  { emoji: '😷', label: 'Маски', query: 'маск' },
];

const PRODUCT_GRID =
  'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4 lg:gap-5';
const PAGE_X = 'px-4 sm:px-6 lg:px-8 xl:px-10';
const CATALOG_SIDEBAR =
  'hidden lg:block lg:sticky lg:top-36 lg:self-start space-y-1 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm';

const PAYMENT_LABELS: Record<'cash' | 'kaspi_qr' | 'halyk_qr', string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
};

interface ConfirmedOrder {
  id: number;
  name: string;
  phone: string;
  address: string;
  payment: string;
  total: number;
  storeName: string;
  giftTitle?: string;
  hasRx?: boolean;
}

function imgSrc(url: string) {
  if (!url) return '';
  return resolveImageSrc(url) || url;
}

const CART_KEY = 'pharmacy_cart_qty';
const FAV_KEY = 'pharmacy_favorites';
const ADDR_KEY = 'pharmacy_delivery_address';

function loadCartQty(): Record<number, number> {
  try {
    const raw = localStorage.getItem(CART_KEY);
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

function normalizePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
}

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}

function hasDiscount(p: PharmacyProduct): boolean {
  return !!p.old_price && p.old_price > p.price;
}

export default function Pharmacy() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<PharmacyCategory[]>([]);
  const [products, setProducts] = useState<PharmacyProduct[]>([]);
  const [settings, setSettings] = useState<PharmacySettings>({
    default_address: 'ул. Жекибаева 129',
    delivery_time: 'Доставка 30-60 мин',
    min_order: '1500',
    hero_title: 'ДОСТАВКА ЛЕКАРСТВ ПО СОРТИРОВКЕ ЗА 30 МИНУТ',
    store_name: 'АПТЕКА 24',
    store_tagline: 'доставка лекарств и товаров для здоровья',
  });
  const [cartQty, setCartQty] = useState<Record<number, number>>(loadCartQty);
  const [favorites, setFavorites] = useState<number[]>(loadFavorites);

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

  const openMenu = useCallback(() => {
    patchSearch((p) => p.set('menu', '1'), false);
  }, [patchSearch]);

  const closeMenu = useCallback(() => {
    patchSearch((p) => p.delete('menu'), true);
  }, [patchSearch]);

  const openProduct = useCallback((product: PharmacyProduct) => {
    patchSearch((p) => {
      p.set('product', String(product.id));
      p.delete('menu');
    }, false);
  }, [patchSearch]);

  const closeProduct = useCallback(() => {
    patchSearch((p) => p.delete('product'), true);
  }, [patchSearch]);

  const openCheckoutModal = useCallback(() => {
    patchSearch((p) => p.set('checkout', '1'), false);
  }, [patchSearch]);

  const closeCheckoutModal = useCallback(() => {
    patchSearch((p) => p.delete('checkout'), true);
  }, [patchSearch]);

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(loadSavedAddress);
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const quoteRequestId = useRef(0);
  const addressPickerRef = useRef<HTMLDivElement>(null);
  const checkoutSectionRef = useRef<HTMLDivElement>(null);
  const prevDeliveryReady = useRef(false);
  const geoPromptStarted = useRef(false);
  const [addressFormCollapsed, setAddressFormCollapsed] = useState(false);

  const heroImage = settings.hero_image_url || HERO_IMG;
  const rxBannerImage = settings.rx_banner_image || RX_IMG;

  const rxCategory = useMemo(
    () => categories.find((c) => c.is_rx) ?? null,
    [categories]
  );

  const selectedProduct = useMemo(
    () => (productIdFromUrl ? products.find((p) => p.id === productIdFromUrl) ?? null : null),
    [productIdFromUrl, products]
  );

  const applyCatalog = useCallback((data: {
    categories: PharmacyCategory[];
    products: PharmacyProduct[];
    settings: PharmacySettings;
  }) => {
    setCategories(data.categories || []);
    setProducts(data.products || []);
    setSettings((prev) => ({ ...prev, ...(data.settings || {}) }));
    if (data.settings?.default_address) {
      setAddress((a) => a || data.settings.default_address);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    const cached = getCachedPharmacyCatalog();
    if (cached) {
      applyCatalog(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchPharmacyCatalog(!!cached);
      applyCatalog(data);
    } catch (e) {
      console.error(e);
      if (!cached) toast.error('Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }, [applyCatalog]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartQty));
  }, [cartQty]);

  useEffect(() => {
    const trimmed = address.trim();
    if (trimmed) {
      try {
        localStorage.setItem(ADDR_KEY, trimmed);
      } catch {
        /* ignore */
      }
    }
  }, [address]);

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const prefill = getAccountPrefill();
    if (prefill.name) setName((v) => v || prefill.name);
    if (prefill.phone) setPhone((v) => v || prefill.phone);
  }, []);

  const cart = useMemo(() => {
    return Object.entries(cartQty)
      .map(([id, qty]) => {
        if (qty <= 0) return null;
        const product = products.find((p) => p.id === Number(id));
        return product ? { product, qty } : null;
      })
      .filter(Boolean) as CartLine[];
  }, [cartQty, products]);

  const cartCount = useMemo(() => cart.reduce((a, c) => a + c.qty, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((a, c) => a + c.qty * c.product.price, 0), [cart]);
  const hasRxInCart = useMemo(() => cart.some((c) => c.product.requires_prescription), [cart]);
  const hasDeliveryZones = useMemo(
    () => parseDeliveryZones(settings.delivery_zones).length > 0,
    [settings.delivery_zones]
  );
  const deliveryFee = useMemo(() => {
    if (hasDeliveryZones) {
      return deliveryQuote?.available ? deliveryQuote.delivery_fee : 0;
    }
    return Number(settings.delivery_fee || 0);
  }, [hasDeliveryZones, deliveryQuote, settings.delivery_fee]);
  const orderTotal = useMemo(() => subtotal + deliveryFee, [subtotal, deliveryFee]);
  const minOrder = Number(settings.min_order || 0);
  const loyaltyGifts = useMemo(
    () => (isLoyaltyEnabled(settings) ? parseLoyaltyGifts(settings.loyalty_gifts) : []),
    [settings.loyalty_gifts, settings.loyalty_enabled]
  );
  const loyaltyGift = useMemo(
    () => resolveLoyaltyGift(subtotal, loyaltyGifts),
    [subtotal, loyaltyGifts]
  );
  const effectiveAddress = useMemo(
    () => address.trim() || settings.default_address?.trim() || '',
    [address, settings.default_address]
  );
  const deliveryReady =
    !hasDeliveryZones
    || (
      deliveryQuote?.available === true
      && !deliveryQuote?.location_warning
      && !deliveryQuoteLoading
    );

  useEffect(() => {
    if (deliveryReady && !prevDeliveryReady.current && hasDeliveryZones) {
      setAddressFormCollapsed(true);
      toast.success('Адрес подтверждён! Нажмите «Оформить заказ»', { duration: 4000 });
    }
    if (!deliveryReady) {
      setAddressFormCollapsed(false);
    }
    prevDeliveryReady.current = deliveryReady;
  }, [deliveryReady, hasDeliveryZones]);

  const focusAddressPicker = useCallback(() => {
    setAddressFormCollapsed(false);
    setActiveTab('cart');
    setAddressEditing(true);
    const saved = address.trim() || settings.default_address?.trim() || '';
    if (!address.trim() && saved) {
      setAddress(saved);
    }
    window.setTimeout(() => {
      addressPickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = addressPickerRef.current?.querySelector('input');
      if (input instanceof HTMLInputElement) {
        input.focus({ preventScroll: true });
        input.select();
      }
    }, 150);
  }, [address, settings.default_address]);

  const runDeliveryQuote = useCallback(async (
    body: { address?: string; lat?: number; lng?: number },
    options?: { notify?: boolean; fillAddress?: boolean },
  ) => {
    const reqId = ++quoteRequestId.current;
    setDeliveryQuoteLoading(true);
    setDeliveryQuoteError(null);
    try {
      const quote = await fetchDeliveryQuote(body);
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(quote);
      if (options?.fillAddress && quote.display_address) {
        setAddress(quote.display_address);
      }
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
      toast.info('Введите улицу и номер дома, например: пер. Урановый 10');
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
      await runDeliveryQuote(
        { lat: coords.lat, lng: coords.lng },
        { notify: true, fillAddress: true },
      );
    } catch (err) {
      setDeliveryQuoteLoading(false);
      if (err instanceof GeolocationError) {
        if (err.code === 'denied') {
          toast.error('Разрешите доступ к геолокации в настройках телефона');
        } else if (err.code === 'unsupported') {
          toast.error('Геолокация не поддерживается на этом устройстве');
        } else {
          toast.error('Не удалось получить GPS. Введите адрес вручную.');
        }
        return;
      }
      toast.error('Не удалось получить GPS. Введите адрес вручную.');
    }
  }, [runDeliveryQuote]);

  useEffect(() => {
    if (geoPromptStarted.current) return;
    geoPromptStarted.current = true;

    const timer = window.setTimeout(() => {
      void (async () => {
        const status = await ensureLocationPermission();
        if (status === 'granted') {
          await requestGeolocation();
        }
      })();
    }, 500);

    return () => window.clearTimeout(timer);
  }, [requestGeolocation]);

  const favoriteProducts = useMemo(
    () => products.filter((p) => favorites.includes(p.id)),
    [products, favorites]
  );

  const popularProducts = useMemo(
    () => products.filter((p) => p.is_popular).slice(0, 8),
    [products]
  );

  const discountProducts = useMemo(
    () => products.filter((p) => hasDiscount(p)).slice(0, 8),
    [products]
  );

  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedCategory) list = list.filter((p) => p.category_id === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.active_ingredient || '').toLowerCase().includes(q) ||
          (p.manufacturer || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  function selectCategory(catId: number | null) {
    setSelectedCategory(catId);
    setActiveTab('catalog');
  }

  function pickSymptom(query: string) {
    setSelectedCategory(null);
    setSearchQuery(query);
    setActiveTab('catalog');
  }

  function openCheckout() {
    if (hasDeliveryZones && !deliveryReady) {
      if (deliveryQuoteLoading) {
        toast.info('Подождите, проверяем адрес на карте...');
        return;
      }
      toast.info('Сначала проверьте адрес — нажмите «Найти на карте» или GPS');
      focusAddressPicker();
      return;
    }
    openCheckoutModal();
  }

  function proceedToCheckout() {
    if (hasDeliveryZones && !deliveryReady) {
      focusAddressPicker();
      toast.info('Сначала проверьте адрес на карте');
      return;
    }
    if (subtotal < minOrder) {
      toast.error(`Минимальный заказ ${formatMoney(minOrder)}`);
      return;
    }
    setAddressFormCollapsed(true);
    openCheckout();
  }

  function openRxCatalog() {
    if (rxCategory) {
      selectCategory(rxCategory.id);
    } else {
      setActiveTab('catalog');
    }
  }

  function addProduct(product: PharmacyProduct) {
    if (product.in_stock === false) {
      toast.error(`«${product.name}» нет в наличии`);
      return;
    }
    setCartQty((prev) => ({
      ...prev,
      [product.id]: (prev[product.id] || 0) + 1,
    }));
    toast.success(`${product.name} добавлен в корзину`);
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
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }

  function openSearch() {
    setSearchOpen(true);
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
      const created = await createPharmacyOrder({
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
      closeCheckoutModal();
      setConfirmedOrder({
        id: created.id,
        name: name.trim(),
        phone: phone.trim(),
        address: effectiveAddress,
        payment: PAYMENT_LABELS[payment],
        total: orderTotal,
        storeName: settings.store_name || 'АПТЕКА 24',
        giftTitle: loyaltyGift?.title,
        hasRx: hasRxInCart,
      });
      toast.success('Заказ оформлен! Мы свяжемся с вами.');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Не удалось оформить заказ');
    } finally {
      setSubmitting(false);
    }
  }

  async function checkout() {
    if (!name.trim() || !phone.trim() || !effectiveAddress) {
      toast.error('Заполните имя, телефон и адрес');
      return;
    }
    if (!normalizePhone(phone)) {
      toast.error('Введите корректный номер телефона');
      return;
    }
    if (cart.length === 0) {
      toast.error('Корзина пуста');
      return;
    }
    if (subtotal < minOrder) {
      toast.error(`Минимальный заказ ${formatMoney(minOrder)}`);
      return;
    }
    if (hasDeliveryZones && !deliveryQuote?.available) {
      toast.error('Укажите адрес в зоне доставки или используйте геолокацию');
      return;
    }
    if (hasDeliveryZones && deliveryQuoteLoading) {
      toast.error('Подождите, рассчитываем доставку...');
      return;
    }
    await submitOrder();
  }

  function ProductCard({ product }: { product: PharmacyProduct }) {
    const inCart = cartQty[product.id] ?? 0;
    const isFav = favorites.includes(product.id);
    const rx = !!product.requires_prescription;
    const outOfStock = product.in_stock === false;
    const discount = hasDiscount(product);
    return (
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100">
        <button
          type="button"
          onClick={() => openProduct(product)}
          className="relative aspect-[4/3] bg-gray-50 w-full block text-left"
        >
          <div className="absolute top-2 left-12 z-10 flex flex-col gap-1 items-start">
            {rx && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white inline-flex items-center gap-0.5">
                <FileText className="h-2.5 w-2.5" /> Rx
              </span>
            )}
            {discount && (
              <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                -{Math.round((1 - product.price / (product.old_price || product.price)) * 100)}%
              </span>
            )}
          </div>
          {product.image_url ? (
            <img
              src={imgSrc(product.image_url)}
              alt={product.name}
              className={`h-full w-full object-cover ${outOfStock ? 'opacity-40 grayscale' : ''}`}
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl">💊</div>
          )}
          {outOfStock && (
            <span className="absolute inset-x-0 bottom-0 bg-gray-900/70 py-1 text-center text-[11px] font-semibold text-white">
              Нет в наличии
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(product.id); }}
            className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
            aria-label="Избранное"
          >
            <Heart className={`h-4 w-4 ${isFav ? 'fill-rose-500 text-rose-500' : 'text-gray-400'}`} />
          </button>
          {!outOfStock && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); addProduct(product); }}
              className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white shadow-lg hover:bg-teal-700 active:scale-95 transition-all"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}
          {inCart > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-teal-600 px-2 py-0.5 text-xs font-bold text-white">
              {inCart}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => openProduct(product)}
          className="p-3 md:p-4 w-full text-left"
        >
          <h3 className="font-semibold text-gray-900 text-sm md:text-base leading-tight line-clamp-2">{product.name}</h3>
          {product.weight && <p className="text-xs md:text-sm text-gray-400 mt-0.5">{product.weight}</p>}
          <div className="mt-1.5 flex items-baseline gap-2">
            <p className="font-bold text-teal-700 text-sm md:text-base">{formatMoney(product.price)}</p>
            {discount && (
              <p className="text-xs text-gray-400 line-through">{formatMoney(product.old_price as number)}</p>
            )}
          </div>
        </button>
      </div>
    );
  }

  function renderNavButton(tab: Tab, Icon: typeof Home, label: string, compact = false) {
    const isActive = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => setActiveTab(tab)}
        className={
          compact
            ? `flex-1 flex flex-col items-center py-2.5 gap-0.5 relative transition-colors ${
                isActive ? 'text-teal-600' : 'text-gray-400'
              }`
            : `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
        }
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-4 w-4'} />
        {tab === 'cart' && cartCount > 0 && (
          <span
            className={
              compact
                ? 'absolute top-1.5 right-[calc(50%-14px)] flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-[9px] font-bold text-white'
                : 'ml-0.5 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white'
            }
          >
            {cartCount}
          </span>
        )}
        <span className={compact ? 'text-[10px] font-medium' : ''}>{label}</span>
      </button>
    );
  }

  if (confirmedOrder) {
    const storePhone = settings.store_phone?.replace(/\D/g, '');
    const paymentHint =
      confirmedOrder.payment === 'Наличные'
        ? 'Оплатите курьеру наличными при получении заказа.'
        : confirmedOrder.payment === 'Kaspi QR'
          ? 'Курьер привезёт QR для оплаты в приложении Kaspi. Сканируйте его в Kaspi, когда получите заказ.'
          : confirmedOrder.payment === 'Halyk QR'
            ? 'Курьер привезёт QR для оплаты в приложении Halyk. Сканируйте его в Halyk, когда получите заказ.'
            : 'Оплатите курьеру при получении заказа.';
    return (
      <Layout hideHeader hideBottomNav>
        <GastronomPortalBar />
        <div className="min-h-screen bg-gray-50 px-4 py-8 md:py-12 pb-24 md:pb-8">
          <div className="max-w-lg mx-auto space-y-6">
            <div className="text-center">
              <CheckCircle2 className="h-16 w-16 text-teal-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Заказ принят!</h1>
              <p className="text-teal-700 font-semibold text-lg">№ {confirmedOrder.id}</p>
              <p className="text-gray-500 text-sm mt-2">
                Мы свяжемся с вами для подтверждения. Сохраните номер заказа.
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 p-5 md:p-6 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Аптека</p>
              <p className="text-lg font-bold text-gray-900">{confirmedOrder.storeName}</p>
              <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
                <p><span className="font-medium">{confirmedOrder.name}</span> · {confirmedOrder.phone}</p>
                <p className="flex items-start gap-2 text-gray-600">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  {confirmedOrder.address}
                </p>
                <p>Оплата: {confirmedOrder.payment}</p>
                {confirmedOrder.giftTitle && (
                  <p className="text-amber-800 bg-amber-50 rounded-xl px-3 py-2 mt-2">
                    🎁 Подарок к заказу: <span className="font-semibold">{confirmedOrder.giftTitle}</span>
                  </p>
                )}
                <p className="text-xl font-bold text-teal-700">{formatMoney(confirmedOrder.total)}</p>
              </div>
            </div>

            {confirmedOrder.hasRx && (
              <div className="bg-rose-50 rounded-3xl border border-rose-100 p-5 md:p-6 shadow-sm flex gap-3">
                <FileText className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-sm text-rose-900 leading-relaxed">
                  В заказе есть рецептурные препараты. Подготовьте рецепт — курьер проверит его при выдаче.
                </p>
              </div>
            )}

            <div className="bg-teal-50 rounded-3xl border border-teal-100 p-5 md:p-6 shadow-sm">
              <p className="text-sm font-semibold text-teal-900 mb-1">Как оплатить</p>
              <p className="text-sm text-teal-800 leading-relaxed">{paymentHint}</p>
            </div>

            {storePhone && storePhone.length >= 10 && (
              <a
                href={`tel:+${storePhone}`}
                className="block text-center text-sm text-teal-600 hover:underline"
              >
                Позвонить в аптеку: {settings.store_phone}
              </a>
            )}

            <Button
              className="w-full bg-teal-600 hover:bg-teal-700 h-12 rounded-xl"
              onClick={() => { setConfirmedOrder(null); setActiveTab('home'); }}
            >
              Вернуться на главную
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout hideHeader hideBottomNav>
      <PharmacySideMenu
        open={menuOpen}
        onClose={closeMenu}
        items={NAV_ITEMS.map(({ id, icon, label }) => ({
          id,
          label,
          icon,
          badge: id === 'cart' ? cartCount : undefined,
        }))}
        activeId={activeTab}
        onSelect={(id) => selectTabFromMenu(id as Tab)}
        storeName={settings.store_name}
        storePhone={settings.store_phone}
      />
      <div className="min-h-screen bg-gray-50 pb-20 md:pb-8">
        <div className="max-w-7xl mx-auto relative">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
          <GastronomPortalBar />
          {/* Mobile / tablet top bar */}
          <div className={`flex items-center justify-between ${PAGE_X} py-3 md:py-4 gap-4 lg:hidden`}>
            <button
              type="button"
              className="p-2 -ml-2 text-gray-600 hover:text-teal-600 transition-colors shrink-0"
              aria-label="Меню"
              onClick={openMenu}
            >
              <Menu className="h-5 w-5 md:h-6 md:w-6" />
            </button>
            <div className="text-center flex-1 min-w-0">
              {settings.logo_url ? (
                <img
                  src={imgSrc(settings.logo_url)}
                  alt={settings.store_name || 'АПТЕКА 24'}
                  className="h-10 md:h-12 mx-auto object-contain"
                />
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <Cross className="h-4 w-4 md:h-5 md:w-5 text-teal-600" />
                  <h1 className="text-lg md:text-2xl font-bold text-teal-700 tracking-wide">
                    {settings.store_name || 'АПТЕКА 24'}
                  </h1>
                </div>
              )}
              <p className="text-[10px] md:text-xs text-gray-400 uppercase tracking-widest mt-0.5 md:mt-1">
                {settings.store_tagline || 'доставка лекарств'}
              </p>
            </div>
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <button
                type="button"
                className="p-2 text-gray-600 hover:text-teal-600 md:hidden"
                aria-label="Поиск"
                onClick={openSearch}
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="relative hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
                onClick={() => setActiveTab('cart')}
              >
                <ShoppingCart className="h-4 w-4" />
                Корзина
                {cartCount > 0 && (
                  <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-white text-teal-700 text-xs font-bold">
                    {cartCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="relative p-2 text-gray-600 md:hidden"
                onClick={() => setActiveTab('cart')}
                aria-label="Корзина"
              >
                <ShoppingCart className="h-5 w-5" />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Desktop top bar */}
          <div className={`hidden lg:flex items-center gap-6 ${PAGE_X} py-4`}>
            <button
              type="button"
              className="p-2 -ml-2 text-gray-600 hover:text-teal-600 transition-colors shrink-0"
              aria-label="Меню"
              onClick={openMenu}
            >
              <Menu className="h-6 w-6" />
            </button>
            <div className="shrink-0">
              {settings.logo_url ? (
                <img
                  src={imgSrc(settings.logo_url)}
                  alt={settings.store_name || 'АПТЕКА 24'}
                  className="h-12 xl:h-14 object-contain"
                />
              ) : (
                <div>
                  <div className="flex items-center gap-1.5">
                    <Cross className="h-5 w-5 text-teal-600" />
                    <h1 className="text-2xl xl:text-3xl font-bold text-teal-700 tracking-wide">
                      {settings.store_name || 'АПТЕКА 24'}
                    </h1>
                  </div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mt-0.5">
                    {settings.store_tagline || 'доставка лекарств'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex-1 max-w-md xl:max-w-lg">
              <Input
                placeholder="Поиск лекарств, витаминов, действующего вещества..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value && activeTab === 'home') setActiveTab('catalog');
                }}
                className="rounded-xl"
              />
            </div>
            <nav className="flex items-center gap-1 shrink-0">
              {NAV_ITEMS.map(({ id, icon, label }) => renderNavButton(id, icon, label))}
            </nav>
            <button
              type="button"
              className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors shrink-0"
              onClick={() => setActiveTab('cart')}
            >
              <ShoppingCart className="h-4 w-4" />
              Корзина
              {cartCount > 0 && (
                <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-white text-teal-700 text-xs font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          </div>

          {/* Tablet: search + nav */}
          <div className={`hidden md:block lg:hidden ${PAGE_X} pb-3 space-y-3`}>
            <Input
              placeholder="Поиск лекарств..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value && activeTab === 'home') setActiveTab('catalog');
              }}
              className="rounded-xl max-w-xl"
            />
            <nav className="flex items-center gap-1 overflow-x-auto">
              {NAV_ITEMS.map(({ id, icon, label }) => renderNavButton(id, icon, label))}
            </nav>
          </div>

          <button
            type="button"
            className={`flex items-center justify-between w-full ${PAGE_X} py-2 md:py-3 bg-gray-50 text-sm md:text-base border-t border-gray-100`}
            onClick={() => {
              if (activeTab === 'cart') {
                focusAddressPicker();
                return;
              }
              setAddressEditing((v) => {
                if (!v && !address.trim() && effectiveAddress) {
                  setAddress(effectiveAddress);
                }
                return !v;
              });
            }}
          >
            <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
              {hasDeliveryZones && (
                deliveryReady ? (
                  <CheckCircle2 className="h-4 w-4 text-teal-600 shrink-0" />
                ) : deliveryQuoteLoading ? (
                  <Loader2 className="h-4 w-4 text-gray-400 animate-spin shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                )
              )}
              {!hasDeliveryZones && <MapPin className="h-4 w-4 text-teal-600 shrink-0" />}
              <span className="truncate font-medium">
                {deliveryReady && deliveryQuote?.zone_name
                  ? `${effectiveAddress || 'Адрес'} · ${deliveryQuote.zone_name}`
                  : effectiveAddress || (hasDeliveryZones ? 'Укажите адрес доставки' : 'Укажите адрес')}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            </div>
            <div className="flex items-center gap-1 text-gray-500 shrink-0 ml-2">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">{settings.delivery_time}</span>
            </div>
          </button>

          {(searchOpen || searchQuery) && (
            <div className={`md:hidden ${PAGE_X} pb-3 bg-gray-50`}>
              <Input
                autoFocus={searchOpen}
                placeholder="Поиск лекарств..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl bg-white"
              />
            </div>
          )}

          {addressEditing && (
            <div className={`${PAGE_X} pb-3 bg-gray-50 space-y-2`}>
              <PharmacyDeliveryAddressPicker
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
              {hasDeliveryZones && deliveryReady && deliveryQuote?.zone_name && (
                <p className="text-xs text-teal-700 font-medium px-1">
                  ✓ {deliveryQuote.zone_name} · доставка {formatMoney(deliveryQuote.delivery_fee)}
                </p>
              )}
            </div>
          )}
        </header>

        {loading ? (
          <div className={`${PAGE_X} py-4 md:py-6 space-y-4`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-40 md:h-48 rounded-2xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 md:py-24 px-4">
            <p className="text-gray-500 mb-4">Каталог пока пуст</p>
            <Button onClick={() => void loadCatalog()} className="bg-teal-600 hover:bg-teal-700">
              Обновить
            </Button>
          </div>
        ) : (
          <>
            {/* HOME tab */}
            {activeTab === 'home' && (
              <div className="space-y-5 md:space-y-8 pb-4 md:pb-8">
                {/* Hero banner */}
                <div className={`${PAGE_X} mt-4 md:mt-6`}>
                <div className="relative overflow-hidden rounded-2xl md:rounded-3xl">
                  <img src={imgSrc(heroImage)} alt="" className="w-full h-48 sm:h-56 md:h-64 lg:h-80 object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-teal-950/85 via-teal-900/40 to-transparent" />
                  <div className="absolute inset-0 p-5 md:p-8 lg:p-10 flex flex-col justify-end max-w-3xl">
                    <h2 className="text-white font-bold text-lg md:text-2xl lg:text-3xl leading-tight mb-3 md:mb-4">
                      {settings.hero_title}
                    </h2>
                    <div className="flex gap-4 md:gap-8 mb-4 md:mb-6">
                      {[
                        { icon: Zap, label: 'Доставка от 30 мин' },
                        { icon: Stethoscope, label: 'Консультация фармацевта' },
                        { icon: ShieldCheck, label: 'Лицензия и сертификаты' },
                      ].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex flex-col items-center md:items-start gap-1">
                          <Icon className="h-4 w-4 md:h-5 md:w-5 text-teal-300" />
                          <span className="text-[9px] md:text-sm text-white/80 text-center md:text-left leading-tight">{label}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="w-full md:w-auto md:px-10 py-2.5 md:py-3 rounded-full bg-teal-500 text-white font-semibold text-sm md:text-base hover:bg-teal-600 transition-colors"
                    >
                      Перейти в каталог
                    </button>
                  </div>
                </div>
                </div>

                {/* Symptom quick-pick */}
                <div className={PAGE_X}>
                  <div className="flex items-end justify-between gap-2 mb-3">
                    <h2 className="font-bold text-gray-900 text-base md:text-lg">Что вас беспокоит?</h2>
                    <span className="md:hidden text-[11px] font-medium text-teal-700">Листайте →</span>
                  </div>
                  <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap">
                    {SYMPTOMS.map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => pickSymptom(s.query)}
                        className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white border border-teal-100 shadow-sm hover:border-teal-300 hover:bg-teal-50/60 transition-colors"
                      >
                        <span className="text-lg">{s.emoji}</span>
                        <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Categories */}
                <div className={PAGE_X}>
                  <div className="flex items-end justify-between gap-2 mb-3 md:mb-4">
                    <h2 className="font-bold text-gray-900 text-base md:text-lg">Категории</h2>
                    <span className="md:hidden text-[11px] font-medium text-teal-700">Листайте →</span>
                  </div>
                  <div className="relative md:static">
                    <div
                      className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-gray-50 to-transparent md:hidden"
                      aria-hidden
                    />
                    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-4 lg:grid-cols-6 md:overflow-visible md:gap-4 md:pb-0">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => selectCategory(cat.id)}
                        className="flex flex-col items-center shrink-0 w-[4.75rem] md:w-auto snap-start group touch-manipulation"
                      >
                        <div className="w-[4.25rem] h-[4.25rem] md:w-full md:aspect-square md:max-h-28 rounded-2xl overflow-hidden bg-white mb-1.5 ring-2 ring-teal-100 shadow-sm group-hover:ring-teal-300 group-active:scale-95 transition-all">
                          {cat.image_url ? (
                            <img src={imgSrc(cat.image_url)} alt={cat.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">💊</div>
                          )}
                        </div>
                        <span className="text-[11px] md:text-sm text-gray-700 font-medium text-center leading-tight line-clamp-2 px-0.5">
                          {cat.name}
                        </span>
                      </button>
                    ))}
                    </div>
                  </div>
                </div>

                {/* Discounts */}
                {discountProducts.length > 0 && (
                  <div className={PAGE_X}>
                    <div className="flex items-center justify-between mb-3 md:mb-5">
                      <h2 className="font-bold text-gray-900 text-base md:text-xl flex items-center gap-2">
                        <Percent className="h-5 w-5 text-orange-500" /> Скидки и акции
                      </h2>
                    </div>
                    <div className={PRODUCT_GRID}>
                      {discountProducts.map((p) => (
                        <ProductCard key={p.id} product={p} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Popular products */}
                <div className={PAGE_X}>
                  <div className="flex items-center justify-between mb-3 md:mb-5">
                    <h2 className="font-bold text-gray-900 text-base md:text-xl">Популярные товары</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="text-teal-600 text-sm md:text-base font-medium flex items-center gap-0.5 hover:underline"
                    >
                      Смотреть все →
                    </button>
                  </div>
                  <div className={PRODUCT_GRID}>
                    {(popularProducts.length > 0 ? popularProducts : products.slice(0, 4)).map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                </div>

                {/* Rx banner */}
                <div className={`${PAGE_X}`}>
                <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-teal-900 min-h-[140px] md:min-h-[180px]">
                  <img src={imgSrc(rxBannerImage)} alt="" className="absolute right-0 top-0 h-full w-1/2 md:w-2/5 object-cover opacity-50" />
                  <div className="relative p-5 md:p-8 max-w-full md:max-w-[55%]">
                    <p className="text-white/60 text-xs md:text-sm mb-1 inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" /> По рецепту
                    </p>
                    <h3 className="text-white font-bold text-sm md:text-xl mb-1">Рецептурные препараты</h3>
                    <p className="text-white/70 text-xs md:text-base mb-3 md:mb-5">Привезём по вашему рецепту. Проверка документа при выдаче.</p>
                    <button
                      type="button"
                      onClick={openRxCatalog}
                      className="px-4 md:px-6 py-1.5 md:py-2.5 rounded-full border border-white/40 text-white text-xs md:text-sm hover:bg-white/10 transition-colors"
                    >
                      Смотреть каталог
                    </button>
                  </div>
                </div>
                </div>

                {/* Features */}
                <div className={`${PAGE_X} grid grid-cols-3 md:grid-cols-3 gap-2 md:gap-8 py-3 md:py-6 border-t border-gray-100`}>
                  {[
                    { icon: Truck, title: 'Быстрая доставка', desc: 'от 30 минут' },
                    { icon: ShieldCheck, title: 'Лицензированная аптека', desc: 'сертифицированные товары' },
                    { icon: CreditCard, title: 'Удобная оплата', desc: 'онлайн и при получении' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="text-center px-1 md:px-4 md:bg-white md:rounded-2xl md:py-5 md:shadow-sm">
                      <Icon className="h-5 w-5 md:h-7 md:w-7 text-teal-600 mx-auto mb-1 md:mb-2" />
                      <p className="text-[10px] md:text-base font-semibold text-gray-800 leading-tight">{title}</p>
                      <p className="text-[9px] md:text-sm text-gray-400 leading-tight mt-0.5">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CATALOG tab */}
            {activeTab === 'catalog' && (
              <div className={`${PAGE_X} py-4 md:py-6`}>
                <h2 className="hidden md:block font-bold text-gray-900 text-xl lg:text-2xl mb-4 md:mb-6">Каталог</h2>
                <div className="lg:grid lg:grid-cols-[minmax(200px,240px)_1fr] lg:gap-8 lg:items-start">
                  <aside className={CATALOG_SIDEBAR}>
                    <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Категории</p>
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(null)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        !selectedCategory ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Все товары
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => selectCategory(cat.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          selectedCategory === cat.id ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {cat.name}{cat.is_rx ? ' · Rx' : ''}
                      </button>
                    ))}
                  </aside>

                  <div className="space-y-4 md:space-y-6 min-w-0">
                    <Input
                      placeholder="Поиск лекарств..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded-xl lg:hidden"
                    />
                    <PharmacyCategoryStrip
                      categories={categories}
                      selectedId={selectedCategory}
                      onSelectAll={() => setSelectedCategory(null)}
                      onSelectCategory={(id) => selectCategory(id)}
                    />
                    <div className={PRODUCT_GRID}>
                      {filteredProducts.map((p) => (
                        <ProductCard key={p.id} product={p} />
                      ))}
                    </div>
                    {filteredProducts.length === 0 && (
                      <p className="text-center text-gray-400 py-8">Товары не найдены</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CART tab */}
            {activeTab === 'cart' && (
              <div className={`${PAGE_X} py-4 md:py-6 ${cart.length > 0 ? 'pb-36 md:pb-6' : ''}`}>
                <h2 className="hidden md:block font-bold text-gray-900 text-xl lg:text-2xl mb-4 md:mb-6">Корзина</h2>
                {cart.length > 0 && hasDeliveryZones && (
                  <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-white border border-gray-100 shadow-sm">
                    <div className={`flex items-center gap-2 flex-1 ${deliveryReady ? 'opacity-70' : ''}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        deliveryReady ? 'bg-teal-600 text-white' : 'bg-teal-600 text-white ring-2 ring-teal-300'
                      }`}>
                        {deliveryReady ? '✓' : '1'}
                      </span>
                      <span className="text-sm font-medium text-gray-900">Адрес</span>
                    </div>
                    <span className="text-gray-300 text-lg">→</span>
                    <div className={`flex items-center gap-2 flex-1 ${!deliveryReady ? 'opacity-40' : ''}`}>
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        deliveryReady ? 'bg-teal-600 text-white ring-2 ring-teal-300' : 'bg-gray-200 text-gray-600'
                      }`}>2</span>
                      <span className="text-sm font-medium text-gray-900">Оформление</span>
                    </div>
                  </div>
                )}
                {cart.length === 0 ? (
                  <div className="text-center py-16 md:py-24">
                    <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">Корзина пуста</p>
                    <Button
                      className="mt-4 bg-teal-600 hover:bg-teal-700"
                      onClick={() => setActiveTab('catalog')}
                    >
                      Перейти в каталог
                    </Button>
                  </div>
                ) : (
                  <div className="lg:grid lg:grid-cols-3 lg:gap-8 lg:items-start">
                    <div className="lg:col-span-2 space-y-4">
                    <div ref={addressPickerRef} id="pharmacy-delivery-address" className="scroll-mt-28">
                    <PharmacyDeliveryAddressPicker
                      address={address}
                      onAddressChange={(v) => { setAddress(v); if (addressFormCollapsed) setAddressFormCollapsed(false); }}
                      hasDeliveryZones={hasDeliveryZones}
                      deliveryQuote={deliveryQuote}
                      loading={deliveryQuoteLoading}
                      error={deliveryQuoteError}
                      onFindByAddress={() => findByAddress()}
                      onFindByGps={requestGeolocation}
                      onSelectExample={(ex) => findByAddress(ex)}
                      collapsed={addressFormCollapsed && deliveryReady}
                      onEdit={focusAddressPicker}
                      onContinueCheckout={proceedToCheckout}
                    />
                    </div>
                    <div className="space-y-3 md:space-y-4">
                    {cart.map(({ product, qty }) => (
                      <div key={product.id} className="flex gap-3 md:gap-4 bg-white md:bg-gray-50 rounded-2xl p-3 md:p-4 shadow-sm md:shadow-none border border-gray-100 md:border-0">
                        <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-white shrink-0">
                          {product.image_url && (
                            <img src={imgSrc(product.image_url)} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm md:text-base text-gray-900 truncate">{product.name}</p>
                          {product.weight && <p className="text-xs md:text-sm text-gray-400">{product.weight}</p>}
                          {product.requires_prescription && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 mt-0.5">
                              <FileText className="h-2.5 w-2.5" /> по рецепту
                            </span>
                          )}
                          <p className="font-bold text-teal-700 mt-0.5 md:text-lg">{formatMoney(product.price)}</p>
                        </div>
                        <div className="flex flex-col items-end justify-between">
                          <div className="flex items-center gap-2 md:gap-3">
                            <button
                              type="button"
                              onClick={() => changeQty(product.id, -1)}
                              className="h-7 w-7 md:h-9 md:w-9 rounded-full bg-white border flex items-center justify-center hover:bg-gray-50"
                            >
                              <Minus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </button>
                            <span className="text-sm md:text-base font-semibold w-4 text-center">{qty}</span>
                            <button
                              type="button"
                              onClick={() => changeQty(product.id, 1)}
                              className="h-7 w-7 md:h-9 md:w-9 rounded-full bg-teal-600 text-white flex items-center justify-center hover:bg-teal-700"
                            >
                              <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </button>
                          </div>
                          <p className="text-sm md:text-base font-bold">{formatMoney(qty * product.price)}</p>
                        </div>
                      </div>
                    ))}
                    </div>
                    {hasRxInCart && (
                      <div className="flex gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-900">
                        <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                        <span>В корзине есть рецептурные препараты. Подготовьте рецепт — курьер проверит его при выдаче.</span>
                      </div>
                    )}
                    {loyaltyGifts.length > 0 && (
                      <LoyaltyGiftBanner subtotal={subtotal} gifts={loyaltyGifts} />
                    )}
                    </div>
                    <div ref={checkoutSectionRef} className="mt-4 lg:mt-0 lg:sticky lg:top-36 relative z-10 bg-white rounded-2xl border border-gray-100 p-4 md:p-6 shadow-sm space-y-3">
                      {deliveryReady && hasDeliveryZones && (
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-100 md:hidden">
                          <span className="w-7 h-7 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                          <span className="text-sm font-semibold text-gray-900">Оформление заказа</span>
                        </div>
                      )}
                      <h3 className="font-bold text-gray-900 text-lg hidden lg:block">Итого</h3>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Товары</span>
                        <span>{formatMoney(subtotal)}</span>
                      </div>
                      {deliveryFee > 0 && deliveryQuote?.zone_name && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Доставка · {deliveryQuote.zone_name}</span>
                          <span>{formatMoney(deliveryFee)}</span>
                        </div>
                      )}
                      {deliveryFee > 0 && !deliveryQuote?.zone_name && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Доставка</span>
                          <span>{formatMoney(deliveryFee)}</span>
                        </div>
                      )}
                      {loyaltyGift && (
                        <div className="flex justify-between text-sm text-amber-800 bg-amber-50 rounded-lg px-2 py-1.5">
                          <span>🎁 Подарок</span>
                          <span className="font-medium truncate ml-2">{loyaltyGift.title}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm md:text-base pt-2 border-t">
                        <span className="text-gray-700 font-medium">К оплате</span>
                        <span className="font-bold text-xl md:text-2xl text-teal-700">{formatMoney(orderTotal)}</span>
                      </div>
                      {hasDeliveryZones && !deliveryReady && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 space-y-2.5 text-sm text-amber-900">
                          <p className="text-xs leading-relaxed">
                            {deliveryQuoteError
                              || deliveryQuote?.message
                              || 'Укажите адрес и нажмите «Найти на карте»'}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={focusAddressPicker}
                              className="text-xs font-semibold px-3 py-2.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 active:scale-[0.98] transition-transform cursor-pointer min-h-[40px]"
                            >
                              Изменить адрес
                            </button>
                            <button
                              type="button"
                              onClick={() => findByAddress()}
                              disabled={deliveryQuoteLoading}
                              className="text-xs font-semibold px-3 py-2.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 active:scale-[0.98] transition-transform cursor-pointer min-h-[40px] disabled:opacity-50"
                            >
                              Повторить
                            </button>
                            <button
                              type="button"
                              onClick={requestGeolocation}
                              disabled={deliveryQuoteLoading}
                              className="text-xs font-semibold px-3 py-2.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 active:scale-[0.98] transition-transform cursor-pointer min-h-[40px] inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              GPS
                            </button>
                          </div>
                        </div>
                      )}
                      {minOrder > 0 && subtotal < minOrder && (
                        <p className="text-xs md:text-sm text-amber-600">
                          Минимальный заказ: {formatMoney(minOrder)}
                        </p>
                      )}
                      <Button
                        className={`w-full h-12 md:h-14 rounded-xl text-base md:text-lg ${
                          deliveryReady || !hasDeliveryZones
                            ? 'bg-teal-600 hover:bg-teal-700 shadow-md'
                            : 'bg-teal-400 hover:bg-teal-500'
                        }`}
                        disabled={subtotal < minOrder}
                        onClick={() => {
                          if (hasDeliveryZones && !deliveryReady) {
                            focusAddressPicker();
                            return;
                          }
                          proceedToCheckout();
                        }}
                      >
                        {deliveryQuoteLoading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Проверяем адрес...
                          </span>
                        ) : hasDeliveryZones && !deliveryReady ? (
                          'Шаг 1: Проверить адрес'
                        ) : (
                          'Шаг 2: Оформить заказ →'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'favorites' && (
              <div className={`${PAGE_X} py-4 md:py-6`}>
                <h2 className="hidden md:block font-bold text-gray-900 text-xl lg:text-2xl mb-4 md:mb-6">Избранное</h2>
                {favoriteProducts.length === 0 ? (
                  <div className="text-center py-16 md:py-24">
                    <Heart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Нажмите ♥ на товаре, чтобы добавить в избранное</p>
                  </div>
                ) : (
                  <div className={PRODUCT_GRID}>
                    {favoriteProducts.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Profile */}
            {activeTab === 'profile' && (
              <div className={`${PAGE_X} py-8 md:py-12`}>
                <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 text-center space-y-4">
                <User className="h-12 w-12 md:h-14 md:w-14 text-gray-300 mx-auto mb-3" />
                <h2 className="font-bold text-gray-900 text-lg md:text-xl">Профиль</h2>
                <p className="text-gray-500 text-sm md:text-base">Войдите в аккаунт портала</p>
                <Link to="/account">
                  <Button variant="outline" className="rounded-xl w-full md:w-auto md:px-8">Войти</Button>
                </Link>
                <div>
                  <Link to="/" className="text-sm text-teal-600 hover:underline">
                    ← На главную Сортировка24
                  </Link>
                </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Product detail modal */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-lg md:max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">
              <div className="relative aspect-[4/3] bg-gray-50">
                {selectedProduct.image_url ? (
                  <img src={imgSrc(selectedProduct.image_url)} alt={selectedProduct.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-6xl">💊</div>
                )}
                <button
                  type="button"
                  onClick={() => closeProduct()}
                  className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center shadow"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                  {selectedProduct.requires_prescription && (
                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-xs font-bold text-white inline-flex items-center gap-1">
                      <FileText className="h-3 w-3" /> По рецепту
                    </span>
                  )}
                  {hasDiscount(selectedProduct) && (
                    <span className="rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-white">
                      -{Math.round((1 - selectedProduct.price / (selectedProduct.old_price || selectedProduct.price)) * 100)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="p-5 md:p-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedProduct.name}</h2>
                  {selectedProduct.weight && <p className="text-sm text-gray-400 mt-1">{selectedProduct.weight}</p>}
                  <div className="mt-2 flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-teal-700">{formatMoney(selectedProduct.price)}</p>
                    {hasDiscount(selectedProduct) && (
                      <p className="text-base text-gray-400 line-through">{formatMoney(selectedProduct.old_price as number)}</p>
                    )}
                  </div>
                </div>
                {selectedProduct.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{selectedProduct.description}</p>
                )}
                {/* Характеристики */}
                {(selectedProduct.active_ingredient || selectedProduct.dosage_form || selectedProduct.manufacturer || selectedProduct.country) && (
                  <div className="rounded-xl bg-gray-50 p-3 space-y-1.5 text-sm">
                    {selectedProduct.active_ingredient && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500 inline-flex items-center gap-1"><Pill className="h-3.5 w-3.5" /> Действ. вещество</span>
                        <span className="font-medium text-gray-900 text-right">{selectedProduct.active_ingredient}</span>
                      </div>
                    )}
                    {selectedProduct.dosage_form && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Форма выпуска</span>
                        <span className="font-medium text-gray-900 text-right">{selectedProduct.dosage_form}</span>
                      </div>
                    )}
                    {selectedProduct.manufacturer && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Производитель</span>
                        <span className="font-medium text-gray-900 text-right">{selectedProduct.manufacturer}</span>
                      </div>
                    )}
                    {selectedProduct.country && (
                      <div className="flex justify-between gap-3">
                        <span className="text-gray-500">Страна</span>
                        <span className="font-medium text-gray-900 text-right">{selectedProduct.country}</span>
                      </div>
                    )}
                  </div>
                )}
                {selectedProduct.requires_prescription && (
                  <div className="flex gap-2.5 rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-900">
                    <FileText className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Отпускается по рецепту. Курьер проверит рецепт при доставке.</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  {selectedProduct.in_stock === false ? (
                    <div className="flex-1 h-12 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center text-sm font-medium">
                      Нет в наличии
                    </div>
                  ) : (cartQty[selectedProduct.id] ?? 0) > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => changeQty(selectedProduct.id, -1)}
                        className="h-10 w-10 rounded-full border flex items-center justify-center"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="font-semibold text-lg w-6 text-center">{cartQty[selectedProduct.id]}</span>
                      <button
                        type="button"
                        onClick={() => changeQty(selectedProduct.id, 1)}
                        className="h-10 w-10 rounded-full bg-teal-600 text-white flex items-center justify-center"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <Button
                      className="flex-1 bg-teal-600 hover:bg-teal-700 h-12 rounded-xl"
                      onClick={() => { addProduct(selectedProduct); closeProduct(); }}
                    >
                      Добавить в корзину
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleFavorite(selectedProduct.id)}
                    className="h-12 w-12 rounded-xl border flex items-center justify-center shrink-0"
                  >
                    <Heart className={`h-5 w-5 ${favorites.includes(selectedProduct.id) ? 'fill-rose-500 text-rose-500' : 'text-gray-400'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Checkout modal */}
        {checkoutOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
            <div className="bg-white w-full sm:max-w-lg md:max-w-xl lg:max-w-2xl rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 md:p-6 border-b">
                <h2 className="font-bold text-lg md:text-xl">Оформление заказа</h2>
                <button type="button" onClick={closeCheckoutModal}>
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>
              <div className="p-4 md:p-6 space-y-4">
                <div className="md:grid md:grid-cols-2 md:gap-6 md:space-y-0">
                <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Имя</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ваше имя" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Телефон</label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+7 (___) ___-__-__"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Адрес доставки</label>
                  {hasDeliveryZones ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 space-y-2">
                      {deliveryReady && deliveryQuote?.available ? (
                        <>
                          <p className="text-sm font-medium text-gray-900">{effectiveAddress}</p>
                          <p className="text-xs text-teal-700 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {deliveryQuote.zone_name} · доставка {formatMoney(deliveryQuote.delivery_fee)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-amber-800">
                          Адрес не проверен. Закройте окно и нажмите «Найти на карте» в корзине.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          closeCheckoutModal();
                          focusAddressPicker();
                        }}
                        className="text-xs text-teal-600 font-medium underline py-1 cursor-pointer"
                      >
                        Изменить адрес
                      </button>
                    </div>
                  ) : (
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Улица, дом, квартира" />
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Комментарий</label>
                  <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Пожелания к заказу" rows={2} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Способ оплаты</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['cash', 'Наличные'],
                      ['kaspi_qr', 'Kaspi QR'],
                      ['halyk_qr', 'Halyk QR'],
                    ] as const).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPayment(val)}
                        className={`py-2 px-2 rounded-xl text-xs font-medium border transition-colors ${
                          payment === val
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  </div>
                </div>
                <div className="space-y-4 md:flex md:flex-col md:justify-between">
                <div className="bg-gray-50 rounded-xl p-3 md:p-4 text-sm space-y-1">
                  {cart.map(({ product, qty }) => (
                    <div key={product.id} className="flex justify-between">
                      <span className="text-gray-600 truncate mr-2">{product.name} ×{qty}</span>
                      <span className="font-medium shrink-0">{formatMoney(qty * product.price)}</span>
                    </div>
                  ))}
                  {deliveryFee > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Доставка</span>
                      <span>{formatMoney(deliveryFee)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Итого</span>
                    <span className="text-teal-700">{formatMoney(orderTotal)}</span>
                  </div>
                </div>
                {hasRxInCart && (
                  <p className="text-xs text-rose-700 bg-rose-50 rounded-lg px-3 py-2">
                    В заказе есть рецептурные препараты. При получении потребуется рецепт.
                  </p>
                )}
                </div>
                </div>
                <Button
                  className="w-full bg-teal-600 hover:bg-teal-700 h-12 md:h-14 rounded-xl"
                  onClick={checkout}
                  disabled={submitting || (hasDeliveryZones && !deliveryReady)}
                >
                  {submitting ? 'Отправка...' : 'Подтвердить заказ'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mobile cart checkout bar */}
        {activeTab === 'cart' && cart.length > 0 && !checkoutOpen && (
          <div className="md:hidden fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-30 px-4 py-2.5 bg-white/95 backdrop-blur border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
            <div className="flex items-center gap-3 max-w-lg mx-auto">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">
                  {deliveryReady || !hasDeliveryZones ? 'Шаг 2' : 'Шаг 1'}
                </p>
                <p className="font-bold text-teal-700 text-lg leading-tight">{formatMoney(orderTotal)}</p>
              </div>
              <Button
                type="button"
                className={`h-12 px-5 rounded-xl font-semibold shrink-0 ${
                  deliveryReady || !hasDeliveryZones
                    ? 'bg-teal-600 hover:bg-teal-700'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
                disabled={subtotal < minOrder || deliveryQuoteLoading}
                onClick={() => {
                  if (hasDeliveryZones && !deliveryReady) {
                    focusAddressPicker();
                    return;
                  }
                  proceedToCheckout();
                }}
              >
                {deliveryQuoteLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : hasDeliveryZones && !deliveryReady ? (
                  'Проверить адрес'
                ) : (
                  'Оформить →'
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 safe-area-pb">
          <div className="flex max-w-7xl mx-auto">
            {NAV_ITEMS.map(({ id, icon, label }) => renderNavButton(id, icon, label, true))}
          </div>
        </nav>
        </div>
      </div>
    </Layout>
  );
}
