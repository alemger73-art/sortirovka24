import { createClient } from '@metagptx/web-sdk';
import { invalidateAllCaches } from './cache';

const _rawClient = createClient();

/**
 * Proxy the SDK client to auto-invalidate caches after any mutation.
 * When any entity's create/update/delete method succeeds, all localStorage
 * caches are cleared so public pages always show fresh data.
 */
function createCacheInvalidatingProxy(rawClient: ReturnType<typeof createClient>) {
  const MUTATION_METHODS = new Set(['create', 'update', 'delete']);

  return new Proxy(rawClient, {
    get(target, prop, receiver) {
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

export const client = createCacheInvalidatingProxy(_rawClient);

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

  _warmupPromise = (async () => {
    for (let i = 0; i < 8; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch('/api/v1/entities/banners?limit=1', {
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
        // If we get a non-ok response (e.g., 500 with DNS error), keep retrying
        const text = await resp.text().catch(() => '');
        if (text.includes('dns') || text.includes('balancer') || text.includes('timeout')) {
          console.warn(`[API] Warmup attempt ${i + 1}: DNS/balancer not ready, retrying...`);
        }
      } catch {
        // Expected during cold start — DNS/balancer resolve errors
      }
      if (i < 7) await sleep(2000 + i * 1500);
    }
    // Warmup failed — that's OK, normal requests will still work with their own retries
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
    const anyErr = err as Record<string, unknown>;
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
  maxRetries = 4,
  baseDelayMs = 1500
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
  'Грузчики', 'Ремонт квартир', 'Окна и двери', 'Натяжные потолки', 'Разнорабочие'
];

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
  'Уборщица', 'Разнорабочий', 'Строительство', 'Доставка', 'Другое'
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
};

export const DIRECTORY_CATEGORIES = [
  'Экстренные службы', 'Коммунальные службы', 'Образование', 'Здоровье'
];

export const CATEGORY_ICONS: Record<string, string> = {
  'Сантехник': '🔧', 'Электрик': '⚡', 'Сварщик': '🔥', 'Мебельщик': '🪑',
  'Ремонт техники': '🔌', 'Грузчики': '📦', 'Ремонт квартир': '🏠',
  'Окна и двери': '🪟', 'Натяжные потолки': '✨', 'Разнорабочие': '🛠️'
};

export function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'только что';
  if (diffMin < 60) return `${diffMin} мин. назад`;
  if (diffHours < 24) return `${diffHours} ч. назад`;
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return `${diffDays} дн. назад`;
  return date.toLocaleDateString('ru-RU');
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
}