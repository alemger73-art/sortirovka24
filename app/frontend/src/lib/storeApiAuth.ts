import { getAccountToken } from '@/lib/accountApi';

import { type PartnerType } from '@/lib/partnerAuthApi';
import { getRequestSessionToken } from './requestSession';

/** JSON headers + account token for checkout; legacy admin token for admin API calls. */
export function storeApiHeaders(admin = false, partnerType?: PartnerType): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host':
      typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
  };
  try {
    if (admin) {
      const token = getRequestSessionToken(partnerType);
      if (token) h.Authorization = `Bearer ${token}`;
    } else {
      const account = getAccountToken();
      if (account) h.Authorization = `Bearer ${account}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}
