import { getCategoryImage } from '@/lib/damAlemImages';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';
import type { FoodPromoCode } from '@/lib/foodPromo';
import { parsePromoCodes } from '@/lib/foodPromo';

export const DEFAULT_PROMO_CODES: FoodPromoCode[] = [
  { code: 'DAMALEM10', type: 'percent', value: 10, min_order: 2500, active: true, label: '−10% на заказ' },
  { code: 'PIZZA500', type: 'fixed', value: 500, min_order: 3500, active: true, label: '−500 ₸ на пиццу' },
  { code: 'OBED15', type: 'percent', value: 15, min_order: 2000, active: true, label: '−15% комплексный обед' },
  { code: 'DOSTAVKA', type: 'free_delivery', value: 0, min_order: 8000, active: true, label: 'Бесплатная доставка' },
  { code: 'SEMYA20', type: 'percent', value: 20, min_order: 12000, active: true, label: '−20% семейный заказ' },
];

export const REFERRAL_SHARE_MESSAGE =
  'Привет! Заказываю в DAM ALEM — вкусная доставка по Сортировке 🍕\nПромокод DAMALEM10 — скидка 10% на заказ от 2 500 ₸';

export function resolvePromoCodes(raw?: string): FoodPromoCode[] {
  const parsed = parsePromoCodes(raw);
  return parsed.length > 0 ? parsed : DEFAULT_PROMO_CODES;
}

export interface PromoSlide {
  title: string;
  lines: string[];
}

export function parsePromoSlides(raw?: string): PromoSlide[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is { title?: unknown; lines?: unknown } => !!s && typeof s === 'object')
      .map(s => ({
        title: String(s.title || '').trim(),
        lines: Array.isArray(s.lines) ? s.lines.map(line => String(line)) : [],
      }))
      .filter(s => s.title.length > 0);
  } catch {
    return [];
  }
}

export function defaultPromoSlides(opts: {
  freeDeliveryFrom: number;
  formatPrice: (n: number) => string;
  promos: FoodPromoCode[];
}): PromoSlide[] {
  const slides: PromoSlide[] = [];
  if (opts.freeDeliveryFrom > 0) {
    slides.push({
      title: 'Бесплатная доставка',
      lines: [`От ${opts.formatPrice(opts.freeDeliveryFrom)} по Сортировке`],
    });
  }
  const first = opts.promos.find(p => p.active !== false);
  if (first) {
    slides.push({
      title: first.label || first.code,
      lines: [`Промокод ${first.code}`],
    });
  }
  slides.push({
    title: 'Готовим после заказа',
    lines: ['Пицца, донеры, шашлыки и комбо — горячими к подъезду'],
  });
  return slides;
}

export interface MarketingStory {
  id: string;
  title: string;
  subtitle: string;
  cta?: string;
  image: string;
  gradient: string;
  emoji: string;
}

export function buildMarketingStories(opts: {
  freeDeliveryFrom: number;
  minOrder: number;
  deliveryTime: string;
  gifts: LoyaltyGift[];
  formatPrice: (n: number) => string;
}): MarketingStory[] {
  const stories: MarketingStory[] = [
    {
      id: 'delivery-free',
      title: 'Бесплатная доставка',
      subtitle:
        opts.freeDeliveryFrom > 0
          ? `Закажите от ${opts.formatPrice(opts.freeDeliveryFrom)} — доставим бесплатно по Сортировке`
          : 'Доставляем горячую еду прямо к подъезду',
      cta: 'Выбрать блюда',
      image: getCategoryImage('burgery'),
      gradient: 'linear-gradient(135deg, #FF3B30 0%, #FF6B35 50%, #FFB347 100%)',
      emoji: '🚚',
    },
    {
      id: 'speed',
      title: 'Быстро и горячо',
      subtitle: `Среднее время доставки ${opts.deliveryTime}. Готовим после вашего заказа`,
      cta: 'Смотреть меню',
      image: getCategoryImage('pizza-30'),
      gradient: 'linear-gradient(135deg, #111 0%, #FF3B30 100%)',
      emoji: '⚡',
    },
    {
      id: 'promo-damalem',
      title: 'Код DAMALEM10',
      subtitle: '−10% на заказ от 2 500 ₸. Нажмите «Выгодно сегодня» ниже и скопируйте код',
      cta: 'Применить код',
      image: getCategoryImage('pizza-30'),
      gradient: 'linear-gradient(135deg, #FF3B30 0%, #FF9500 100%)',
      emoji: '🏷',
    },
    {
      id: 'hits',
      title: 'Хиты DAM ALEM',
      subtitle: 'Пицца, донеры, шашлыки и комплексные обеды — всё в одном приложении',
      cta: 'Популярное',
      image: getCategoryImage('donery'),
      gradient: 'linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)',
      emoji: '🔥',
    },
  ];

  if (opts.gifts.length > 0) {
    const first = opts.gifts.filter(g => g.is_active).sort((a, b) => a.min_amount - b.min_amount)[0];
    if (first) {
      stories.push({
        id: 'gift',
        title: 'Подарок к заказу',
        subtitle: `От ${opts.formatPrice(first.min_amount)} — ${first.title}. Бесплатно!`,
        cta: 'Заказать',
        image: getCategoryImage('kombo-fastfud'),
        gradient: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
        emoji: '🎁',
      });
    }
  }

  if (opts.minOrder > 0) {
    stories.push({
      id: 'min-order',
      title: 'Удобный заказ',
      subtitle: `Минимальный заказ всего ${opts.formatPrice(opts.minOrder)} — идеально на компанию или семью`,
      cta: 'Начать',
      image: getCategoryImage('sety-na-kompaniyu'),
      gradient: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
      emoji: '✨',
    });
  }

  return stories;
}

export function promoChipLabel(p: FoodPromoCode): string {
  if (p.label?.trim()) return p.label.trim();
  if (p.type === 'free_delivery') return 'Бесплатная доставка';
  if (p.type === 'fixed') return `−${p.value.toLocaleString('ru-RU')} ₸`;
  return `−${p.value}%`;
}

export function promoChipHint(p: FoodPromoCode, formatPrice: (n: number) => string): string {
  const parts: string[] = [promoChipLabel(p)];
  if (p.min_order && p.min_order > 0) parts.push(`от ${formatPrice(p.min_order)}`);
  return parts.join(' · ');
}

/** What happens when user taps a food promo banner */
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
  button_text?: string;
  button_url?: string;
}

function parseBannerUrl(url: string): FoodBannerAction | null {
  const raw = url.trim();
  if (!raw) return null;

  if (!raw.startsWith('/food')) {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return { type: 'link', url: raw };
    }
    return null;
  }

  const hash = raw.includes('#') ? raw.split('#')[1] : '';
  if (!hash) return null;

  const params = new URLSearchParams(hash.replace(/^\?/, ''));
  const promo = (params.get('promo') || params.get('code') || '').trim().toUpperCase();
  const category = (params.get('category') || params.get('cat') || '').trim().toLowerCase();

  if (hash === 'popular' || params.get('section') === 'popular') {
    return { type: 'popular' };
  }
  if (hash === 'gifts' || params.get('section') === 'gifts') {
    return { type: 'gifts' };
  }
  if (promo) {
    return { type: 'promo', code: promo, categorySlug: category || undefined };
  }
  if (category) {
    return { type: 'category', slug: category };
  }
  return null;
}

/** Map banner content → scroll category / apply promo / open section */
export function resolveFoodBannerAction(banner: FoodBannerLike): FoodBannerAction {
  const fromUrl = parseBannerUrl(banner.button_url || '');
  if (fromUrl) return fromUrl;

  const text = `${banner.title || ''} ${banner.subtitle || ''} ${banner.button_text || ''}`.toLowerCase();

  if (/semya20|семейн/.test(text)) {
    return { type: 'promo', code: 'SEMYA20', categorySlug: 'sety-na-kompaniyu' };
  }
  if (/obed15|комплексн.*обед|обед.*−15/.test(text)) {
    return { type: 'promo', code: 'OBED15', categorySlug: 'kompleksnye-obedy' };
  }
  if (/damalem10|−10\s*%|скидка.*10/.test(text)) {
    return { type: 'promo', code: 'DAMALEM10' };
  }
  if (/pizza500|пицц.*500|пицц.*выгод/.test(text)) {
    return { type: 'promo', code: 'PIZZA500', categorySlug: 'pizza-30' };
  }
  if (/донер|шашлык|хит/.test(text)) {
    return { type: 'popular' };
  }
  if (/подарок|подарки|коктейл.*фри/.test(text)) {
    return { type: 'gifts' };
  }
  if (/обед/.test(text)) {
    return { type: 'category', slug: 'kompleksnye-obedy' };
  }
  if (/сет|набор/.test(text)) {
    return { type: 'category', slug: 'sety-na-kompaniyu' };
  }
  if (/пицц/.test(text)) {
    return { type: 'category', slug: 'pizza-30' };
  }

  return { type: 'menu' };
}

export function foodBannerCtaLabel(action: FoodBannerAction, buttonText?: string): string {
  const custom = buttonText?.trim();
  switch (action.type) {
    case 'promo':
      return custom || `Применить ${action.code}`;
    case 'category':
      return custom || 'Смотреть меню';
    case 'popular':
      return custom || 'Хиты меню';
    case 'gifts':
      return custom || 'Подарки';
    case 'menu':
      return custom || 'В меню';
    case 'link':
      return custom || 'Подробнее';
  }
}
