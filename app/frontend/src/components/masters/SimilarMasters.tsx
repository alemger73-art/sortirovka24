import { useEffect, useState } from 'react';
import MasterCard, { type MasterCardData } from './MasterCard';
import { client, withRetry } from '@/lib/api';
import { fetchWithCache } from '@/lib/cache';
import { sortMasters } from './mastersTheme';
import { useLanguage } from '@/contexts/LanguageContext';

export default function SimilarMasters({ masterId, category }: { masterId: number | string; category: string }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<MasterCardData[]>([]);

  useEffect(() => {
    if (!category) return;
    (async () => {
      try {
        const res = await fetchWithCache(
          `masters_similar_${category}`,
          () => withRetry(() => client.entities.masters.query({ query: { category }, sort: '-rating', limit: 8 })),
          5 * 60 * 1000,
        );
        const list = sortMasters(res.data?.items || []).filter((m: MasterCardData) => String(m.id) !== String(masterId));
        setItems(list.slice(0, 3));
      } catch {
        setItems([]);
      }
    })();
  }, [masterId, category]);

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <h2 className="text-sm font-bold text-gray-900 dark:text-white mb-3">{t('masters.similarTitle')}</h2>
      <div className="space-y-3">
        {items.map((m) => (
          <MasterCard key={m.id} master={m} />
        ))}
      </div>
    </section>
  );
}
