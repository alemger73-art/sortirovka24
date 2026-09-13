import publicTranslations from '@/i18n/publicTranslations';
import { getPublicLocale, getPublicLanguage } from '@/i18n/publicLocale';
import { getRequestSessionToken } from './requestSession';
import { createClient } from '@metagptx/web-sdk';
import { Capacitor } from '@capacitor/core';
import { getAPIBaseURL } from './config';
import { invalidateAllCaches } from './cache';

/**
 * The SDK reads the auth token from localStorage('token') ONCE, when
 * `createClient()` runs, and bakes `Authorization: Bearer <token>` into the
 * underlying axios instance. That means a client created at page load (before
 * the admin logs in) would never send the token, so admin writes would be
 * unauthenticated. To keep the token always current — across login, session
 * refresh and logout — we lazily recreate the client whenever the stored token
 * changes.
 */
const readToken = getRequestSessionToken;

/** SDK defaults to baseURL "/" — breaks Capacitor (requests hit https://localhost). */
function createSdkClient(): ReturnType<typeof createClient> {
  const base = getAPIBaseURL();
  return createClient({ ...(base ? { baseURL: base } : {}), headers: { Authorization: readToken() ? `Bearer ${readToken()}` : undefined } });
}

let _activeToken = readToken();
let _activeClient = createSdkClient();

function getActiveClient(): ReturnType<typeof createClient> {
  const current = readToken();
  if (current !== _activeToken) {
    _activeToken = current;
    _activeClient = createSdkClient();
  }
  return _activeClient;
}

/**
 * Proxy the SDK client to auto-invalidate caches after any mutation.
 * When any entity's create/update/delete method succeeds, all localStorage
 * caches are cleared so public pages always show fresh data.
 *
 * The proxy resolves the underlying client dynamically on every access so the
 * latest auth token is always used.
 */
function createCacheInvalidatingProxy(getClient: () => ReturnType<typeof createClient>) {
  const MUTATION_METHODS = new Set(['create', 'update', 'delete']);

  return new Proxy({} as ReturnType<typeof createClient>, {
    get(_dummy, prop, receiver) {
      const target = getClient();
      const value = Reflect.get(target, prop, receiver);

      if (prop === 'entities' && value && typeof value === 'object') {
        return new Proxy(value, {
          get(entitiesTarget, entityName, entitiesReceiver) {
            const entity = Reflect.get(entitiesTarget, entityName, entitiesReceiver);
            if (!entity || typeof entity !== 'object') return entity;

            return new Proxy(entity, {
              get(entityTarget, methodName, entityReceiver) {
                const method = Reflect.get(entityTarget, methodName, entityReceiver);
                if (typeof method !== 'function') return method;

                if (MUTATION_METHODS.has(methodName as string)) {
                  return async (...args: unknown[]) => {
                    const result = await method.apply(entityTarget, args);
                    try { invalidateAllCaches(); } catch { /* non-critical */ }
                    return result;
                  };
                }
                return method.bind(entityTarget);
              },
            });
          },
        });
      }

      return value;
    },
  });
}

export const client = createCacheInvalidatingProxy(getActiveClient);

// ─── Simple delay helper ─────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Backend warm-up (fire-and-forget, non-blocking) ─────────────
// Sends a lightweight request to wake the Lambda container.
// Does NOT block any data loading — runs purely in background.

let _warmupDone = false;
let _warmupPromise: Promise<void> | null = null;

export function warmupBackend(): Promise<void> {
  if (_warmupDone) return Promise.resolve();
  if (_warmupPromise) return _warmupPromise;

  const isNative = Capacitor.isNativePlatform();
  const maxAttempts = isNative ? 2 : 8;
  const apiBase = getAPIBaseURL().replace(/\/+$/, '');
  const warmupUrl = apiBase
    ? `${apiBase}/health`
    : '/health';

  _warmupPromise = (async () => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), isNative ? 8000 : 15000);
        const resp = await fetch(warmupUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'App-Host': globalThis?.window?.location?.origin ?? '',
          },
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (resp.ok) {
          _warmupDone = true;
          console.log(`[API] Backend warm (attempt ${i + 1})`);
          return;
        }
        const text = await resp.text().catch(() => '');
        if (text.includes('dns') || text.includes('balancer') || text.includes('timeout')) {
          console.warn(`[API] Warmup attempt ${i + 1}: DNS/balancer not ready, retrying...`);
        }
      } catch {
        // Expected during cold start
      }
      if (i < maxAttempts - 1) await sleep(isNative ? 600 : 2000 + i * 1500);
    }
    console.warn('[API] Warmup exhausted retries — proceeding normally');
  })();

  return _warmupPromise.catch(() => {});
}

export function resetWarmup(): void {
  _warmupDone = false;
  _warmupPromise = null;
}

export function isBackendWarmedUp(): boolean {
  return _warmupDone;
}

// ─── Error helpers ───────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err.toLowerCase();
  if (err instanceof Error) {
    const base = err.message.toLowerCase();
    const anyErr = err as unknown as Record<string, unknown>;
    if (anyErr.response && typeof anyErr.response === 'object') {
      const resp = anyErr.response as Record<string, unknown>;
      if (resp.data && typeof resp.data === 'object') {
        const rd = resp.data as Record<string, unknown>;
        if (typeof rd.message === 'string') return `${base} ${rd.message.toLowerCase()}`;
      }
    }
    return base;
  }
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message.toLowerCase();
    try { return JSON.stringify(err).toLowerCase(); } catch { return String(err).toLowerCase(); }
  }
  return String(err).toLowerCase();
}

export function isTransientError(err: unknown): boolean {
  const msg = extractErrorMessage(err);

  // DNS / network errors
  if (msg.includes('dns') || msg.includes('balancer resolve') || msg.includes('callback lock')) return true;
  if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('enotfound')) return true;
  if (msg.includes('econnreset') || msg.includes('epipe') || msg.includes('network')) return true;
  if (msg.includes('fetch failed') || msg.includes('failed to fetch')) return true;
  if (msg.includes('not ready') || msg.includes('service unavailable')) return true;
  if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
  if (msg.includes('<!doctype') || msg.includes('<html') || msg.includes('temporarily unavailable')) return true;
  if (msg.includes('aborted') || msg.includes('abort') || msg.includes('cancelled') || msg.includes('canceled')) return true;

  if (typeof err === 'object' && err !== null) {
    const anyErr = err as Record<string, unknown>;
    if ('status' in anyErr) {
      const status = anyErr.status as number;
      if (status === 502 || status === 503 || status === 504) return true;
    }
    if ('data' in anyErr && typeof anyErr.data === 'string') {
      const d = (anyErr.data as string).toLowerCase();
      if (d.includes('<!doctype') || d.includes('<html') || d.includes('503')) return true;
    }
  }

  return false;
}

// ─── Simple retry wrapper ────────────────────────────────────────
// No gate, no timeout wrapper, no DNS tracking.
// Just exponential backoff with jitter for transient errors.

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = Capacitor.isNativePlatform() ? 2 : 4,
  baseDelayMs = Capacitor.isNativePlatform() ? 600 : 1500
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // Guard: SDK sometimes resolves with HTML error pages instead of rejecting
      if (result && typeof result === 'object' && 'data' in (result as Record<string, unknown>)) {
        const data = (result as Record<string, unknown>).data;
        if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
          throw Object.assign(new Error('Server returned HTML error page'), { status: 503, data });
        }
      }

      // Guard: SDK may resolve with a JSON error body (e.g., DNS/balancer errors return 500)
      if (result && typeof result === 'object') {
        const res = result as Record<string, unknown>;
        if (res.data && typeof res.data === 'object') {
          const d = res.data as Record<string, unknown>;
          if (typeof d.message === 'string' && (d.message.includes('dns') || d.message.includes('balancer resolve') || d.message.includes('callback lock'))) {
            throw Object.assign(new Error(d.message as string), { status: 500, data: res.data });
          }
        }
      }

      return result;
    } catch (err: unknown) {
      lastError = err;

      if (isTransientError(err) && attempt < maxRetries) {
        // Use longer delays for DNS/balancer errors since they need more time to resolve
        const errMsg = extractErrorMessage(err);
        const isDnsError = errMsg.includes('dns') || errMsg.includes('balancer') || errMsg.includes('callback lock');
        const multiplier = isDnsError ? 2.0 : 1.5;
        const extraJitter = isDnsError ? 2000 : 1000;
        const delay = Math.min(baseDelayMs * Math.pow(multiplier, attempt) + Math.random() * extraJitter, 15000);
        console.warn(`[API] Retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms${isDnsError ? ' (DNS cold start)' : ''}`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// ─── isDnsHealthy (kept for backward compat, always returns true now) ──
export function isDnsHealthy(): boolean {
  return true;
}

// ─── adaptiveExecute (simplified: always parallel with Promise.allSettled) ──
export async function adaptiveExecute<T>(
  fns: Array<() => Promise<T>>,
  _delayBetweenMs = 0
): Promise<PromiseSettledResult<T>[]> {
  return Promise.allSettled(fns.map(fn => fn()));
}

// ─── Static data ─────────────────────────────────────────────────

export const MASTER_CATEGORIES = [
  'Сантехник', 'Электрик', 'Сварщик', 'Мебельщик', 'Ремонт техники',
  'Грузчики', 'Ремонт квартир', 'Окна и двери', 'Кровельщик', 'Натяжные потолки', 'Разнорабочие'
];

export const SALON_CATEGORIES = [
  'Парикмахерская', 'Барбершоп', 'Ногтевой сервис', 'Брови и ресницы',
  'Косметология', 'СПА и массаж', 'Макияж', 'Эпиляция', 'Тату и пирсинг', 'Солярий'
];

export const SALON_CATEGORY_ICONS: Record<string, string> = {
  'Парикмахерская': '💇',
  'Барбершоп': '💈',
  'Ногтевой сервис': '💅',
  'Брови и ресницы': '👁️',
  'Косметология': '✨',
  'СПА и массаж': '💆',
  'Макияж': '💄',
  'Эпиляция': '🪒',
  'Тату и пирсинг': '🎨',
  'Солярий': '🌞',
};

export const SALON_CATEGORY_GRADIENTS: Record<string, string> = {
  'Парикмахерская': 'from-pink-400 to-rose-600',
  'Барбершоп': 'from-slate-500 to-zinc-700',
  'Ногтевой сервис': 'from-fuchsia-400 to-pink-600',
  'Брови и ресницы': 'from-purple-400 to-violet-600',
  'Косметология': 'from-rose-400 to-pink-600',
  'СПА и массаж': 'from-teal-400 to-emerald-600',
  'Макияж': 'from-pink-400 to-fuchsia-600',
  'Эпиляция': 'from-amber-400 to-orange-600',
  'Тату и пирсинг': 'from-indigo-400 to-purple-600',
  'Солярий': 'from-amber-400 to-yellow-500',
};

export function salonCategoryIcon(category?: string): string {
  return (category && SALON_CATEGORY_ICONS[category]) || '💅';
}

export function salonCategoryGradient(category?: string): string {
  return (category && SALON_CATEGORY_GRADIENTS[category]) || 'from-pink-500 to-rose-600';
}

export function sortSalons<T extends { featured?: boolean; verified?: boolean; sort_order?: number | null; rating?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const featDiff = Number(Boolean(b.featured)) - Number(Boolean(a.featured));
    if (featDiff !== 0) return featDiff;
    const verDiff = Number(Boolean(b.verified)) - Number(Boolean(a.verified));
    if (verDiff !== 0) return verDiff;
    const sa = a.sort_order ?? 9999;
    const sb = b.sort_order ?? 9999;
    if (sa !== sb) return sa - sb;
    return (Number(b.rating) || 0) - (Number(a.rating) || 0);
  });
}

export const COMPLAINT_CATEGORIES = [
  'Ямы на дорогах', 'Мусор', 'Не работает освещение', 'Проблемы ЖКХ',
  'Сломанные остановки', 'Незаконная свалка', 'Вода', 'Электричество', 'Другое'
];

export const NEWS_CATEGORIES = [
  'Происшествия', 'События района', 'ЖКХ', 'Дороги', 'Инфраструктура', 'Объявления', 'Важная информация'
];

export const ANN_TYPES: Record<string, string> = {
  sell: 'Продам', buy: 'Куплю', rent: 'Сдам', services: 'Услуги',
  free: 'Отдам бесплатно', other: 'Другое'
};

export const REAL_ESTATE_TYPES: Record<string, string> = {
  sell_apartment: 'Продам квартиру',
  rent_apartment: 'Сдам квартиру',
  need_apartment: 'Сниму квартиру',
  sell_house: 'Продам дом',
  rent_house: 'Сдам дом',
  commercial: 'Коммерческая недвижимость',
  land: 'Участки',
};

export const JOB_CATEGORIES = [
  'Продавец', 'Грузчик', 'Водитель', 'Кассир', 'Повар',
  'Уборщица', 'Разнорабочий', 'Строительство', 'Кровельные работы', 'Доставка', 'Другое'
];

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'Новая', color: 'bg-yellow-100 text-yellow-800' },
  in_progress: { label: 'В работе', color: 'bg-blue-100 text-blue-800' },
  resolved: { label: 'Решено', color: 'bg-green-100 text-green-800' },
  done: { label: 'Выполнено', color: 'bg-green-100 text-green-800' },
  pending: { label: 'На модерации', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Одобрено', color: 'bg-green-100 text-green-800' },
  published: { label: 'Опубликовано', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'Отклонено', color: 'bg-red-100 text-red-800' },
  hidden: { label: 'Снято с публикации', color: 'bg-gray-100 text-gray-800' },
};

export const DIRECTORY_CATEGORIES = [
  'Экстренные службы', 'Коммунальные службы', 'Образование', 'Здоровье'
];

export const DIRECTORY_CATEGORY_ICONS: Record<string, string> = {
  'Экстренные службы': '🚨',
  'Коммунальные службы': '🔧',
  'Образование': '🏫',
  'Здоровье': '🏥',
};

export const DIRECTORY_CATEGORY_KEYS: Record<string, string> = {
  'Экстренные службы': 'directory.cat.emergency',
  'Коммунальные службы': 'directory.cat.utilities',
  'Образование': 'directory.cat.education',
  'Здоровье': 'directory.cat.health',
};

export function getDirectoryCategoryLabel(category: string, t: (key: string) => string): string {
  const key = DIRECTORY_CATEGORY_KEYS[category];
  return key ? t(key) : getPublicCategoryLabel(category, t);
}

export function sortDirectoryEntries<T extends { category?: string; sort_order?: number | null; entry_name?: string }>(items: T[]): T[] {
  const catIndex = (c: string) => {
    const i = DIRECTORY_CATEGORIES.indexOf(c);
    return i === -1 ? 999 : i;
  };
  return [...items].sort((a, b) => {
    const ca = catIndex(a.category || '');
    const cb = catIndex(b.category || '');
    if (ca !== cb) return ca - cb;
    const sa = a.sort_order ?? 9999;
    const sb = b.sort_order ?? 9999;
    if (sa !== sb) return sa - sb;
    return (a.entry_name || '').localeCompare(b.entry_name || '', 'ru');
  });
}

export const EMERGENCY_NUMBERS = [
  { number: '112', labelKey: 'emergency.112' },
  { number: '101', labelKey: 'emergency.101' },
  { number: '102', labelKey: 'emergency.102' },
  { number: '103', labelKey: 'emergency.103' },
  { number: '104', labelKey: 'emergency.104' },
] as const;

export const CATEGORY_ICONS: Record<string, string> = {
  'Сантехник': '🔧', 'Электрик': '⚡', 'Сварщик': '🔥', 'Мебельщик': '🪑',
  'Ремонт техники': '🔌', 'Грузчики': '📦', 'Ремонт квартир': '🏠',
  'Окна и двери': '🪟', 'Кровельщик': '🏗️', 'Натяжные потолки': '✨', 'Разнорабочие': '🛠️'
};

export function timeAgo(dateStr: string, lang = getPublicLanguage()): string {
  const date = new Date(dateStr);
  if (!dateStr || Number.isNaN(date.getTime())) return '';
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const message = (key: string, count = 0) => publicTranslations[`public.time.${key}`][lang].replace('{count}', String(count));
  if (diffMin < 1) return message('now');
  if (diffMin < 60) return message('minutes', diffMin);
  if (diffHours < 24) return message('hours', diffHours);
  if (diffDays === 1) return message('yesterday');
  if (diffDays < 7) return message('days', diffDays);
  return date.toLocaleDateString(getPublicLocale(lang));
}

export function formatDate(dateStr: string, lang = getPublicLanguage()): string {
  const date = new Date(dateStr);
  if (!dateStr || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(getPublicLocale(lang), { day: 'numeric', month: 'long', year: 'numeric' });
}

const PUBLIC_CATEGORY_KEYS: Record<string, string> = {
  "Сантехник": "public.category.0",
  "Электрик": "public.category.1",
  "Сварщик": "public.category.2",
  "Мебельщик": "public.category.3",
  "Ремонт техники": "public.category.4",
  "Грузчики": "public.category.5",
  "Ремонт квартир": "public.category.6",
  "Окна и двери": "public.category.7",
  "Кровельщик": "public.category.8",
  "Натяжные потолки": "public.category.9",
  "Разнорабочие": "public.category.10",
  "Парикмахерская": "public.category.11",
  "Барбершоп": "public.category.12",
  "Ногтевой сервис": "public.category.13",
  "Брови и ресницы": "public.category.14",
  "Косметология": "public.category.15",
  "СПА и массаж": "public.category.16",
  "Макияж": "public.category.17",
  "Эпиляция": "public.category.18",
  "Тату и пирсинг": "public.category.19",
  "Солярий": "public.category.20",
  "Ямы на дорогах": "public.category.21",
  "Мусор": "public.category.22",
  "Не работает освещение": "public.category.23",
  "Проблемы ЖКХ": "public.category.24",
  "Сломанные остановки": "public.category.25",
  "Незаконная свалка": "public.category.26",
  "Вода": "public.category.27",
  "Электричество": "public.category.28",
  "Другое": "public.category.29",
  "Прочее": "public.category.30",
  "Происшествия": "public.category.31",
  "События района": "public.category.32",
  "ЖКХ": "public.category.33",
  "Дороги": "public.category.34",
  "Инфраструктура": "public.category.35",
  "Объявления": "public.category.36",
  "Важная информация": "public.category.37",
  "Продам": "public.category.38",
  "Куплю": "public.category.39",
  "Сдам": "public.category.40",
  "Услуги": "public.category.41",
  "Отдам бесплатно": "public.category.42",
  "Продам квартиру": "public.category.43",
  "Сдам квартиру": "public.category.44",
  "Сниму квартиру": "public.category.45",
  "Продам дом": "public.category.46",
  "Сдам дом": "public.category.47",
  "Коммерческая недвижимость": "public.category.48",
  "Участки": "public.category.49",
  "Продавец": "public.category.50",
  "Грузчик": "public.category.51",
  "Водитель": "public.category.52",
  "Кассир": "public.category.53",
  "Повар": "public.category.54",
  "Уборщица": "public.category.55",
  "Разнорабочий": "public.category.56",
  "Строительство": "public.category.57",
  "Кровельные работы": "public.category.58",
  "Доставка": "public.category.59",
  "Все": "public.category.60",
  "Квартиры": "public.category.61",
  "Дома": "public.category.62",
  "Аренда": "public.category.63",
  "Коммерция": "public.category.64",
  "Все сделки": "public.category.65",
  "Продажа": "public.category.66",
  "Ищу": "public.category.67",
  "Культура": "public.category.68",
  "Люди": "public.category.69",
  "Транспорт": "public.category.70",
  "Велосипед": "public.category.71",
  "Автомобиль": "public.category.72",
  "Пешком": "public.category.73"
};
const PUBLIC_STATUS_KEYS: Record<string, string> = {
  "new": "public.status.new",
  "Новая": "public.status.new",
  "in_progress": "public.status.in_progress",
  "В работе": "public.status.in_progress",
  "resolved": "public.status.resolved",
  "Решено": "public.status.resolved",
  "done": "public.status.done",
  "Выполнено": "public.status.done",
  "pending": "public.status.pending",
  "На модерации": "public.status.pending",
  "approved": "public.status.approved",
  "Одобрено": "public.status.approved",
  "published": "public.status.published",
  "Опубликовано": "public.status.published",
  "rejected": "public.status.rejected",
  "Отклонено": "public.status.rejected",
  "hidden": "public.status.hidden",
  "Снято с публикации": "public.status.hidden",
  "Отправлена": "public.status.new",
  "На рассмотрении": "public.status.pending",
  "Решена": "public.status.resolved"
};

/** Translate only known system labels; preserve user-defined categories. */
export function getPublicCategoryLabel(value: string | undefined, t: (key: string) => string): string {
  return value ? PUBLIC_CATEGORY_KEYS[value] ? t(PUBLIC_CATEGORY_KEYS[value]) : value : '';
}

export function getStatusLabel(status: string | undefined, t: (key: string) => string): string {
  return status ? PUBLIC_STATUS_KEYS[status] ? t(PUBLIC_STATUS_KEYS[status]) : status : '';
}
