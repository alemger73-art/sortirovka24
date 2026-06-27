import { apiUrl } from './config';

const SESSION_KEY = '_dam_alem_partner_token';

export interface PartnerLoginResult {
  success: boolean;
  message: string;
  token: string;
  display_name: string;
}

export interface PartnerSession {
  valid: boolean;
  login: string;
  display_name: string;
}

export interface PartnerCredential {
  id: number;
  partner_type: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  is_active: boolean;
  created_at: string | null;
}

function partnerHeaders(): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host':
      typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
  };
  try {
    const t = getPartnerToken();
    if (t) h.Authorization = `Bearer ${t}`;
  } catch {
    /* ignore */
  }
  return h;
}

function adminHeaders(): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host':
      typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
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

export function getPartnerToken(): string {
  try {
    return localStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

export function setPartnerToken(token: string): void {
  localStorage.setItem(SESSION_KEY, token);
  localStorage.setItem('token', token);
}

export function clearPartnerToken(): void {
  localStorage.removeItem(SESSION_KEY);
  const legacy = localStorage.getItem('_sp924_token');
  if (!legacy) localStorage.removeItem('token');
}

export async function partnerDamAlemLogin(login: string, password: string): Promise<PartnerLoginResult> {
  const resp = await fetch(apiUrl('/api/v1/partner-auth/dam-alem/login'), {
    method: 'POST',
    headers: partnerHeaders(),
    body: JSON.stringify({ login: login.trim(), password }),
  });
  const data = await resp.json();
  return {
    success: Boolean(data.success),
    message: data.message || '',
    token: data.token || data.jwt_token || '',
    display_name: data.display_name || 'DAM ALEM',
  };
}

export async function partnerDamAlemVerifySession(): Promise<PartnerSession> {
  const token = getPartnerToken();
  if (!token) return { valid: false, login: '', display_name: '' };

  const resp = await fetch(apiUrl('/api/v1/partner-auth/dam-alem/verify-session'), {
    method: 'POST',
    headers: partnerHeaders(),
  });
  const data = await resp.json();
  return {
    valid: Boolean(data.valid),
    login: data.login || '',
    display_name: data.display_name || '',
  };
}

export async function partnerDamAlemChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> {
  const resp = await fetch(apiUrl('/api/v1/partner-auth/dam-alem/change-password'), {
    method: 'POST',
    headers: partnerHeaders(),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  const data = await resp.json();
  return { success: Boolean(data.success), message: data.message || '' };
}

export async function listDamAlemPartnerCredentials(): Promise<PartnerCredential[]> {
  const resp = await fetch(apiUrl('/api/v1/partner-auth/dam-alem/credentials'), {
    headers: adminHeaders(),
  });
  if (!resp.ok) throw new Error('Не удалось загрузить доступы партнёра');
  return resp.json();
}

export async function createDamAlemPartnerCredential(payload: {
  email?: string;
  phone?: string;
  password: string;
  display_name?: string;
}): Promise<PartnerCredential> {
  const resp = await fetch(apiUrl('/api/v1/partner-auth/dam-alem/credentials'), {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось создать доступ');
  }
  return resp.json();
}

export async function updateDamAlemPartnerCredential(
  id: number,
  payload: Partial<{ email: string; phone: string; password: string; display_name: string; is_active: boolean }>,
): Promise<PartnerCredential> {
  const resp = await fetch(apiUrl(`/api/v1/partner-auth/dam-alem/credentials/${id}`), {
    method: 'PATCH',
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || 'Не удалось обновить доступ');
  }
  return resp.json();
}

export const PARTNER_SESSION_KEY = SESSION_KEY;
