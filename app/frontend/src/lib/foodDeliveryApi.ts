import { getAPIBaseURL } from './config';
import type { DeliveryQuote } from './gastronomDelivery';

const apiBase = () => getAPIBaseURL().replace(/\/$/, '');

export type FoodDeliveryQuote = DeliveryQuote & {
  base_delivery_fee?: number;
  free_delivery_from?: number;
  free_delivery_applied?: boolean;
  amount_to_free_delivery?: number;
};

export async function fetchFoodDeliveryQuote(body: {
  address?: string;
  lat?: number;
  lng?: number;
  cart_subtotal?: number;
}): Promise<FoodDeliveryQuote> {
  const res = await fetch(`${apiBase()}/api/v1/food/delivery-quote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const parsed = await res.json();
      if (typeof parsed.detail === 'string') message = parsed.detail;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function validateFoodPromo(body: {
  code: string;
  cart_subtotal?: number;
}): Promise<{
  valid: boolean;
  code: string;
  type: string;
  label: string;
  discount: number;
  free_delivery: boolean;
}> {
  const res = await fetch(`${apiBase()}/api/v1/food/validate-promo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const parsed = await res.json();
      if (typeof parsed.detail === 'string') message = parsed.detail;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}
