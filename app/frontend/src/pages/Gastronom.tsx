import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { resolveImageSrc } from '@/lib/storage';
import { getAccountPrefill } from '@/lib/localAuth';
import {
  fetchGastronomCatalog,
  getCachedGastronomCatalog,
  fetchDeliveryQuote,
  createGastronomOrder,
  type GastronomCategory,
  type GastronomProduct,
  type GastronomSettings,
} from '@/lib/gastronomApi';
import { parseDeliveryZones, type DeliveryQuote } from '@/lib/gastronomDelivery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Menu, Search, ShoppingCart, MapPin, Clock, ChevronDown, Plus, Minus, X,
  Home, LayoutGrid, Heart, User, Truck, ShieldCheck, CreditCard, CheckCircle2,
  Leaf, Zap, Navigation, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const HERO_IMG =
  'https://images.unsplash.com/photo-1542838132-92c53300491e?w=800&h=500&fit=crop';
const ALCOHOL_IMG =
  'https://images.unsplash.com/photo-1510812431401-41d2bd2724f3?w=600&h=300&fit=crop';

interface CartLine {
  product: GastronomProduct;
  qty: number;
}

type Tab = 'home' | 'catalog' | 'cart' | 'favorites' | 'profile';

const NAV_ITEMS: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Главная' },
  { id: 'catalog', icon: LayoutGrid, label: 'Каталог' },
  { id: 'cart', icon: ShoppingCart, label: 'Корзина' },
  { id: 'favorites', icon: Heart, label: 'Избранное' },
  { id: 'profile', icon: User, label: 'Профиль' },
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
}

function imgSrc(url: string) {
  if (!url) return '';
  return resolveImageSrc(url) || url;
}

const CART_KEY = 'gastronom_cart_qty';
const FAV_KEY = 'gastronom_favorites';
const AGE_KEY = 'gastronom_age_21';
const ADDR_KEY = 'gastronom_delivery_address';

function isAgeConfirmed(): boolean {
  try {
    return localStorage.getItem(AGE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadCartQty(): Record<number, number> {
  try {
    const raw = localStorage.getItem(CART_KEY) ?? localStorage.getItem('gastronom_cart');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (parsed[0]?.product) {
        return Object.fromEntries(parsed.map((c: CartLine) => [c.product.id, c.qty]));
      }
      return Object.fromEntries(parsed.filter((x) => Array.isArray(x)).map(([id, qty]: [number, number]) => [id, qty]));
    }
    if (parsed && typeof parsed === 'object') return parsed as Record<number, number>;
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

export default function Gastronom() {
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<GastronomCategory[]>([]);
  const [products, setProducts] = useState<GastronomProduct[]>([]);
  const [settings, setSettings] = useState<GastronomSettings>({
    default_address: 'Жекибаева 129',
    delivery_time: 'Доставка 30-60 мин',
    min_order: '2000',
    hero_title: 'ДОСТАВКА ПРОДУКТОВ ПИТАНИЯ ПО СОРТИРОВКЕ',
    store_name: 'ГАСТРОНОМ',
    store_tagline: 'доставка продуктов питания',
  });
  const [cartQty, setCartQty] = useState<Record<number, number>>(loadCartQty);
  const [favorites, setFavorites] = useState<number[]>(loadFavorites);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<ConfirmedOrder | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<GastronomProduct | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(loadSavedAddress);
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(isAgeConfirmed);
  const pendingAgeAction = useRef<(() => void) | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const quoteRequestId = useRef(0);

  const alcoholCategoryIds = useMemo(
    () => new Set(categories.filter((c) => c.is_alcohol).map((c) => c.id)),
    [categories]
  );

  const alcoholCategory = useMemo(
    () => categories.find((c) => c.is_alcohol) ?? null,
    [categories]
  );

  const isProductAlcohol = useCallback(
    (product: GastronomProduct) => alcoholCategoryIds.has(product.category_id),
    [alcoholCategoryIds]
  );

  const heroImage = settings.hero_image_url || HERO_IMG;
  const alcoholBannerImage = settings.alcohol_banner_image || ALCOHOL_IMG;

  const applyCatalog = useCallback((data: {
    categories: GastronomCategory[];
    products: GastronomProduct[];
    settings: GastronomSettings;
  }) => {
    setCategories(data.categories || []);
    setProducts(data.products || []);
    setSettings((prev) => ({ ...prev, ...(data.settings || {}) }));
    if (data.settings?.default_address) {
      setAddress((a) => a || data.settings.default_address);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    const cached = getCachedGastronomCatalog();
    if (cached) {
      applyCatalog(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchGastronomCatalog(!!cached);
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
  const effectiveAddress = useMemo(
    () => address.trim() || settings.default_address?.trim() || '',
    [address, settings.default_address]
  );
  const deliveryReady = !hasDeliveryZones || (deliveryQuote?.available === true && !deliveryQuoteLoading);

  const runDeliveryQuote = useCallback(async (body: { address?: string; lat?: number; lng?: number }) => {
    const reqId = ++quoteRequestId.current;
    setDeliveryQuoteLoading(true);
    setDeliveryQuoteError(null);
    try {
      const quote = await fetchDeliveryQuote(body);
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(quote);
      if (!quote.available) {
        const msg = quote.message || 'Доставка по этому адресу недоступна';
        setDeliveryQuoteError(msg);
        toast.error(msg);
      }
    } catch (e) {
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(null);
      const msg = e instanceof Error ? e.message : 'Не удалось рассчитать доставку';
      setDeliveryQuoteError(msg);
      toast.error(msg);
    } finally {
      if (reqId === quoteRequestId.current) setDeliveryQuoteLoading(false);
    }
  }, []);

  const retryDeliveryQuote = useCallback(() => {
    if (effectiveAddress.length >= 5) {
      void runDeliveryQuote({ address: effectiveAddress });
      return;
    }
    setAddressEditing(true);
    toast.info('Введите адрес: улица, дом, квартира');
  }, [effectiveAddress, runDeliveryQuote]);

  useEffect(() => {
    if (!hasDeliveryZones) {
      setDeliveryQuote(null);
      setDeliveryQuoteError(null);
      return;
    }
    if (effectiveAddress.length < 5) {
      setDeliveryQuote(null);
      setDeliveryQuoteError(null);
      return;
    }
    const timer = setTimeout(() => {
      void runDeliveryQuote({ address: effectiveAddress });
    }, 700);
    return () => clearTimeout(timer);
  }, [effectiveAddress, hasDeliveryZones, runDeliveryQuote]);

  function requestGeolocation() {
    if (!navigator.geolocation) {
      toast.error('Геолокация не поддерживается браузером');
      return;
    }
    setDeliveryQuoteLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void runDeliveryQuote({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success('Местоположение определено');
      },
      () => {
        setDeliveryQuoteLoading(false);
        toast.error('Не удалось получить геолокацию. Введите адрес вручную.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  const visibleCategories = useMemo(
    () => categories.filter((c) => !c.is_alcohol || ageConfirmed),
    [categories, ageConfirmed]
  );

  const hasAlcoholInCart = useMemo(
    () => cart.some((c) => isProductAlcohol(c.product)),
    [cart, isProductAlcohol]
  );

  const favoriteProducts = useMemo(
    () =>
      products.filter(
        (p) => favorites.includes(p.id) && (!isProductAlcohol(p) || ageConfirmed)
      ),
    [products, favorites, isProductAlcohol, ageConfirmed]
  );

  const popularProducts = useMemo(
    () =>
      products
        .filter((p) => p.is_popular && (!isProductAlcohol(p) || ageConfirmed))
        .slice(0, 8),
    [products, isProductAlcohol, ageConfirmed]
  );

  const filteredProducts = useMemo(() => {
    let list = products;
    if (!ageConfirmed) {
      list = list.filter((p) => !isProductAlcohol(p));
    }
    if (selectedCategory) list = list.filter((p) => p.category_id === selectedCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedCategory, searchQuery, ageConfirmed, isProductAlcohol]);

  function requireAge(then: () => void) {
    if (ageConfirmed) {
      then();
      return;
    }
    pendingAgeAction.current = then;
    setAgeGateOpen(true);
  }

  function confirmAge() {
    localStorage.setItem(AGE_KEY, '1');
    setAgeConfirmed(true);
    setAgeGateOpen(false);
    pendingAgeAction.current?.();
    pendingAgeAction.current = null;
  }

  function rejectAge() {
    setAgeGateOpen(false);
    pendingAgeAction.current = null;
    toast.error('Раздел доступен только для лиц старше 21 года');
  }

  function selectCategory(catId: number | null, isAlcohol = false) {
    const apply = () => {
      setSelectedCategory(catId);
      setActiveTab('catalog');
    };
    if (isAlcohol) requireAge(apply);
    else apply();
  }

  function openCheckout() {
    if (hasDeliveryZones && !deliveryReady) {
      if (deliveryQuoteLoading) {
        toast.info('Подождите, рассчитываем доставку...');
        return;
      }
      if (deliveryQuoteError || !deliveryQuote?.available) {
        toast.error(deliveryQuoteError || 'Укажите адрес в зоне доставки');
      } else {
        toast.error('Сначала укажите адрес и дождитесь расчёта доставки');
      }
      setAddressEditing(true);
      return;
    }
    if (hasAlcoholInCart && !ageConfirmed) {
      requireAge(() => setCheckoutOpen(true));
      return;
    }
    setCheckoutOpen(true);
  }

  function openAlcoholCatalog() {
    if (alcoholCategory) {
      selectCategory(alcoholCategory.id, true);
    } else {
      setActiveTab('catalog');
      toast.info('Алкогольная категория скоро появится');
    }
  }

  function addProduct(product: GastronomProduct) {
    const putInCart = () => {
      setCartQty((prev) => ({
        ...prev,
        [product.id]: (prev[product.id] || 0) + 1,
      }));
      toast.success(`${product.name} добавлен в корзину`);
    };
    if (isProductAlcohol(product)) requireAge(putInCart);
    else putInCart();
  }

  function changeQty(productId: number, delta: number) {
    setCartQty((prev) => {
      const next = { ...prev, [productId]: (prev[productId] || 0) + delta };
      if (next[productId] <= 0) delete next[productId];
      return next;
    });
  }

  function toggleFavorite(productId: number) {
    const product = products.find((p) => p.id === productId);
    const apply = () => {
      setFavorites((prev) =>
        prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
      );
    };
    if (product && isProductAlcohol(product)) requireAge(apply);
    else apply();
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
      const created = await createGastronomOrder({
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
      setCheckoutOpen(false);
      setConfirmedOrder({
        id: created.id,
        name: name.trim(),
        phone: phone.trim(),
        address: effectiveAddress,
        payment: PAYMENT_LABELS[payment],
        total: orderTotal,
        storeName: settings.store_name || 'ГАСТРОНОМ',
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
    if (hasAlcoholInCart && !ageConfirmed) {
      requireAge(() => void submitOrder());
      return;
    }
    await submitOrder();
  }

  function ProductCard({ product }: { product: GastronomProduct }) {
    const inCart = cartQty[product.id] ?? 0;
    const isFav = favorites.includes(product.id);
    const alcohol = isProductAlcohol(product);
    return (
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100">
        <button
          type="button"
          onClick={() => setSelectedProduct(product)}
          className="relative aspect-[4/3] bg-gray-50 w-full block text-left"
        >
          {alcohol && (
            <span className="absolute top-2 left-12 z-10 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
              21+
            </span>
          )}
          {product.image_url ? (
            <img
              src={imgSrc(product.image_url)}
              alt={product.name}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-4xl">🛒</div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(product.id); }}
            className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
            aria-label="Избранное"
          >
            <Heart className={`h-4 w-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); addProduct(product); }}
            className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <Plus className="h-5 w-5" />
          </button>
          {inCart > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
              {inCart}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setSelectedProduct(product)}
          className="p-3 md:p-4 w-full text-left"
        >
          <h3 className="font-semibold text-gray-900 text-sm md:text-base leading-tight line-clamp-2">{product.name}</h3>
          {product.weight && <p className="text-xs md:text-sm text-gray-400 mt-0.5">{product.weight}</p>}
          <p className="mt-1.5 font-bold text-emerald-700 text-sm md:text-base">{formatMoney(product.price)}</p>
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
                isActive ? 'text-emerald-600' : 'text-gray-400'
              }`
            : `flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
        }
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-4 w-4'} />
        {tab === 'cart' && cartCount > 0 && (
          <span
            className={
              compact
                ? 'absolute top-1.5 right-[calc(50%-14px)] flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white'
                : 'ml-0.5 flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white'
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
    const qrText = `GASTRONOM:${confirmedOrder.id};TOTAL:${confirmedOrder.total};PHONE:${confirmedOrder.phone}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`;
    const storePhone = settings.store_phone?.replace(/\D/g, '');
    return (
      <Layout hideHeader>
        <div className="min-h-screen bg-gray-50 px-4 py-8 md:py-12 pb-24 md:pb-8">
          <div className="max-w-lg mx-auto space-y-6">
            <div className="text-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Заказ принят!</h1>
              <p className="text-emerald-700 font-semibold text-lg">№ {confirmedOrder.id}</p>
              <p className="text-gray-500 text-sm mt-2">
                Магазин получил заявку. При оплате по QR покажите код курьеру.
              </p>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 p-5 md:p-6 shadow-sm space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Магазин</p>
              <p className="text-lg font-bold text-gray-900">{confirmedOrder.storeName}</p>
              <div className="border-t border-gray-100 pt-3 space-y-2 text-sm">
                <p><span className="font-medium">{confirmedOrder.name}</span> · {confirmedOrder.phone}</p>
                <p className="flex items-start gap-2 text-gray-600">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  {confirmedOrder.address}
                </p>
                <p>Оплата: {confirmedOrder.payment}</p>
                <p className="text-xl font-bold text-emerald-700">{formatMoney(confirmedOrder.total)}</p>
              </div>
            </div>

            {confirmedOrder.payment !== 'Наличные' && (
              <div className="bg-white rounded-3xl border border-gray-100 p-6 text-center shadow-sm">
                <p className="text-sm font-semibold text-gray-800">{confirmedOrder.payment}</p>
                <img src={qrUrl} alt="QR для оплаты" className="mx-auto mt-4 h-52 w-52 rounded-2xl ring-1 ring-gray-100" />
                <p className="mt-3 text-xs text-gray-500">Сохраните или покажите этот QR</p>
              </div>
            )}

            {storePhone && storePhone.length >= 10 && (
              <a
                href={`tel:+${storePhone}`}
                className="block text-center text-sm text-emerald-600 hover:underline"
              >
                Позвонить в магазин: {settings.store_phone}
              </a>
            )}

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 rounded-xl"
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
    <Layout hideHeader>
      <div className="min-h-screen bg-gray-50 pb-20 md:pb-8">
        <div className="max-w-7xl mx-auto relative">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
          {/* Mobile / tablet top bar */}
          <div className={`flex items-center justify-between ${PAGE_X} py-3 md:py-4 gap-4 lg:hidden`}>
            <Link
              to="/"
              className="p-2 -ml-2 text-gray-600 hover:text-emerald-600 transition-colors shrink-0"
              aria-label="На портал"
            >
              <Menu className="h-5 w-5 md:h-6 md:w-6" />
            </Link>
            <div className="text-center flex-1 min-w-0">
              {settings.logo_url ? (
                <img
                  src={imgSrc(settings.logo_url)}
                  alt={settings.store_name || 'ГАСТРОНОМ'}
                  className="h-10 md:h-12 mx-auto object-contain"
                />
              ) : (
                <div className="flex items-center justify-center gap-1.5">
                  <Leaf className="h-4 w-4 md:h-5 md:w-5 text-emerald-600" />
                  <h1 className="text-lg md:text-2xl font-serif font-bold text-emerald-700 tracking-wide">
                    {settings.store_name || 'ГАСТРОНОМ'}
                  </h1>
                </div>
              )}
              <p className="text-[10px] md:text-xs text-gray-400 uppercase tracking-widest mt-0.5 md:mt-1">
                {settings.store_tagline || 'доставка продуктов питания'}
              </p>
            </div>
            <div className="flex items-center gap-1 md:gap-2 shrink-0">
              <button
                type="button"
                className="p-2 text-gray-600 hover:text-emerald-600 md:hidden"
                aria-label="Поиск"
                onClick={openSearch}
              >
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="relative hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                onClick={() => setActiveTab('cart')}
              >
                <ShoppingCart className="h-4 w-4" />
                Корзина
                {cartCount > 0 && (
                  <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-white text-emerald-700 text-xs font-bold">
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
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Desktop top bar: logo + search + nav + cart in one row */}
          <div className={`hidden lg:flex items-center gap-6 ${PAGE_X} py-4`}>
            <Link
              to="/"
              className="p-2 -ml-2 text-gray-600 hover:text-emerald-600 transition-colors shrink-0"
              aria-label="На портал"
            >
              <Menu className="h-6 w-6" />
            </Link>
            <div className="shrink-0">
              {settings.logo_url ? (
                <img
                  src={imgSrc(settings.logo_url)}
                  alt={settings.store_name || 'ГАСТРОНОМ'}
                  className="h-12 xl:h-14 object-contain"
                />
              ) : (
                <div>
                  <div className="flex items-center gap-1.5">
                    <Leaf className="h-5 w-5 text-emerald-600" />
                    <h1 className="text-2xl xl:text-3xl font-serif font-bold text-emerald-700 tracking-wide">
                      {settings.store_name || 'ГАСТРОНОМ'}
                    </h1>
                  </div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mt-0.5">
                    {settings.store_tagline || 'доставка продуктов питания'}
                  </p>
                </div>
              )}
            </div>
            <div className="flex-1 max-w-md xl:max-w-lg">
              <Input
                placeholder="Поиск товаров..."
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
              className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors shrink-0"
              onClick={() => setActiveTab('cart')}
            >
              <ShoppingCart className="h-4 w-4" />
              Корзина
              {cartCount > 0 && (
                <span className="flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-white text-emerald-700 text-xs font-bold">
                  {cartCount}
                </span>
              )}
            </button>
          </div>

          {/* Tablet: search + nav below logo row */}
          <div className={`hidden md:block lg:hidden ${PAGE_X} pb-3 space-y-3`}>
            <Input
              placeholder="Поиск товаров..."
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
              setAddressEditing((v) => {
                if (!v && !address.trim() && effectiveAddress) {
                  setAddress(effectiveAddress);
                }
                return !v;
              });
            }}
          >
            <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
              <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="truncate font-medium">{effectiveAddress || 'Укажите адрес'}</span>
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
                placeholder="Поиск товаров..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl bg-white"
              />
            </div>
          )}

          {addressEditing && (
            <div className={`${PAGE_X} pb-3 bg-gray-50 space-y-2`}>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Улица, дом, квартира"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="rounded-xl bg-white flex-1"
                />
                <button
                  type="button"
                  onClick={requestGeolocation}
                  className="shrink-0 flex items-center gap-1.5 px-3 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  title="Определить по GPS"
                >
                  {deliveryQuoteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                  <span className="hidden sm:inline">GPS</span>
                </button>
              </div>
              {hasDeliveryZones && (
                <div className="text-xs rounded-lg px-3 py-2 bg-white border border-gray-100">
                  {deliveryQuoteLoading && (
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Рассчитываем доставку...
                    </span>
                  )}
                  {!deliveryQuoteLoading && deliveryQuote?.available && (
                    <span className="text-emerald-700 font-medium">
                      {deliveryQuote.zone_name}: доставка {formatMoney(deliveryQuote.delivery_fee)}
                    </span>
                  )}
                  {!deliveryQuoteLoading && deliveryQuote && !deliveryQuote.available && (
                    <span className="text-red-600">{deliveryQuote.message || 'Доставка недоступна'}</span>
                  )}
                  {!deliveryQuoteLoading && deliveryQuoteError && !deliveryQuote && (
                    <span className="text-red-600">{deliveryQuoteError}</span>
                  )}
                  {!deliveryQuoteLoading && !deliveryQuote && !deliveryQuoteError && effectiveAddress.length >= 5 && (
                    <span className="text-gray-400">Проверяем адрес...</span>
                  )}
                  {!deliveryQuoteLoading && !deliveryQuote && effectiveAddress.length < 5 && (
                    <span className="text-gray-400">Введите полный адрес для расчёта</span>
                  )}
                  {(deliveryQuoteError || (deliveryQuote && !deliveryQuote.available)) && (
                    <button
                      type="button"
                      onClick={retryDeliveryQuote}
                      className="mt-2 text-emerald-600 font-medium underline"
                    >
                      Повторить расчёт
                    </button>
                  )}
                </div>
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
            <Button onClick={() => void loadCatalog()} className="bg-emerald-600 hover:bg-emerald-700">
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                  <div className="absolute inset-0 p-5 md:p-8 lg:p-10 flex flex-col justify-end max-w-3xl">
                    <h2 className="text-white font-bold text-lg md:text-2xl lg:text-3xl leading-tight mb-3 md:mb-4">
                      {settings.hero_title}
                    </h2>
                    <div className="flex gap-4 md:gap-8 mb-4 md:mb-6">
                      {[
                        { icon: Leaf, label: 'Свежие продукты' },
                        { icon: Zap, label: 'Быстрая доставка' },
                        { icon: ShieldCheck, label: 'Гарантия качества' },
                      ].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex flex-col items-center md:items-start gap-1">
                          <Icon className="h-4 w-4 md:h-5 md:w-5 text-emerald-300" />
                          <span className="text-[9px] md:text-sm text-white/80 text-center md:text-left leading-tight">{label}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="w-full md:w-auto md:px-10 py-2.5 md:py-3 rounded-full bg-emerald-500 text-white font-semibold text-sm md:text-base hover:bg-emerald-600 transition-colors"
                    >
                      Сделать заказ
                    </button>
                  </div>
                </div>
                </div>

                {/* Categories */}
                <div className={PAGE_X}>
                  <h2 className="hidden md:block font-bold text-gray-900 mb-4 text-lg">Категории</h2>
                  <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide md:grid md:grid-cols-4 lg:grid-cols-6 md:overflow-visible md:gap-4">
                    {visibleCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => selectCategory(cat.id, !!cat.is_alcohol)}
                        className="flex flex-col items-center shrink-0 w-20 md:w-auto group"
                      >
                        <div className="w-16 h-16 md:w-full md:aspect-square md:max-h-28 rounded-2xl overflow-hidden bg-gray-100 mb-1.5 ring-2 ring-transparent group-hover:ring-emerald-200 transition-all">
                          {cat.image_url ? (
                            <img src={imgSrc(cat.image_url)} alt={cat.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🥗</div>
                          )}
                        </div>
                        <span className="text-[10px] md:text-sm text-gray-600 text-center leading-tight line-clamp-2 px-1">
                          {cat.name}
                          {cat.is_alcohol && <span className="text-amber-600"> 21+</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Popular products */}
                <div className={PAGE_X}>
                  <div className="flex items-center justify-between mb-3 md:mb-5">
                    <h2 className="font-bold text-gray-900 text-base md:text-xl">Популярные товары</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="text-emerald-600 text-sm md:text-base font-medium flex items-center gap-0.5 hover:underline"
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

                {/* Alcohol banner */}
                <div className={`${PAGE_X}`}>
                <div className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-emerald-900 min-h-[140px] md:min-h-[180px]">
                  <img src={imgSrc(alcoholBannerImage)} alt="" className="absolute right-0 top-0 h-full w-1/2 md:w-2/5 object-cover opacity-60" />
                  <div className="relative p-5 md:p-8 max-w-full md:max-w-[55%]">
                    <p className="text-white/60 text-xs md:text-sm mb-1">21+</p>
                    <h3 className="text-white font-bold text-sm md:text-xl mb-1">Алкогольная продукция (21+)</h3>
                    <p className="text-white/70 text-xs md:text-base mb-3 md:mb-5">Широкий выбор напитков с доставкой на дом</p>
                    <button
                      type="button"
                      onClick={openAlcoholCatalog}
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
                    { icon: ShieldCheck, title: 'Гарантия качества', desc: 'только свежие продукты' },
                    { icon: CreditCard, title: 'Удобная оплата', desc: 'онлайн и при получении' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="text-center px-1 md:px-4 md:bg-white md:rounded-2xl md:py-5 md:shadow-sm">
                      <Icon className="h-5 w-5 md:h-7 md:w-7 text-emerald-600 mx-auto mb-1 md:mb-2" />
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
                        !selectedCategory ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Все товары
                    </button>
                    {visibleCategories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => selectCategory(cat.id, !!cat.is_alcohol)}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                          selectedCategory === cat.id ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {cat.name}{cat.is_alcohol ? ' 21+' : ''}
                      </button>
                    ))}
                  </aside>

                  <div className="space-y-4 md:space-y-6 min-w-0">
                    <Input
                      placeholder="Поиск товаров..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded-xl md:hidden"
                    />
                    <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden md:flex-wrap md:overflow-visible">
                      <button
                        type="button"
                        onClick={() => setSelectedCategory(null)}
                        className={`shrink-0 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium transition-colors ${
                          !selectedCategory ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        Все
                      </button>
                      {visibleCategories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => selectCategory(cat.id, !!cat.is_alcohol)}
                          className={`shrink-0 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-sm font-medium transition-colors ${
                            selectedCategory === cat.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {cat.name}{cat.is_alcohol ? ' 21+' : ''}
                        </button>
                      ))}
                    </div>
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
              <div className={`${PAGE_X} py-4 md:py-6`}>
                <h2 className="hidden md:block font-bold text-gray-900 text-xl lg:text-2xl mb-4 md:mb-6">Корзина</h2>
                {cart.length === 0 ? (
                  <div className="text-center py-16 md:py-24">
                    <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">Корзина пуста</p>
                    <Button
                      className="mt-4 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => setActiveTab('catalog')}
                    >
                      Перейти в каталог
                    </Button>
                  </div>
                ) : (
                  <div className="lg:grid lg:grid-cols-3 lg:gap-8 lg:items-start">
                    <div className="lg:col-span-2 space-y-3 md:space-y-4">
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
                          <p className="font-bold text-emerald-700 mt-0.5 md:text-lg">{formatMoney(product.price)}</p>
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
                              className="h-7 w-7 md:h-9 md:w-9 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700"
                            >
                              <Plus className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </button>
                          </div>
                          <p className="text-sm md:text-base font-bold">{formatMoney(qty * product.price)}</p>
                        </div>
                      </div>
                    ))}
                    </div>
                    <div className="mt-4 lg:mt-0 lg:sticky lg:top-36 bg-white rounded-2xl border border-gray-100 p-4 md:p-6 shadow-sm space-y-3">
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
                      <div className="flex justify-between text-sm md:text-base pt-2 border-t">
                        <span className="text-gray-700 font-medium">К оплате</span>
                        <span className="font-bold text-xl md:text-2xl text-emerald-700">{formatMoney(orderTotal)}</span>
                      </div>
                      {hasDeliveryZones && (
                        <div className={`rounded-xl px-3 py-2.5 text-sm ${
                          deliveryQuoteLoading
                            ? 'bg-gray-50 text-gray-600'
                            : deliveryReady
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-amber-900'
                        }`}>
                          {deliveryQuoteLoading && (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                              Рассчитываем доставку для «{effectiveAddress}»...
                            </span>
                          )}
                          {!deliveryQuoteLoading && deliveryReady && deliveryQuote?.zone_name && (
                            <span>
                              Доставка · {deliveryQuote.zone_name}: {formatMoney(deliveryQuote.delivery_fee)}
                            </span>
                          )}
                          {!deliveryQuoteLoading && !deliveryReady && (
                            <div className="space-y-2">
                              <p>
                                {deliveryQuoteError
                                  || deliveryQuote?.message
                                  || (effectiveAddress.length < 5
                                    ? 'Укажите адрес доставки вверху страницы'
                                    : 'Не удалось рассчитать доставку — проверьте адрес')}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAddressEditing(true)}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-amber-200"
                                >
                                  Изменить адрес
                                </button>
                                <button
                                  type="button"
                                  onClick={retryDeliveryQuote}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white"
                                >
                                  Повторить
                                </button>
                                <button
                                  type="button"
                                  onClick={requestGeolocation}
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-amber-200 inline-flex items-center gap-1"
                                >
                                  <Navigation className="h-3.5 w-3.5" /> GPS
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {minOrder > 0 && subtotal < minOrder && (
                        <p className="text-xs md:text-sm text-amber-600">
                          Минимальный заказ: {formatMoney(minOrder)}
                        </p>
                      )}
                      <Button
                        className={`w-full h-12 md:h-14 rounded-xl text-base md:text-lg ${
                          hasDeliveryZones && !deliveryReady && subtotal >= minOrder
                            ? 'bg-emerald-400 hover:bg-emerald-500'
                            : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                        disabled={subtotal < minOrder}
                        onClick={openCheckout}
                      >
                        {deliveryQuoteLoading ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Расчёт доставки...
                          </span>
                        ) : (
                          'Оформить заказ'
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
                  <Link to="/" className="text-sm text-emerald-600 hover:underline">
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
                  <div className="flex h-full items-center justify-center text-6xl">🛒</div>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-3 right-3 h-9 w-9 rounded-full bg-white/90 flex items-center justify-center shadow"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
                {isProductAlcohol(selectedProduct) && (
                  <span className="absolute top-3 left-3 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">21+</span>
                )}
              </div>
              <div className="p-5 md:p-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedProduct.name}</h2>
                  {selectedProduct.weight && <p className="text-sm text-gray-400 mt-1">{selectedProduct.weight}</p>}
                  <p className="text-2xl font-bold text-emerald-700 mt-2">{formatMoney(selectedProduct.price)}</p>
                </div>
                {selectedProduct.description && (
                  <p className="text-sm text-gray-600 leading-relaxed">{selectedProduct.description}</p>
                )}
                <div className="flex items-center gap-3">
                  {(cartQty[selectedProduct.id] ?? 0) > 0 ? (
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
                        className="h-10 w-10 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <Button
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 h-12 rounded-xl"
                      onClick={() => { addProduct(selectedProduct); setSelectedProduct(null); }}
                    >
                      Добавить в корзину
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleFavorite(selectedProduct.id)}
                    className="h-12 w-12 rounded-xl border flex items-center justify-center shrink-0"
                  >
                    <Heart className={`h-5 w-5 ${favorites.includes(selectedProduct.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
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
                <button type="button" onClick={() => setCheckoutOpen(false)}>
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
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+7 ..." />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Адрес доставки</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Улица, дом, квартира" />
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
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
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
                    <span className="text-emerald-700">{formatMoney(orderTotal)}</span>
                  </div>
                </div>
                {hasAlcoholInCart && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    В заказе есть алкоголь (21+). При получении потребуется документ.
                  </p>
                )}
                </div>
                </div>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 md:h-14 rounded-xl"
                  onClick={checkout}
                  disabled={submitting}
                >
                  {submitting ? 'Отправка...' : 'Подтвердить заказ'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Age gate 21+ */}
        {ageGateOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl text-center">
              <p className="text-3xl font-bold text-emerald-700 mb-2">21+</p>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Подтвердите возраст</h2>
              <p className="text-sm text-gray-500 mb-6">
                Раздел алкогольной продукции доступен только лицам старше 21 года.
              </p>
              <div className="flex flex-col gap-2">
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={confirmAge}>
                  Мне есть 21 год
                </Button>
                <Button variant="outline" className="w-full" onClick={rejectAge}>
                  Мне нет 21 года
                </Button>
              </div>
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
