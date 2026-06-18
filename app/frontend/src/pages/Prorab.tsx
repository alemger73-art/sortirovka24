import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '@/components/Layout';
import { resolveImageSrc } from '@/lib/storage';
import { getAccountPrefill } from '@/lib/localAuth';
import {
  fetchProrabCatalog,
  getCachedProrabCatalog,
  fetchProrabDeliveryQuote,
  createProrabOrder,
  type ProrabCategory,
  type ProrabProduct,
  type ProrabSettings,
} from '@/lib/prorabApi';
import { parseDeliveryZones, type DeliveryQuote } from '@/lib/gastronomDelivery';
import { GeolocationError, requestCurrentPosition } from '@/lib/geolocation';
import DeliveryAddressPicker from '@/components/gastronom/DeliveryAddressPicker';
import SavedAddressBar from '@/components/SavedAddressBar';
import { type SavedAddress } from '@/lib/accountApi';
import CatalogCategoryStrip from '@/components/gastronom/CatalogCategoryStrip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Search, ShoppingCart, MapPin, Clock, Plus, Minus, X,
  Home, LayoutGrid, Heart, User, Truck, CheckCircle2,
  HardHat, Loader2, Phone, ArrowLeft, Package,
} from 'lucide-react';
import { toast } from 'sonner';

const HERO_FALLBACK = 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=500&fit=crop';

type Tab = 'home' | 'catalog' | 'cart' | 'favorites';

const TAB_IDS: Tab[] = ['home', 'catalog', 'cart', 'favorites'];

function parseTab(raw: string | null): Tab {
  return TAB_IDS.includes(raw as Tab) ? (raw as Tab) : 'home';
}

const NAV_ITEMS: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Витрина' },
  { id: 'catalog', icon: LayoutGrid, label: 'Каталог' },
  { id: 'cart', icon: ShoppingCart, label: 'Корзина' },
  { id: 'favorites', icon: Heart, label: 'Избранное' },
];

const PAYMENT_LABELS: Record<'cash' | 'kaspi_qr' | 'halyk_qr', string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
};

const CART_KEY = 'prorab_cart_qty';
const FAV_KEY = 'prorab_favorites';
const ADDR_KEY = 'prorab_delivery_address';

function imgSrc(url: string) {
  if (!url) return '';
  return resolveImageSrc(url) || url;
}

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}

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

export default function Prorab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ProrabCategory[]>([]);
  const [products, setProducts] = useState<ProrabProduct[]>([]);
  const [settings, setSettings] = useState<ProrabSettings>({
    default_address: 'ул. Жекибаева 129',
    delivery_time: 'Доставка в день заказа',
    min_order: '0',
    free_delivery_from: '50000',
    hero_title: 'ДОСТАВКА СТРОИТЕЛЬНЫХ МАТЕРИАЛОВ ПО СОРТИРОВКЕ',
    store_name: 'PRORAB',
    store_tagline: 'магазин строительных материалов',
  });
  const [cartQty, setCartQty] = useState<Record<number, number>>(loadCartQty);
  const [favorites, setFavorites] = useState<number[]>(loadFavorites);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [address, setAddress] = useState(() => {
    try { return localStorage.getItem(ADDR_KEY) || ''; } catch { return ''; }
  });
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [deliveryQuoteError, setDeliveryQuoteError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<{ id: number; total: number } | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');
  const quoteRequestId = useRef(0);

  const activeTab = parseTab(searchParams.get('tab'));

  const setActiveTab = useCallback((tab: Tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'home') next.delete('tab');
      else next.set('tab', tab);
      return next;
    }, { replace: true });
    setCheckoutOpen(false);
  }, [setSearchParams]);

  useEffect(() => {
    const cached = getCachedProrabCatalog();
    if (cached) {
      setCategories(cached.categories);
      setProducts(cached.products);
      setSettings(cached.settings);
      setLoading(false);
    }
    fetchProrabCatalog(!!cached)
      .then((data) => {
        setCategories(data.categories);
        setProducts(data.products);
        setSettings(data.settings);
      })
      .catch(() => toast.error('Не удалось загрузить каталог'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartQty));
  }, [cartQty]);

  useEffect(() => {
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const prefill = getAccountPrefill();
    if (prefill.name && !name) setName(prefill.name);
    if (prefill.phone && !phone) setPhone(prefill.phone);
  }, [name, phone]);

  const productsById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);

  const cart = useMemo(
    () =>
      Object.entries(cartQty)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ product: productsById[Number(id)], qty }))
        .filter((c) => c.product),
    [cartQty, productsById],
  );

  const cartCount = useMemo(() => Object.values(cartQty).reduce((s, q) => s + q, 0), [cartQty]);
  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.product.price * c.qty, 0), [cart]);

  const freeFrom = Number(settings.free_delivery_from || 50000);
  const baseDeliveryFee = deliveryQuote?.available ? Number(deliveryQuote.delivery_fee ?? settings.delivery_fee ?? 0) : 0;
  const deliveryFee = subtotal >= freeFrom ? 0 : baseDeliveryFee;
  const total = subtotal + deliveryFee;
  const amountToFree = Math.max(0, freeFrom - subtotal);

  const hasDeliveryZones = useMemo(
    () => parseDeliveryZones(settings.delivery_zones).length > 0,
    [settings.delivery_zones],
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
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, selectedCategory, searchQuery]);

  const favoriteProducts = useMemo(
    () => products.filter((p) => favorites.includes(p.id)),
    [products, favorites],
  );

  function setQty(productId: number, qty: number) {
    setCartQty((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }

  function toggleFavorite(id: number) {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const runDeliveryQuote = useCallback(async (
    body: { address?: string; lat?: number; lng?: number },
    options?: { notify?: boolean; fillAddress?: boolean },
  ) => {
    const reqId = ++quoteRequestId.current;
    setDeliveryQuoteLoading(true);
    setDeliveryQuoteError(null);
    try {
      const quote = await fetchProrabDeliveryQuote({ ...body, cart_subtotal: subtotal });
      if (reqId !== quoteRequestId.current) return;
      setDeliveryQuote(quote);
      if (options?.fillAddress && quote.display_address) {
        setAddress(quote.display_address);
        localStorage.setItem(ADDR_KEY, quote.display_address);
      }
      if (!quote.available) {
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
  }, [subtotal]);

  const findByAddress = useCallback(() => {
    const target = address.trim();
    if (target.length < 5) {
      toast.info('Введите улицу и номер дома');
      return;
    }
    void runDeliveryQuote({ address: target }, { notify: true });
  }, [address, runDeliveryQuote]);

  const findByGps = useCallback(async () => {
    setDeliveryQuoteLoading(true);
    try {
      const coords = await requestCurrentPosition();
      await runDeliveryQuote({ lat: coords.lat, lng: coords.lng }, { notify: true, fillAddress: true });
    } catch (err) {
      setDeliveryQuoteLoading(false);
      if (err instanceof GeolocationError && err.code === 'denied') {
        toast.error('Разрешите доступ к геолокации');
      } else {
        toast.error('Не удалось получить GPS. Введите адрес вручную.');
      }
    }
  }, [runDeliveryQuote]);

  const applySavedAddress = useCallback((saved: SavedAddress, opts?: { auto?: boolean }) => {
    setAddress(saved.address);
    void runDeliveryQuote(
      saved.lat != null && saved.lng != null
        ? { address: saved.address, lat: saved.lat, lng: saved.lng }
        : { address: saved.address },
      { notify: !opts?.auto },
    );
  }, [runDeliveryQuote]);

  useEffect(() => {
    if (deliveryQuote?.lat && deliveryQuote?.lng && subtotal > 0) {
      void runDeliveryQuote({ lat: deliveryQuote.lat, lng: deliveryQuote.lng });
    }
  }, [subtotal]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitOrder() {
    if (!name.trim()) { toast.error('Укажите имя'); return; }
    if (phone.replace(/\D/g, '').length < 10) { toast.error('Укажите корректный телефон'); return; }
    if (!address.trim()) { toast.error('Укажите адрес доставки'); return; }
    if (cart.length === 0) { toast.error('Корзина пуста'); return; }
    if (hasDeliveryZones && (!deliveryQuote || !deliveryQuote.available)) {
      toast.error('Подтвердите адрес доставки');
      return;
    }

    setSubmitting(true);
    try {
      const items = cart.map((c) => ({
        id: c.product.id,
        name: c.product.name,
        qty: c.qty,
        price: c.product.price,
        sum: c.product.price * c.qty,
        weight: c.product.weight,
      }));
      const order = await createProrabOrder({
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_address: address.trim(),
        payment_method: payment,
        comment: comment.trim(),
        order_items: JSON.stringify(items),
        total_amount: total,
        delivery_lat: deliveryQuote?.lat,
        delivery_lng: deliveryQuote?.lng,
        delivery_zone_id: deliveryQuote?.zone_id,
        delivery_fee: deliveryFee,
      });
      setConfirmedOrder({ id: order.id, total });
      setCartQty({});
      setCheckoutOpen(false);
      setActiveTab('home');
      toast.success('Заказ оформлен! Оператор перезвонит вам.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка оформления заказа');
    } finally {
      setSubmitting(false);
    }
  }

  function ProductCard({ product, compact }: { product: ProrabProduct; compact?: boolean }) {
    const qty = cartQty[product.id] || 0;
    const fav = favorites.includes(product.id);
    return (
      <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col ${compact ? '' : 'hover:shadow-md transition-shadow'}`}>
        <div className="relative aspect-square bg-gray-100">
          {product.image_url ? (
            <img src={imgSrc(product.image_url)} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-amber-300"><Package className="h-12 w-12" /></div>
          )}
          <button
            type="button"
            onClick={() => toggleFavorite(product.id)}
            className={`absolute top-2 right-2 p-1.5 rounded-full ${fav ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400'}`}
          >
            <Heart className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} />
          </button>
          {product.is_popular && (
            <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">ХИТ</span>
          )}
        </div>
        <div className="p-3 flex flex-col flex-1 gap-1">
          <p className="font-semibold text-sm text-gray-900 line-clamp-2 leading-tight">{product.name}</p>
          {product.weight && <p className="text-xs text-gray-500">{product.weight}</p>}
          <p className="text-base font-bold text-amber-700 mt-auto">{formatMoney(product.price)}</p>
          {qty > 0 ? (
            <div className="flex items-center justify-between mt-2 bg-amber-50 rounded-xl p-1">
              <button type="button" onClick={() => setQty(product.id, qty - 1)} className="p-2 text-amber-700"><Minus className="h-4 w-4" /></button>
              <span className="font-bold text-amber-900">{qty}</span>
              <button type="button" onClick={() => setQty(product.id, qty + 1)} className="p-2 text-amber-700"><Plus className="h-4 w-4" /></button>
            </div>
          ) : (
            <Button size="sm" className="mt-2 w-full bg-amber-600 hover:bg-amber-700" onClick={() => setQty(product.id, 1)}>
              В корзину
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
        </div>
      </Layout>
    );
  }

  if (confirmedOrder) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
          <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Заказ №{confirmedOrder.id} принят!</h1>
          <p className="text-gray-600">
            Сумма: <strong>{formatMoney(confirmedOrder.total)}</strong>
          </p>
          <p className="text-gray-500 text-sm">
            {settings.operator_note || 'Оператор перезвонит вам для уточнения деталей и согласования доставки.'}
          </p>
          <div className="flex flex-col gap-3">
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setConfirmedOrder(null)}>
              Продолжить покупки
            </Button>
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-700">На главную</Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 pb-24">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link to="/" className="p-2 text-gray-500 hover:text-gray-700"><ArrowLeft className="h-5 w-5" /></Link>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="h-9 w-9 rounded-xl bg-amber-600 flex items-center justify-center shrink-0">
                <HardHat className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-gray-900 leading-tight truncate">{settings.store_name || 'PRORAB'}</p>
                <p className="text-[11px] text-gray-500 truncate">{settings.store_tagline}</p>
              </div>
            </div>
            <button type="button" onClick={() => setActiveTab('cart')} className="relative p-2 text-amber-700">
              <ShoppingCart className="h-6 w-6" />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-amber-600 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Checkout overlay */}
        {checkoutOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center">
            <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl max-h-[92vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
                <h2 className="font-bold text-lg">Оформление заказа</h2>
                <button type="button" onClick={() => setCheckoutOpen(false)}><X className="h-5 w-5" /></button>
              </div>
              <div className="p-4 space-y-4">
                <SavedAddressBar currentAddress={address} onSelect={applySavedAddress} accent="amber" />
                <DeliveryAddressPicker
                  address={address}
                  onAddressChange={setAddress}
                  hasDeliveryZones={hasDeliveryZones}
                  deliveryQuote={deliveryQuote}
                  loading={deliveryQuoteLoading}
                  error={deliveryQuoteError}
                  onFindByAddress={findByAddress}
                  onFindByGps={findByGps}
                  variant="full"
                />
                <div className="space-y-3">
                  <Input placeholder="Ваше имя *" value={name} onChange={(e) => setName(e.target.value)} />
                  <Input placeholder="Телефон *" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" />
                  <Textarea placeholder="Комментарий к заказу" value={comment} onChange={(e) => setComment(e.target.value)} rows={2} />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-2">Способ оплаты</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'kaspi_qr', 'halyk_qr'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPayment(m)}
                        className={`py-2 px-2 rounded-xl text-xs font-medium border-2 transition-colors ${
                          payment === m ? 'border-amber-600 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {PAYMENT_LABELS[m]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between"><span>Товары</span><span>{formatMoney(subtotal)}</span></div>
                  <div className="flex justify-between">
                    <span>Доставка</span>
                    <span className={deliveryFee === 0 ? 'text-green-600 font-semibold' : ''}>
                      {deliveryFee === 0 ? 'Бесплатно' : formatMoney(deliveryFee)}
                    </span>
                  </div>
                  {amountToFree > 0 && (
                    <p className="text-xs text-amber-700">Ещё {formatMoney(amountToFree)} до бесплатной доставки</p>
                  )}
                  <div className="flex justify-between font-bold text-base pt-2 border-t">
                    <span>Итого</span><span>{formatMoney(total)}</span>
                  </div>
                </div>
                <Button
                  className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-base font-semibold"
                  disabled={submitting}
                  onClick={() => void submitOrder()}
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Подтвердить заказ'}
                </Button>
                <p className="text-xs text-center text-gray-500">
                  После заказа оператор перезвонит для уточнения
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="max-w-6xl mx-auto px-4 py-4 space-y-6">
          {/* Hero — only on home */}
          {activeTab === 'home' && (
            <section className="relative rounded-3xl overflow-hidden shadow-lg min-h-[200px]">
              <img
                src={imgSrc(settings.hero_image_url || HERO_FALLBACK)}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
              <div className="relative p-6 sm:p-8 text-white">
                <div className="flex items-center gap-2 mb-3">
                  <HardHat className="h-6 w-6 text-amber-400" />
                  <span className="text-amber-400 font-bold tracking-wider text-sm">{settings.store_name}</span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold leading-tight mb-2">{settings.hero_title}</h1>
                <p className="text-white/80 text-sm mb-4">{settings.store_tagline}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 bg-amber-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                    <Truck className="h-3.5 w-3.5" />
                    Бесплатная доставка от {formatMoney(freeFrom)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs px-3 py-1.5 rounded-full">
                    <Clock className="h-3.5 w-3.5" />
                    {settings.delivery_time}
                  </span>
                  <span className="inline-flex items-center gap-1.5 bg-white/20 text-white text-xs px-3 py-1.5 rounded-full">
                    <MapPin className="h-3.5 w-3.5" />
                    Сортировка, Караганда
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Free delivery banner */}
          {(activeTab === 'home' || activeTab === 'catalog') && (
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl p-4 flex items-center gap-3">
              <Truck className="h-8 w-8 shrink-0 opacity-90" />
              <div>
                <p className="font-bold">Доставка стройматериалов по Сортировке</p>
                <p className="text-sm text-white/90">
                  {amountToFree > 0 && cartCount > 0
                    ? `Добавьте ещё ${formatMoney(amountToFree)} — и доставка бесплатно!`
                    : `Бесплатная доставка при заказе от ${formatMoney(freeFrom)}`}
                </p>
              </div>
            </div>
          )}

          {/* Search */}
          {(activeTab === 'home' || activeTab === 'catalog') && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Поиск: цемент, кирпич, доска..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-xl border-gray-200"
              />
            </div>
          )}

          {/* Home tab */}
          {activeTab === 'home' && (
            <>
              {categories.length > 0 && (
                <section>
                  <h2 className="font-bold text-gray-900 mb-3">Категории</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => { setSelectedCategory(cat.id); setActiveTab('catalog'); }}
                        className="relative rounded-2xl overflow-hidden aspect-[4/3] group"
                      >
                        <img src={imgSrc(cat.image_url)} alt={cat.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform" loading="lazy" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        <span className="absolute bottom-3 left-3 right-3 text-white font-semibold text-sm text-left">{cat.name}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {popularProducts.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-gray-900">Популярные товары</h2>
                    <button type="button" className="text-amber-600 text-sm font-medium" onClick={() => setActiveTab('catalog')}>
                      Весь каталог →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {popularProducts.map((p) => <ProductCard key={p.id} product={p} />)}
                  </div>
                </section>
              )}
              {settings.store_phone && (
                <a href={`tel:${settings.store_phone}`} className="flex items-center gap-3 bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Позвонить в магазин</p>
                    <p className="text-amber-700 font-medium">{settings.store_phone}</p>
                  </div>
                </a>
              )}
            </>
          )}

          {/* Catalog tab */}
          {activeTab === 'catalog' && (
            <section className="space-y-4">
              <CatalogCategoryStrip
                categories={categories}
                selectedId={selectedCategory}
                onSelectAll={() => setSelectedCategory(null)}
                onSelectCategory={(id) => setSelectedCategory(id)}
              />
              <div className="hidden lg:flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${selectedCategory === null ? 'bg-amber-600 text-white' : 'bg-white border text-gray-700'}`}
                >
                  Все
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${selectedCategory === cat.id ? 'bg-amber-600 text-white' : 'bg-white border text-gray-700'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredProducts.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
              {filteredProducts.length === 0 && (
                <p className="text-center text-gray-500 py-12">Товары не найдены</p>
              )}
            </section>
          )}

          {/* Cart tab */}
          {activeTab === 'cart' && (
            <section className="space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <ShoppingCart className="h-16 w-16 text-gray-300 mx-auto" />
                  <p className="text-gray-500">Корзина пуста</p>
                  <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => setActiveTab('catalog')}>
                    Перейти в каталог
                  </Button>
                </div>
              ) : (
                <>
                  {cart.map(({ product, qty }) => (
                    <div key={product.id} className="flex gap-3 bg-white rounded-2xl p-3 border border-gray-100">
                      <img src={imgSrc(product.image_url)} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{product.name}</p>
                        <p className="text-amber-700 font-bold">{formatMoney(product.price)}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <button type="button" onClick={() => setQty(product.id, qty - 1)} className="p-1 rounded-lg bg-gray-100"><Minus className="h-4 w-4" /></button>
                          <span className="font-bold">{qty}</span>
                          <button type="button" onClick={() => setQty(product.id, qty + 1)} className="p-1 rounded-lg bg-gray-100"><Plus className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900 shrink-0">{formatMoney(product.price * qty)}</p>
                    </div>
                  ))}
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-2">
                    <div className="flex justify-between text-sm"><span>Товары</span><span>{formatMoney(subtotal)}</span></div>
                    <div className="flex justify-between text-sm">
                      <span>Доставка</span>
                      <span className={deliveryFee === 0 && subtotal >= freeFrom ? 'text-green-600' : ''}>
                        {subtotal >= freeFrom ? 'Бесплатно' : hasDeliveryZones ? 'по адресу' : formatMoney(Number(settings.delivery_fee || 0))}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-lg pt-2 border-t">
                      <span>Итого</span><span>{formatMoney(total)}</span>
                    </div>
                  </div>
                  <Button className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-base font-semibold" onClick={() => setCheckoutOpen(true)}>
                    Оформить заказ
                  </Button>
                </>
              )}
            </section>
          )}

          {/* Favorites */}
          {activeTab === 'favorites' && (
            <section>
              {favoriteProducts.length === 0 ? (
                <p className="text-center text-gray-500 py-16">Нет избранных товаров</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {favoriteProducts.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-lg safe-area-pb">
          <div className="max-w-6xl mx-auto flex">
            {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors ${
                  activeTab === id ? 'text-amber-600' : 'text-gray-400'
                }`}
              >
                <div className="relative">
                  <Icon className="h-5 w-5" />
                  {id === 'cart' && cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 bg-amber-600 text-white text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                      {cartCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </Layout>
  );
}
