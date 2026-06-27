/** Local cabinet preferences — security lock + notification toggles (device-only). */

import { Capacitor } from '@capacitor/core';

const SECURITY_KEY = 'cabinet_security_v1';
const NOTIFY_KEY = 'cabinet_notify_prefs_v1';
const UNLOCK_SESSION_KEY = 'cabinet_unlocked_session';

export interface CabinetSecuritySettings {
  lockEnabled: boolean;
  pinEnabled: boolean;
  pinHash?: string;
  pinSalt?: string;
  biometricEnabled: boolean;
}

export interface CabinetNotificationPrefs {
  orders: boolean;
  taxi: boolean;
  delivery: boolean;
  bonuses: boolean;
  master: boolean;
  marketing: boolean;
}

const DEFAULT_SECURITY: CabinetSecuritySettings = {
  lockEnabled: false,
  pinEnabled: false,
  biometricEnabled: false,
};

const DEFAULT_NOTIFY: CabinetNotificationPrefs = {
  orders: true,
  taxi: true,
  delivery: true,
  bonuses: true,
  master: true,
  marketing: false,
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
  try {
    localStorage.setItem(key, raw);
  } catch {
    /* ignore */
  }
  if (Capacitor.isNativePlatform()) {
    try {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.set({ key, value: raw });
    } catch {
      /* ignore */
    }
  }
}

function randomSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function loadSecuritySettings(): Promise<CabinetSecuritySettings> {
  return readJson(SECURITY_KEY, DEFAULT_SECURITY);
}

export async function saveSecuritySettings(settings: CabinetSecuritySettings): Promise<void> {
  await writeJson(SECURITY_KEY, settings);
}

export async function setCabinetPin(pin: string): Promise<CabinetSecuritySettings> {
  const salt = randomSalt();
  const pinHash = await hashPin(pin, salt);
  const current = await loadSecuritySettings();
  const next: CabinetSecuritySettings = {
    ...current,
    pinEnabled: true,
    pinHash,
    pinSalt: salt,
    lockEnabled: true,
  };
  await saveSecuritySettings(next);
  return next;
}

export async function verifyCabinetPin(pin: string, settings?: CabinetSecuritySettings): Promise<boolean> {
  const cfg = settings || (await loadSecuritySettings());
  if (!cfg.pinHash || !cfg.pinSalt) return false;
  const hash = await hashPin(pin, cfg.pinSalt);
  return hash === cfg.pinHash;
}

export async function clearCabinetPin(): Promise<CabinetSecuritySettings> {
  const current = await loadSecuritySettings();
  const next: CabinetSecuritySettings = {
    ...current,
    pinEnabled: false,
    pinHash: undefined,
    pinSalt: undefined,
    biometricEnabled: false,
    lockEnabled: false,
  };
  await saveSecuritySettings(next);
  clearCabinetUnlock();
  return next;
}

export function isCabinetUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markCabinetUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCK_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearCabinetUnlock(): void {
  try {
    sessionStorage.removeItem(UNLOCK_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function shouldLockCabinet(settings: CabinetSecuritySettings): boolean {
  if (!settings.lockEnabled) return false;
  if (!settings.pinEnabled && !settings.biometricEnabled) return false;
  return !isCabinetUnlocked();
}

export async function loadNotificationPrefs(): Promise<CabinetNotificationPrefs> {
  return readJson(NOTIFY_KEY, DEFAULT_NOTIFY);
}

export async function saveNotificationPrefs(prefs: CabinetNotificationPrefs): Promise<void> {
  await writeJson(NOTIFY_KEY, prefs);
}

const CATEGORY_MAP: Record<string, keyof CabinetNotificationPrefs> = {
  food: 'orders',
  store: 'orders',
  logistics: 'delivery',
  taxi: 'taxi',
  bonus: 'bonuses',
  master: 'master',
};

export function isNotificationCategoryEnabled(
  category: string,
  prefs: CabinetNotificationPrefs,
): boolean {
  const key = CATEGORY_MAP[category];
  if (!key) return true;
  return prefs[key] !== false;
}
