import { DAM_ALEM_CDN } from '@/lib/damAlemImages';

/** Homepage promo banners — project CDN only (stable in KZ / Yandex Browser). */
export const SITE_BANNER_IMAGES = {
  foodDelivery: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png',
  pizzaPromo: DAM_ALEM_CDN.pizza,
  lunchCombo: DAM_ALEM_CDN.combo,
  familySet: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/e1e63b15-29d2-4b2e-b1b5-919722b3b1b9.png',
  giftPromo: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/8455d66f-e18f-4075-9b91-972d3002381b.png',
  donerHits: DAM_ALEM_CDN.hero,
  masters: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/b909034d-586a-4902-99f3-2abcf2e3c7d8.png',
  directory: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/802ce8b1-e55e-42b0-8b26-3ec0b903e7e7.png',
  inspector: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-21/d9cdc63f-9e09-4de5-b2eb-1c2ef0cb55ad.png',
  business: 'https://mgx-backend-cdn.metadl.com/generate/images/1029162/2026-03-31/5007abb2-2c10-46e9-9721-c83a5b9a7265.png',
} as const;

export const SITE_BANNER_FALLBACKS = [
  SITE_BANNER_IMAGES.foodDelivery,
  SITE_BANNER_IMAGES.pizzaPromo,
  SITE_BANNER_IMAGES.lunchCombo,
  DAM_ALEM_CDN.hero,
];

/** Map banner title fragments to preferred CDN images. */
export function resolveSiteBannerImage(title?: string, imageUrl?: string | null): string {
  const t = (title || '').toLowerCase();
  if (t.includes('донер') || t.includes('шашлык')) return SITE_BANNER_IMAGES.donerHits;
  if (t.includes('подарок')) return SITE_BANNER_IMAGES.giftPromo;
  if (t.includes('семейн') || t.includes('semya')) return SITE_BANNER_IMAGES.familySet;
  if (t.includes('обед') || t.includes('obed')) return SITE_BANNER_IMAGES.lunchCombo;
  if (t.includes('пицц') || t.includes('pizza')) return SITE_BANNER_IMAGES.pizzaPromo;
  if (t.includes('damalem') || t.includes('−10%') || t.includes('-10%')) return SITE_BANNER_IMAGES.pizzaPromo;
  if (t.includes('мастер')) return SITE_BANNER_IMAGES.masters;
  const url = (imageUrl || '').trim();
  if (url.startsWith('http') && !url.includes('unsplash.com')) return url;
  return SITE_BANNER_IMAGES.foodDelivery;
}

export function buildSiteBannerImageChain(title?: string, imageUrl?: string | null): string[] {
  const primary = resolveSiteBannerImage(title, imageUrl);
  const seen = new Set<string>();
  const chain: string[] = [];
  for (const url of [imageUrl, primary, ...SITE_BANNER_FALLBACKS]) {
    const trimmed = (url || '').trim();
    if (!trimmed || seen.has(trimmed) || trimmed.includes('unsplash.com')) continue;
    seen.add(trimmed);
    chain.push(trimmed);
  }
  return chain.length > 0 ? chain : [SITE_BANNER_IMAGES.foodDelivery];
}
