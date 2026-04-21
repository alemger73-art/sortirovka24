/**
 * Lightweight localStorage cache with TTL support.
 * Used for caching API responses (categories, menu items, etc.)
 *
 * Enhanced with stale-data fallback for resilience against
 * transient backend errors (DNS resolution, Lambda cold starts, etc.)
 */

const DEFAULT_TTL = 2 * 60 * 1000; // 2 minutes (reduced from 10 for faster data freshness)
const STALE_TTL = 60 * 60 * 1000; // 1 hour — max age for stale fallback (reduced from 24h)

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export const appCache = {
  set<T>(key: string, data: T, ttl: number = DEFAULT_TTL): void {
    try {
      const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
      localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    } catch {
      // localStorage full — try to evict oldest entries
      try {
        this._evictOldest(3);
        const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
        localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
      } catch {
        // Still full — silently fail
      }
    }
  },

  /**
   * Get cached data if still within TTL.
   */
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(`cache_${key}`);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() - entry.timestamp > entry.ttl) {
        // Don't remove — keep for stale fallback
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Get cached data even if TTL expired (stale fallback).
   * Returns null only if no data exists or data is older than STALE_TTL (24h).
   */
  getStale<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(`cache_${key}`);
      if (!raw) return null;
      const entry: CacheEntry<T> = JSON.parse(raw);
      // Allow stale data up to 24 hours old
      if (Date.now() - entry.timestamp > STALE_TTL) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  },

  /**
   * Check if cached data is fresh (within TTL).
   */
  isFresh(key: string): boolean {
    try {
      const raw = localStorage.getItem(`cache_${key}`);
      if (!raw) return false;
      const entry: CacheEntry<unknown> = JSON.parse(raw);
      return Date.now() - entry.timestamp <= entry.ttl;
    } catch {
      return false;
    }
  },

  remove(key: string): void {
    localStorage.removeItem(`cache_${key}`);
  },

  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cache_'));
    keys.forEach(k => localStorage.removeItem(k));
  },

  /**
   * Invalidate (remove) all cache entries whose key contains the given substring.
   * E.g. invalidateByPrefix('inspectors') removes cache_inspectors_list, etc.
   */
  invalidateByPrefix(prefix: string): void {
    const keys = Object.keys(localStorage).filter(
      k => k.startsWith('cache_') && k.includes(prefix)
    );
    keys.forEach(k => localStorage.removeItem(k));
  },

  /** Evict the N oldest cache entries to free space. */
  _evictOldest(count: number): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cache_'));
    const entries = keys.map(k => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return { key: k, ts: 0 };
        const entry = JSON.parse(raw);
        return { key: k, ts: entry.timestamp || 0 };
      } catch {
        return { key: k, ts: 0 };
      }
    });
    entries.sort((a, b) => a.ts - b.ts);
    entries.slice(0, count).forEach(e => localStorage.removeItem(e.key));
  },
};

/**
 * Fetch data with network-first strategy + stale fallback.
 * 1. Always try network first for fresh data.
 * 2. If network succeeds → cache and return fresh data.
 * 3. If network fails → return cached data (fresh or stale) if available.
 * 4. If no cached data → throw the original error.
 *
 * This ensures admin changes are immediately visible on public pages.
 */
export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  // 1. Always try network first
  try {
    const data = await fetcher();
    appCache.set(key, data, ttl);
    return data;
  } catch (err) {
    // 2. Network failed — try fresh cache
    const cached = appCache.get<T>(key);
    if (cached) {
      console.warn(`[Cache] Using fresh cache for "${key}" due to network error`);
      return cached;
    }
    // 3. Try stale cache
    const stale = appCache.getStale<T>(key);
    if (stale) {
      console.warn(`[Cache] Using stale data for "${key}" due to network error`);
      return stale;
    }
    // 4. No cached data — propagate error
    throw err;
  }
}

/**
 * Invalidate all public page caches. Call this from admin pages
 * after any create/update/delete operation to ensure public pages
 * show fresh data immediately (when admin browses the public site).
 */
export function invalidatePublicCaches(): void {
  appCache.clear();
}

/**
 * Invalidate cache entries related to a specific entity.
 * E.g. invalidateEntityCache('inspectors') clears inspectors_list, etc.
 */
export function invalidateEntityCache(entity: string): void {
  appCache.invalidateByPrefix(entity);
}

/**
 * Invalidate ALL caches. Should be called after any admin mutation
 * (create/update/delete) to ensure public pages show fresh data.
 * This is a broad invalidation — safe because caches are cheap to rebuild.
 */
export function invalidateAllCaches(): void {
  appCache.clear();
}