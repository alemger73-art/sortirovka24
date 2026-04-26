import { useState, useEffect } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, Phone, MapPin, Truck, Store, ChevronDown, ChevronUp, MessageSquare, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface FoodOrder {
  id: number;
  restaurant_id?: number;
  restaurant_name?: string;
  restaurant_phone?: string;
  order_items: string;
  total_amount: number;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  comment: string;
  delivery_method: string;
  payment_method?: string;
  payment_status?: string;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  new: { label: 'Новый', color: 'bg-yellow-100 text-yellow-800', next: 'in_progress', nextLabel: 'Взять в работу' },
  in_progress: { label: 'Готовится', color: 'bg-blue-100 text-blue-800', next: 'done', nextLabel: 'Доставлен' },
  done: { label: 'Доставлен', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-800' },
};

export default function AdminFoodOrders() {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => { loadOrders(); }, []);

  async function loadOrders() {
    setLoading(true);
    try {
      const res = await withRetry(() => client.entities.food_orders.query({ sort: '-created_at', limit: 100 }));
      setOrders(res?.data?.items || []);
    } catch (e) {
      console.error(e);
      toast.error('Ошибка загрузки заказов');
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(orderId: number, newStatus: string) {
    try {
      await withRetry(() => client.entities.food_orders.update({ id: String(orderId), data: { status: newStatus } }));
      toast.success('Статус обновлён');
      invalidateAllCaches();
      loadOrders();
    } catch (e) {
      toast.error('Ошибка обновления');
    }
  }

  function parseItems(jsonStr: string) {
    try {
      return JSON.parse(jsonStr);
    } catch {
      return [];
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  const filteredOrders = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const newCount = orders.filter(o => o.status === 'new').length;
  const inProgressCount = orders.filter(o => o.status === 'in_progress').length;

  if (loading) {
    return <div className="text-center py-8"><div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-lg">Заказы еды</h3>
          {newCount > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-0">{newCount} новых</Badge>}
          {inProgressCount > 0 && <Badge className="bg-blue-100 text-blue-800 border-0">{inProgressCount} в работе</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={loadOrders}>
          <RefreshCw className="w-4 h-4 mr-1" /> Обновить
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'Все' },
          { id: 'new', label: 'Новые' },
          { id: 'in_progress', label: 'В работе' },
          { id: 'done', label: 'Доставленные' },
          { id: 'cancelled', label: 'Отменённые' },
        ].map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          Заказов нет
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map(order => {
            const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.new;
            const isExpanded = expandedId === order.id;
            const orderItems = parseItems(order.order_items);

            return (
              <div key={order.id} className="bg-white rounded-xl border overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">#{order.id}</span>
                        <Badge className={`${st.color} border-0 text-[10px]`}>{st.label}</Badge>
                        <Badge className="bg-gray-100 text-gray-600 border-0 text-[10px]">
                          {order.delivery_method === 'delivery' ? '🚗 Доставка' : '🏪 Самовывоз'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                        {order.restaurant_name && <span className="font-semibold">{order.restaurant_name}</span>}
                        <span>{order.customer_name}</span>
                        <span className="font-semibold text-gray-700">{order.total_amount.toLocaleString()} ₸</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(order.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                    {/* Contact info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <a href={`tel:${order.customer_phone}`} className="text-blue-600 hover:underline">{order.customer_phone}</a>
                      </div>
                      {order.delivery_address && (
                        <div className="flex items-center gap-2 text-gray-600">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          <span>{order.delivery_address}</span>
                        </div>
                      )}
                      {order.payment_method && (
                        <div className="text-gray-600">
                          Оплата: <span className="font-semibold">{order.payment_method}</span>
                          {order.payment_status ? ` (${order.payment_status})` : ''}
                        </div>
                      )}
                    </div>

                    {order.comment && (
                      <div className="flex items-start gap-2 text-sm bg-yellow-50 p-2.5 rounded-lg">
                        <MessageSquare className="w-4 h-4 text-yellow-600 mt-0.5" />
                        <span className="text-yellow-800">{order.comment}</span>
                      </div>
                    )}

                    {/* Order items */}
                    <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                      {orderItems.map((oi: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <div>
                            <span className="text-gray-800">{oi.name} × {oi.quantity}</span>
                            {oi.modifiers?.length > 0 && (
                              <span className="text-xs text-orange-500 block">+ {oi.modifiers.map((m: any) => m.name).join(', ')}</span>
                            )}
                          </div>
                          <span className="font-medium text-gray-700">
                            {((oi.price + (oi.modifiers?.reduce((s: number, m: any) => s + m.price, 0) || 0)) * oi.quantity).toLocaleString()} ₸
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-gray-200 pt-1.5 mt-1.5 flex justify-between font-bold text-sm">
                        <span>Итого</span>
                        <span>{order.total_amount.toLocaleString()} ₸</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap">
                      {st.next && (
                        <Button size="sm" onClick={() => updateStatus(order.id, st.next!)} className="bg-orange-500 hover:bg-orange-600">
                          {st.nextLabel}
                        </Button>
                      )}
                      {order.status !== 'cancelled' && order.status !== 'done' && (
                        <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => updateStatus(order.id, 'cancelled')}>
                          Отменить
                        </Button>
                      )}
                      <a
                        href={`https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                      </a>
                    </div>
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