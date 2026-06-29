import { apiUrl } from '@/lib/config';

const SESSION_KEY = '_sp924_token';

function readAdminToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) || localStorage.getItem('token');
  } catch {
    return null;
  }
}

export async function registerAdminPushDevice(token: string, platform: 'android' | 'ios'): Promise<void> {
  const auth = readAdminToken();
  if (!auth) throw new Error('Admin not logged in');

  const resp = await fetch(apiUrl('/api/v1/push/register-admin'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
      'App-Host': globalThis?.window?.location?.origin ?? '',
    },
    body: JSON.stringify({ token, platform }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || `HTTP ${resp.status}`);
  }
}
