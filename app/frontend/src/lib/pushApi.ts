import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

function getAdminToken(): string {
  try {
    return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
}

async function pushApi<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
  const auth = token === undefined ? getAccountToken() : token;
  const resp = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(init?.headers || {}),
    },
    body: init?.body,
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(txt || `Push API ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export interface PushStats {
  enabled: boolean;
  total_devices: number;
  active_devices: number;
  android_active: number;
  ios_active: number;
}

export interface PushBroadcastResult {
  success: boolean;
  sent: number;
  failed: number;
  total: number;
  skipped?: boolean;
}

export const pushApiClient = {
  status: () => pushApi<{ enabled: boolean }>('/api/v1/push/status'),

  register: (token: string, platform: 'android' | 'ios') =>
    pushApi<{ success: boolean }>('/api/v1/push/register', {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }),

  unregister: (token: string) =>
    pushApi<{ success: boolean }>('/api/v1/push/unregister', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  adminStats: () =>
    pushApi<PushStats>('/api/v1/push/stats', undefined, getAdminToken()),

  adminBroadcast: (payload: {
    title: string;
    body: string;
    path?: string;
    platform?: 'android' | 'ios';
  }) =>
    pushApi<PushBroadcastResult>('/api/v1/push/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, getAdminToken()),
};
