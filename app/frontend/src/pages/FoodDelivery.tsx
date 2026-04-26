import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { client, withRetry } from '@/lib/api';
import { resolveImageSrc } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus, ShoppingBag, Store, Star } from 'lucide-react';
import { toast } from 'sonner';

/** Старые записи без restaurant_id показываем как одно «виртуальное» заведение */
const LEGACY_RESTAURANT_ID = 0;

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
    'App-Host': typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
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
        icon: (c.image && String(c.image).trim()) ? '' : '🍽',
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
        mappedCats.some(c => c.restaurant_id == null) ||
        mappedDishes.some(d => d.restaurant_id == null);

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
        <div className="flex min-h-[50vh] items-center justify-center text-gray-500">Загрузка меню…</div>
      </Layout>
    );
  }

  if (confirmedOrder) {
    const qrText = `ORDER:${confirmedOrder.restaurant.name};TOTAL:${confirmedOrder.total};PHONE:${confirmedOrder.phone}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`;
    return (
      <Layout>
        <div className="mx-auto max-w-lg space-y-4 p-4">
          <h1 className="text-2xl font-bold">Заказ подтвержден</h1>
          <div className="space-y-2 rounded-xl border bg-white p-4">
            <p className="font-semibold">{confirmedOrder.restaurant.name}</p>
            <p>
              {confirmedOrder.name} • {confirmedOrder.phone}
            </p>
            <p>{confirmedOrder.address}</p>
            <p>Оплата: {confirmedOrder.payment}</p>
            <p className="font-bold">Итого: {confirmedOrder.total.toLocaleString()} ₸</p>
          </div>
          {confirmedOrder.payment !== 'Наличные' && (
            <div className="space-y-2 rounded-xl border bg-white p-4 text-center">
              <p className="font-semibold">{confirmedOrder.payment}</p>
              <img src={qrUrl} alt="QR" className="mx-auto h-52 w-52 rounded-lg" />
              <p className="text-xs text-gray-500">Покажите QR при получении/оплате</p>
            </div>
          )}
          <Button
            className="w-full"
            onClick={() => {
              setConfirmedOrder(null);
              setActiveRestaurant(restaurants.length === 1 ? restaurants[0] : null);
            }}
          >
            Сделать новый заказ
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl space-y-6 p-4 pb-28">
        {restaurants.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
            <p className="font-medium">Меню пока пустое</p>
            <p className="mt-2 text-sm">Добавьте рестораны и блюда в админке (раздел «Еда»).</p>
          </div>
        ) : !activeRestaurant ? (
          <>
            <h1 className="text-2xl font-bold">Доставка еды</h1>
            <div className="flex flex-wrap gap-2">
              {cuisines.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveCuisine(c)}
                  className={`rounded-full px-3 py-1.5 text-sm ${activeCuisine === c ? 'bg-black text-white' : 'bg-gray-100'}`}
                >
                  {c === 'all' ? 'Все' : c}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleRestaurants.map(r => (
                <button
                  key={r.id}
                  type="button"
                  className="overflow-hidden rounded-2xl border bg-white text-left"
                  onClick={() => setActiveRestaurant(r)}
                >
                  <img
                    src={resolveImageSrc(r.photo) || 'https://placehold.co/600x360?text=Restaurant'}
                    alt={r.name}
                    className="h-44 w-full object-cover"
                  />
                  <div className="space-y-1 p-3">
                    <h3 className="font-bold">{r.name}</h3>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {r.rating || 4.5}
                      </span>
                      <span>{r.delivery_time}</span>
                      <span>от {Number(r.min_order || 0)} ₸</span>
                    </div>
                    <p className="text-xs text-gray-500">{r.cuisine_type}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button type="button" className="text-sm text-gray-500" onClick={() => setActiveRestaurant(null)}>
              ← Все рестораны
            </button>
            <div className="overflow-hidden rounded-2xl border bg-white">
              <img
                src={resolveImageSrc(activeRestaurant.photo) || 'https://placehold.co/1200x420?text=Restaurant'}
                alt={activeRestaurant.name}
                className="h-52 w-full object-cover"
              />
              <div className="p-4">
                <h1 className="text-2xl font-bold">{activeRestaurant.name}</h1>
                <p className="text-sm text-gray-600">{activeRestaurant.description}</p>
                <p className="mt-2 text-xs text-gray-500">
                  {activeRestaurant.working_hours} • {activeRestaurant.delivery_time} • мин. заказ{' '}
                  {activeRestaurant.min_order} ₸
                </p>
              </div>
            </div>
            {groupedMenu.length === 0 ? (
              <p className="text-center text-gray-500">В этом ресторане пока нет блюд в меню.</p>
            ) : (
              groupedMenu.map(g => (
                <div key={g.cat.id} className="space-y-2">
                  <h2 className="text-lg font-bold">{g.cat.name}</h2>
                  <div className="grid gap-3">
                    {g.items.map(d => (
                      <div key={d.id} className="flex gap-3 rounded-xl border bg-white p-3">
                        <img
                          src={resolveImageSrc(d.image_url) || 'https://placehold.co/200x160?text=Dish'}
                          alt={d.name}
                          className="h-20 w-24 rounded-lg object-cover"
                        />
                        <div className="flex-1">
                          <p className="font-semibold">{d.name}</p>
                          <p className="text-xs text-gray-500">{d.description}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="font-bold">{Number(d.price || 0).toLocaleString()} ₸</span>
                            <Button type="button" size="sm" onClick={() => addDish(d)}>
                              В корзину
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>

      {cartCount > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed bottom-5 right-4 inline-flex items-center gap-2 rounded-full bg-black px-4 py-3 text-white shadow-lg"
        >
          <ShoppingBag className="h-4 w-4" /> {cartCount}
        </button>
      )}

      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center"
          onClick={() => setCartOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[85vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
          >
            <h3 className="text-lg font-bold">Корзина</h3>
            {cart.map(c => (
              <div key={c.dish.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <p className="font-semibold">{c.dish.name}</p>
                  <p className="text-xs text-gray-500">{c.dish.price} ₸</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => changeQty(c.dish.id, -1)}>
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-6 text-center">{c.qty}</span>
                  <button type="button" onClick={() => changeQty(c.dish.id, 1)}>
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <Input placeholder="Имя" value={name} onChange={e => setName(e.target.value)} />
              <Input placeholder="Телефон" value={phone} onChange={e => setPhone(e.target.value)} />
              <Input placeholder="Адрес доставки" value={address} onChange={e => setAddress(e.target.value)} />
              <Textarea placeholder="Комментарий" value={comment} onChange={e => setComment(e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={`rounded-lg border p-2 text-sm ${payment === 'cash' ? 'border-black' : ''}`}
                  onClick={() => setPayment('cash')}
                >
                  Наличные
                </button>
                <button
                  type="button"
                  className={`rounded-lg border p-2 text-sm ${payment === 'kaspi_qr' ? 'border-black' : ''}`}
                  onClick={() => setPayment('kaspi_qr')}
                >
                  Kaspi QR
                </button>
                <button
                  type="button"
                  className={`rounded-lg border p-2 text-sm ${payment === 'halyk_qr' ? 'border-black' : ''}`}
                  onClick={() => setPayment('halyk_qr')}
                >
                  Halyk QR
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Итого</span>
              <span>{subtotal.toLocaleString()} ₸</span>
            </div>
            <Button type="button" className="w-full" onClick={checkout}>
              <Store className="mr-2 h-4 w-4" />
              Оформить заказ
            </Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
