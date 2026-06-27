import { getAccountToken } from '@/lib/accountApi';

import { getPartnerToken, type PartnerType } from '@/lib/partnerAuthApi';

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
      const platform = localStorage.getItem('_sp924_token');
      if (platform) {
        h.Authorization = `Bearer ${platform}`;
        return h;
      }
      if (partnerType) {
        const pt = getPartnerToken(partnerType);
        if (pt) h.Authorization = `Bearer ${pt}`;
      } else {
        const legacy = localStorage.getItem('token');
        if (legacy) h.Authorization = `Bearer ${legacy}`;
      }
    } else {
      const account = getAccountToken();
      if (account) h.Authorization = `Bearer ${account}`;
    }
  } catch {
    /* ignore */
  }
  return h;
}
