import { client, withRetry, ANN_TYPES } from '@/lib/api';

export const ANN_FAV_KEY = 'ann_favorites';
export const ANN_VISIBLE_STATUSES = ['approved', 'published'];

export const ANN_TYPE_BY_SLUG: Record<string, string> = {
  prodam: 'sell',
  kuplyu: 'buy',
  sdam: 'rent',
  'uslugi-ann': 'services',
  'otdam-besplatno': 'free',
};

export const ANN_SLUG_BY_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(ANN_TYPE_BY_SLUG).map(([slug, type]) => [type, slug]),
);

export type AnnCategory = {
  id: number | string;
  name: string;
  slug?: string;
  icon?: string;
  parent_id?: number | string | null;
  sort_order?: number;
};

/** Fallback when API categories are unavailable (uses ann_type slug as id). */
export function fallbackAnnouncementCategories(): AnnCategory[] {
  return Object.entries(ANN_TYPES).map(([slug, name]) => ({ id: slug, name, slug }));
}

export type AnnouncementSort = 'new' | 'price_asc' | 'price_desc';

export function loadAnnFavorites(): number[] {
  try {
    return JSON.parse(localStorage.getItem(ANN_FAV_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveAnnFavorites(ids: number[]) {
  localStorage.setItem(ANN_FAV_KEY, JSON.stringify(ids));
}

export function toggleAnnFavorite(id: number): number[] {
  const prev = loadAnnFavorites();
  const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
  saveAnnFavorites(next);
  return next;
}

export function parseAnnouncementPrice(value?: string | null): number | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isAnnouncementExpired(item: { expires_at?: string | null }, now = Date.now()): boolean {
  if (!item.expires_at) return false;
  const ts = Date.parse(item.expires_at);
  return Number.isFinite(ts) && ts <= now;
}

export function isAnnouncementPromoted(
  item: { promoted_until?: string | null; promotion_tier?: string | null },
  now = Date.now(),
): boolean {
  if (!item.promoted_until || !item.promotion_tier) return false;
  const ts = Date.parse(item.promoted_until);
  return Number.isFinite(ts) && ts > now;
}

export function getAnnouncementCover(ann: { image_url?: string; gallery_images?: string }) {
  if (ann.image_url) return ann.image_url;
  if (ann.gallery_images) {
    const first = ann.gallery_images.split(',').map((k) => k.trim()).find(Boolean);
    if (first) return first;
  }
  return null;
}

export function resolveCategoryLabel(
  ann: { category_id?: number | null; ann_type?: string | null },
  categories: AnnCategory[],
): string {
  if (ann.category_id) {
    const cat = categories.find((c) => c.id === ann.category_id);
    if (cat?.name) return cat.name;
  }
  if (ann.ann_type && ANN_TYPES[ann.ann_type]) return ANN_TYPES[ann.ann_type];
  return ann.ann_type || 'Объявление';
}

export function sortAnnouncements<T extends {
  promoted_until?: string | null;
  promotion_tier?: string | null;
  created_at?: string | null;
  price?: string | null;
}>(items: T[], sortBy: AnnouncementSort): T[] {
  const tierRank = (tier?: string | null) => (tier === 'vip' ? 2 : tier === 'boost' ? 1 : 0);
  const now = Date.now();

  return [...items].sort((a, b) => {
    const pa = isAnnouncementPromoted(a, now) ? 1 : 0;
    const pb = isAnnouncementPromoted(b, now) ? 1 : 0;
    if (pb !== pa) return pb - pa;
    const ta = tierRank(a.promotion_tier);
    const tb = tierRank(b.promotion_tier);
    if (tb !== ta) return tb - ta;

    if (sortBy === 'price_asc' || sortBy === 'price_desc') {
      const paPrice = parseAnnouncementPrice(a.price);
      const pbPrice = parseAnnouncementPrice(b.price);
      if (paPrice == null && pbPrice == null) {
        /* fall through to date */
      } else if (paPrice == null) {
        return 1;
      } else if (pbPrice == null) {
        return -1;
      } else if (paPrice !== pbPrice) {
        return sortBy === 'price_asc' ? paPrice - pbPrice : pbPrice - paPrice;
      }
    }

    return Date.parse(b.created_at || '') - Date.parse(a.created_at || '');
  });
}

export function filterPublicAnnouncements<T extends {
  status?: string | null;
  expires_at?: string | null;
}>(items: T[]): T[] {
  const now = Date.now();
  return items.filter(
    (item) => ANN_VISIBLE_STATUSES.includes(String(item.status || '')) && !isAnnouncementExpired(item, now),
  );
}

export async function fetchAnnouncementCategories(): Promise<AnnCategory[]> {
  const res = await withRetry(() =>
    client.entities.categories.query({
      query: { cat_type: 'announcements', is_active: true },
      sort: 'sort_order',
      limit: 100,
    }),
  );
  const items: AnnCategory[] = res.data?.items || [];
  return items.filter((cat) => cat.parent_id !== null && cat.parent_id !== '' && cat.parent_id !== undefined);
}

export function annTypeForCategory(category: AnnCategory | undefined, categoryId: number | string): string {
  if (category?.slug && ANN_TYPE_BY_SLUG[category.slug]) return ANN_TYPE_BY_SLUG[category.slug];
  if (typeof categoryId === 'string' && ANN_TYPES[categoryId]) return categoryId;
  return 'other';
}

export function formatExpiryLabel(expiresAt?: string | null): string {
  if (!expiresAt) return '';
  try {
    return new Date(expiresAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return expiresAt;
  }
}

export function defaultExpiresAtIso(days = 30): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
