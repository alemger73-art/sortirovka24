/**
 * User auth helpers — backed by the server account API (`account_token`).
 * Legacy local-only registration was removed; all flows go through /account.
 */
import { accountApi, clearAccountToken, getAccountToken } from './accountApi';

export interface LocalUser {
  id: string;
  name: string;
  phone: string;
  password: string;
  email?: string;
  avatar?: string;
  themePreference?: 'light' | 'dark';
}

export interface CabinetItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  createdAt: string;
}

export interface BonusEntry {
  id: string;
  title: string;
  amount: number;
  createdAt: string;
}

export interface CabinetData {
  foodOrders: CabinetItem[];
  announcements: CabinetItem[];
  masterRequests: CabinetItem[];
  complaints: CabinetItem[];
  bonusBalance: number;
  bonusHistory: BonusEntry[];
  notificationsEnabled: boolean;
}

const PROFILE_KEY = 'account_user_profile';
const THEME_PREF_KEY = 'account_user_theme';
export const AUTH_PROMPT_EVENT = 's24-auth-prompt';
const AUTH_EVENT = 's24-auth-changed';

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT));
}

export function onAuthChanged(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(AUTH_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(AUTH_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function cacheAccountProfile(profile: {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
}) {
  localStorage.setItem(
    PROFILE_KEY,
    JSON.stringify({
      id: profile.id,
      name: profile.name,
      phone: profile.phone,
      password: '',
      email: profile.email,
      avatar: profile.avatar,
    }),
  );
  emitAuthChanged();
}

export async function refreshAccountProfile(): Promise<LocalUser | null> {
  if (!getAccountToken()) {
    localStorage.removeItem(PROFILE_KEY);
    emitAuthChanged();
    return null;
  }
  try {
    const me = await accountApi.me();
    cacheAccountProfile({
      id: me.id,
      name: me.name,
      phone: me.phone,
      email: me.email,
      avatar: me.avatar,
    });
    return getCurrentUser();
  } catch {
    clearAccountToken();
    localStorage.removeItem(PROFILE_KEY);
    emitAuthChanged();
    return null;
  }
}

export function getCurrentUser(): LocalUser | null {
  if (!getAccountToken()) return null;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return Boolean(getAccountToken());
}

export function logoutLocalUser() {
  accountApi.logout().catch(() => {});
  clearAccountToken();
  localStorage.removeItem(PROFILE_KEY);
  emitAuthChanged();
}

export function getCurrentUserTheme(): 'light' | 'dark' | null {
  if (!getAccountToken()) return null;
  const stored = localStorage.getItem(THEME_PREF_KEY);
  return stored === 'dark' || stored === 'light' ? stored : null;
}

export function setCurrentUserTheme(theme: 'light' | 'dark') {
  if (!getAccountToken()) return;
  localStorage.setItem(THEME_PREF_KEY, theme);
}

/** @deprecated Server-side cabinet is the source of truth. */
export function pushCabinetItem(
  _section: 'foodOrders' | 'announcements' | 'masterRequests' | 'complaints',
  _item: { title: string; subtitle?: string; status?: string },
) {
  // no-op — history is loaded from /api/v1/account/cabinet
}

export function openAuthPrompt(redirectTo = '/account') {
  window.dispatchEvent(
    new CustomEvent(AUTH_PROMPT_EVENT, {
      detail: { redirectTo },
    }),
  );
}

export function requireAuthDialog(_navigate?: (path: string) => void): boolean {
  if (isLoggedIn()) return true;
  openAuthPrompt('/account');
  return false;
}

export function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.startsWith('7')) return `+${digits}`;
  return `+7${digits}`;
}

export function isValidPhone(phone: string): boolean {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return true;
  if (digits.length === 10) return true;
  return false;
}

/** Kept for backward compatibility — redirects users to /account. */
export function registerLocalUser(_input: {
  name: string;
  phone: string;
  password: string;
  email?: string;
}): LocalUser {
  openAuthPrompt('/register');
  throw new Error('Регистрация доступна на странице /register');
}

export function loginLocalUser(_phone: string, _password: string): LocalUser {
  openAuthPrompt('/account');
  throw new Error('Вход доступен на странице /login');
}

export function setCurrentUserId(_userId: string) {
  emitAuthChanged();
}

export function updateCurrentUserProfile(_input: {
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
}) {
  throw new Error('Обновите профиль в личном кабинете');
}

export function changeCurrentUserPassword(_currentPassword: string, _newPassword: string) {
  throw new Error('Смена пароля будет доступна в настройках кабинета');
}

export function getCabinetData(_userId: string): CabinetData {
  return {
    foodOrders: [],
    announcements: [],
    masterRequests: [],
    complaints: [],
    bonusBalance: 0,
    bonusHistory: [],
    notificationsEnabled: true,
  };
}

export function updateCabinetData(_userId: string, _patch: Partial<CabinetData>) {}

export function upsertCabinetItem(
  _userId: string,
  _section: 'announcements' | 'masterRequests' | 'complaints',
  _item: CabinetItem,
) {}

export function deleteCabinetItem(
  _userId: string,
  _section: 'announcements' | 'masterRequests' | 'complaints',
  _id: string,
) {}

export function setNotificationsEnabled(_userId: string, _enabled: boolean) {}
