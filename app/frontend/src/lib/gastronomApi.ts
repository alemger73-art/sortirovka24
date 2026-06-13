const apiBase = () =>
  (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL || '';

function headers(admin = false): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host':
      typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
  };
  if (admin) {
    try {
      const t = localStorage.getItem('token') || localStorage.getItem('_sp924_token');
      if (t) h.Authorization = `Bearer ${t}`;
    } catch {
      /* ignore */
    }
  }
  return h;
}

async function request<T>(path: string, options: RequestInit = {}, admin = false): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers: { ...headers(admin), ...options.headers } });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(err || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface GastronomCategory {
  id: number;
  name: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  is_alcohol?: boolean;
}

export interface GastronomProduct {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  weight: string;
  image_url: string;
  is_popular: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface GastronomSettings {
  default_address: string;
  delivery_time: string;
  min_order: string;
  hero_title: string;
  store_name: string;
  store_tagline: string;
  logo_url?: string;
  hero_image_url?: string;
  alcohol_banner_image?: string;
  [key: string]: string | undefined;
}

export interface GastronomOrder {
  id: number;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  payment_method: string;
  comment: string;
  order_items: string;
  total_amount: number;
  status: string;
  created_at: string;
}

export async function fetchGastronomCatalog(): Promise<{
  categories: GastronomCategory[];
  products: GastronomProduct[];
  settings: GastronomSettings;
}> {
  return request('/api/v1/gastronom/catalog');
}

export async function createGastronomOrder(data: {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  payment_method: string;
  comment?: string;
  order_items: string;
  total_amount: number;
}): Promise<GastronomOrder> {
  return request('/api/v1/gastronom/orders', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchGastronomCategories(): Promise<GastronomCategory[]> {
  const j = await request<{ items: GastronomCategory[] }>('/api/v1/gastronom/categories', {}, true);
  return j.items || [];
}

export async function fetchGastronomProducts(): Promise<GastronomProduct[]> {
  const j = await request<{ items: GastronomProduct[] }>('/api/v1/gastronom/products', {}, true);
  return j.items || [];
}

export async function fetchGastronomOrders(): Promise<GastronomOrder[]> {
  const j = await request<{ items: GastronomOrder[] }>('/api/v1/gastronom/orders', {}, true);
  return j.items || [];
}

export async function fetchGastronomSettings(): Promise<GastronomSettings> {
  return request('/api/v1/gastronom/settings');
}

export async function saveGastronomCategory(data: Partial<GastronomCategory> & { name: string }): Promise<GastronomCategory> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/gastronom/categories/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/gastronom/categories', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deleteGastronomCategory(id: number): Promise<void> {
  await request(`/api/v1/gastronom/categories/${id}`, { method: 'DELETE' }, true);
}

export async function saveGastronomProduct(data: Partial<GastronomProduct> & { name: string; price: number }): Promise<GastronomProduct> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/gastronom/products/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/gastronom/products', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deleteGastronomProduct(id: number): Promise<void> {
  await request(`/api/v1/gastronom/products/${id}`, { method: 'DELETE' }, true);
}

export async function saveGastronomSettings(settings: Record<string, string>): Promise<GastronomSettings> {
  return request('/api/v1/gastronom/settings', { method: 'PUT', body: JSON.stringify({ settings }) }, true);
}

export async function updateGastronomOrderStatus(orderId: number, status: string): Promise<GastronomOrder> {
  return request(`/api/v1/gastronom/orders/${orderId}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' }, true);
}
