import { useEffect, useState } from 'react';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';

export interface HeroStatItem {
  value: number;
  labelKey: 'hero.mastersShort' | 'hero.cafesShort' | 'hero.residentsShort';
}

const CACHE_TTL = 60 * 1000;

const DEFAULT_STATS: HeroStatItem[] = [
  { value: 8, labelKey: 'hero.mastersShort' },
  { value: 6, labelKey: 'hero.cafesShort' },
  { value: 1000, labelKey: 'hero.residentsShort' },
];

function getTotal(r: PromiseSettledResult<any>): number {
  if (r.status !== 'fulfilled') return 0;
  const val = r.value;
  if (!val || typeof val !== 'object') return 0;
  const total = val?.data?.total ?? val?.total ?? 0;
  if (typeof total === 'number' && total > 0) return total;
  const items = val?.data?.items ?? val?.items;
  return Array.isArray(items) ? items.length : 0;
}

export function useHomepageHeroStats() {
  const [visible, setVisible] = useState(true);
  const [items, setItems] = useState<HeroStatItem[]>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchWithCache(
          'hero_homepage_stats',
          () => withRetry(() => client.entities.homepage_stats.query({ limit: 1 })),
          CACHE_TTL,
        );
        const row = res?.data?.items?.[0] ?? null;
        const isVisible = row?.is_visible !== false && row?.is_visible !== 'false';
        if (cancelled) return;

        if (!isVisible) {
          setVisible(false);
          setItems([]);
          return;
        }

        setVisible(true);
        const isAuto = row ? row.is_auto === true || row.is_auto === 'true' : true;
        const residents = row?.residents_count > 0 ? row.residents_count : 1000;
        const next: HeroStatItem[] = [];

        if (isAuto) {
          const [mastersRes, cafesRes] = await Promise.allSettled([
            fetchWithCache('hero_stats_masters', () => withRetry(() => client.entities.masters.query({ limit: 1 })), CACHE_TTL),
            fetchWithCache('hero_stats_cafes', () => withRetry(() => client.entities.food_categories.query({ limit: 1 })), CACHE_TTL),
          ]);
          if (cancelled) return;
          const mc = getTotal(mastersRes);
          const cc = getTotal(cafesRes);
          if (mc > 0) next.push({ value: mc, labelKey: 'hero.mastersShort' });
          if (cc > 0) next.push({ value: cc, labelKey: 'hero.cafesShort' });
        } else if (row) {
          if ((row.masters_count || 0) > 0) next.push({ value: row.masters_count, labelKey: 'hero.mastersShort' });
          if ((row.cafes_count || 0) > 0) next.push({ value: row.cafes_count, labelKey: 'hero.cafesShort' });
        } else {
          next.push(...DEFAULT_STATS.slice(0, 2));
        }

        if (residents > 0) next.push({ value: residents, labelKey: 'hero.residentsShort' });
        setItems(next.length > 0 ? next : DEFAULT_STATS);
      } catch {
        if (!cancelled) {
          setVisible(true);
          setItems(DEFAULT_STATS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return { visible, items, loading };
}
