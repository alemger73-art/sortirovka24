import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/Layout';
import { resolveImageSrc } from '@/lib/storage';
import { getAccountPrefill } from '@/lib/localAuth';
import {
  fetchGastronomCatalog,
  createGastronomOrder,
  type GastronomCategory,
  type GastronomProduct,
  type GastronomSettings,
} from '@/lib/gastronomApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Menu, Search, ShoppingCart, MapPin, Clock, ChevronDown, Plus, Minus, X,
  Home, LayoutGrid, Heart, User, Truck, ShieldCheck, CreditCard, CheckCircle2,
  Leaf, Zap,
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

function imgSrc(url: string) {
  if (!url) return '';
  return resolveImageSrc(url) || url;
}

const CART_KEY = 'gastronom_cart_qty';
const FAV_KEY = 'gastronom_favorites';
const AGE_KEY = 'gastronom_age_21';

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
  const [orderDone, setOrderDone] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addressEditing, setAddressEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(isAgeConfirmed);
  const pendingAgeAction = useRef<(() => void) | null>(null);

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

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGastronomCatalog();
      setCategories(data.categories || []);
      setProducts(data.products || []);
      setSettings((prev) => ({ ...prev, ...(data.settings || {}) }));
      if (data.settings?.default_address) {
        setAddress((a) => a || data.settings.default_address);
      }
    } catch (e) {
      console.error(e);
      toast.error('Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cartQty));
  }, [cartQty]);

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
  const minOrder = Number(settings.min_order || 0);

  const hasAlcoholInCart = useMemo(
    () => cart.some((c) => isProductAlcohol(c.product)),
    [cart, isProductAlcohol]
  );

  const favoriteProducts = useMemo(
    () => products.filter((p) => favorites.includes(p.id)),
    [products, favorites]
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
  }, [products, selectedCategory, searchQuery]);

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
      await createGastronomOrder({
        customer_name: name.trim(),
        customer_phone: phone.trim(),
        customer_address: address.trim(),
        payment_method: payment,
        comment: comment.trim(),
        order_items: JSON.stringify(items),
        total_amount: subtotal,
      });
      setCartQty({});
      setCheckoutOpen(false);
      setOrderDone(true);
      toast.success('Заказ оформлен! Мы свяжемся с вами.');
    } catch (e) {
      console.error(e);
      toast.error('Не удалось оформить заказ');
    } finally {
      setSubmitting(false);
    }
  }

  async function checkout() {
    if (!name.trim() || !phone.trim() || !address.trim()) {
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
        <div className="relative aspect-[4/3] bg-gray-50">
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
            onClick={() => toggleFavorite(product.id)}
            className="absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow"
            aria-label="Избранное"
          >
            <Heart className={`h-4 w-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
          </button>
          <button
            type="button"
            onClick={() => addProduct(product)}
            className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition-all"
          >
            <Plus className="h-5 w-5" />
          </button>
          {inCart > 0 && (
            <span className="absolute top-2 right-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
              {inCart}
            </span>
          )}
        </div>
        <div className="p-3">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{product.name}</h3>
          {product.weight && <p className="text-xs text-gray-400 mt-0.5">{product.weight}</p>}
          <p className="mt-1.5 font-bold text-emerald-700">{formatMoney(product.price)}</p>
        </div>
      </div>
    );
  }

  if (orderDone) {
    return (
      <Layout hideHeader>
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 pb-24">
          <div className="max-w-sm w-full bg-white rounded-3xl p-8 shadow-lg text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900 mb-2">Заказ принят!</h1>
            <p className="text-gray-500 text-sm mb-6">
              Спасибо за заказ в ГАСТРОНОМ. Мы уже получили его и скоро свяжемся с вами.
            </p>
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => { setOrderDone(false); setActiveTab('home'); }}
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
      <div className="min-h-screen bg-white pb-20 max-w-lg mx-auto relative">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100">
          <div className="flex items-center justify-between px-4 py-3">
            <Link to="/" className="p-2 -ml-2 text-gray-600" aria-label="На портал">
              <Menu className="h-5 w-5" />
            </Link>
            <div className="text-center flex-1">
              {settings.logo_url ? (
                <img
                  src={imgSrc(settings.logo_url)}
                  alt={settings.store_name || 'ГАСТРОНОМ'}
                  className="h-10 mx-auto object-contain"
                />
              ) : (
                <div className="flex items-center justify-center gap-1">
                  <Leaf className="h-4 w-4 text-emerald-600" />
                  <h1 className="text-lg font-serif font-bold text-emerald-700 tracking-wide">
                    {settings.store_name || 'ГАСТРОНОМ'}
                  </h1>
                </div>
              )}
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">
                {settings.store_tagline || 'доставка продуктов питания'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" className="p-2 text-gray-600" aria-label="Поиск" onClick={openSearch}>
                <Search className="h-5 w-5" />
              </button>
              <button
                type="button"
                className="relative p-2 text-gray-600"
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

          <button
            type="button"
            className="flex items-center justify-between w-full px-4 py-2 bg-gray-50 text-sm"
            onClick={() => setAddressEditing((v) => !v)}
          >
            <div className="flex items-center gap-1.5 text-gray-700 min-w-0">
              <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
              <span className="truncate font-medium">{address || settings.default_address}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            </div>
            <div className="flex items-center gap-1 text-gray-500 shrink-0 ml-2">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs">{settings.delivery_time}</span>
            </div>
          </button>

          {(searchOpen || searchQuery) && (
            <div className="px-4 pb-3 bg-gray-50">
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
            <div className="px-4 pb-3 bg-gray-50">
              <Input
                autoFocus
                placeholder="Адрес доставки"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="rounded-xl bg-white"
              />
            </div>
          )}
        </header>

        {loading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 px-4">
            <p className="text-gray-500 mb-4">Каталог пока пуст</p>
            <Button onClick={() => void loadCatalog()} className="bg-emerald-600 hover:bg-emerald-700">
              Обновить
            </Button>
          </div>
        ) : (
          <>
            {/* HOME tab */}
            {activeTab === 'home' && (
              <div className="space-y-5 pb-4">
                {/* Hero banner */}
                <div className="mx-4 mt-4 relative overflow-hidden rounded-2xl">
                  <img src={imgSrc(heroImage)} alt="" className="w-full h-48 object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                  <div className="absolute inset-0 p-5 flex flex-col justify-end">
                    <span className="absolute top-3 right-3 bg-white/20 backdrop-blur text-white text-xs px-2 py-0.5 rounded-full">
                      21+
                    </span>
                    <h2 className="text-white font-bold text-lg leading-tight mb-3">
                      {settings.hero_title}
                    </h2>
                    <div className="flex gap-3 mb-3">
                      {[
                        { icon: Leaf, label: 'Свежие продукты' },
                        { icon: Zap, label: 'Быстрая доставка' },
                        { icon: ShieldCheck, label: 'Гарантия качества' },
                      ].map(({ icon: Icon, label }) => (
                        <div key={label} className="flex flex-col items-center gap-0.5">
                          <Icon className="h-4 w-4 text-emerald-300" />
                          <span className="text-[9px] text-white/80 text-center leading-tight">{label}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="w-full py-2.5 rounded-full bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors"
                    >
                      Сделать заказ
                    </button>
                  </div>
                </div>

                {/* Categories scroll */}
                <div>
                  <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => selectCategory(cat.id, !!cat.is_alcohol)}
                        className="flex flex-col items-center shrink-0 w-20"
                      >
                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-100 mb-1.5 ring-2 ring-transparent hover:ring-emerald-200 transition-all">
                          {cat.image_url ? (
                            <img src={imgSrc(cat.image_url)} alt={cat.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">🥗</div>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-600 text-center leading-tight line-clamp-2">
                          {cat.name}
                          {cat.is_alcohol && <span className="text-amber-600"> 21+</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Popular products */}
                <div className="px-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-bold text-gray-900">Популярные товары</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('catalog')}
                      className="text-emerald-600 text-sm font-medium flex items-center gap-0.5"
                    >
                      Смотреть все →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(popularProducts.length > 0 ? popularProducts : products.slice(0, 4)).map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                </div>

                {/* Alcohol banner */}
                <div className="mx-4 relative overflow-hidden rounded-2xl bg-emerald-900">
                  <img src={imgSrc(alcoholBannerImage)} alt="" className="absolute right-0 top-0 h-full w-1/2 object-cover opacity-60" />
                  <div className="relative p-5 max-w-[60%]">
                    <p className="text-white/60 text-xs mb-1">21+</p>
                    <h3 className="text-white font-bold text-sm mb-1">Алкогольная продукция (21+)</h3>
                    <p className="text-white/70 text-xs mb-3">Широкий выбор напитков с доставкой на дом</p>
                    <button
                      type="button"
                      onClick={openAlcoholCatalog}
                      className="px-4 py-1.5 rounded-full border border-white/40 text-white text-xs hover:bg-white/10"
                    >
                      Смотреть каталог
                    </button>
                  </div>
                </div>

                {/* Features */}
                <div className="mx-4 grid grid-cols-3 gap-2 py-3 border-t border-gray-100">
                  {[
                    { icon: Truck, title: 'Быстрая доставка', desc: 'от 30 минут' },
                    { icon: ShieldCheck, title: 'Гарантия качества', desc: 'только свежие продукты' },
                    { icon: CreditCard, title: 'Удобная оплата', desc: 'онлайн и при получении' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div key={title} className="text-center px-1">
                      <Icon className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                      <p className="text-[10px] font-semibold text-gray-800 leading-tight">{title}</p>
                      <p className="text-[9px] text-gray-400 leading-tight mt-0.5">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CATALOG tab */}
            {activeTab === 'catalog' && (
              <div className="px-4 py-4 space-y-4">
                <Input
                  placeholder="Поиск товаров..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(null)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      !selectedCategory ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Все
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => selectCategory(cat.id, !!cat.is_alcohol)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        selectedCategory === cat.id ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {cat.name}{cat.is_alcohol ? ' 21+' : ''}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {filteredProducts.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                {filteredProducts.length === 0 && (
                  <p className="text-center text-gray-400 py-8">Товары не найдены</p>
                )}
              </div>
            )}

            {/* CART tab */}
            {activeTab === 'cart' && (
              <div className="px-4 py-4">
                {cart.length === 0 ? (
                  <div className="text-center py-16">
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
                  <div className="space-y-4">
                    {cart.map(({ product, qty }) => (
                      <div key={product.id} className="flex gap-3 bg-gray-50 rounded-2xl p-3">
                        <div className="w-16 h-16 rounded-xl overflow-hidden bg-white shrink-0">
                          {product.image_url && (
                            <img src={imgSrc(product.image_url)} alt="" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{product.name}</p>
                          {product.weight && <p className="text-xs text-gray-400">{product.weight}</p>}
                          <p className="font-bold text-emerald-700 mt-0.5">{formatMoney(product.price)}</p>
                        </div>
                        <div className="flex flex-col items-end justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => changeQty(product.id, -1)}
                              className="h-7 w-7 rounded-full bg-white border flex items-center justify-center"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-sm font-semibold w-4 text-center">{qty}</span>
                            <button
                              type="button"
                              onClick={() => changeQty(product.id, 1)}
                              className="h-7 w-7 rounded-full bg-emerald-600 text-white flex items-center justify-center"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-sm font-bold">{formatMoney(qty * product.price)}</p>
                        </div>
                      </div>
                    ))}
                    <div className="border-t pt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Итого</span>
                        <span className="font-bold text-lg">{formatMoney(subtotal)}</span>
                      </div>
                      {minOrder > 0 && subtotal < minOrder && (
                        <p className="text-xs text-amber-600">
                          Минимальный заказ: {formatMoney(minOrder)}
                        </p>
                      )}
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 rounded-xl text-base"
                        disabled={subtotal < minOrder}
                        onClick={openCheckout}
                      >
                        Оформить заказ
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'favorites' && (
              <div className="px-4 py-4">
                {favoriteProducts.length === 0 ? (
                  <div className="text-center py-16">
                    <Heart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Нажмите ♥ на товаре, чтобы добавить в избранное</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {favoriteProducts.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Profile */}
            {activeTab === 'profile' && (
              <div className="text-center py-16 px-4 space-y-4">
                <User className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Войдите в аккаунт портала</p>
                <Link to="/account">
                  <Button variant="outline" className="rounded-xl">Войти</Button>
                </Link>
                <div>
                  <Link to="/" className="text-sm text-emerald-600 hover:underline">
                    ← На главную Сортировка24
                  </Link>
                </div>
              </div>
            )}
          </>
        )}

        {/* Checkout modal */}
        {checkoutOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
            <div className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-bold text-lg">Оформление заказа</h2>
                <button type="button" onClick={() => setCheckoutOpen(false)}>
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>
              <div className="p-4 space-y-4">
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
                <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
                  {cart.map(({ product, qty }) => (
                    <div key={product.id} className="flex justify-between">
                      <span className="text-gray-600 truncate mr-2">{product.name} ×{qty}</span>
                      <span className="font-medium shrink-0">{formatMoney(qty * product.price)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold pt-2 border-t">
                    <span>Итого</span>
                    <span className="text-emerald-700">{formatMoney(subtotal)}</span>
                  </div>
                </div>
                {hasAlcoholInCart && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    В заказе есть алкоголь (21+). При получении потребуется документ.
                  </p>
                )}
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 h-12 rounded-xl"
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

        {/* Bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 max-w-lg mx-auto">
          <div className="flex">
            {([
              ['home', Home, 'Главная'],
              ['catalog', LayoutGrid, 'Каталог'],
              ['cart', ShoppingCart, 'Корзина'],
              ['favorites', Heart, 'Избранное'],
              ['profile', User, 'Профиль'],
            ] as const).map(([tab, Icon, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 relative transition-colors ${
                  activeTab === tab ? 'text-emerald-600' : 'text-gray-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                {tab === 'cart' && cartCount > 0 && (
                  <span className="absolute top-1.5 right-[calc(50%-14px)] flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[9px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
                <span className="text-[10px] font-medium">{label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </Layout>
  );
}
