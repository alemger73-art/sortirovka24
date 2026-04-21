/**
 * Prefetch utility — preloads API data AND images for likely next screens.
 * Uses requestIdleCallback + cache to avoid blocking the UI.
 *
 * Simplified: no gate, no DNS tracking — just straightforward prefetching.
 */

import { appCache } from './cache';
import { client, withRetry } from './api';
import { resolveImageSrc } from './storage';
import {
  extractImageUrls,
  preloadImagesOnIdle,
  preloadCriticalImages,
} from './imageCache';

const prefetched = new Set<string>();

function shouldPrefetch(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as any).connection;
  if (conn) {
    if (conn.saveData) return false;
    if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return false;
  }
  return true;
}

function onIdle(fn: () => void): void {
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(fn, { timeout: 5000 });
  } else {
    setTimeout(fn, 300);
  }
}

function resolveUrl(key: string): string | null {
  return resolveImageSrc(key);
}

function extractItems(result: any): any[] {
  try {
    const items = result?.data?.items ?? result?.items ?? [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function prefetchOne(
  cacheKey: string,
  fetcher: () => Promise<any>,
  ttl: number,
  preloadImgs = true
): Promise<void> {
  if (prefetched.has(cacheKey)) return;
  if (appCache.isFresh(cacheKey)) {
    prefetched.add(cacheKey);
    if (preloadImgs) {
      const cached = appCache.get<any>(cacheKey);
      if (cached) {
        const items = extractItems(cached);
        if (items.length > 0) {
          const urls = extractImageUrls(items, resolveUrl);
          if (urls.length > 0) preloadImagesOnIdle(urls, 2);
        }
      }
    }
    return;
  }
  prefetched.add(cacheKey);
  try {
    const data = await fetcher();
    appCache.set(cacheKey, data, ttl);
    if (preloadImgs) {
      const items = extractItems(data);
      if (items.length > 0) {
        const urls = extractImageUrls(items, resolveUrl);
        if (urls.length > 0) preloadImagesOnIdle(urls, 2);
      }
    }
  } catch {
    // Prefetch failure is non-critical
  }
}

const CACHE_5M = 5 * 60 * 1000;

function prefetchFood(): void {
  prefetchOne('food_categories', () => withRetry(() =>
    client.entities.food_categories.query({ sort: 'sort_order', limit: 50 })
  ), CACHE_5M);
  prefetchOne('food_items', () => withRetry(() =>
    client.entities.food_items.query({ sort: 'sort_order', limit: 200 })
  ), CACHE_5M);
}

function prefetchMasters(): void {
  prefetchOne('masters_list_all', () => withRetry(() =>
    client.entities.masters.query({ sort: '-rating', limit: 50 })
  ), CACHE_5M);
}

function prefetchAnnouncements(): void {
  prefetchOne('announcements_list_all', () => withRetry(() =>
    client.entities.announcements.query({
      query: { active: true, status: 'approved' },
      sort: '-created_at',
      limit: 50,
    })
  ), CACHE_5M);
}

function prefetchComplaints(): void {
  prefetchOne('complaints_list', () => withRetry(() =>
    client.entities.complaints.query({ sort: '-created_at', limit: 50 })
  ), CACHE_5M);
}

function prefetchNews(): void {
  prefetchOne('news_list_all', () => withRetry(() =>
    client.entities.news.query({ query: { published: true }, sort: '-created_at', limit: 50 })
  ), CACHE_5M);
}

function prefetchJobs(): void {
  prefetchOne('jobs_list_all', () => withRetry(() =>
    client.entities.jobs.query({ query: { active: true }, sort: '-created_at', limit: 50 })
  ), CACHE_5M);
}

function prefetchInspectors(): void {
  prefetchOne('inspectors_list', () => withRetry(() =>
    client.entities.inspectors.query({ sort: 'precinct_number', limit: 100 })
  ), CACHE_5M);
}

function prefetchRealEstate(): void {
  prefetchOne('real_estate_list', () => withRetry(() =>
    client.entities.real_estate.query({ sort: '-created_at', limit: 100 })
  ), CACHE_5M);
}

function prefetchTransport(): void {
  prefetchOne('bus_routes', () => withRetry(() =>
    client.entities.bus_routes.query({ sort: 'sort_order', limit: 50 })
  ), CACHE_5M);
}

/**
 * Prefetch data for the most likely next pages from Index.
 * Runs during idle time. Staggers requests to avoid congestion.
 */
export function prefetchFromIndex(): void {
  if (!shouldPrefetch()) return;

  preloadCriticalImages([
    'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/ad8caa55-9593-448b-8f7a-39be84ed5053.png',
  ]);

  onIdle(() => {
    prefetchFood();
    prefetchMasters();
    prefetchAnnouncements();
  });

  setTimeout(() => {
    onIdle(() => {
      prefetchComplaints();
      prefetchNews();
      prefetchJobs();
    });
  }, 3000);

  setTimeout(() => {
    onIdle(() => {
      prefetchInspectors();
      prefetchRealEstate();
    });
  }, 6000);
}

/**
 * Prefetch data for a specific page on hover/focus.
 */
export function prefetchPage(page: string): void {
  if (!shouldPrefetch()) return;

  const map: Record<string, () => void> = {
    food: prefetchFood,
    masters: prefetchMasters,
    announcements: prefetchAnnouncements,
    complaints: prefetchComplaints,
    news: prefetchNews,
    jobs: prefetchJobs,
    inspectors: prefetchInspectors,
    'real-estate': prefetchRealEstate,
    transport: prefetchTransport,
    questions: () => {},
    directory: () => {},
  };

  const fn = map[page];
  if (fn) fn();
}

export function routeToPage(path: string): string {
  return path.replace(/^\//, '').split('/')[0] || '';
}