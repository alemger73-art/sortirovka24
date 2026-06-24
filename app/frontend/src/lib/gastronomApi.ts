import { appCache } from './cache';
import { getAPIBaseURL } from './config';
import { storeApiHeaders } from './storeApiAuth';
import type { DeliveryQuote } from './gastronomDelivery';

const CATALOG_CACHE_KEY = 'gastronom_catalog';
const CATALOG_TTL = 5 * 60 * 1000;

const apiBase = () => getAPIBaseURL();

async function request<T>(path: string, options: RequestInit = {}, admin = false): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers: { ...storeApiHeaders(admin), ...options.headers } });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) message = typeof body.detail === 'string' ? body.detail : message;
    } catch {
      const err = await res.text().catch(() => '');
      if (err) message = err;
    }
    throw new Error(message);
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
  delivery_fee?: string;
  store_phone?: string;
  store_lat?: string;
  store_lng?: string;
  delivery_zones?: string;
  outside_zone_message?: string;
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

export type GastronomCatalog = {
  categories: GastronomCategory[];
  products: GastronomProduct[];
  settings: GastronomSettings;
};

export function getCachedGastronomCatalog(): GastronomCatalog | null {
  if (appCache.isFresh(CATALOG_CACHE_KEY)) {
    return appCache.get<GastronomCatalog>(CATALOG_CACHE_KEY);
  }
  return null;
}

export async function fetchGastronomCatalog(force = false): Promise<GastronomCatalog> {
  if (!force && appCache.isFresh(CATALOG_CACHE_KEY)) {
    const cached = appCache.get<GastronomCatalog>(CATALOG_CACHE_KEY);
    if (cached) return cached;
  }
  const data = await request<GastronomCatalog>('/api/v1/gastronom/catalog');
  appCache.set(CATALOG_CACHE_KEY, data, CATALOG_TTL);
  return data;
}

export async function fetchDeliveryQuote(body: {
  address?: string;
  lat?: number;
  lng?: number;
}): Promise<DeliveryQuote> {
  return request('/api/v1/gastronom/delivery-quote', { method: 'POST', body: JSON.stringify(body) });
}

export async function createGastronomOrder(data: {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  payment_method: string;
  comment?: string;
  order_items: string;
  total_amount: number;
  delivery_lat?: number;
  delivery_lng?: number;
  delivery_zone_id?: string | null;
  delivery_fee?: number;
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
