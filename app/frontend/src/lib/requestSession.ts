import { getPartnerToken, PARTNER_MODULES, type PartnerType } from './partnerAuthApi';

/** Select the identity of the open cabinet, never another saved cabinet session. */
export function getRequestSessionToken(partnerType?: PartnerType): string | null {
  try {
    const path = typeof window === 'undefined' ? '' : window.location.pathname;
    if (path === '/partner' || path.startsWith('/partner/')) {
      const module = Object.values(PARTNER_MODULES).find(m => path === m.route || path.startsWith(m.route + '/'));
      return module ? getPartnerToken(module.type) || null : null;
    }
    if (path === '/admin' || path.startsWith('/admin/')) return localStorage.getItem('_sp924_token') || null;
    if (partnerType) return getPartnerToken(partnerType) || null;
    return localStorage.getItem('account_token') || localStorage.getItem('token') || null;
  } catch { return null; }
}
