import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { client, withRetry } from '@/lib/api';
import { resolveImageSrc } from '@/lib/storage';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Minus,
  Plus,
  ShoppingBag,
  Store,
  Star,
  ChevronLeft,
  Clock,
  MapPin,
  Banknote,
  Smartphone,
  X,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

/** Старые записи без restaurant_id показываем как одно «виртуальное» заведение */
const LEGACY_RESTAURANT_ID = 0;

/** Акцент в духе свежих маркетплейсов (Wolt: мята/изумруд) + нейтрали портала */
const ACCENT = {
  solid: 'bg-emerald-500 hover:bg-emerald-600',
  soft: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
  ring: 'ring-emerald-500/25',
  text: 'text-emerald-600',
};

interface Restaurant {
  id: number;
  name: string;
  photo: string;
  description: string;
  whatsapp_phone: string;
  working_hours: string;
  min_order: number;
  delivery_time: string;
  cuisine_type: string;
  rating: number;
}
interface FoodCategory {
  id: number;
  restaurant_id: number | null;
  name: string;
  icon: string;
}
interface Dish {
  id: number;
  restaurant_id: number | null;
  category_id: number;
  name: string;
  description: string;
  price: number;
  image_url: string;
  available?: boolean;
}
interface CartLine {
  dish: Dish;
  qty: number;
}

function apiBase(): string {
  return (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL || '';
}

function catalogHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'App-Host':
      typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
  };
}

async function safeGetJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${apiBase()}${path}`, { headers: catalogHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn('[FoodDelivery]', path, e);
    return null;
  }
}

function matchesRestaurant(activeRestaurantId: number, rowRestaurantId: number | null | undefined): boolean {
  if (activeRestaurantId === LEGACY_RESTAURANT_ID) {
    return rowRestaurantId == null || rowRestaurantId === undefined || rowRestaurantId === LEGACY_RESTAURANT_ID;
  }
  return rowRestaurantId === activeRestaurantId;
}

function legacyPlaceholderRestaurant(): Restaurant {
  return {
    id: LEGACY_RESTAURANT_ID,
    name: 'Доставка еды',
    photo: '',
    description: 'Меню портала',
    whatsapp_phone: '',
    working_hours: '',
    min_order: 0,
    delivery_time: '',
    cuisine_type: 'разное',
    rating: 4.5,
  };
}

function formatMoney(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}

export default function FoodDelivery() {
  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [activeCuisine, setActiveCuisine] = useState('all');
  const [activeRestaurant, setActiveRestaurant] = useState<Restaurant | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<any>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [comment, setComment] = useState('');
  const [payment, setPayment] = useState<'cash' | 'kaspi_qr' | 'halyk_qr'>('cash');

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [rj, cj, pj] = await Promise.all([
        safeGetJson('/api/restaurants'),
        safeGetJson('/api/categories'),
        safeGetJson('/api/products?limit=2000'),
      ]);

      let rs = (rj?.restaurants || []) as Restaurant[];

      const rawCats = Array.isArray(cj?.categories) ? cj.categories : [];
      const mappedCats: FoodCategory[] = rawCats.map((c: any) => ({
        id: c.id,
        restaurant_id: c.restaurant_id ?? null,
        name: c.name,
        icon: c.image && String(c.image).trim() ? '' : '🍽',
      }));

      const rawProds = Array.isArray(pj?.products) ? pj.products : [];
      const mappedDishes: Dish[] = rawProds.map((p: any) => ({
        id: p.id,
        restaurant_id: p.restaurant_id ?? null,
        category_id: p.category_id,
        name: p.title,
        description: p.description || '',
        price: Number(p.price) || 0,
        image_url: p.image || '',
        available: p.available !== false,
      }));

      const hasLegacy =
        mappedCats.some(c => c.restaurant_id == null) || mappedDishes.some(d => d.restaurant_id == null);

      if (rs.length === 0 && (mappedCats.length > 0 || mappedDishes.length > 0)) {
        rs = [legacyPlaceholderRestaurant()];
      }

      setRestaurants(rs);
      setCategories(mappedCats);
      setDishes(mappedDishes);

      if (rs.length === 1 && rs[0].id === LEGACY_RESTAURANT_ID && hasLegacy) {
        setActiveRestaurant(rs[0]);
      } else {
        setActiveRestaurant(null);
      }
    } catch (e) {
      console.error(e);
      toast.error('Не удалось загрузить каталог');
    } finally {
      setLoading(false);
    }
  }

  const cuisines = useMemo(
    () => ['all', ...Array.from(new Set(restaurants.map(r => r.cuisine_type).filter(Boolean)))],
    [restaurants]
  );
  const visibleRestaurants = useMemo(
    () => (activeCuisine === 'all' ? restaurants : restaurants.filter(r => r.cuisine_type === activeCuisine)),
    [restaurants, activeCuisine]
  );

  const restaurantCategories = useMemo(() => {
    if (!activeRestaurant) return [];
    return categories.filter(c => matchesRestaurant(activeRestaurant.id, c.restaurant_id));
  }, [categories, activeRestaurant]);

  const restaurantDishes = useMemo(() => {
    if (!activeRestaurant) return [];
    return dishes.filter(d => matchesRestaurant(activeRestaurant.id, d.restaurant_id) && d.available !== false);
  }, [dishes, activeRestaurant]);

  const groupedMenu = useMemo(
    () =>
      restaurantCategories
        .sort((a, b) => a.id - b.id)
        .map(cat => ({
          cat,
          items: restaurantDishes.filter(d => d.category_id === cat.id),
        }))
        .filter(g => g.items.length > 0),
    [restaurantCategories, restaurantDishes]
  );

  const cartCount = useMemo(() => cart.reduce((a, c) => a + c.qty, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((a, c) => a + c.qty * c.dish.price, 0), [cart]);

  const qtyForDish = (dishId: number) => cart.find(c => c.dish.id === dishId)?.qty ?? 0;

  function addDish(dish: Dish) {
    setCart(prev => {
      const exists = prev.find(p => p.dish.id === dish.id);
      if (exists) return prev.map(p => (p.dish.id === dish.id ? { ...p, qty: p.qty + 1 } : p));
      return [...prev, { dish, qty: 1 }];
    });
  }

  function changeQty(dishId: number, delta: number) {
    setCart(prev =>
      prev.map(c => (c.dish.id === dishId ? { ...c, qty: c.qty + delta } : c)).filter(c => c.qty > 0)
    );
  }

  async function checkout() {
    if (!activeRestaurant) return;
    if (!name.trim() || !phone.trim() || !address.trim()) return toast.error('Заполните имя, телефон и адрес');
    if (subtotal < Number(activeRestaurant.min_order || 0))
      return toast.error(`Минимальный заказ ${activeRestaurant.min_order} ₸`);
    const paymentLabel = payment === 'cash' ? 'Наличные' : payment === 'kaspi_qr' ? 'Kaspi QR' : 'Halyk QR';
    const items = cart.map(c => ({
      name: c.dish.name,
      qty: c.qty,
      price: c.dish.price,
      sum: c.qty * c.dish.price,
    }));
    const total = subtotal;
    const orderPayload = {
      restaurant_id: activeRestaurant.id === LEGACY_RESTAURANT_ID ? undefined : activeRestaurant.id,
      restaurant_name: activeRestaurant.name,
      restaurant_phone: activeRestaurant.whatsapp_phone,
      customer_name: name,
      customer_phone: phone,
      delivery_address: address,
      comment,
      payment_method: payment,
      payment_status: payment === 'cash' ? 'pending' : 'awaiting_qr_payment',
      delivery_method: 'delivery',
      status: 'new',
      total_amount: total,
      order_items: JSON.stringify(items),
      created_at: new Date().toISOString(),
    };
    try {
      await withRetry(() => client.entities.food_orders.create({ data: orderPayload as any }));
    } catch (e) {
      console.error(e);
      toast.error('Не удалось оформить заказ');
      return;
    }
    const waPhone = String(activeRestaurant.whatsapp_phone || '').replace(/\D/g, '');
    let text = `*Новый заказ*\nРесторан: ${activeRestaurant.name}\n\n`;
    items.forEach((i, idx) => {
      text += `${idx + 1}) ${i.name} x${i.qty} = ${i.sum} ₸\n`;
    });
    text += `\nИтого: ${total} ₸\nКлиент: ${name}\nТел: ${phone}\nАдрес: ${address}\nОплата: ${paymentLabel}`;
    if (comment.trim()) text += `\nКомментарий: ${comment}`;
    if (waPhone) window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank');
    else toast.info('WhatsApp ресторана не указан — заказ сохранён в системе');
    setConfirmedOrder({
      restaurant: activeRestaurant,
      items,
      total,
      payment: paymentLabel,
      name,
      phone,
      address,
      comment,
    });
    setCart([]);
    setCartOpen(false);
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] bg-gradient-to-b from-stone-50 to-slate-100/90 dark:from-gray-950 dark:to-gray-900">
          <div className="mx-auto max-w-2xl px-4 pb-28 pt-6">
            <div className="mb-6 h-8 w-48 animate-pulse rounded-lg bg-stone-200 dark:bg-gray-800" />
            <div className="mb-4 flex gap-2 overflow-hidden">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-9 w-20 shrink-0 animate-pulse rounded-full bg-stone-200 dark:bg-gray-800" />
              ))}
            </div>
            <div className="grid gap-4">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-gray-900"
                >
                  <div className="aspect-[5/4] animate-pulse bg-stone-200 dark:bg-gray-800" />
                  <div className="space-y-2 p-4">
                    <div className="h-5 w-3/4 animate-pulse rounded bg-stone-200 dark:bg-gray-800" />
                    <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100 dark:bg-gray-800" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (confirmedOrder) {
    const qrText = `ORDER:${confirmedOrder.restaurant.name};TOTAL:${confirmedOrder.total};PHONE:${confirmedOrder.phone}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`;
    return (
      <Layout>
        <div className="min-h-[70vh] bg-gradient-to-b from-emerald-50/80 via-stone-50 to-white dark:from-gray-950 dark:via-gray-950 dark:to-gray-900">
          <div className="mx-auto max-w-lg space-y-6 px-4 py-10">
            <div className="flex flex-col items-center text-center">
              <div
                className={cn(
                  'mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-lg',
                  ACCENT.solid,
                  'text-white'
                )}
              >
                <CheckCircle2 className="h-8 w-8" strokeWidth={2.2} />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Заказ принят
              </h1>
              <p className="mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-400">
                Ресторан получит заявку. При оплате по QR покажите код курьеру или в заведении.
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-xl shadow-stone-200/40 dark:border-gray-800 dark:bg-gray-900 dark:shadow-none">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ресторан</p>
              <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{confirmedOrder.restaurant.name}</p>
              <div className="mt-4 space-y-2 border-t border-stone-100 pt-4 text-sm dark:border-gray-800">
                <p className="text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-white">{confirmedOrder.name}</span>
                  {' · '}
                  {confirmedOrder.phone}
                </p>
                <p className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 opacity-60" />
                  {confirmedOrder.address}
                </p>
                <p className="font-medium text-slate-800 dark:text-slate-200">Оплата: {confirmedOrder.payment}</p>
                <p className="text-xl font-extrabold text-slate-900 dark:text-white">
                  {formatMoney(confirmedOrder.total)}
                </p>
              </div>
            </div>

            {confirmedOrder.payment !== 'Наличные' && (
              <div className="rounded-3xl border border-stone-200/80 bg-white p-6 text-center shadow-lg dark:border-gray-800 dark:bg-gray-900">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{confirmedOrder.payment}</p>
                <img src={qrUrl} alt="QR" className="mx-auto mt-4 h-52 w-52 rounded-2xl ring-1 ring-stone-100 dark:ring-gray-700" />
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Сохраните или покажите этот QR</p>
              </div>
            )}

            <Button
              className={cn('h-12 w-full rounded-2xl text-base font-semibold text-white', ACCENT.solid)}
              onClick={() => {
                setConfirmedOrder(null);
                setActiveRestaurant(restaurants.length === 1 ? restaurants[0] : null);
              }}
            >
              Заказать ещё
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const shellClass =
    'min-h-screen bg-gradient-to-b from-stone-50 via-white to-stone-100/90 dark:from-gray-950 dark:via-gray-950 dark:to-gray-900';

  return (
    <Layout>
      <div className={shellClass}>
        <div className="mx-auto max-w-2xl px-4 pb-32 pt-2 md:max-w-3xl lg:max-w-4xl">
          {restaurants.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-white/80 p-10 text-center dark:border-gray-700 dark:bg-gray-900/80">
              <Sparkles className="mx-auto h-10 w-10 text-emerald-500 opacity-80" />
              <p className="mt-4 font-semibold text-slate-900 dark:text-white">Меню скоро появится</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Добавьте рестораны и блюда в админ-панели в разделе «Еда».
              </p>
            </div>
          ) : !activeRestaurant ? (
            <>
              <header className="pt-4 pb-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  Доставка
                </p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Рестораны рядом
                </h1>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Выберите заведение — меню и оформление как в привычных сервисах доставки.
                </p>
              </header>

              <div className="-mx-4 mt-5 px-4">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {cuisines.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveCuisine(c)}
                      className={cn(
                        'shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition-all duration-200',
                        activeCuisine === c
                          ? cn(ACCENT.solid, 'text-white shadow-md shadow-emerald-500/25')
                          : 'border border-stone-200 bg-white text-slate-700 shadow-sm hover:border-stone-300 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200'
                      )}
                    >
                      {c === 'all' ? 'Все кухни' : c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
                {visibleRestaurants.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveRestaurant(r)}
                    className="group w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950"
                  >
                    <article className="overflow-hidden rounded-3xl bg-white shadow-md shadow-stone-200/50 ring-1 ring-stone-200/60 transition duration-300 hover:shadow-xl hover:ring-emerald-200/50 dark:bg-gray-900 dark:shadow-none dark:ring-gray-800 dark:hover:ring-emerald-900/40">
                      <div className="relative aspect-[5/4] overflow-hidden bg-stone-200 dark:bg-gray-800">
                        <img
                          src={resolveImageSrc(r.photo) || 'https://placehold.co/800x640/f5f5f4/78716c?text=Photo'}
                          alt=""
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-sm backdrop-blur-sm dark:bg-gray-900/90 dark:text-white">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          {(r.rating || 4.5).toFixed(1)}
                        </div>
                        <div className="absolute bottom-3 left-3 right-3">
                          <h2 className="text-lg font-bold leading-tight text-white drop-shadow-md md:text-xl">
                            {r.name}
                          </h2>
                          {r.cuisine_type ? (
                            <p className="mt-0.5 text-sm font-medium text-white/90">{r.cuisine_type}</p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
                        {r.delivery_time ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-gray-800 dark:text-slate-300">
                            <Clock className="h-3.5 w-3.5 opacity-70" />
                            {r.delivery_time}
                          </span>
                        ) : null}
                        <span className="inline-flex items-center rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-gray-800 dark:text-slate-300">
                          от {formatMoney(Number(r.min_order || 0))}
                        </span>
                      </div>
                    </article>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="relative -mx-4 mb-0 sm:mx-0 sm:rounded-3xl sm:overflow-hidden sm:ring-1 sm:ring-stone-200/80 dark:sm:ring-gray-800">
                <div className="relative aspect-[16/10] max-h-[280px] bg-stone-200 dark:bg-gray-800 sm:max-h-[320px]">
                  <img
                    src={
                      resolveImageSrc(activeRestaurant.photo) ||
                      'https://placehold.co/1200x750/f5f5f4/57534e?text=Restaurant'
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <button
                    type="button"
                    onClick={() => setActiveRestaurant(null)}
                    className="absolute left-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-lg backdrop-blur-sm transition hover:bg-white dark:bg-gray-900/95 dark:text-white"
                    aria-label="Назад"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="relative z-10 -mt-6 rounded-t-3xl bg-white px-5 pb-2 pt-6 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] dark:bg-gray-900 dark:shadow-none sm:rounded-3xl sm:shadow-xl sm:shadow-stone-200/30 dark:sm:shadow-none">
                <div className="mx-auto h-1 w-10 shrink-0 rounded-full bg-stone-200 dark:bg-gray-700 sm:hidden" />
                <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-3xl">
                  {activeRestaurant.name}
                </h1>
                {activeRestaurant.description ? (
                  <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {activeRestaurant.description}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {activeRestaurant.delivery_time ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300">
                      <Clock className="h-3.5 w-3.5" />
                      {activeRestaurant.delivery_time}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300">
                    Мин. заказ {formatMoney(Number(activeRestaurant.min_order || 0))}
                  </span>
                  {activeRestaurant.working_hours ? (
                    <span className="inline-flex items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300">
                      {activeRestaurant.working_hours}
                    </span>
                  ) : null}
                </div>
              </div>

              {groupedMenu.length === 0 ? (
                <p className="mt-10 text-center text-slate-500 dark:text-slate-400">В этом ресторане пока нет блюд.</p>
              ) : (
                <div className="mt-8 space-y-10">
                  {groupedMenu.map(g => (
                    <section key={g.cat.id} className="scroll-mt-24">
                      <div className="sticky top-0 z-[5] -mx-4 border-b border-stone-100 bg-white/90 px-4 py-3 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
                        <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                          {g.cat.name}
                        </h2>
                      </div>
                      <ul className="mt-4 space-y-3">
                        {g.items.map(d => {
                          const q = qtyForDish(d.id);
                          return (
                            <li
                              key={d.id}
                              className="rounded-2xl border border-stone-100 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900"
                            >
                              <div className="flex gap-3">
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-semibold leading-snug text-slate-900 dark:text-white">{d.name}</h3>
                                  {d.description ? (
                                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                      {d.description}
                                    </p>
                                  ) : null}
                                  <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                                    {formatMoney(Number(d.price || 0))}
                                  </p>
                                </div>
                                <div className="relative h-[88px] w-[88px] shrink-0 sm:h-[100px] sm:w-[100px]">
                                  <img
                                    src={
                                      resolveImageSrc(d.image_url) ||
                                      'https://placehold.co/200x200/f5f5f4/a8a29e?text=Food'
                                    }
                                    alt=""
                                    className="h-full w-full rounded-2xl object-cover ring-1 ring-stone-100 dark:ring-gray-700"
                                  />
                                  {q <= 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => addDish(d)}
                                      className={cn(
                                        'absolute -bottom-1 -right-1 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95',
                                        ACCENT.solid
                                      )}
                                      aria-label="Добавить"
                                    >
                                      <Plus className="h-5 w-5" strokeWidth={2.5} />
                                    </button>
                                  ) : (
                                    <div
                                      className={cn(
                                        'absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-0 rounded-full border border-stone-200 bg-white px-1 py-0.5 shadow-md dark:border-gray-600 dark:bg-gray-800'
                                      )}
                                    >
                                      <button
                                        type="button"
                                        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-700 hover:bg-stone-100 dark:text-slate-200 dark:hover:bg-gray-700"
                                        onClick={() => changeQty(d.id, -1)}
                                        aria-label="Меньше"
                                      >
                                        <Minus className="h-4 w-4" />
                                      </button>
                                      <span className="min-w-[1.25rem] text-center text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                                        {q}
                                      </span>
                                      <button
                                        type="button"
                                        className={cn(
                                          'flex h-8 w-8 items-center justify-center rounded-full text-white',
                                          ACCENT.solid
                                        )}
                                        onClick={() => addDish(d)}
                                        aria-label="Больше"
                                      >
                                        <Plus className="h-4 w-4" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {cartCount > 0 && !cartOpen && (
          <div className="fixed bottom-5 left-4 right-4 z-40 mx-auto max-w-lg animate-in slide-in-from-bottom-4 duration-300 md:max-w-xl">
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4 text-left text-white shadow-2xl shadow-slate-900/30 transition hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:shadow-stone-900/20 dark:hover:bg-stone-100"
            >
              <span className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 dark:bg-slate-900/10">
                  <ShoppingBag className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white/80 dark:text-slate-600">Корзина</span>
                  <span className="text-base font-bold">{cartCount} позиций</span>
                </span>
              </span>
              <span className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white dark:bg-emerald-600">
                {formatMoney(subtotal)}
              </span>
            </button>
          </div>
        )}

        {cartOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px] md:items-center md:p-4"
            onClick={() => setCartOpen(false)}
            role="presentation"
          >
            <div
              className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl dark:bg-gray-900 md:max-h-[85vh] md:rounded-3xl"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-5 py-4 dark:border-gray-800">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Ваш заказ</p>
                  <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Корзина</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCartOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-slate-700 hover:bg-stone-200 dark:bg-gray-800 dark:text-slate-200"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                <ul className="space-y-3">
                  {cart.map(c => (
                    <li
                      key={c.dish.id}
                      className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-stone-50/80 p-3 dark:border-gray-800 dark:bg-gray-800/50"
                    >
                      <img
                        src={
                          resolveImageSrc(c.dish.image_url) ||
                          'https://placehold.co/96x96/f5f5f4/a8a29e?text=·'
                        }
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold leading-snug text-slate-900 dark:text-white">{c.dish.name}</p>
                        <p className="text-xs font-medium text-slate-500">{formatMoney(c.dish.price)}</p>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-white px-1 py-0.5 shadow-sm dark:bg-gray-900">
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-700 hover:bg-stone-100 dark:text-slate-200 dark:hover:bg-gray-800"
                          onClick={() => changeQty(c.dish.id, -1)}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-7 text-center text-sm font-bold tabular-nums">{c.qty}</span>
                        <button
                          type="button"
                          className={cn('flex h-9 w-9 items-center justify-center rounded-full text-white', ACCENT.solid)}
                          onClick={() => changeQty(c.dish.id, 1)}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Доставка</p>
                  <Input
                    placeholder="Имя"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-12 rounded-xl border-stone-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                  />
                  <Input
                    placeholder="Телефон"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="h-12 rounded-xl border-stone-200 bg-white dark:border-gray-700 dark:bg-gray-900"
                  />
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Адрес доставки"
                      value={address}
                      onChange={e => setAddress(e.target.value)}
                      className="h-12 rounded-xl border-stone-200 bg-white pl-10 dark:border-gray-700 dark:bg-gray-900"
                    />
                  </div>
                  <Textarea
                    placeholder="Комментарий к заказу"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    className="min-h-[80px] rounded-xl border-stone-200 dark:border-gray-700 dark:bg-gray-900"
                  />
                </div>

                <div className="mt-6">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Оплата</p>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { id: 'cash' as const, label: 'Наличные', Icon: Banknote },
                        { id: 'kaspi_qr' as const, label: 'Kaspi QR', Icon: Smartphone },
                        { id: 'halyk_qr' as const, label: 'Halyk QR', Icon: Smartphone },
                      ] as const
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPayment(id)}
                        className={cn(
                          'flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition',
                          payment === id
                            ? cn('border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100')
                            : 'border-stone-200 bg-white text-slate-700 hover:border-stone-300 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 opacity-80" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="shrink-0 space-y-3 border-t border-stone-100 bg-white px-5 py-5 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between text-slate-900 dark:text-white">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400">К оплате</span>
                  <span className="text-xl font-extrabold">{formatMoney(subtotal)}</span>
                </div>
                <Button
                  type="button"
                  className={cn('h-14 w-full rounded-2xl text-base font-bold text-white', ACCENT.solid)}
                  onClick={checkout}
                >
                  <Store className="mr-2 h-5 w-5 opacity-90" />
                  Оформить заказ
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
