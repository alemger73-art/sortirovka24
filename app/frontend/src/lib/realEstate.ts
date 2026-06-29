import { client, withRetry, REAL_ESTATE_TYPES } from '@/lib/api';

export const RE_FAV_KEY = 're_favorites';
export const RE_VISIBLE_STATUSES = ['approved', 'published'];

export const RE_TYPE_BY_SLUG: Record<string, string> = {
  'prodam-kvartiru': 'sell_apartment',
  'sdam-kvartiru': 'rent_apartment',
  'snimu-kvartiru': 'need_apartment',
  'prodam-dom': 'sell_house',
  'arenda-doma': 'rent_house',
  kommercheskaya: 'commercial',
  uchastki: 'land',
};

export const RE_SLUG_BY_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(RE_TYPE_BY_SLUG).map(([slug, type]) => [type, slug]),
);

export type ReCategory = {
  id: number;
  name: string;
  slug?: string;
  icon?: string;
  parent_id?: number | string | null;
  sort_order?: number;
};

export type RealEstateSort = 'new' | 'price_asc' | 'price_desc';

export type RealEstateListing = {
  id: number;
  user_id?: string | null;
  re_type?: string | null;
  category_id?: number | null;
  title?: string | null;
  description?: string | null;
  price?: string | null;
  address?: string | null;
  rooms?: string | null;
  area?: string | null;
  floor_info?: string | null;
  image_url?: string | null;
  gallery_images?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  telegram?: string | null;
  author_name?: string | null;
  active?: boolean | null;
  status?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
  promoted_until?: string | null;
  promotion_tier?: string | null;
  views_count?: number | null;
};

export function loadReFavorites(): number[] {
  try {
    return JSON.parse(localStorage.getItem(RE_FAV_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveReFavorites(ids: number[]) {
  localStorage.setItem(RE_FAV_KEY, JSON.stringify(ids));
}

export function toggleReFavorite(id: number): number[] {
  const prev = loadReFavorites();
  const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
  saveReFavorites(next);
  return next;
}

export function parseRealEstatePrice(value?: string | null): number | null {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return null;
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isRealEstateExpired(item: { expires_at?: string | null }, now = Date.now()): boolean {
  if (!item.expires_at) return false;
  const ts = Date.parse(item.expires_at);
  return Number.isFinite(ts) && ts <= now;
}

export function isRealEstatePromoted(
  item: { promoted_until?: string | null; promotion_tier?: string | null },
  now = Date.now(),
): boolean {
  if (!item.promoted_until || !item.promotion_tier) return false;
  const ts = Date.parse(item.promoted_until);
  return Number.isFinite(ts) && ts > now;
}

export function getRealEstateCover(item: { image_url?: string | null; gallery_images?: string | null }) {
  if (item.image_url) return item.image_url;
  if (item.gallery_images) {
    const first = item.gallery_images.split(',').map((k) => k.trim()).find(Boolean);
    if (first) return first;
  }
  return null;
}

export function resolveReTypeLabel(
  item: { category_id?: number | null; re_type?: string | null },
  categories: ReCategory[],
): string {
  if (item.category_id) {
    const cat = categories.find((c) => c.id === item.category_id);
    if (cat?.name) return cat.name;
  }
  if (item.re_type && REAL_ESTATE_TYPES[item.re_type]) return REAL_ESTATE_TYPES[item.re_type];
  return item.re_type || '';
}

export function reTypeForCategory(category: ReCategory | undefined, categoryId: number | string): string {
  if (category?.slug && RE_TYPE_BY_SLUG[category.slug]) return RE_TYPE_BY_SLUG[category.slug];
  return 'sell_apartment';
}

export function sortRealEstateListings<T extends {
  promoted_until?: string | null;
  promotion_tier?: string | null;
  created_at?: string | null;
  price?: string | null;
}>(items: T[], sortBy: RealEstateSort): T[] {
  const tierRank = (tier?: string | null) => (tier === 'vip' ? 2 : tier === 'boost' ? 1 : 0);
  const now = Date.now();

  return [...items].sort((a, b) => {
    const pa = isRealEstatePromoted(a, now) ? 1 : 0;
    const pb = isRealEstatePromoted(b, now) ? 1 : 0;
    if (pb !== pa) return pb - pa;
    const ta = tierRank(a.promotion_tier);
    const tb = tierRank(b.promotion_tier);
    if (tb !== ta) return tb - ta;

    if (sortBy === 'price_asc' || sortBy === 'price_desc') {
      const paPrice = parseRealEstatePrice(a.price);
      const pbPrice = parseRealEstatePrice(b.price);
      if (paPrice == null && pbPrice == null) {
        /* fall through */
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

export function filterPublicRealEstate<T extends {
  status?: string | null;
  expires_at?: string | null;
}>(items: T[]): T[] {
  const now = Date.now();
  return items.filter(
    (item) => RE_VISIBLE_STATUSES.includes(String(item.status || '')) && !isRealEstateExpired(item, now),
  );
}

export async function fetchRealEstateCategories(): Promise<ReCategory[]> {
  const res = await withRetry(() =>
    client.entities.categories.query({
      query: { cat_type: 'real_estate', is_active: true },
      sort: 'sort_order',
      limit: 100,
    }),
  );
  const items: ReCategory[] = res.data?.items || [];
  return items.filter((cat) => cat.parent_id !== null && cat.parent_id !== '' && cat.parent_id !== undefined);
}

export function defaultReExpiresAtIso(days = 30): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function dealTypeForReType(reType?: string | null): 'sell' | 'rent' | 'need' | '' {
  if (!reType) return '';
  if (reType.startsWith('sell')) return 'sell';
  if (reType.startsWith('rent')) return 'rent';
  if (reType.startsWith('need')) return 'need';
  return '';
}

export const RE_QUICK_FILTER_KEYS = ['', 'sell_apartment', 'sell_house', 'rent_apartment', 'commercial'] as const;

export const RE_FALLBACK_IMAGES = [
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/c83eeaff-9091-405e-9032-5908700e9593.png',
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/6f4290d1-fefd-4261-982d-94ebf83e72a4.png',
  'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/082ab9a3-356f-48e7-92b4-61c3affe5cd6.png',
];

export const RE_HERO_IMG = 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-22/239eba9e-e793-4adc-a70a-f2cad35db132.png';

export { formatExpiryLabel } from '@/lib/announcements';
