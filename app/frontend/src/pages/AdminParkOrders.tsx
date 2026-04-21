import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw, MapPin, Phone, MessageSquare, Clock, User,
  ChevronDown, ChevronUp, Bike, ArrowRight, Package, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface ParkOrder {
  id: number; order_items: string; total_amount: number; customer_phone: string;
  park_point_id: number; park_point_name: string; park_lat: number; park_lng: number;
  park_note: string; user_geolocation: string; status: string;
  assigned_courier_id: number; courier_name: string;
  created_at: string; updated_at: string;
}

interface Courier { id: number; name: string; phone: string; is_active: boolean; }

const STATUS_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  new: { label: 'Новый', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', emoji: '🆕' },
  confirmed: { label: 'Подтверждён', color: 'bg-blue-100 text-blue-800 border-blue-200', emoji: '✅' },
  preparing: { label: 'Готовится', color: 'bg-orange-100 text-orange-800 border-orange-200', emoji: '👨‍🍳' },
  courier_assigned: { label: 'Курьер назначен', color: 'bg-purple-100 text-purple-800 border-purple-200', emoji: '🏃' },
  on_the_way: { label: 'В пути', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', emoji: '🚴' },
  delivered: { label: 'Доставлен', color: 'bg-green-100 text-green-800 border-green-200', emoji: '🎉' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-800 border-red-200', emoji: '❌' },
};

const STATUS_FLOW: Record<string, string[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['courier_assigned', 'cancelled'],
  courier_assigned: ['on_the_way', 'cancelled'],
  on_the_way: ['delivered', 'cancelled'],
};

export default function AdminParkOrders() {
  const [orders, setOrders] = useState<ParkOrder[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [assigningCourier, setAssigningCourier] = useState<number | null>(null);

  useEffect(() => { loadAll(); }, []);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    const interval = setInterval(loadAll, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadAll() {
    try {
      const [ordersRes, couriersRes] = await Promise.all([
        withRetry(() => client.entities.park_orders.query({ sort: '-created_at', limit: 100 })),
        withRetry(() => client.entities.couriers.query({ limit: 50 })),
      ]);
      setOrders(ordersRes?.data?.items || []);
      setCouriers((couriersRes?.data?.items || []).filter((c: Courier) => c.is_active));
    } catch (e) {
      console.error('Error loading:', e);
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(orderId: number, newStatus: string) {
    try {
      await withRetry(() => client.entities.park_orders.update({
        id: String(orderId),
        data: { status: newStatus, updated_at: new Date().toISOString() }
      }));
      toast.success(`Статус → ${STATUS_CONFIG[newStatus]?.label || newStatus}`);
      invalidateAllCaches();
      loadAll();
    } catch { toast.error('Ошибка обновления'); }
  }

  async function assignCourier(orderId: number, courier: Courier) {
    try {
      await withRetry(() => client.entities.park_orders.update({
        id: String(orderId),
        data: {
          status: 'courier_assigned',
          assigned_courier_id: courier.id,
          courier_name: courier.name,
          updated_at: new Date().toISOString(),
        }
      }));
      toast.success(`Курьер ${courier.name} назначен`);
      invalidateAllCaches();
      setAssigningCourier(null);
      loadAll();
    } catch { toast.error('Ошибка назначения'); }
  }

  function parseItems(json: string): { name: string; price: number; quantity: number }[] {
    try { return JSON.parse(json); } catch { return []; }
  }

  function timeAgo(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин`;
    return `${Math.floor(mins / 60)} ч ${mins % 60} мин`;
  }

  const filteredOrders = orders.filter(o => {
    if (statusFilter === 'active') return !['delivered', 'cancelled'].includes(o.status);
    if (statusFilter === 'completed') return o.status === 'delivered';
    if (statusFilter === 'cancelled') return o.status === 'cancelled';
    return true;
  });

  if (loading) {
    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg">Заказы в парк 🌳</h3>
          <p className="text-xs text-gray-500">Всего: {orders.length} | Активных: {orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length}</p>
        </div>
        <Button size="sm" variant="outline" onClick={loadAll}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Обновить
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'active', label: 'Активные', count: orders.filter(o => !['delivered', 'cancelled'].includes(o.status)).length },
          { id: 'completed', label: 'Доставлены', count: orders.filter(o => o.status === 'delivered').length },
          { id: 'cancelled', label: 'Отменены', count: orders.filter(o => o.status === 'cancelled').length },
          { id: 'all', label: 'Все', count: orders.length },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === f.id ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {/* Orders list */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">Нет заказов</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const isExpanded = expandedId === order.id;
            const items = parseItems(order.order_items);
            const nextStatuses = STATUS_FLOW[order.status] || [];
            const isAssigning = assigningCourier === order.id;

            return (
              <div key={order.id} className="bg-white rounded-xl border overflow-hidden">
                {/* Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full p-3 flex items-center justify-between text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      <span className="text-lg">{STATUS_CONFIG[order.status]?.emoji || '📦'}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">#{order.id}</span>
                        <Badge className={`border text-[10px] ${STATUS_CONFIG[order.status]?.color}`}>
                          {STATUS_CONFIG[order.status]?.label}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{order.park_point_name}</span>
                        <span>•</span>
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(order.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="font-bold text-sm">{order.total_amount.toLocaleString()} ₸</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>

                {/* Expanded */}
                {isExpanded && (
                  <div className="border-t border-gray-100 p-3 space-y-3">
                    {/* Customer info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <a href={`tel:${order.customer_phone}`} className="text-sm font-medium text-blue-600 hover:underline">{order.customer_phone}</a>
                        </div>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-sm font-medium">{order.park_point_name}</span>
                        </div>
                      </div>
                    </div>

                    {/* Note */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5">
                      <p className="text-xs font-bold text-yellow-700 mb-0.5">📍 Ориентир:</p>
                      <p className="text-sm text-yellow-800">{order.park_note || 'Не указан'}</p>
                    </div>

                    {/* Items */}
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-gray-500 uppercase">Позиции:</p>
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-gray-700">{item.name} ×{item.quantity}</span>
                          <span className="font-medium">{(item.price * item.quantity).toLocaleString()} ₸</span>
                        </div>
                      ))}
                      <div className="border-t pt-1 flex justify-between font-bold text-sm">
                        <span>Итого</span>
                        <span>{order.total_amount.toLocaleString()} ₸</span>
                      </div>
                    </div>

                    {/* Courier info */}
                    {order.courier_name && (
                      <div className="bg-purple-50 rounded-lg p-2.5 flex items-center gap-2">
                        <Bike className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-purple-800">Курьер: {order.courier_name}</span>
                      </div>
                    )}

                    {/* Assign courier */}
                    {order.status === 'preparing' && (
                      <div>
                        <Button size="sm" variant="outline" onClick={() => setAssigningCourier(isAssigning ? null : order.id)} className="w-full">
                          <Bike className="w-4 h-4 mr-1" /> Назначить курьера
                        </Button>
                        {isAssigning && (
                          <div className="mt-2 space-y-1.5">
                            {couriers.map(c => (
                              <button
                                key={c.id}
                                onClick={() => assignCourier(order.id, c)}
                                className="w-full flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 hover:bg-purple-50 transition-colors text-left"
                              >
                                <User className="w-4 h-4 text-gray-400" />
                                <div>
                                  <span className="text-sm font-medium">{c.name}</span>
                                  <span className="text-xs text-gray-400 ml-2">{c.phone}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status actions */}
                    {nextStatuses.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {nextStatuses.map(ns => (
                          <Button
                            key={ns}
                            size="sm"
                            onClick={() => {
                              if (ns === 'courier_assigned' && !order.assigned_courier_id) {
                                setAssigningCourier(order.id);
                                return;
                              }
                              updateStatus(order.id, ns);
                            }}
                            className={ns === 'cancelled'
                              ? 'bg-red-500 hover:bg-red-600 text-white'
                              : 'bg-green-500 hover:bg-green-600 text-white'
                            }
                          >
                            {ns === 'cancelled' ? '❌' : <ArrowRight className="w-3.5 h-3.5 mr-1" />}
                            {STATUS_CONFIG[ns]?.label || ns}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}