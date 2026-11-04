import { apiUrl } from './config';
import { getAccountToken } from './accountApi';

export type ShopZone = { name: string; price: string };
export type Light = 'bright' | 'diffused' | 'partial';
export type Water = 'rare' | 'moderate' | 'often';
export type ShopProduct = {
  sku: string; category: string; name: string; kind?: string | null; height_cm?: number | null; pot_cm?: number | null;
  price: number; image?: string | null; description?: string | null; light?: Light | null; water?: Water | null; easy?: boolean;
};
export type Shop = {
  slug: string; name: string; headline?: string; logo?: string; accent?: string; hours?: string;
  phone?: string; whatsapp?: string; instagram?: string; delivery_note?: string; min_order?: number;
  delivery: ShopZone[]; categories: string[]; products: ShopProduct[];
};
export type ShopSummary = {
  slug: string; name: string; headline: string; logo: string; accent: string; free_zones: string[];
  products: number; from_price: number; photos: string[];
};
export type ShopOrder = { name: string; phone: string; address: string; zone: string; wanted: string; comment: string; items: { sku: string; qty: number }[] };

export type OrderStatus = 'new' | 'accepted' | 'done' | 'cancelled';
export type CabinetOrder = {
  id: number; items: { sku: string; name: string; price: number; qty: number }[]; total: number; name: string; phone: string;
  address: string; zone: string; wanted: string; comment: string; status: OrderStatus; accepted_by: string; created_at: string;
};
export type CabinetProduct = ShopProduct & { active: boolean };
export type Cabinet = {
  slug: string; name: string; enabled: boolean; accent: string; logo: string; hours: string; headline: string;
  statuses: Record<OrderStatus, string>; stats: { new: number; month_orders: number; month_total: number };
  orders: CabinetOrder[]; products: CabinetProduct[]; telegram: { name: string; linked_at: string }[];
};

export const LIGHT: Record<Light, string> = { bright: 'Яркий свет, можно солнце', diffused: 'Светло, без прямого солнца', partial: 'Полутень' };
export const WATER: Record<Water, string> = { rare: 'Редко, раз в 2–3 недели', moderate: 'Когда подсохнет земля', often: 'Часто, земля чуть влажная' };

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string; account?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.token) headers.Authorization = `Shop ${init.token}`;
  else if (init.account && getAccountToken()) headers.Authorization = `Bearer ${getAccountToken()}`;  // goes to the resident's order history
  const response = await fetch(apiUrl(`/api/v1/shops${path}`), {
    method: init.method || (init.body !== undefined ? 'POST' : 'GET'), headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const failure = new Error(typeof error.detail === 'string' ? error.detail : 'Не получилось. Проверьте интернет и попробуйте ещё раз.');
    (failure as Error & { status?: number }).status = response.status;
    throw failure;
  }
  return response.json();
}

const at = (slug: string) => `/${encodeURIComponent(slug)}`;

export const partnerShop = {
  list: () => call<{ items: ShopSummary[] }>('').then(r => r.items),
  get: (slug: string) => call<Shop>(at(slug)),
  order: (slug: string, order: ShopOrder) => call<{ id: number; total: number; notified: number }>(`${at(slug)}/orders`, { body: order, account: true }),
};

export type MyShop = { slug: string; name: string; logo: string };

export const shopCabinet = {
  /** Shops whose number is the signed-in account's confirmed number. */
  mine: () => (getAccountToken() ? call<{ items: MyShop[] }>('/mine', { account: true }).then(r => r.items) : Promise.resolve([] as MyShop[])),
  /** The owner signed in to the app by the shop's number: a cabinet token without the bot. */
  accountLogin: (slug: string) => call<{ token: string; name: string }>(`${at(slug)}/cabinet/account-login`, { method: 'POST', account: true }),
  login: (slug: string, code: string) => call<{ token: string; name: string }>(`${at(slug)}/cabinet/login`, { body: { code } }),
  get: (slug: string, token: string) => call<Cabinet>(`${at(slug)}/cabinet`, { token }),
  product: (slug: string, token: string, sku: string, change: Partial<Pick<CabinetProduct, 'price' | 'active' | 'description'>>) =>
    call<CabinetProduct>(`${at(slug)}/cabinet/products/${encodeURIComponent(sku)}`, { method: 'PATCH', body: change, token }),
  status: (slug: string, token: string, id: number, status: OrderStatus) =>
    call<CabinetOrder>(`${at(slug)}/cabinet/orders/${id}/status`, { body: { status }, token }),
  invite: (slug: string, token: string) => call<{ url: string; linked: number }>(`${at(slug)}/cabinet/telegram-link`, { method: 'POST', token }),
};

export const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₸`;
export const sizeOf = (p: Pick<ShopProduct, 'height_cm' | 'pot_cm'>) =>
  [p.height_cm && `высота ${p.height_cm} см`, p.pot_cm && `горшок ⌀${p.pot_cm} см`].filter(Boolean).join(' · ');
