import { getAPIBaseURL } from '@/lib/config';
import { SUPPORT_REQUISITES } from '@/config/support';

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

export interface SupportSettings {
  promo_enabled: boolean;
  recipient: string;
  bank: string;
  iban: string;
  bin: string;
  kaspi_phone: string;
  kaspi_qr_url: string;
  purpose: string;
  contact_email: string;
}

export const DEFAULT_SUPPORT_SETTINGS: SupportSettings = {
  promo_enabled: true,
  recipient: SUPPORT_REQUISITES.recipient,
  bank: SUPPORT_REQUISITES.bank,
  iban: SUPPORT_REQUISITES.iban,
  bin: SUPPORT_REQUISITES.bin,
  kaspi_phone: SUPPORT_REQUISITES.kaspiPhone,
  kaspi_qr_url: '',
  purpose: SUPPORT_REQUISITES.purpose,
  contact_email: SUPPORT_REQUISITES.contactEmail,
};

type SettingsCache = { data: SupportSettings; at: number } | null;
let settingsCache: SettingsCache = null;

export function getSupportSettingsCache(): SettingsCache {
  return settingsCache;
}

export function setSupportSettingsCache(data: SupportSettings): void {
  settingsCache = { data, at: Date.now() };
}

export function invalidateSupportSettingsCache(): void {
  settingsCache = null;
}

function getAdminToken(): string {
  try {
    return localStorage.getItem('_sp924_token') || localStorage.getItem('token') || '';
  } catch {
    return '';
  }
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const resp = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(txt || `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export const supportApi = {
  settings: () => request<SupportSettings>('/api/v1/support/settings'),
  adminSettings: () => request<Record<string, string>>('/api/v1/support/admin/settings', undefined, getAdminToken()),
  adminUpdateSettings: (settings: Record<string, string>) =>
    request<Record<string, string>>('/api/v1/support/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    }, getAdminToken()),
};
