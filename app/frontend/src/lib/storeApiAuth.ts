import { getAccountToken } from '@/lib/accountApi';

/** JSON headers + account token for checkout; legacy admin token for admin API calls. */
export function storeApiHeaders(admin = false): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host':
      typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
  };
  try {
    if (admin) {
      const legacy = localStorage.getItem('token') || localStorage.getItem('_sp924_token');
      if (legacy) h.Authorization = `Bearer ${legacy}`;
    } else {
      const account = getAccountToken();
      if (account) h.Authorization = `Bearer ${account}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}
