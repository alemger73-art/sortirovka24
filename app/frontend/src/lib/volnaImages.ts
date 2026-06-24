import { buildImageFallbackChain, DAM_ALEM_CDN, getCategoryImage } from '@/lib/damAlemImages';

/** Verified Unsplash IDs + project CDN as reliable fallback in KZ */
const PHOTOS = {
  hero: 'photo-1510812431401-41d2bd2724f3',
  promo: 'photo-1544145945-f90425340c7e',
  wineCat: 'photo-1510812431401-41d2bd2724f3',
  beerCat: 'photo-1608270586620-248524c67de9',
  spiritsCat: 'photo-1569529465841-df137b257a08',
  sparklingCat: 'photo-1544145945-f90425340c7e',
  cocktailCat: 'photo-1551538827-9c037cb80827',
  snacksCat: 'photo-1604908177521-402890a3a563',
  wineRed: 'photo-1506377247377-2ccd4979b731',
  wineWhite: 'photo-1584916201218-f4242ceb4809',
  beer: 'photo-1535958636474-b021ee887b13',
  whiskey: 'photo-1527281400683-1aae7261f764',
  champagne: 'photo-1544145945-f90425340c7e',
} as const;

export const VOLNA_CDN = {
  index: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png',
  hero: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-15/fe194ca1-0095-44bf-a906-e50cb844ad56.png',
  promo: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/2034a1d7-1c57-40c0-8145-23816557ba5c.png',
} as const;

export const VOLNA_INDEX_IMAGE = VOLNA_CDN.index;

const VOLNA_FALLBACKS = [VOLNA_CDN.hero, VOLNA_CDN.promo, DAM_ALEM_CDN.food];

function volnaImg(photoId: string, w = 600, h = 800): string {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${w}&h=${h}&q=85`;
}

/** Normalize legacy bare Unsplash URLs from seed/admin. */
export function normalizeVolnaImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || !trimmed.includes('unsplash.com')) return trimmed;
  if (trimmed.includes('auto=format')) return trimmed;
  const idMatch = trimmed.match(/images\.unsplash\.com\/([^?]+)/);
  if (!idMatch) return trimmed;
  const wMatch = trimmed.match(/[?&]w=(\d+)/);
  const hMatch = trimmed.match(/[?&]h=(\d+)/);
  const w = wMatch ? Number(wMatch[1]) : 600;
  const h = hMatch ? Number(hMatch[1]) : 800;
  return volnaImg(idMatch[1], w, h);
}

export function buildVolnaImageChain(url?: string | null, kind: 'hero' | 'promo' | 'category' | 'product' = 'product'): string[] {
  const defaults: Record<typeof kind, string> = {
    hero: volnaImg(PHOTOS.hero, 900, 560),
    promo: volnaImg(PHOTOS.promo, 600, 320),
    category: volnaImg(PHOTOS.wineCat, 400, 400),
    product: volnaImg(PHOTOS.wineRed, 400, 400),
  };
  const primary = url?.trim() ? normalizeVolnaImageUrl(url) : defaults[kind];
  return buildImageFallbackChain(primary, VOLNA_FALLBACKS);
}

export function resolveVolnaImage(url?: string | null, kind: 'hero' | 'promo' | 'category' | 'product' = 'product'): string {
  return buildVolnaImageChain(url, kind)[0] ?? defaultsFor(kind);
}

function defaultsFor(kind: 'hero' | 'promo' | 'category' | 'product'): string {
  if (kind === 'hero') return volnaImg(PHOTOS.hero, 900, 560);
  if (kind === 'promo') return volnaImg(PHOTOS.promo, 600, 320);
  if (kind === 'category') return volnaImg(PHOTOS.wineCat, 400, 400);
  return volnaImg(PHOTOS.wineRed, 400, 400);
}

/** Cross-marketing: food pairings for alcohol orders */
export function getVolnaDamAlemPromoImage(): string {
  return getCategoryImage('shashlyki');
}
