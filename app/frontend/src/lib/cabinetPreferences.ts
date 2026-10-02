/** Local cabinet preferences — security lock + notification toggles (device-only). */

import { Capacitor } from '@capacitor/core';

const SECURITY_KEY = 'cabinet_security_v1';
const NOTIFY_KEY = 'cabinet_notify_prefs_v1';
const UNLOCK_SESSION_KEY = 'cabinet_unlocked_session';

export interface CabinetNotificationPrefs {
  orders: boolean;
  taxi: boolean;
  delivery: boolean;
  bonuses: boolean;
  master: boolean;
  marketing: boolean;
  news: boolean;
}

const DEFAULT_NOTIFY: CabinetNotificationPrefs = {
  orders: true,
  taxi: true,
  delivery: true,
  bonuses: true,
  master: true,
  marketing: false,
  news: false,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import('@capacitor/preferences');
      const { value } = await Preferences.get({ key });
      if (value) return { ...fallback, ...JSON.parse(value) } as T;
    }
    const raw = localStorage.getItem(key);
    if (raw) return { ...fallback, ...JSON.parse(raw) } as T;
  } catch {
    /* ignore */
  }
  return fallback;
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  let saved = false;
  try {
    localStorage.setItem(key, raw);
    saved = true;
  } catch {
    /* ignore */
  }
  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value: raw });
      saved = true;
    } catch {
      /* ignore */
    }
  }
  if (!saved) throw new Error('Не удалось сохранить настройки на устройстве');
}

/** Retire only the old device lock. Never clear account credentials or other preferences. */
export async function retireCabinetDeviceLock(): Promise<void> {
  try { localStorage.removeItem(SECURITY_KEY); } catch { /* Restricted storage must not block access. */ }
  try { sessionStorage.removeItem(UNLOCK_SESSION_KEY); } catch { /* Same for session storage. */ }
  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: SECURITY_KEY });
    } catch { /* The removed lock is not consulted, even if cleanup fails. */ }
  }
}

export async function loadNotificationPrefs(): Promise<CabinetNotificationPrefs> {
  return readJson(NOTIFY_KEY, DEFAULT_NOTIFY);
}

export async function saveNotificationPrefs(prefs: CabinetNotificationPrefs): Promise<void> {
  const { getAccountToken } = await import('./accountApi');
  const token = getAccountToken();
  if (token) {
    const { getAPIBaseURL } = await import('./config');
    const response = await fetch(getAPIBaseURL().replace(/\/$/, '') + '/api/v1/push/preferences', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(prefs),
    });
    if (!response.ok) throw new Error('Не удалось сохранить настройки уведомлений на сервере');
  }
  await writeJson(NOTIFY_KEY, prefs);
}

const CATEGORY_MAP: Record<string, keyof CabinetNotificationPrefs> = {
  food: 'orders',
  store: 'orders',
  logistics: 'delivery',
  taxi: 'taxi',
  bonus: 'bonuses',
  master: 'master',
  marketing: 'marketing',
  news: 'news',
};

export function isNotificationCategoryEnabled(
  category: string,
  prefs: CabinetNotificationPrefs,
): boolean {
  const key = CATEGORY_MAP[category];
  if (!key) return true;
  return prefs[key] !== false;
}
