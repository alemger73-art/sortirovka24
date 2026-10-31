/**
 * Prefetch utility — preloads API data AND images for likely next screens.
 * Uses requestIdleCallback + cache to avoid blocking the UI.
 *
 * Simplified: no gate, no DNS tracking — just straightforward prefetching.
 */

import { appCache } from './cache';
import { moduleEnabled } from '@/hooks/useModules';
import type { ModuleKey } from '@/config/modules';
import { client, withRetry } from './api';
import { apiUrl } from './config';
import { resolveImageSrc } from './storage';
import {
  extractImageUrls,
  preloadImagesOnIdle,
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
  preloadImgs = true,
  module?: ModuleKey,
): Promise<void> {
  if (prefetched.has(cacheKey)) return;
  if (module && !(await moduleEnabled(module))) return;
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

function prefetchGastronom(): void {
  prefetchOne('gastronom_catalog', () => fetch(apiUrl('/api/v1/gastronom/catalog')).then(r => r.json()), CACHE_5M, false, 'gastronom');
}

function prefetchFood(): void {
  prefetchOne('food_categories', () => withRetry(() =>
    client.entities.food_categories.query({ sort: 'sort_order', limit: 50 })
  ), CACHE_5M, true, 'food');
  // Menu data only: downloading every dish photo in advance cost visitors several megabytes on the home page.
  prefetchOne('food_items', () => withRetry(() =>
    client.entities.food_items.query({ sort: 'sort_order', limit: 200 })
  ), CACHE_5M, false, 'food');
}

function prefetchMasters(): void {
  prefetchOne('masters_list_all', () => withRetry(() =>
    client.entities.masters.query({ sort: '-rating', limit: 200 })
  ), CACHE_5M, true, 'masters');
}

function prefetchAnnouncements(): void {
  prefetchOne('announcements_list_all', () => withRetry(() =>
    client.entities.announcements.query({
      query: { active: true, status: 'approved' },
      sort: '-created_at',
      limit: 50,
    })
  ), CACHE_5M, true, 'announcements');
}

function prefetchComplaints(): void {
  prefetchOne('complaints_list', () => withRetry(() =>
    client.entities.complaints.query({ sort: '-created_at', limit: 50 })
  ), CACHE_5M, true, 'complaints');
}

function prefetchNews(): void {
  prefetchOne('news_list_all', () => withRetry(() =>
    client.entities.news.query({ query: { published: true }, sort: '-created_at', limit: 50 })
  ), CACHE_5M, true, 'news');
}

function prefetchJobs(): void {
  prefetchOne('jobs_list_all', () => withRetry(() =>
    client.entities.jobs.query({ query: { active: true }, sort: '-created_at', limit: 50 })
  ), CACHE_5M, true, 'jobs');
}

function prefetchInspectors(): void {
  prefetchOne('inspectors_list_v2', () => withRetry(() =>
    client.entities.inspectors.query({ sort: 'precinct_number', limit: 100 })
  ), CACHE_5M, true, 'inspectors');
}

function prefetchDirectory(): void {
  prefetchOne('directory_entries_v2', () => withRetry(() =>
    client.entities.directory_entries.query({ sort: 'sort_order', limit: 200 })
  ), CACHE_5M, true, 'directory');
}

function prefetchRealEstate(): void {
  prefetchOne('real_estate_list', () => withRetry(() =>
    client.entities.real_estate.query({ sort: '-created_at', limit: 100 })
  ), CACHE_5M, true, 'real_estate');
}

function prefetchTransport(): void {
  prefetchOne('bus_routes', () => withRetry(() =>
    client.entities.bus_routes.query({ sort: 'sort_order', limit: 50 })
  ), CACHE_5M, true, 'transport');
}

/**
 * Prefetch data for the most likely next pages from Index.
 * Runs during idle time. Staggers requests to avoid congestion.
 */
export function prefetchFromIndex(): void {
  if (!shouldPrefetch()) return;

  onIdle(() => {
    prefetchGastronom();
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
      prefetchDirectory();
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
    gastronom: prefetchGastronom,
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
    directory: prefetchDirectory,
  };

  const fn = map[page];
  if (fn) fn();
}

export function routeToPage(path: string): string {
  return path.replace(/^\//, '').split('/')[0] || '';
}