import { DAM_ALEM_CDN } from '@/lib/damAlemImages';

/** Homepage promo banners — project CDN only (stable in KZ / Yandex Browser). */
export const SITE_BANNER_IMAGES = {
  foodDelivery: 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505694/legacy-images/0bdca3ab9d92dc7a772a.png',
  pizzaPromo: DAM_ALEM_CDN.pizza,
  lunchCombo: DAM_ALEM_CDN.combo,
  familySet: 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505701/legacy-images/a867ffe78770fa826fe1.png',
  giftPromo: 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505694/legacy-images/0bdca3ab9d92dc7a772a.png',
  donerHits: DAM_ALEM_CDN.hero,
  masters: 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505698/legacy-images/e9af3e8091e7803d0d09.png',
  directory: 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505692/legacy-images/743b887a044471e15970.png',
  inspector: 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505700/legacy-images/4bc25cf2db9751b93b92.png',
  business: 'https://res.cloudinary.com/djpdmlkr9/image/upload/v1792505711/legacy-images/cdf3da78dd1bdb839c30.png',
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
