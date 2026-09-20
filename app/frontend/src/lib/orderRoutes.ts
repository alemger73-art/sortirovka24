import { DAM_ALEM_BRAND } from '@/lib/damAlem';

export type OrderSource = 'food' | 'volna' | 'gastronom' | 'pharmacy' | 'prorab';

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  food: DAM_ALEM_BRAND,
  volna: 'VOLNA',
  gastronom: 'Гастроном',
  pharmacy: 'Аптека',
  prorab: 'Прораб',
};

export const ORDER_SOURCE_PATHS: Record<OrderSource, string> = {
  food: '/food',
  volna: '/volna',
  gastronom: '/gastronom',
  pharmacy: '/apteka',
  prorab: '/prorab',
};

export function cabinetOrderDetailPath(source: string, orderNumber: number | string): string {
  return `/cabinet/orders/${source}/${orderNumber}`;
}

export function parseOrderItems(raw?: unknown): Array<Record<string, unknown>> {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) : [];
  } catch { return []; }
}

export function orderLineQuantity(item: Record<string, unknown>): number {
  const value = Number(item.qty ?? item.quantity ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function orderLineTotal(item: Record<string, unknown>): number {
  const explicit = item.line_total ?? item.total;
  if (explicit != null && Number.isFinite(Number(explicit))) return Math.max(0, Number(explicit));
  const extras = item.modTotal ?? (Array.isArray(item.modifiers) ? item.modifiers.reduce((sum, mod) => sum + (Number(mod?.price) || 0), 0) : 0);
  const total = (Number(item.price ?? 0) + Number(extras)) * orderLineQuantity(item);
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

const STORE_REPEAT_KEYS: Partial<Record<OrderSource, string>> = {
  volna: 'volna_repeat_order',
  gastronom: 'gastronom_repeat_order',
  pharmacy: 'pharmacy_repeat_order',
  prorab: 'prorab_repeat_order',
};

export function saveStoreRepeatOrder(source: OrderSource, orderItems?: string | null, address?: string | null) {
  const key = STORE_REPEAT_KEYS[source];
  if (!key || !orderItems) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ order_items: orderItems, customer_address: address || '' }));
  } catch {
    /* ignore */
  }
}

export interface CabinetOrderRow {
  id: string;
  type: string;
  status?: string;
  amount?: number;
  details?: string;
  store_label?: string;
  store_path?: string;
  payment_method?: string;
  order_number?: number;
  order_items?: string;
  customer_name?: string;
  customer_address?: string;
  delivery_address?: string;
  comment?: string;
  created_at?: string;
  restaurant_name?: string;
  delivery_method?: string;
  food_order_id?: number;
}

export function orderDetailId(order: CabinetOrderRow): { source: string; id: number } | null {
  const num = order.order_number ?? order.food_order_id;
  if (!order.type || num == null) return null;
  return { source: order.type, id: Number(num) };
}
