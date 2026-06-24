import { appCache } from './cache';
import { getAPIBaseURL } from './config';
import { storeApiHeaders } from './storeApiAuth';
import type { DeliveryQuote } from './gastronomDelivery';

const CATALOG_CACHE_KEY = 'pharmacy_catalog';
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

export interface PharmacyCategory {
  id: number;
  name: string;
  image_url: string;
  sort_order: number;
  is_active: boolean;
  is_rx?: boolean;
}

export interface PharmacyProduct {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: number;
  old_price?: number | null;
  weight: string;
  image_url: string;
  is_popular: boolean;
  is_active: boolean;
  in_stock?: boolean;
  requires_prescription?: boolean;
  manufacturer?: string;
  country?: string;
  active_ingredient?: string;
  dosage_form?: string;
  sort_order: number;
}

export interface PharmacySettings {
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
  rx_banner_image?: string;
  [key: string]: string | undefined;
}

export interface PharmacyOrder {
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

export type PharmacyCatalog = {
  categories: PharmacyCategory[];
  products: PharmacyProduct[];
  settings: PharmacySettings;
};

export function getCachedPharmacyCatalog(): PharmacyCatalog | null {
  if (appCache.isFresh(CATALOG_CACHE_KEY)) {
    return appCache.get<PharmacyCatalog>(CATALOG_CACHE_KEY);
  }
  return null;
}

export async function fetchPharmacyCatalog(force = false): Promise<PharmacyCatalog> {
  if (!force && appCache.isFresh(CATALOG_CACHE_KEY)) {
    const cached = appCache.get<PharmacyCatalog>(CATALOG_CACHE_KEY);
    if (cached) return cached;
  }
  const data = await request<PharmacyCatalog>('/api/v1/pharmacy/catalog');
  appCache.set(CATALOG_CACHE_KEY, data, CATALOG_TTL);
  return data;
}

export async function fetchDeliveryQuote(body: {
  address?: string;
  lat?: number;
  lng?: number;
}): Promise<DeliveryQuote> {
  return request('/api/v1/pharmacy/delivery-quote', { method: 'POST', body: JSON.stringify(body) });
}

export async function createPharmacyOrder(data: {
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
}): Promise<PharmacyOrder> {
  return request('/api/v1/pharmacy/orders', { method: 'POST', body: JSON.stringify(data) });
}

export async function fetchPharmacyCategories(): Promise<PharmacyCategory[]> {
  const j = await request<{ items: PharmacyCategory[] }>('/api/v1/pharmacy/categories', {}, true);
  return j.items || [];
}

export async function fetchPharmacyProducts(): Promise<PharmacyProduct[]> {
  const j = await request<{ items: PharmacyProduct[] }>('/api/v1/pharmacy/products', {}, true);
  return j.items || [];
}

export async function fetchPharmacyOrders(): Promise<PharmacyOrder[]> {
  const j = await request<{ items: PharmacyOrder[] }>('/api/v1/pharmacy/orders', {}, true);
  return j.items || [];
}

export async function fetchPharmacySettings(): Promise<PharmacySettings> {
  return request('/api/v1/pharmacy/settings');
}

export async function savePharmacyCategory(data: Partial<PharmacyCategory> & { name: string }): Promise<PharmacyCategory> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/pharmacy/categories/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/pharmacy/categories', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deletePharmacyCategory(id: number): Promise<void> {
  await request(`/api/v1/pharmacy/categories/${id}`, { method: 'DELETE' }, true);
}

export async function savePharmacyProduct(data: Partial<PharmacyProduct> & { name: string; price: number }): Promise<PharmacyProduct> {
  if (data.id) {
    const { id, ...rest } = data;
    return request(`/api/v1/pharmacy/products/${id}`, { method: 'PUT', body: JSON.stringify(rest) }, true);
  }
  return request('/api/v1/pharmacy/products', { method: 'POST', body: JSON.stringify(data) }, true);
}

export async function deletePharmacyProduct(id: number): Promise<void> {
  await request(`/api/v1/pharmacy/products/${id}`, { method: 'DELETE' }, true);
}

export async function savePharmacySettings(settings: Record<string, string>): Promise<PharmacySettings> {
  return request('/api/v1/pharmacy/settings', { method: 'PUT', body: JSON.stringify({ settings }) }, true);
}

export async function updatePharmacyOrderStatus(orderId: number, status: string): Promise<PharmacyOrder> {
  return request(`/api/v1/pharmacy/orders/${orderId}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' }, true);
}
