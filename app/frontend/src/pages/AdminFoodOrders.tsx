import { useState, useEffect, useMemo, useCallback } from 'react';
import { client, withRetry } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { fetchFoodRestaurantsList } from '@/lib/foodAdminApi';
import { findDamAlemRestaurantId } from '@/lib/damAlem';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Clock, Phone, MapPin, Truck, Store, ChevronDown, ChevronUp,
  MessageSquare, RefreshCw, Search, TrendingUp,
} from 'lucide-react';
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
  frontpad_order_number?: string;
  bonus_points_used?: number;
  bonus_discount_amount?: number;
  status: string;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; next?: string; nextLabel?: string }> = {
  new: { label: 'Новый', color: 'bg-yellow-100 text-yellow-800', next: 'confirmed', nextLabel: 'Подтвердить' },
  confirmed: { label: 'Подтверждён', color: 'bg-emerald-100 text-emerald-800', next: 'in_progress', nextLabel: 'Курьеру' },
  in_progress: { label: 'У курьера', color: 'bg-blue-100 text-blue-800', next: 'done', nextLabel: 'Доставлен' },
  done: { label: 'Доставлен', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-800' },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Наличные',
  kaspi_qr: 'Kaspi QR',
  halyk_qr: 'Halyk QR',
};

interface AdminFoodOrdersProps {
  damAlemMode?: boolean;
}

export default function AdminFoodOrders({ damAlemMode = false }: AdminFoodOrdersProps) {
  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [damAlemRestaurantId, setDamAlemRestaurantId] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ delivery_address: '', comment: '', total_amount: '', order_items: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!damAlemMode) return;
    fetchFoodRestaurantsList().then(rows => {
      setDamAlemRestaurantId(findDamAlemRestaurantId(rows));
    }).catch(() => {});
  }, [damAlemMode]);

  const loadOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await withRetry(() => client.entities.food_orders.query({ sort: '-created_at', limit: 200 }));
      setOrders(res?.data?.items || []);
    } catch (e) {
      console.error(e);
      if (!silent) toast.error('Ошибка загрузки заказов');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => loadOrders(true), 30000);
    return () => window.clearInterval(id);
  }, [autoRefresh, loadOrders]);

  async function updateStatus(orderId: number, newStatus: string) {
    try {
      await withRetry(() => client.entities.food_orders.update({ id: String(orderId), data: { status: newStatus } }));
      toast.success(newStatus === 'in_progress' ? 'Заказ отправлен курьерам в Telegram' : 'Статус обновлён');
      invalidateAllCaches();
      loadOrders(true);
    } catch {
      toast.error('Ошибка обновления');
    }
  }

  function startEdit(order: FoodOrder) {
    setEditingId(order.id);
    setEditForm({
      delivery_address: order.delivery_address || '',
      comment: order.comment || '',
      total_amount: String(order.total_amount ?? ''),
      order_items: order.order_items || '[]',
    });
  }

  async function saveEdit(orderId: number) {
    const itemsJson = editForm.order_items;
    try {
      JSON.parse(itemsJson);
    } catch {
      toast.error('Неверный JSON состава заказа');
      return;
    }
    const total = parseFloat(editForm.total_amount.replace(',', '.'));
    if (!Number.isFinite(total) || total <= 0) {
      toast.error('Укажите корректную сумму');
      return;
    }
    setSavingEdit(true);
    try {
      await withRetry(() => client.entities.food_orders.update({
        id: String(orderId),
        data: {
          delivery_address: editForm.delivery_address.trim(),
          comment: editForm.comment.trim(),
          total_amount: total,
          order_items: itemsJson,
        },
      }));
      toast.success('Заказ сохранён');
      setEditingId(null);
      invalidateAllCaches();
      loadOrders(true);
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSavingEdit(false);
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
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  function isToday(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getDate() === now.getDate()
      && d.getMonth() === now.getMonth()
      && d.getFullYear() === now.getFullYear();
  }

  const scopedOrders = useMemo(() => {
    if (!damAlemMode || damAlemRestaurantId == null) return orders;
    return orders.filter(o =>
      o.restaurant_id === damAlemRestaurantId
      || (o.restaurant_name || '').toLowerCase().includes('dam alem')
      || (o.restaurant_name || '').toLowerCase().includes('dam alem'.replace(' ', ''))
    );
  }, [orders, damAlemMode, damAlemRestaurantId]);

  const filteredOrders = useMemo(() => {
    let list = filter === 'all' ? scopedOrders : scopedOrders.filter(o => o.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(o =>
        String(o.id).includes(q)
        || (o.customer_name || '').toLowerCase().includes(q)
        || (o.customer_phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
        || (o.delivery_address || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [scopedOrders, filter, search]);

  const newCount = scopedOrders.filter(o => o.status === 'new').length;
  const confirmedCount = scopedOrders.filter(o => o.status === 'confirmed').length;
  const inProgressCount = scopedOrders.filter(o => o.status === 'in_progress').length;
  const todayOrders = scopedOrders.filter(o => isToday(o.created_at));
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total_amount || 0), 0);

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block w-8 h-8 border-4 border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-bold text-lg">{damAlemMode ? 'Заказы DAM ALEM' : 'Заказы еды'}</h3>
          {newCount > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-0">{newCount} новых</Badge>}
          {confirmedCount > 0 && <Badge className="bg-emerald-100 text-emerald-800 border-0">{confirmedCount} подтвержд.</Badge>}
          {inProgressCount > 0 && <Badge className="bg-blue-100 text-blue-800 border-0">{inProgressCount} у курьера</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Авто 30с
          </label>
          <Button size="sm" variant="outline" onClick={() => loadOrders()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Обновить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-gray-500">Сегодня заказов</p>
          <p className="text-xl font-bold">{todayOrders.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Выручка сегодня</p>
          <p className="text-xl font-bold text-orange-600">{todayRevenue.toLocaleString('ru-RU')} ₸</p>
        </div>
        <div className="rounded-xl border bg-white p-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500">Всего в списке</p>
          <p className="text-xl font-bold">{scopedOrders.length}</p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Поиск: №, имя, телефон, адрес…"
          className="pl-9 h-10 rounded-xl"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'all', label: 'Все' },
          { id: 'new', label: 'Новые' },
          { id: 'confirmed', label: 'Подтверждённые' },
          { id: 'in_progress', label: 'У курьера' },
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
            const payLabel = PAYMENT_LABELS[order.payment_method || ''] || order.payment_method;

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
                        {payLabel && (
                          <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px]">{payLabel}</Badge>
                        )}
                        {order.frontpad_order_number && (
                          <Badge className="bg-violet-50 text-violet-700 border-0 text-[10px]">
                            FP #{order.frontpad_order_number}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
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
                          Оплата: <span className="font-semibold">{payLabel}</span>
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

                    {(order.bonus_points_used || 0) > 0 && (
                      <div className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                        Бонусы: −{(order.bonus_discount_amount ?? order.bonus_points_used).toLocaleString()} ₸
                        {order.bonus_points_used ? ` (${order.bonus_points_used} баллов)` : ''}
                      </div>
                    )}

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
                            {(oi.sum ?? ((oi.price + (oi.modTotal ?? oi.mod_total ?? (oi.modifiers?.reduce((s: number, m: any) => s + (m.price || 0), 0) || 0))) * (oi.quantity ?? oi.qty ?? 1))).toLocaleString()} ₸
                          </span>
                        </div>
                      ))}
                    </div>

                    {editingId === order.id ? (
                      <div className="space-y-2 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                        <p className="text-xs font-semibold text-orange-800">Редактирование после звонка клиенту</p>
                        <Input
                          value={editForm.delivery_address}
                          onChange={e => setEditForm(f => ({ ...f, delivery_address: e.target.value }))}
                          placeholder="Адрес доставки"
                          className="h-9 text-sm"
                        />
                        <Input
                          value={editForm.comment}
                          onChange={e => setEditForm(f => ({ ...f, comment: e.target.value }))}
                          placeholder="Комментарий"
                          className="h-9 text-sm"
                        />
                        <Input
                          value={editForm.total_amount}
                          onChange={e => setEditForm(f => ({ ...f, total_amount: e.target.value }))}
                          placeholder="Итого, ₸"
                          className="h-9 text-sm"
                        />
                        <textarea
                          value={editForm.order_items}
                          onChange={e => setEditForm(f => ({ ...f, order_items: e.target.value }))}
                          rows={4}
                          className="w-full rounded-md border border-gray-200 bg-white p-2 text-xs font-mono"
                          placeholder="JSON состава заказа"
                        />
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" disabled={savingEdit} onClick={() => saveEdit(order.id)} className="bg-orange-500 hover:bg-orange-600">
                            Сохранить
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Отмена</Button>
                        </div>
                      </div>
                    ) : (
                      order.status !== 'done' && order.status !== 'cancelled' && (
                        <Button size="sm" variant="outline" onClick={() => startEdit(order)} className="text-orange-700 border-orange-200">
                          ✏️ Изменить заказ
                        </Button>
                      )
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {st.next && (
                        <Button size="sm" onClick={() => updateStatus(order.id, st.next!)} className="bg-orange-500 hover:bg-orange-600">
                          {st.nextLabel}
                        </Button>
                      )}
                      {order.status !== 'cancelled' && order.status !== 'done' && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(order.id, 'cancelled')} className="text-red-600 border-red-200">
                          Отменить
                        </Button>
                      )}
                      {order.restaurant_phone && (
                        <a href={`tel:${order.restaurant_phone}`} className="inline-flex items-center gap-1 text-sm text-blue-600 px-3 py-1.5">
                          <Phone className="w-3.5 h-3.5" /> Позвонить
                        </a>
                      )}
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
