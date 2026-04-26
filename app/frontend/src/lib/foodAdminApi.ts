/** Direct HTTP helpers for food entities when @metagptx/web-sdk has no generated client (e.g. food_restaurants). */

const apiBase = () => (import.meta as ImportMeta & { env: { VITE_API_BASE_URL?: string } }).env.VITE_API_BASE_URL || '';

function adminHeaders(): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host': typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
      ? (globalThis as any).window.location.origin
      : '',
  };
  try {
    const t = localStorage.getItem('token') || localStorage.getItem('_sp924_token');
    if (t) h.Authorization = `Bearer ${t}`;
  } catch {
    /* ignore */
  }
  return h;
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
