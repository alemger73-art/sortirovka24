import { getAPIBaseURL } from '@/lib/config';
import { getAccountToken } from '@/lib/accountApi';

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

async function pushApi<T>(path: string, body: unknown): Promise<T> {
  const token = getAccountToken();
  const resp = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Push API ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export const pushApiClient = {
  register: (token: string, platform: 'android' | 'ios') =>
    pushApi<{ success: boolean }>('/api/v1/push/register', { token, platform }),
  unregister: (token: string) =>
    pushApi<{ success: boolean }>('/api/v1/push/unregister', { token }),
};
