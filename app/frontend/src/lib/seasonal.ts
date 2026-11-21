/** New Year decoration: settings from the admin panel, the active window and the viewer's own switches. */
import { getAPIBaseURL } from '@/lib/config';

export interface SeasonalSettings {
  enabled: boolean;
  starts_at: string;
  ends_at: string;
  snow: boolean;
  snow_intensity: number;
  garland: boolean;
  countdown: boolean;
  hero_image: string;
  title_ru: string;
  title_kz: string;
  greeting_ru: string;
  greeting_kz: string;
}

export const SEASONAL_DEFAULTS: SeasonalSettings = {
  enabled: true,
  starts_at: '2026-12-01',
  ends_at: '2027-01-14',
  snow: true,
  snow_intensity: 2,
  garland: true,
  countdown: true,
  hero_image: '/seasonal/ny-hero.webp',
  title_ru: 'Новогодняя Сортировка',
  title_kz: 'Жаңажылдық Сортировка',
  greeting_ru: 'С Новым 2027 годом, Сортировка!',
  greeting_kz: 'Жаңа 2027 жылыңызбен, Сортировка!',
};

/** Midnight of 1 January 2027 in Almaty (UTC+5). */
export const NEW_YEAR_AT = Date.parse('2027-01-01T00:00:00+05:00');

const CACHE_KEY = 's24_seasonal';
const PREVIEW_KEY = 's24_ny_preview';
const STILL_KEY = 's24_ny_still';

function safeGet(store: Storage | undefined, key: string): string | null {
  try { return store?.getItem(key) ?? null; } catch { return null; }
}

function safeSet(store: Storage | undefined, key: string, value: string | null): void {
  try {
    if (value === null) store?.removeItem(key);
    else store?.setItem(key, value);
  } catch { /* private mode: the switch simply is not remembered */ }
}

export function cachedSettings(): SeasonalSettings | null {
  const raw = safeGet(globalThis.localStorage, CACHE_KEY);
  if (!raw) return null;
  try { return { ...SEASONAL_DEFAULTS, ...JSON.parse(raw) }; } catch { return null; }
}

export async function fetchSettings(): Promise<SeasonalSettings> {
  const resp = await fetch(`${getAPIBaseURL().replace(/\/$/, '')}/api/v1/seasonal`);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = { ...SEASONAL_DEFAULTS, ...(await resp.json()) } as SeasonalSettings;
  safeSet(globalThis.localStorage, CACHE_KEY, JSON.stringify(data));
  return data;
}

export async function saveSettings(settings: SeasonalSettings): Promise<SeasonalSettings> {
  const token = safeGet(globalThis.localStorage, '_sp924_token') || safeGet(globalThis.localStorage, 'token') || '';
  const resp = await fetch(`${getAPIBaseURL().replace(/\/$/, '')}/api/v1/seasonal/admin`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ settings }),
  });
  if (!resp.ok) throw new Error((await resp.text().catch(() => '')) || `HTTP ${resp.status}`);
  const data = { ...SEASONAL_DEFAULTS, ...(await resp.json()) } as SeasonalSettings;
  safeSet(globalThis.localStorage, CACHE_KEY, JSON.stringify(data));
  return data;
}

/** Today's date in Almaty as YYYY-MM-DD. */
export function almatyToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function inWindow(s: SeasonalSettings, now = new Date()): boolean {
  const today = almatyToday(now);
  return s.enabled && s.starts_at <= today && today <= s.ends_at;
}

/** `?ny=1` turns the preview on for this tab, `?ny=0` turns it off; staff use it before the start date. */
export function readPreview(): boolean | null {
  const store = globalThis.sessionStorage;
  const param = new URLSearchParams(globalThis.location?.search || '').get('ny');
  if (param === '1') safeSet(store, PREVIEW_KEY, '1');
  if (param === '0') safeSet(store, PREVIEW_KEY, '0');
  const saved = safeGet(store, PREVIEW_KEY);
  return saved === null ? null : saved === '1';
}

export function readStill(): boolean {
  return safeGet(globalThis.localStorage, STILL_KEY) === '1';
}

export function writeStill(still: boolean): void {
  safeSet(globalThis.localStorage, STILL_KEY, still ? '1' : null);
}
