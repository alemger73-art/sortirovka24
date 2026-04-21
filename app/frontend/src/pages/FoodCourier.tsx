import { useState, useEffect, useCallback } from 'react';
import { client, withRetry } from '@/lib/api';
import {
  Bike, Phone, MessageSquare, MapPin, Check, Clock,
  RefreshCw, LogIn, LogOut, Navigation, ChevronDown, ChevronUp,
  Package, ArrowRight, Loader2, AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import ParkMap from '@/components/ParkMap';
import type { ParkPoint } from '@/components/ParkMap';

/* ─── Types ─── */
interface Courier { id: number; name: string; phone: string; is_active: boolean; pin_code: string; }
interface ParkOrder {
  id: number; order_items: string; total_amount: number; customer_phone: string;
  park_point_id: number; park_point_name: string; park_lat: number; park_lng: number; park_note: string;
  status: string; assigned_courier_id: number; courier_name: string;
  created_at: string; updated_at: string;
}

const STATUS_FLOW: Record<string, { next: string; label: string; color: string }> = {
  courier_assigned: { next: 'on_the_way', label: 'Выехал к клиенту', color: 'bg-indigo-500 hover:bg-indigo-600' },
  on_the_way: { next: 'delivered', label: 'Доставил', color: 'bg-green-500 hover:bg-green-600' },
};

const STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  new: { label: 'Новый', color: 'bg-yellow-100 text-yellow-800', emoji: '🆕' },
  confirmed: { label: 'Подтверждён', color: 'bg-blue-100 text-blue-800', emoji: '✅' },
  preparing: { label: 'Готовится', color: 'bg-orange-100 text-orange-800', emoji: '👨‍🍳' },
  courier_assigned: { label: 'Назначен вам', color: 'bg-purple-100 text-purple-800', emoji: '📦' },
  on_the_way: { label: 'В пути', color: 'bg-indigo-100 text-indigo-800', emoji: '🚴' },
  delivered: { label: 'Доставлен', color: 'bg-green-100 text-green-800', emoji: '✅' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-800', emoji: '❌' },
};

export default function FoodCourier() {
  const [courier, setCourier] = useState<Courier | null>(null);
  const [pinCode, setPinCode] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [orders, setOrders] = useState<ParkOrder[]>([]);
  const [parkPoints, setParkPoints] = useState<ParkPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<number | null>(null);
  const [updatingOrder, setUpdatingOrder] = useState<number | null>(null);

  // Check saved courier session
  useEffect(() => {
    const saved = sessionStorage.getItem('courier_session');
    if (saved) {
      try {
        const c = JSON.parse(saved);
        setCourier(c);
      } catch { /* ignore */ }
    }
  }, []);

  // Load orders and park points when courier is logged in
  useEffect(() => {
    if (courier) {
      loadOrders();
      loadParkPoints();
    }
  }, [courier]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!courier) return;
    const interval = setInterval(loadOrders, 15000);
    return () => clearInterval(interval);
  }, [courier]);

  async function loadParkPoints() {
    try {
      const result = await withRetry(() => client.entities.park_points.query({ sort: 'sort_order', limit: 50 }));
      setParkPoints((result?.data?.items || []).filter((p: ParkPoint) => p.is_active));
    } catch (e) {
      console.error('Error loading park points:', e);
    }
  }

  async function handleLogin() {
    if (!pinCode.trim() || pinCode.length < 4) {
      toast.error('Введите 4-значный PIN-код');
      return;
    }
    setLoginLoading(true);
    try {
      const result = await withRetry(() => client.entities.couriers.query({ limit: 50 }));
      const couriers: Courier[] = result?.data?.items || [];
      const found = couriers.find(c => c.pin_code === pinCode.trim() && c.is_active);
      if (found) {
        setCourier(found);
        sessionStorage.setItem('courier_session', JSON.stringify(found));
        toast.success(`Добро пожаловать, ${found.name}!`);
      } else {
        toast.error('Неверный PIN-код');
      }
    } catch (e) {
      console.error('Login error:', e);
      toast.error('Ошибка подключения');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleLogout() {
    setCourier(null);
    setOrders([]);
    sessionStorage.removeItem('courier_session');
    setPinCode('');
  }

  async function loadOrders() {
    if (!courier) return;
    setLoading(true);
    try {
      const result = await withRetry(() => client.entities.park_orders.query({ sort: '-created_at', limit: 50 }));
      const allOrders: ParkOrder[] = result?.data?.items || [];
      const myOrders = allOrders.filter(o =>
        o.assigned_courier_id === courier.id &&
        ['courier_assigned', 'on_the_way', 'delivered'].includes(o.status)
      );
      setOrders(myOrders);
    } catch (e) {
      console.error('Error loading orders:', e);
    } finally {
      setLoading(false);
    }
  }

  async function updateOrderStatus(orderId: number, newStatus: string) {
    setUpdatingOrder(orderId);
    try {
      await withRetry(() => client.entities.park_orders.update({
        id: String(orderId),
        data: { status: newStatus, updated_at: new Date().toISOString() }
      }));
      toast.success(newStatus === 'delivered' ? '🎉 Заказ доставлен!' : 'Статус обновлён');
      loadOrders();
    } catch (e) {
      console.error('Error updating order:', e);
      toast.error('Ошибка обновления');
    } finally {
      setUpdatingOrder(null);
    }
  }

  function parseOrderItems(json: string): { name: string; price: number; quantity: number }[] {
    try { return JSON.parse(json); } catch { return []; }
  }

  function timeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин назад`;
    return `${Math.floor(mins / 60)} ч назад`;
  }

  /* ─── LOGIN SCREEN ─── */
  if (!courier) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Bike className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900">Панель курьера</h1>
            <p className="text-sm text-gray-500 mt-1">Доставка в парк 🌳</p>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-gray-600 mb-1.5 block">PIN-код</label>
              <Input
                type="password"
                maxLength={4}
                value={pinCode}
                onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))}
                placeholder="Введите 4-значный PIN"
                className="rounded-xl h-12 text-center text-2xl tracking-widest"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={loginLoading || pinCode.length < 4}
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-xl font-bold text-base"
            >
              {loginLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
              Войти
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── COURIER DASHBOARD ─── */
  const activeOrders = orders.filter(o => ['courier_assigned', 'on_the_way'].includes(o.status));
  const completedOrders = orders.filter(o => o.status === 'delivered');

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* Header */}
      <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <Bike className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-sm">{courier.name}</p>
            <p className="text-white/70 text-xs">Курьер</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadOrders} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleLogout} className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center hover:bg-white/30">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Active orders count */}
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-2xl font-extrabold text-gray-900">{activeOrders.length}</p>
            <p className="text-xs text-gray-500">Активных заказов</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-green-600">{completedOrders.length}</p>
            <p className="text-xs text-gray-500">Доставлено сегодня</p>
          </div>
        </div>

        {/* Active orders */}
        {activeOrders.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="font-medium text-gray-500">Нет активных заказов</p>
            <p className="text-xs text-gray-400 mt-1">Ожидайте назначения от оператора</p>
          </div>
        )}

        {activeOrders.map(order => {
          const isExpanded = expandedOrder === order.id;
          const items = parseOrderItems(order.order_items);
          const flow = STATUS_FLOW[order.status];
          const isUpdating = updatingOrder === order.id;

          return (
            <div key={order.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Order header */}
              <button
                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    order.status === 'on_the_way' ? 'bg-indigo-100' : 'bg-purple-100'
                  }`}>
                    <span className="text-lg">{STATUS_LABELS[order.status]?.emoji || '📦'}</span>
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900">Заказ #{order.id}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_LABELS[order.status]?.color}`}>
                        {STATUS_LABELS[order.status]?.label}
                      </span>
                      <span className="text-[10px] text-gray-400">{timeAgo(order.created_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-gray-900">{order.total_amount.toLocaleString()} ₸</span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 space-y-3">
                  {/* Park Map — shows delivery point */}
                  {parkPoints.length > 0 && (
                    <div className="rounded-xl overflow-hidden border border-green-100">
                      <ParkMap
                        points={parkPoints}
                        highlightId={order.park_point_id}
                        readOnly
                      />
                    </div>
                  )}

                  {/* Point & note */}
                  <div className="bg-green-50 rounded-xl p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="font-bold text-sm text-green-800">{order.park_point_name}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Navigation className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-green-700">{order.park_note}</span>
                    </div>
                  </div>

                  {/* Items */}
                  <div className="space-y-1">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.name} ×{item.quantity}</span>
                        <span className="font-medium text-gray-900">{(item.price * item.quantity).toLocaleString()} ₸</span>
                      </div>
                    ))}
                  </div>

                  {/* Contact buttons */}
                  <div className="flex gap-2">
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="flex-1 flex items-center justify-center gap-2 bg-blue-50 text-blue-700 font-bold text-sm py-3 rounded-xl hover:bg-blue-100 transition-colors"
                    >
                      <Phone className="w-4 h-4" /> Позвонить
                    </a>
                    <a
                      href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-2 bg-green-50 text-green-700 font-bold text-sm py-3 rounded-xl hover:bg-green-100 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" /> WhatsApp
                    </a>
                  </div>

                  {/* Action button */}
                  {flow && (
                    <Button
                      onClick={() => updateOrderStatus(order.id, flow.next)}
                      disabled={isUpdating}
                      className={`w-full h-12 text-white font-bold rounded-xl text-base ${flow.color}`}
                    >
                      {isUpdating ? (
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      ) : (
                        <ArrowRight className="w-5 h-5 mr-2" />
                      )}
                      {flow.label}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Completed orders */}
        {completedOrders.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-2">Доставленные</h3>
            <div className="space-y-2">
              {completedOrders.slice(0, 5).map(order => (
                <div key={order.id} className="bg-white rounded-xl p-3 shadow-sm flex items-center justify-between opacity-70">
                  <div className="flex items-center gap-2">
                    <span className="text-base">✅</span>
                    <div>
                      <span className="font-medium text-sm text-gray-700">#{order.id}</span>
                      <span className="text-xs text-gray-400 ml-2">{order.park_point_name}</span>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-600">{order.total_amount.toLocaleString()} ₸</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}