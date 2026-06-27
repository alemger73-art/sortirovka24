import { apiUrl } from './config';

export type PartnerType = 'dam_alem' | 'gastronom' | 'volna' | 'prorab' | 'pharmacy';

export interface PartnerModuleConfig {
  type: PartnerType;
  label: string;
  defaultDisplayName: string;
  route: string;
  storefront: string;
  accentClass: string;
  buttonClass: string;
  description: string;
}

export const PARTNER_MODULES: Record<PartnerType, PartnerModuleConfig> = {
  dam_alem: {
    type: 'dam_alem',
    label: 'DAM ALEM',
    defaultDisplayName: 'DAM ALEM',
    route: '/partner/dam-alem',
    storefront: '/food',
    accentClass: 'text-[#FF3B30]',
    buttonClass: 'bg-[#FF3B30] hover:bg-[#e8352b]',
    description: 'Меню, заказы, баннеры и настройки доставки',
  },
  gastronom: {
    type: 'gastronom',
    label: 'Гастроном',
    defaultDisplayName: 'Гастроном',
    route: '/partner/gastronom',
    storefront: '/gastronom',
    accentClass: 'text-emerald-600',
    buttonClass: 'bg-emerald-600 hover:bg-emerald-700',
    description: 'Товары, категории, заказы, зоны доставки и подарки',
  },
  volna: {
    type: 'volna',
    label: 'VOLNA',
    defaultDisplayName: 'VOLNA',
    route: '/partner/volna',
    storefront: '/volna',
    accentClass: 'text-violet-600',
    buttonClass: 'bg-violet-600 hover:bg-violet-700',
    description: 'Каталог, заказы, акции и настройки магазина',
  },
  prorab: {
    type: 'prorab',
    label: 'PRORAB',
    defaultDisplayName: 'PRORAB',
    route: '/partner/prorab',
    storefront: '/prorab',
    accentClass: 'text-amber-700',
    buttonClass: 'bg-amber-600 hover:bg-amber-700',
    description: 'Стройматериалы, заказы и зоны доставки',
  },
  pharmacy: {
    type: 'pharmacy',
    label: 'Аптека',
    defaultDisplayName: 'Аптека',
    route: '/partner/pharmacy',
    storefront: '/apteka',
    accentClass: 'text-teal-600',
    buttonClass: 'bg-teal-600 hover:bg-teal-700',
    description: 'Лекарства, заказы, зоны доставки и подарки',
  },
};

function sessionKey(partnerType: PartnerType): string {
  return `_partner_token_${partnerType}`;
}

export function getPartnerToken(partnerType: PartnerType): string {
  try {
    if (partnerType === 'dam_alem') {
      return localStorage.getItem(sessionKey(partnerType))
        || localStorage.getItem('_dam_alem_partner_token')
        || '';
    }
    return localStorage.getItem(sessionKey(partnerType)) || '';
  } catch {
    return '';
  }
}

export function setPartnerToken(partnerType: PartnerType, token: string): void {
  localStorage.setItem(sessionKey(partnerType), token);
  localStorage.setItem('token', token);
  if (partnerType === 'dam_alem') {
    localStorage.setItem('_dam_alem_partner_token', token);
  }
}

export function clearPartnerToken(partnerType: PartnerType): void {
  localStorage.removeItem(sessionKey(partnerType));
  if (partnerType === 'dam_alem') {
    localStorage.removeItem('_dam_alem_partner_token');
  }
  const legacy = localStorage.getItem('_sp924_token');
  if (!legacy) localStorage.removeItem('token');
}

function partnerHeaders(partnerType: PartnerType): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'App-Host':
      typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.origin
        ? (globalThis as any).window.location.origin
        : '',
  };
  const t = getPartnerToken(partnerType);
  if (t) h.Authorization = `Bearer ${t}`;
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
  const t = localStorage.getItem('_sp924_token') || localStorage.getItem('token');
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

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

export async function partnerLogin(
  partnerType: PartnerType,
  login: string,
  password: string,
): Promise<PartnerLoginResult> {
  const cfg = PARTNER_MODULES[partnerType];
  const resp = await fetch(apiUrl(`/api/v1/partner-auth/${partnerType}/login`), {
    method: 'POST',
    headers: partnerHeaders(partnerType),
    body: JSON.stringify({ login: login.trim(), password }),
  });
  const data = await resp.json();
  return {
    success: Boolean(data.success),
    message: data.message || '',
    token: data.token || data.jwt_token || '',
    display_name: data.display_name || cfg.defaultDisplayName,
  };
}

export async function partnerVerifySession(partnerType: PartnerType): Promise<PartnerSession> {
  const cfg = PARTNER_MODULES[partnerType];
  const token = getPartnerToken(partnerType);
  if (!token) return { valid: false, login: '', display_name: '' };

  const resp = await fetch(apiUrl(`/api/v1/partner-auth/${partnerType}/verify-session`), {
    method: 'POST',
    headers: partnerHeaders(partnerType),
  });
  const data = await resp.json();
  return {
    valid: Boolean(data.valid),
    login: data.login || '',
    display_name: data.display_name || cfg.defaultDisplayName,
  };
}

export async function partnerChangePassword(
  partnerType: PartnerType,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message: string }> {
  const resp = await fetch(apiUrl(`/api/v1/partner-auth/${partnerType}/change-password`), {
    method: 'POST',
    headers: partnerHeaders(partnerType),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  const data = await resp.json();
  return { success: Boolean(data.success), message: data.message || '' };
}

export async function listPartnerCredentials(partnerType: PartnerType): Promise<PartnerCredential[]> {
  const resp = await fetch(apiUrl(`/api/v1/partner-auth/${partnerType}/credentials`), {
    headers: adminHeaders(),
  });
  if (!resp.ok) throw new Error('Не удалось загрузить доступы партнёра');
  return resp.json();
}

export async function createPartnerCredential(
  partnerType: PartnerType,
  payload: { email?: string; phone?: string; password: string; display_name?: string },
): Promise<PartnerCredential> {
  const resp = await fetch(apiUrl(`/api/v1/partner-auth/${partnerType}/credentials`), {
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

export async function updatePartnerCredential(
  partnerType: PartnerType,
  id: number,
  payload: Partial<{ email: string; phone: string; password: string; display_name: string; is_active: boolean }>,
): Promise<PartnerCredential> {
  const resp = await fetch(apiUrl(`/api/v1/partner-auth/${partnerType}/credentials/${id}`), {
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

// Backward-compatible DAM ALEM aliases
export const partnerDamAlemLogin = (login: string, password: string) => partnerLogin('dam_alem', login, password);
export const partnerDamAlemVerifySession = () => partnerVerifySession('dam_alem');
export const partnerDamAlemChangePassword = (c: string, n: string) => partnerChangePassword('dam_alem', c, n);
export const listDamAlemPartnerCredentials = () => listPartnerCredentials('dam_alem');
export const createDamAlemPartnerCredential = (p: Parameters<typeof createPartnerCredential>[1]) =>
  createPartnerCredential('dam_alem', p);
export const updateDamAlemPartnerCredential = (id: number, p: Parameters<typeof updatePartnerCredential>[2]) =>
  updatePartnerCredential('dam_alem', id, p);
