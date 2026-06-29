/** Direct HTTP helpers for food entities when @metagptx/web-sdk has no generated client (e.g. food_restaurants). */

import { getAPIBaseURL } from './config';
import { getPartnerToken } from './partnerAuthApi';
import { humanizeApiError } from './apiErrors';

const apiBase = () => getAPIBaseURL();

function adminHeaders(): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host': typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
      ? (globalThis as any).window.location.origin
      : '',
  };
  try {
    const t = localStorage.getItem('_sp924_token')
      || getPartnerToken('dam_alem')
      || localStorage.getItem('token');
    if (t) h.Authorization = `Bearer ${t}`;
  } catch {
    /* ignore */
  }
  return h;
}

async function parseEntityError(res: Response): Promise<never> {
  let detail = '';
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') {
      detail = body.detail;
    } else if (Array.isArray(body?.detail)) {
      detail = body.detail
        .map((item: { msg?: string; loc?: unknown[] }) => item?.msg || String(item))
        .filter(Boolean)
        .join('; ');
    } else if (typeof body?.message === 'string') {
      detail = body.message;
    }
  } catch {
    /* ignore */
  }
  const message = detail || `HTTP ${res.status}`;
  throw new Error(humanizeApiError(new Error(message)));
}

export interface BannerPayload {
  title: string;
  banner_text?: string;
  subtitle?: string;
  image_url?: string;
  link_url?: string;
  button_text?: string;
  button_url?: string;
  banner_type?: string;
  active?: boolean;
  created_at?: string;
}

export async function fetchBannersList(params?: { limit?: number; sort?: string }): Promise<any[]> {
  const limit = params?.limit ?? 100;
  const sort = params?.sort ?? '-created_at';
  const res = await fetch(
    `${apiBase()}/api/v1/entities/banners?limit=${limit}&sort=${encodeURIComponent(sort)}`,
    { headers: adminHeaders() },
  );
  if (!res.ok) await parseEntityError(res);
  const j = await res.json();
  return j.items || [];
}

export async function createBanner(data: BannerPayload): Promise<any> {
  const res = await fetch(`${apiBase()}/api/v1/entities/banners`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await parseEntityError(res);
  return res.json();
}

export async function updateBanner(id: number | string, data: BannerPayload): Promise<any> {
  const res = await fetch(`${apiBase()}/api/v1/entities/banners/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) await parseEntityError(res);
  return res.json();
}

export async function deleteBanner(id: number | string): Promise<void> {
  const res = await fetch(`${apiBase()}/api/v1/entities/banners/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!res.ok) await parseEntityError(res);
}

export async function fetchFoodRestaurantsList(): Promise<any[]> {
  const res = await fetch(
    `${apiBase()}/api/v1/entities/food_restaurants?limit=500&sort=sort_order`,
    { headers: adminHeaders() }
  );
  if (!res.ok) return [];
  const j = await res.json();
  return j.items || [];
}

export async function createFoodRestaurant(data: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${apiBase()}/api/v1/entities/food_restaurants`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('create restaurant failed');
  return res.json();
}

export async function updateFoodRestaurant(id: string | number, data: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${apiBase()}/api/v1/entities/food_restaurants/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('update restaurant failed');
  return res.json();
}

export async function deleteFoodRestaurant(id: string | number): Promise<void> {
  const res = await fetch(`${apiBase()}/api/v1/entities/food_restaurants/${id}`, {
    method: 'DELETE',
    headers: adminHeaders(),
  });
  if (!res.ok) throw new Error('delete restaurant failed');
}
