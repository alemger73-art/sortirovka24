/** One explicit action contract shared by storefront and banner editor. */
export type FoodBannerAction =
  | { type: 'category'; slug: string }
  | { type: 'promo'; code: string; categorySlug?: string }
  | { type: 'popular' }
  | { type: 'gifts' }
  | { type: 'menu' }
  | { type: 'link'; url: string };

export interface FoodBannerLike {
  title?: string;
  subtitle?: string;
  banner_text?: string;
  button_text?: string;
  button_url?: string;
  link_url?: string;
  banner_type?: string;
  active?: boolean;
}

export function safeBannerLink(value: string): boolean {
  if (!value || Array.from(value).some(char => char.charCodeAt(0) <= 32 || char === '\\')) return false;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function resolveFoodBannerAction(banner: FoodBannerLike): FoodBannerAction {
  const raw = (banner.button_url || banner.link_url || '').trim();
  if (!safeBannerLink(raw)) return { type: 'menu' };
  const origin = typeof window === 'undefined' ? 'https://food.local' : window.location.origin;
  const url = new URL(raw, origin);
  if (url.origin !== origin || !/^\/food\/?$/.test(url.pathname)) return { type: 'link', url: raw };
  const hash = url.hash.slice(1).replace(/^\?/, '');
  const params = new URLSearchParams(url.search);
  new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
  const code = (params.get('promo') || params.get('code') || '').trim().toUpperCase();
  const slug = (params.get('category') || params.get('cat') || '').trim().toLowerCase();
  if (code) return { type: 'promo', code, categorySlug: slug || undefined };
  if (slug) return { type: 'category', slug };
  const section = params.get('section') || hash;
  if (section === 'popular' || section === 'gifts') return { type: section };
  return { type: 'menu' };
}

export function foodBannerActionUrl(action: FoodBannerAction): string {
  if (action.type === 'link') return action.url.trim();
  if (action.type === 'menu') return '/food';
  if (action.type === 'category') return `/food#category=${encodeURIComponent(action.slug)}`;
  if (action.type === 'promo') return `/food#promo=${encodeURIComponent(action.code.trim().toUpperCase())}${action.categorySlug ? `&category=${encodeURIComponent(action.categorySlug)}` : ''}`;
  return `/food#${action.type}`;
}

export function foodBannerCtaLabel(action: FoodBannerAction, custom?: string): string {
  if (custom?.trim()) return custom.trim();
  switch (action.type) {
    case 'promo': return `Применить ${action.code}`;
    case 'category': return 'Выбрать блюда';
    case 'popular': return 'Смотреть хиты';
    case 'gifts': return 'Посмотреть подарки';
    case 'link': return 'Подробнее';
    default: return 'Открыть меню';
  }
}

export function foodBannerActionDescription(action: FoodBannerAction): string {
  switch (action.type) {
    case 'category': return `Откроется категория «${action.slug}»`;
    case 'promo': return `Будет проверен и применён промокод ${action.code}`;
    case 'popular': return 'Переход к популярным блюдам';
    case 'gifts': return 'Условия подарков к заказу';
    case 'link': return `Переход по ссылке: ${action.url}`;
    default: return 'Переход к меню';
  }
}

export function isFoodBanner(banner: FoodBannerLike): boolean {
  if (banner.banner_type === 'food_delivery') return true;
  const raw = (banner.button_url || banner.link_url || '').trim();
  if (/^\/food(?:[/?#]|$)/i.test(raw)) return true;
  // Compatibility with old untyped banners. Explicitly typed banners from
  // another storefront must never be guessed from a generic word like delivery.
  return !banner.banner_type && /dam\s*alem|дам\s*алем|алем\s*фуд/i.test(banner.title || '');
}
