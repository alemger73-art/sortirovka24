import { apiUrl } from './config';

export type ShopZone = { name: string; price: string };
export type ShopProduct = { sku: string; category: string; name: string; kind?: string | null; height_cm?: number | null; pot_cm?: number | null; price: number; image?: string | null };
export type Shop = {
  slug: string; name: string; headline?: string; logo?: string; accent?: string; hours?: string;
  phone?: string; whatsapp?: string; instagram?: string; delivery_note?: string; min_order?: number;
  delivery: ShopZone[]; categories: string[]; products: ShopProduct[];
};
export type ShopOrder = { name: string; phone: string; address: string; zone: string; wanted: string; comment: string; items: { sku: string; qty: number }[] };

async function call<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl(`/api/v1/shops${path}`), body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Не получилось. Проверьте интернет и попробуйте ещё раз.');
  }
  return response.json();
}

export const partnerShop = {
  slugs: () => call<{ items: string[] }>('').then(r => r.items),
  get: (slug: string) => call<Shop>(`/${encodeURIComponent(slug)}`),
  order: (slug: string, order: ShopOrder) => call<{ id: number; total: number; notified: number }>(`/${encodeURIComponent(slug)}/orders`, order),
};

export const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₸`;
