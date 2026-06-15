/** Durable auth storage — localStorage + Capacitor Preferences on Android. */

import { Capacitor } from '@capacitor/core';

const TOKEN_KEY = 'account_token';
const TOKEN_BACKUP = 's24_account_token_v1';
export const PROFILE_STORAGE_KEY = 'account_user_profile';
const PROFILE_BACKUP = 's24_account_profile_v1';

type PreferencesApi = typeof import('@capacitor/preferences').Preferences;

let preferencesPromise: Promise<PreferencesApi | null> | null = null;

function getPreferences(): Promise<PreferencesApi | null> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null);
  if (!preferencesPromise) {
    preferencesPromise = import('@capacitor/preferences')
      .then((mod) => mod.Preferences)
      .catch(() => null);
  }
  return preferencesPromise;
}

function writeLocalToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_BACKUP, token);
  sessionStorage.setItem(TOKEN_BACKUP, token);
}

export function persistAccountToken(token: string): void {
  try {
    writeLocalToken(token);
  } catch {
    /* ignore quota errors */
  }
  void getPreferences().then((prefs) => {
    if (prefs && token) void prefs.set({ key: TOKEN_KEY, value: token });
  });
}

export function persistAccountProfileJson(json: string): void {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, json);
    localStorage.setItem(PROFILE_BACKUP, json);
  } catch {
    /* ignore */
  }
  void getPreferences().then((prefs) => {
    if (prefs && json) void prefs.set({ key: PROFILE_STORAGE_KEY, value: json });
  });
}

export function readAccountToken(): string {
  try {
    const primary = localStorage.getItem(TOKEN_KEY);
    if (primary) return primary;
    const backup =
      localStorage.getItem(TOKEN_BACKUP) || sessionStorage.getItem(TOKEN_BACKUP) || '';
    if (backup) {
      writeLocalToken(backup);
      return backup;
    }
  } catch {
    /* ignore */
  }
  return '';
}

function restoreProfileFromBackup(): void {
  try {
    if (localStorage.getItem(PROFILE_STORAGE_KEY)) return;
    const backup = localStorage.getItem(PROFILE_BACKUP);
    if (backup) localStorage.setItem(PROFILE_STORAGE_KEY, backup);
  } catch {
    /* ignore */
  }
}

export function clearPersistedAccountToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_BACKUP);
    sessionStorage.removeItem(TOKEN_BACKUP);
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    localStorage.removeItem(PROFILE_BACKUP);
  } catch {
    /* ignore */
  }
  void getPreferences().then(async (prefs) => {
    if (!prefs) return;
    await prefs.remove({ key: TOKEN_KEY });
    await prefs.remove({ key: PROFILE_STORAGE_KEY });
  });
}

/** Call once at app boot before React renders. */
export async function restoreAccountSession(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const prefs = await getPreferences();
    if (prefs) {
      try {
        const { value: token } = await prefs.get({ key: TOKEN_KEY });
        if (token) {
          writeLocalToken(token);
        } else {
          const lsToken =
            localStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_BACKUP) || '';
          if (lsToken) await prefs.set({ key: TOKEN_KEY, value: lsToken });
        }

        const { value: profile } = await prefs.get({ key: PROFILE_STORAGE_KEY });
        if (profile) {
          localStorage.setItem(PROFILE_STORAGE_KEY, profile);
          localStorage.setItem(PROFILE_BACKUP, profile);
        } else {
          const lsProfile = localStorage.getItem(PROFILE_STORAGE_KEY);
          if (lsProfile) await prefs.set({ key: PROFILE_STORAGE_KEY, value: lsProfile });
        }
      } catch {
        readAccountToken();
        restoreProfileFromBackup();
      }
      return;
    }
  }

  readAccountToken();
  restoreProfileFromBackup();
}
