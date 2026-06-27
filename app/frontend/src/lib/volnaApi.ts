import { appCache } from './cache';
import { getAPIBaseURL } from './config';
import { storeApiHeaders } from './storeApiAuth';
import type { DeliveryQuote } from './gastronomDelivery';

const CATALOG_CACHE_KEY = 'volna_catalog';
const CATALOG_TTL = 5 * 60 * 1000;

const apiBase = () => getAPIBaseURL();

async function request<T>(path: string, options: RequestInit = {}, admin = false): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers: { ...storeApiHeaders(admin, 'volna'), ...options.headers } });
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

export interface VolnaCategory {
  id: number;
  name: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

export interface VolnaProduct {
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

export interface VolnaSettings {
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
  promo_title?: string;
  promo_subtitle?: string;
  promo_image_url?: string;
  promo2_title?: string;
  promo2_subtitle?: string;
  [key: string]: string | undefined;
}

export interface VolnaOrder {
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

export type VolnaCatalog = {
  categories: VolnaCategory[];
  products: VolnaProduct[];
  settings: VolnaSettings;
};

export function getCachedVolnaCatalog(): VolnaCatalog | null {
  if (appCache.isFresh(CATALOG_CACHE_KEY)) {
    return appCache.get<VolnaCatalog>(CATALOG_CACHE_KEY);
  }
  return null;
}

export async function fetchVolnaCatalog(force = false): Promise<VolnaCatalog> {
  if (!force && appCache.isFresh(CATALOG_CACHE_KEY)) {
    const cached = appCache.get<VolnaCatalog>(CATALOG_CACHE_KEY);
    if (cached) return cached;
  }
  const data = await request<VolnaCatalog>('/api/v1/volna/catalog');
  appCache.set(CATALOG_CACHE_KEY, data, CATALOG_TTL);
  return data;
}

export async function fetchVolnaDeliveryQuote(body: {
  address?: string;
  lat?: number;
  lng?: number;
}): Promise<DeliveryQuote> {
  return request('/api/v1/volna/delivery-quote', { method: 'POST', body: JSON.stringify(body) });
}

export async function createVolnaOrder(data: {
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
}): Promise<VolnaOrder> {
  return request('/api/v1/volna/orders', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchVolnaCategories(): Promise<VolnaCategory[]> {
  const j = await request<{ items: VolnaCategory[] }>('/api/v1/volna/categories', {}, true);
  return j.items || [];
}

export async function fetchVolnaProducts(): Promise<VolnaProduct[]> {
  const j = await request<{ items: VolnaProduct[] }>('/api/v1/volna/products', {}, true);
  return j.items || [];
}

export async function fetchVolnaOrders(): Promise<VolnaOrder[]> {
  const j = await request<{ items: VolnaOrder[] }>('/api/v1/volna/orders', {}, true);
  return j.items || [];
}

export async function fetchVolnaSettings(): Promise<VolnaSettings> {
  return request('/api/v1/volna/settings');
}

export async function saveVolnaCategory(data: Partial<VolnaCategory> & { name: string }): Promise<VolnaCategory> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/volna/categories/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/volna/categories', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deleteVolnaCategory(id: number): Promise<void> {
  await request(`/api/v1/volna/categories/${id}`, { method: 'DELETE' }, true);
}

export async function saveVolnaProduct(data: Partial<VolnaProduct> & { name: string; price: number }): Promise<VolnaProduct> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/volna/products/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/volna/products', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deleteVolnaProduct(id: number): Promise<void> {
  await request(`/api/v1/volna/products/${id}`, { method: 'DELETE' }, true);
}

export async function saveVolnaSettings(settings: Record<string, string>): Promise<VolnaSettings> {
  return request('/api/v1/volna/settings', { method: 'PUT', body: JSON.stringify({ settings }) }, true);
}

export async function updateVolnaOrderStatus(orderId: number, status: string): Promise<VolnaOrder> {
  return request(`/api/v1/volna/orders/${orderId}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' }, true);
}
