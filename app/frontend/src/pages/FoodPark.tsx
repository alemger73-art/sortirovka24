import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/Layout';
import { client, withRetry } from '@/lib/api';
import { resolveImageSrc } from '@/lib/storage';
import {
  ShoppingCart, Plus, Minus, X, MapPin, Phone, MessageSquare,
  Check, TreePine, Navigation, ChevronRight, ArrowLeft,
  Utensils, Clock, Loader2, Search, AlertCircle, Flame
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import ParkMap from '@/components/ParkMap';
import type { ParkPoint } from '@/components/ParkMap';

/* ─── Types ─── */
interface FoodCategory { id: number; name: string; icon: string; sort_order: number; is_active: boolean; }
interface FoodItem { id: number; category_id: number; name: string; description: string; price: number; image_url: string; is_active: boolean; is_recommended: boolean; weight: string; sort_order: number; available_in_park: boolean; }
interface CartItem { item: FoodItem; quantity: number; }

const FALLBACK_IMAGES = [
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png',
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png',
];

/* ─── Order status labels ─── */
const ORDER_STATUSES: Record<string, { label: string; color: string; emoji: string }> = {
  new: { label: 'Новый', color: 'bg-yellow-100 text-yellow-800', emoji: '🆕' },
  confirmed: { label: 'Подтверждён', color: 'bg-blue-100 text-blue-800', emoji: '✅' },
  preparing: { label: 'Готовится', color: 'bg-orange-100 text-orange-800', emoji: '👨‍🍳' },
  courier_assigned: { label: 'Курьер назначен', color: 'bg-purple-100 text-purple-800', emoji: '🏃' },
  on_the_way: { label: 'В пути', color: 'bg-indigo-100 text-indigo-800', emoji: '🚴' },
  delivered: { label: 'Доставлен', color: 'bg-green-100 text-green-800', emoji: '🎉' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-800', emoji: '❌' },
};

type ViewState = 'menu' | 'map' | 'cart' | 'checkout' | 'tracking';

export default function FoodPark() {
  const [parkPoints, setParkPoints] = useState<ParkPoint[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [items, setItems] = useState<FoodItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>('menu');
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);

  // Selected point
  const [selectedPoint, setSelectedPoint] = useState<ParkPoint | null>(null);

  // Checkout
  const [customerPhone, setCustomerPhone] = useState('');
  const [parkNote, setParkNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Tracking
  const [trackingOrderId, setTrackingOrderId] = useState<number | null>(null);
  const [trackingOrder, setTrackingOrder] = useState<any>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // User geolocation (optional helper)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'granted' | 'denied' | 'unavailable'>('idle');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        withRetry(() => client.entities.park_points.query({ sort: 'sort_order', limit: 50 })),
        withRetry(() => client.entities.food_categories.query({ sort: 'sort_order', limit: 50 })),
        withRetry(() => client.entities.food_items.query({ sort: 'sort_order', limit: 200 })),
      ]);
      const extract = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value?.data?.items || []) : [];
      setParkPoints(extract(results[0]).filter((p: ParkPoint) => p.is_active));
      setCategories(extract(results[1]).filter((c: FoodCategory) => c.is_active));
      const allItems = extract(results[2]).filter((i: FoodItem) => i.is_active);
      const parkItems = allItems.filter((i: FoodItem) => i.available_in_park);
      setItems(parkItems.length > 0 ? parkItems : allItems);
    } catch (e) {
      console.error('Error loading park data:', e);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    let result = activeCategory === null ? items : items.filter(i => i.category_id === activeCategory);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q));
    }
    return result;
  }, [items, activeCategory, searchQuery]);

  const cartTotal = useMemo(() => cart.reduce((sum, ci) => sum + ci.item.price * ci.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, ci) => sum + ci.quantity, 0), [cart]);

  function addToCart(item: FoodItem) {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === item.id);
      if (existing) return prev.map(ci => ci.item.id === item.id ? { ...ci, quantity: ci.quantity + 1 } : ci);
      return [...prev, { item, quantity: 1 }];
    });
    toast.success(
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Check className="w-3.5 h-3.5 text-green-600" />
        </div>
        <span className="text-sm font-medium">{item.name} добавлен</span>
      </div>,
      { duration: 1200 }
    );
  }

  function removeFromCart(itemId: number) {
    setCart(prev => {
      const existing = prev.find(ci => ci.item.id === itemId);
      if (!existing) return prev;
      if (existing.quantity > 1) return prev.map(ci => ci.item.id === itemId ? { ...ci, quantity: ci.quantity - 1 } : ci);
      return prev.filter(ci => ci.item.id !== itemId);
    });
  }

  function getItemQty(itemId: number) {
    return cart.find(ci => ci.item.id === itemId)?.quantity || 0;
  }

  function formatPrice(price: number) { return price.toLocaleString('ru-RU') + ' ₸'; }
  function getFallbackImage(id: number) { return FALLBACK_IMAGES[id % FALLBACK_IMAGES.length]; }
  /** Resolve image_url (objectKey or URL) to a displayable src, with fallback */
  function getItemImage(item: { id: number; image_url: string }): string {
    const resolved = resolveImageSrc(item.image_url);
    return resolved || getFallbackImage(item.id);
  }

  /* ─── Geolocation (optional helper) ─── */
  function requestGeolocation() {
    if (!navigator.geolocation) {
      setGeoStatus('unavailable');
      toast.error('Геолокация не поддерживается вашим браузером');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setGeoStatus('granted');

        // Find nearest point and suggest it
        if (parkPoints.length > 0) {
          let nearest = parkPoints[0];
          let minDist = Infinity;
          for (const p of parkPoints) {
            const d = Math.sqrt((p.lat - loc.lat) ** 2 + (p.lng - loc.lng) ** 2);
            if (d < minDist) { minDist = d; nearest = p; }
          }
          setSelectedPoint(nearest);
          toast.success(`📍 Ближайшая точка: ${nearest.name}`);
        } else {
          toast.success('📍 Местоположение определено!');
        }
      },
      () => {
        setGeoStatus('denied');
        toast.info('Выберите точку доставки на карте парка');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function selectPoint(point: ParkPoint) {
    setSelectedPoint(point);
  }

  async function submitOrder() {
    if (!selectedPoint) { toast.error('Выберите точку доставки на карте'); return; }
    if (!customerPhone.trim()) { toast.error('Укажите номер телефона'); return; }
    if (!parkNote.trim()) { toast.error('Укажите ориентир — как вас найти'); return; }
    if (cart.length === 0) { toast.error('Корзина пуста'); return; }

    setSubmitting(true);
    try {
      const orderItems = cart.map(ci => ({
        name: ci.item.name, price: ci.item.price, quantity: ci.quantity,
      }));
      const geoData: Record<string, any> = {};
      if (userLocation) geoData.user_location = userLocation;

      const result = await withRetry(() => client.entities.park_orders.create({
        data: {
          order_items: JSON.stringify(orderItems),
          total_amount: cartTotal,
          customer_phone: customerPhone.trim(),
          park_point_id: selectedPoint.id,
          park_point_name: selectedPoint.name,
          park_lat: selectedPoint.lat,
          park_lng: selectedPoint.lng,
          park_note: parkNote.trim(),
          user_geolocation: JSON.stringify(geoData),
          status: 'new',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      }));

      const orderId = result?.data?.id;
      toast.success(`Заказ #${orderId || ''} оформлен!`);
      setTrackingOrderId(orderId || null);
      setTrackingOrder({
        id: orderId,
        status: 'new',
        park_point_name: selectedPoint.name,
        park_point_id: selectedPoint.id,
        park_lat: selectedPoint.lat,
        park_lng: selectedPoint.lng,
        total_amount: cartTotal,
        order_items: JSON.stringify(orderItems),
        park_note: parkNote,
        customer_phone: customerPhone,
        created_at: new Date().toISOString(),
      });
      setCart([]);
      setView('tracking');
    } catch (e) {
      console.error('Error creating park order:', e);
      toast.error('Ошибка при оформлении заказа');
    } finally {
      setSubmitting(false);
    }
  }

  async function refreshTracking() {
    if (!trackingOrderId) return;
    setTrackingLoading(true);
    try {
      const result = await withRetry(() => client.entities.park_orders.get({ id: String(trackingOrderId) }));
      if (result?.data) setTrackingOrder(result.data);
    } catch (e) {
      console.error('Error fetching order:', e);
    } finally {
      setTrackingLoading(false);
    }
  }

  /* ─── LOADING ─── */
  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh] bg-[#f5f5f5]">
          <div className="text-center">
            <div className="relative w-16 h-16 mx-auto mb-4">
              <div className="absolute inset-0 border-4 border-green-100 rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-green-500 rounded-full animate-spin" />
              <TreePine className="absolute inset-0 m-auto w-6 h-6 text-green-500" />
            </div>
            <p className="text-gray-500 font-medium">Загрузка парка...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="bg-[#f5f5f5] min-h-screen">
        {/* ═══ HERO ═══ */}
        <section className="relative bg-gradient-to-br from-green-600 via-green-500 to-emerald-500 overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 left-10 text-8xl">🌳</div>
            <div className="absolute top-5 right-20 text-6xl">🌲</div>
            <div className="absolute bottom-5 left-1/3 text-7xl">🌿</div>
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-8 md:py-12">
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                <TreePine className="w-3 h-3" /> Парк Железнодорожников
              </span>
              <span className="bg-white/20 backdrop-blur-sm text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                <Clock className="w-3 h-3" /> 20-40 мин
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
              Доставка в парк 🌳
            </h1>
            <p className="text-white/80 text-base mt-2">
              Закажите еду прямо к вашей скамейке! Выберите точку на карте парка.
            </p>
          </div>
        </section>

        {/* ═══ STEP INDICATOR ═══ */}
        <div className="max-w-7xl mx-auto px-4 -mt-4 relative z-10">
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between text-xs font-medium">
              {[
                { step: 1, label: 'Меню', view: 'menu' as ViewState, icon: '🍽' },
                { step: 2, label: 'Точка', view: 'map' as ViewState, icon: '📍' },
                { step: 3, label: 'Заказ', view: 'checkout' as ViewState, icon: '📝' },
              ].map((s, i) => {
                const isActive = view === s.view || (view === 'cart' && s.view === 'menu');
                const isDone = (s.view === 'menu' && cart.length > 0 && (view === 'map' || view === 'checkout' || view === 'tracking'))
                  || (s.view === 'map' && selectedPoint && (view === 'checkout' || view === 'tracking'));
                return (
                  <div key={s.step} className="flex items-center gap-2 flex-1">
                    <button
                      onClick={() => { if (view !== 'tracking') setView(s.view); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all w-full justify-center ${
                        isActive ? 'bg-green-50 text-green-700 font-bold' :
                        isDone ? 'bg-green-500 text-white' : 'text-gray-400'
                      }`}
                    >
                      <span className="text-base">{isDone ? '✅' : s.icon}</span>
                      <span className="hidden sm:inline">{s.label}</span>
                    </button>
                    {i < 2 && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 pt-5 pb-32">
          {/* ═══ MENU VIEW ═══ */}
          {(view === 'menu' || view === 'cart') && (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Поиск блюд..."
                  className="w-full pl-12 pr-4 py-3 bg-white rounded-2xl border-0 shadow-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center">
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>

              {/* Categories */}
              <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide -mx-4 px-4">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                    activeCategory === null ? 'bg-green-600 text-white shadow-lg' : 'bg-white text-gray-600 shadow-sm'
                  }`}
                >
                  🍽 Все
                </button>
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                      activeCategory === cat.id ? 'bg-green-600 text-white shadow-lg' : 'bg-white text-gray-600 shadow-sm'
                    }`}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>

              {/* Items Grid */}
              {filteredItems.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredItems.map(item => {
                    const qty = getItemQty(item.id);
                    return (
                      <div key={item.id} className="bg-white rounded-2xl shadow-sm overflow-hidden hover:shadow-md transition-all group">
                        <div className="h-[120px] sm:h-[140px] bg-gray-100 relative overflow-hidden">
                          <img src={getItemImage(item)} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                          {item.is_recommended && (
                            <span className="absolute top-2 left-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              <Flame className="w-2.5 h-2.5" /> Хит
                            </span>
                          )}
                        </div>
                        <div className="p-3">
                          <h3 className="font-bold text-gray-900 text-sm leading-tight line-clamp-1">{item.name}</h3>
                          {item.weight && <p className="text-[10px] text-gray-400 mt-0.5">{item.weight}</p>}
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-sm font-extrabold text-gray-900">{formatPrice(item.price)}</span>
                            {qty > 0 ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center active:scale-90">
                                  <Minus className="w-3 h-3 text-gray-600" />
                                </button>
                                <span className="w-5 text-center text-xs font-bold">{qty}</span>
                                <button onClick={() => addToCart(item)} className="w-7 h-7 bg-green-500 text-white rounded-lg flex items-center justify-center active:scale-90">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(item)} className="w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-xl flex items-center justify-center shadow-md active:scale-90">
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-8 text-center">
                  <Utensils className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Блюда не найдены</p>
                </div>
              )}
            </>
          )}

          {/* ═══ MAP VIEW ═══ */}
          {view === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">📍 Выберите точку доставки</h2>
                <button
                  onClick={() => setView('menu')}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                >
                  <ArrowLeft className="w-4 h-4" /> Назад
                </button>
              </div>

              <p className="text-sm text-gray-500">
                Нажмите на точку на карте парка, куда доставить заказ
              </p>

              {/* ═══ INTERACTIVE PARK MAP ═══ */}
              <div className="bg-white rounded-2xl shadow-lg p-3 border-2 border-green-100">
                <ParkMap
                  points={parkPoints}
                  selectedId={selectedPoint?.id ?? null}
                  onSelect={selectPoint}
                  userLocation={userLocation}
                />
              </div>

              {/* Geolocation — optional helper */}
              <div className="bg-white rounded-2xl p-3 shadow-sm">
                {geoStatus === 'idle' && (
                  <button
                    onClick={requestGeolocation}
                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-blue-50 transition-colors text-left"
                  >
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Navigation className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">Определить моё местоположение</p>
                      <p className="text-[11px] text-gray-400">Подскажем ближайшую точку доставки</p>
                    </div>
                  </button>
                )}
                {geoStatus === 'loading' && (
                  <div className="flex items-center gap-3 p-2">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    </div>
                    <p className="text-sm text-blue-700 font-medium">Определяем местоположение...</p>
                  </div>
                )}
                {geoStatus === 'granted' && userLocation && (
                  <div className="flex items-center gap-3 p-2">
                    <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-green-700 font-medium">📍 Местоположение определено</p>
                      <p className="text-[11px] text-green-500">Ваша точка показана на карте</p>
                    </div>
                    <button onClick={requestGeolocation} className="text-green-600 text-xs font-medium hover:underline">
                      Обновить
                    </button>
                  </div>
                )}
                {(geoStatus === 'denied' || geoStatus === 'unavailable') && (
                  <div className="flex items-center gap-3 p-2">
                    <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-amber-700 font-medium">Выберите точку на карте вручную</p>
                    </div>
                    <button onClick={requestGeolocation} className="text-amber-600 text-xs font-medium hover:underline">
                      Повторить
                    </button>
                  </div>
                )}
              </div>

              {/* Points list (quick select) */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Точки доставки</p>
                {parkPoints.map(point => (
                  <button
                    key={point.id}
                    onClick={() => selectPoint(point)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all text-left ${
                      selectedPoint?.id === point.id
                        ? 'bg-green-50 border-2 border-green-500 shadow-sm'
                        : 'bg-white border-2 border-transparent hover:bg-gray-50 shadow-sm'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      selectedPoint?.id === point.id ? 'bg-green-500 text-white' : 'bg-green-50 text-green-600'
                    }`}>
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm ${selectedPoint?.id === point.id ? 'text-green-700' : 'text-gray-900'}`}>{point.name}</p>
                      {point.description && <p className="text-xs text-gray-400 line-clamp-1">{point.description}</p>}
                    </div>
                    {selectedPoint?.id === point.id && (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {selectedPoint && (
                <Button
                  onClick={() => setView('checkout')}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-13 text-base font-bold rounded-2xl shadow-lg"
                >
                  Далее — оформить заказ
                </Button>
              )}
            </div>
          )}

          {/* ═══ CHECKOUT VIEW ═══ */}
          {view === 'checkout' && (
            <div className="space-y-4">
              <button onClick={() => setView('map')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-4 h-4" /> Назад к карте
              </button>

              {/* Selected point */}
              {selectedPoint && (
                <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center text-white flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-bold text-green-800 text-sm">{selectedPoint.name}</p>
                    <p className="text-xs text-green-600">{selectedPoint.description}</p>
                  </div>
                  <button onClick={() => setView('map')} className="ml-auto text-green-600 text-xs font-medium hover:underline">Изменить</button>
                </div>
              )}

              {/* Contact & note */}
              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
                <h3 className="font-bold text-gray-800 text-sm">Контактные данные</h3>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Телефон *</label>
                  <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+7 (___) ___-__-__" className="rounded-xl h-11" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" /> Как вас найти? *
                  </label>
                  <Textarea
                    value={parkNote}
                    onChange={e => setParkNote(e.target.value)}
                    placeholder="Например: у второй лавочки справа, рядом с фонтаном, в белой кепке"
                    className="rounded-xl resize-none"
                    rows={3}
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Обязательно опишите, где именно вы находитесь — курьер найдёт вас по этому ориентиру
                  </p>
                </div>
              </div>

              {/* Mini park map preview */}
              {selectedPoint && (
                <div className="bg-white rounded-2xl p-3 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Точка на карте</p>
                  <ParkMap
                    points={parkPoints}
                    selectedId={selectedPoint.id}
                    readOnly
                    className="opacity-80"
                  />
                </div>
              )}

              {/* Order summary */}
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <h3 className="font-bold text-gray-800 text-sm mb-3">Ваш заказ</h3>
                <div className="space-y-2">
                  {cart.map(ci => (
                    <div key={ci.item.id} className="flex justify-between items-center">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-sm text-gray-700">{ci.item.name}</span>
                        <span className="text-xs text-gray-400">×{ci.quantity}</span>
                      </div>
                      <span className="font-bold text-sm text-gray-900 ml-2">{formatPrice(ci.item.price * ci.quantity)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-gray-100 pt-3 mt-3 flex justify-between">
                  <span className="font-extrabold text-gray-900">Итого</span>
                  <span className="font-extrabold text-green-600 text-lg">{formatPrice(cartTotal)}</span>
                </div>
              </div>

              <Button
                onClick={submitOrder}
                disabled={submitting}
                className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-base font-bold rounded-2xl shadow-lg disabled:opacity-50"
              >
                {submitting ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Оформление...</>
                ) : (
                  <>Оформить заказ — {formatPrice(cartTotal)}</>
                )}
              </Button>
            </div>
          )}

          {/* ═══ TRACKING VIEW ═══ */}
          {view === 'tracking' && trackingOrder && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-xl font-extrabold text-gray-900">Заказ оформлен!</h2>
                <p className="text-gray-500 text-sm mt-1">Заказ #{trackingOrder.id}</p>
              </div>

              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-800 text-sm">Статус заказа</h3>
                  <button onClick={refreshTracking} disabled={trackingLoading} className="text-xs text-green-600 font-medium hover:underline flex items-center gap-1">
                    {trackingLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Обновить
                  </button>
                </div>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold ${ORDER_STATUSES[trackingOrder.status]?.color || 'bg-gray-100 text-gray-800'}`}>
                  <span>{ORDER_STATUSES[trackingOrder.status]?.emoji || '📦'}</span>
                  <span>{ORDER_STATUSES[trackingOrder.status]?.label || trackingOrder.status}</span>
                </div>
                {trackingOrder.courier_name && (
                  <p className="text-sm text-gray-600 mt-2">🏃 Курьер: <span className="font-medium">{trackingOrder.courier_name}</span></p>
                )}
              </div>

              {/* Tracking map */}
              {trackingOrder.park_point_id && (
                <div className="bg-white rounded-2xl p-3 shadow-sm">
                  <p className="text-xs font-semibold text-gray-500 mb-2">Точка доставки</p>
                  <ParkMap
                    points={parkPoints}
                    highlightId={trackingOrder.park_point_id}
                    readOnly
                  />
                </div>
              )}

              <div className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-green-500" />
                  <span className="font-medium">{trackingOrder.park_point_name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{trackingOrder.park_note}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">{trackingOrder.customer_phone}</span>
                </div>
                <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between">
                  <span className="font-bold text-gray-900">Итого</span>
                  <span className="font-bold text-green-600">{formatPrice(trackingOrder.total_amount)}</span>
                </div>
              </div>

              <Button
                onClick={() => { setView('menu'); setTrackingOrder(null); setTrackingOrderId(null); setSelectedPoint(null); setParkNote(''); setCustomerPhone(''); }}
                variant="outline"
                className="w-full h-12 rounded-2xl font-bold"
              >
                Новый заказ
              </Button>
            </div>
          )}
        </div>

        {/* ═══ FLOATING CART BUTTON ═══ */}
        {cartCount > 0 && view === 'menu' && (
          <div className="fixed bottom-5 left-4 right-4 z-40 max-w-lg mx-auto">
            <button
              onClick={() => setView('map')}
              className="w-full bg-green-600 hover:bg-green-700 text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-green-900/30 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {cartCount}
                  </span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-base block">{formatPrice(cartTotal)}</span>
                  <span className="text-white/60 text-xs">{cartCount} товар(ов)</span>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2">
                <MapPin className="w-4 h-4" />
                <span className="font-semibold text-sm">Выбрать точку</span>
              </div>
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}