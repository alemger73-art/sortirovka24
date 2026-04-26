import { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { client, withRetry } from '@/lib/api';
import { resolveImageSrc } from '@/lib/storage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Minus, Plus, ShoppingBag, Store, Star } from 'lucide-react';
import { toast } from 'sonner';

interface Restaurant { id: number; name: string; photo: string; description: string; whatsapp_phone: string; working_hours: string; min_order: number; delivery_time: string; cuisine_type: string; rating: number; }
interface FoodCategory { id: number; restaurant_id: number; name: string; icon: string; }
interface Dish { id: number; restaurant_id: number; category_id: number; name: string; description: string; price: number; image_url: string; available?: boolean; }
interface CartLine { dish: Dish; qty: number; }

export default function FoodDelivery() {
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

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [r, c, d] = await Promise.all([
        withRetry(() => fetch('/api/restaurants').then(x => x.json())),
        withRetry(() => client.entities.food_categories.query({ sort: 'sort_order', limit: 1000 })),
        withRetry(() => client.entities.food_items.query({ sort: 'sort_order', limit: 2000 })),
      ]);
      const rs = (r?.restaurants || []) as Restaurant[];
      setRestaurants(rs);
      setCategories((c?.data?.items || []).filter((x: FoodCategory) => x.is_active !== false));
      setDishes((d?.data?.items || []).filter((x: Dish) => (x.available ?? true)));
      if (rs.length > 0) setActiveRestaurant(rs[0]);
    } catch {
      toast.error('Ошибка загрузки каталога');
    }
  }

  const cuisines = useMemo(() => ['all', ...Array.from(new Set(restaurants.map(r => r.cuisine_type).filter(Boolean)))], [restaurants]);
  const visibleRestaurants = useMemo(() => activeCuisine === 'all' ? restaurants : restaurants.filter(r => r.cuisine_type === activeCuisine), [restaurants, activeCuisine]);
  const restaurantCategories = useMemo(() => categories.filter(c => c.restaurant_id === activeRestaurant?.id), [categories, activeRestaurant]);
  const restaurantDishes = useMemo(() => dishes.filter(d => d.restaurant_id === activeRestaurant?.id && d.available !== false), [dishes, activeRestaurant]);
  const groupedMenu = useMemo(
    () => restaurantCategories.map(cat => ({ cat, items: restaurantDishes.filter(d => d.category_id === cat.id) })).filter(g => g.items.length > 0),
    [restaurantCategories, restaurantDishes]
  );
  const cartCount = useMemo(() => cart.reduce((a, c) => a + c.qty, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((a, c) => a + c.qty * c.dish.price, 0), [cart]);

  function addDish(dish: Dish) {
    setCart(prev => {
      const exists = prev.find(p => p.dish.id === dish.id);
      if (exists) return prev.map(p => p.dish.id === dish.id ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { dish, qty: 1 }];
    });
  }

  function changeQty(dishId: number, delta: number) {
    setCart(prev => prev.map(c => c.dish.id === dishId ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
  }

  async function checkout() {
    if (!activeRestaurant) return;
    if (!name.trim() || !phone.trim() || !address.trim()) return toast.error('Заполните имя, телефон и адрес');
    if (subtotal < Number(activeRestaurant.min_order || 0)) return toast.error(`Минимальный заказ ${activeRestaurant.min_order} ₸`);
    const paymentLabel = payment === 'cash' ? 'Наличные' : payment === 'kaspi_qr' ? 'Kaspi QR' : 'Halyk QR';
    const items = cart.map(c => ({ name: c.dish.name, qty: c.qty, price: c.dish.price, sum: c.qty * c.dish.price }));
    const total = subtotal;
    try {
      await withRetry(() => client.entities.food_orders.create({
        data: {
          restaurant_id: activeRestaurant.id,
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
        },
      }));
      const waPhone = String(activeRestaurant.whatsapp_phone || '').replace(/\D/g, '');
      let text = `*Новый заказ*\nРесторан: ${activeRestaurant.name}\n\n`;
      items.forEach((i, idx) => { text += `${idx + 1}) ${i.name} x${i.qty} = ${i.sum} ₸\n`; });
      text += `\nИтого: ${total} ₸\nКлиент: ${name}\nТел: ${phone}\nАдрес: ${address}\nОплата: ${paymentLabel}`;
      if (comment.trim()) text += `\nКомментарий: ${comment}`;
      if (waPhone) window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`, '_blank');
      setConfirmedOrder({ restaurant: activeRestaurant, items, total, payment: paymentLabel, name, phone, address, comment });
      setCart([]);
      setCartOpen(false);
    } catch {
      toast.error('Не удалось оформить заказ');
    }
  }

  if (confirmedOrder) {
    const qrText = `ORDER:${confirmedOrder.restaurant.name};TOTAL:${confirmedOrder.total};PHONE:${confirmedOrder.phone}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrText)}`;
    return (
      <Layout>
        <div className="mx-auto max-w-lg p-4 space-y-4">
          <h1 className="text-2xl font-bold">Заказ подтвержден</h1>
          <div className="bg-white rounded-xl p-4 border space-y-2">
            <p className="font-semibold">{confirmedOrder.restaurant.name}</p>
            <p>{confirmedOrder.name} • {confirmedOrder.phone}</p>
            <p>{confirmedOrder.address}</p>
            <p>Оплата: {confirmedOrder.payment}</p>
            <p className="font-bold">Итого: {confirmedOrder.total.toLocaleString()} ₸</p>
          </div>
          {confirmedOrder.payment !== 'Наличные' && (
            <div className="bg-white border rounded-xl p-4 text-center space-y-2">
              <p className="font-semibold">{confirmedOrder.payment}</p>
              <img src={qrUrl} alt="QR" className="mx-auto w-52 h-52 rounded-lg" />
              <p className="text-xs text-gray-500">Покажите QR при получении/оплате</p>
            </div>
          )}
          <Button className="w-full" onClick={() => { setConfirmedOrder(null); setActiveRestaurant(restaurants[0] || null); }}>Сделать новый заказ</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-6xl p-4 pb-28 space-y-6">
        {!activeRestaurant ? (
          <>
            <h1 className="text-2xl font-bold">Доставка еды</h1>
            <div className="flex gap-2 flex-wrap">
              {cuisines.map(c => (
                <button key={c} onClick={() => setActiveCuisine(c)} className={`px-3 py-1.5 rounded-full text-sm ${activeCuisine === c ? 'bg-black text-white' : 'bg-gray-100'}`}>
                  {c === 'all' ? 'Все' : c}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleRestaurants.map(r => (
                <button key={r.id} className="text-left bg-white border rounded-2xl overflow-hidden" onClick={() => setActiveRestaurant(r)}>
                  <img src={resolveImageSrc(r.photo) || 'https://placehold.co/600x360?text=Restaurant'} alt={r.name} className="w-full h-44 object-cover" />
                  <div className="p-3 space-y-1">
                    <h3 className="font-bold">{r.name}</h3>
                    <div className="text-xs text-gray-500 flex gap-2"><span className="inline-flex items-center gap-1"><Star className="w-3 h-3" />{r.rating || 4.5}</span><span>{r.delivery_time}</span><span>от {Number(r.min_order || 0)} ₸</span></div>
                    <p className="text-xs text-gray-500">{r.cuisine_type}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button className="text-sm text-gray-500" onClick={() => setActiveRestaurant(null)}>← Все рестораны</button>
            <div className="bg-white rounded-2xl border overflow-hidden">
              <img src={resolveImageSrc(activeRestaurant.photo) || 'https://placehold.co/1200x420?text=Restaurant'} alt={activeRestaurant.name} className="w-full h-52 object-cover" />
              <div className="p-4">
                <h1 className="text-2xl font-bold">{activeRestaurant.name}</h1>
                <p className="text-sm text-gray-600">{activeRestaurant.description}</p>
                <p className="text-xs text-gray-500 mt-2">{activeRestaurant.working_hours} • {activeRestaurant.delivery_time} • мин. заказ {activeRestaurant.min_order} ₸</p>
              </div>
            </div>
            {groupedMenu.map(g => (
              <div key={g.cat.id} className="space-y-2">
                <h2 className="font-bold text-lg">{g.cat.name}</h2>
                <div className="grid gap-3">
                  {g.items.map(d => (
                    <div key={d.id} className="bg-white border rounded-xl p-3 flex gap-3">
                      <img src={resolveImageSrc(d.image_url) || 'https://placehold.co/200x160?text=Dish'} alt={d.name} className="w-24 h-20 rounded-lg object-cover" />
                      <div className="flex-1">
                        <p className="font-semibold">{d.name}</p>
                        <p className="text-xs text-gray-500">{d.description}</p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-bold">{Number(d.price || 0).toLocaleString()} ₸</span>
                          <Button size="sm" onClick={() => addDish(d)}>Add to cart</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {cartCount > 0 && (
        <button onClick={() => setCartOpen(true)} className="fixed right-4 bottom-5 bg-black text-white rounded-full px-4 py-3 inline-flex items-center gap-2 shadow-lg">
          <ShoppingBag className="w-4 h-4" /> {cartCount}
        </button>
      )}

      {cartOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center" onClick={() => setCartOpen(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-2xl md:rounded-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-lg">Корзина</h3>
            {cart.map(c => (
              <div key={c.dish.id} className="border rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{c.dish.name}</p>
                  <p className="text-xs text-gray-500">{c.dish.price} ₸</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(c.dish.id, -1)}><Minus className="w-4 h-4" /></button>
                  <span className="w-6 text-center">{c.qty}</span>
                  <button onClick={() => changeQty(c.dish.id, 1)}><Plus className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <Input placeholder="Имя" value={name} onChange={e => setName(e.target.value)} />
              <Input placeholder="Телефон" value={phone} onChange={e => setPhone(e.target.value)} />
              <Input placeholder="Адрес доставки" value={address} onChange={e => setAddress(e.target.value)} />
              <Textarea placeholder="Комментарий" value={comment} onChange={e => setComment(e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                <button className={`rounded-lg border p-2 text-sm ${payment === 'cash' ? 'border-black' : ''}`} onClick={() => setPayment('cash')}>Cash</button>
                <button className={`rounded-lg border p-2 text-sm ${payment === 'kaspi_qr' ? 'border-black' : ''}`} onClick={() => setPayment('kaspi_qr')}>Kaspi QR</button>
                <button className={`rounded-lg border p-2 text-sm ${payment === 'halyk_qr' ? 'border-black' : ''}`} onClick={() => setPayment('halyk_qr')}>Halyk QR</button>
              </div>
            </div>
            <div className="flex items-center justify-between font-bold text-lg"><span>Итого</span><span>{subtotal.toLocaleString()} ₸</span></div>
            <Button className="w-full" onClick={checkout}><Store className="w-4 h-4 mr-2" />Оформить заказ</Button>
          </div>
        </div>
      )}
    </Layout>
  );
}
