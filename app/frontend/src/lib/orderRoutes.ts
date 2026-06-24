export type OrderSource = 'food' | 'volna' | 'gastronom' | 'pharmacy' | 'prorab' | 'park';

export const ORDER_SOURCE_LABELS: Record<OrderSource, string> = {
  food: 'DAM ALEM',
  volna: 'VOLNA',
  gastronom: 'Гастроном',
  pharmacy: 'Аптека',
  prorab: 'Прораб',
  park: 'Фуд-парк',
};

export const ORDER_SOURCE_PATHS: Record<OrderSource, string> = {
  food: '/food',
  volna: '/volna',
  gastronom: '/gastronom',
  pharmacy: '/apteka',
  prorab: '/prorab',
  park: '/food/park',
};

export function cabinetOrderDetailPath(source: string, orderNumber: number | string): string {
  return `/cabinet/orders/${source}/${orderNumber}`;
}

export function parseOrderItems(raw?: string | null): Array<Record<string, unknown>> {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
