import { appCache } from './cache';
import { getAPIBaseURL } from './config';
import { storeApiHeaders } from './storeApiAuth';
import type { DeliveryQuote } from './gastronomDelivery';

const CATALOG_CACHE_KEY = 'prorab_catalog';
const CATALOG_TTL = 5 * 60 * 1000;

const apiBase = () => getAPIBaseURL();

async function request<T>(path: string, options: RequestInit = {}, admin = false): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers: { ...storeApiHeaders(admin, 'prorab'), ...options.headers } });
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

export interface ProrabCategory {
  id: number;
  name: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
}

export interface ProrabProduct {
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

export interface ProrabSettings {
  default_address: string;
  delivery_time: string;
  min_order: string;
  delivery_fee?: string;
  free_delivery_from?: string;
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
  operator_note?: string;
  [key: string]: string | undefined;
}

export interface ProrabOrder {
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

export type ProrabCatalog = {
  categories: ProrabCategory[];
  products: ProrabProduct[];
  settings: ProrabSettings;
};

export function getCachedProrabCatalog(): ProrabCatalog | null {
  if (appCache.isFresh(CATALOG_CACHE_KEY)) {
    return appCache.get<ProrabCatalog>(CATALOG_CACHE_KEY);
  }
  return null;
}

export async function fetchProrabCatalog(force = false): Promise<ProrabCatalog> {
  if (!force && appCache.isFresh(CATALOG_CACHE_KEY)) {
    const cached = appCache.get<ProrabCatalog>(CATALOG_CACHE_KEY);
    if (cached) return cached;
  }
  const data = await request<ProrabCatalog>('/api/v1/prorab/catalog');
  appCache.set(CATALOG_CACHE_KEY, data, CATALOG_TTL);
  return data;
}

export async function fetchProrabDeliveryQuote(body: {
  address?: string;
  lat?: number;
  lng?: number;
  cart_subtotal?: number;
}): Promise<DeliveryQuote & { free_delivery_from?: number; free_delivery_applied?: boolean; base_delivery_fee?: number }> {
  return request('/api/v1/prorab/delivery-quote', { method: 'POST', body: JSON.stringify(body) });
}

export async function createProrabOrder(data: {
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
}): Promise<ProrabOrder> {
  return request('/api/v1/prorab/orders', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchProrabCategories(): Promise<ProrabCategory[]> {
  const j = await request<{ items: ProrabCategory[] }>('/api/v1/prorab/categories', {}, true);
  return j.items || [];
}

export async function fetchProrabProducts(): Promise<ProrabProduct[]> {
  const j = await request<{ items: ProrabProduct[] }>('/api/v1/prorab/products', {}, true);
  return j.items || [];
}

export async function fetchProrabOrders(): Promise<ProrabOrder[]> {
  const j = await request<{ items: ProrabOrder[] }>('/api/v1/prorab/orders', {}, true);
  return j.items || [];
}

export async function fetchProrabSettings(): Promise<ProrabSettings> {
  return request('/api/v1/prorab/settings');
}

export async function saveProrabCategory(data: Partial<ProrabCategory> & { name: string }): Promise<ProrabCategory> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/prorab/categories/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/prorab/categories', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deleteProrabCategory(id: number): Promise<void> {
  await request(`/api/v1/prorab/categories/${id}`, { method: 'DELETE' }, true);
}

export async function saveProrabProduct(data: Partial<ProrabProduct> & { name: string; price: number }): Promise<ProrabProduct> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/prorab/products/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/prorab/products', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deleteProrabProduct(id: number): Promise<void> {
  await request(`/api/v1/prorab/products/${id}`, { method: 'DELETE' }, true);
}

export async function saveProrabSettings(settings: Record<string, string>): Promise<ProrabSettings> {
  return request('/api/v1/prorab/settings', { method: 'PUT', body: JSON.stringify({ settings }) }, true);
}

export async function updateProrabOrderStatus(orderId: number, status: string): Promise<ProrabOrder> {
  return request(`/api/v1/prorab/orders/${orderId}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' }, true);
}
