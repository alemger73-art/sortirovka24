import { getCategoryImage } from '@/lib/damAlemImages';
import { parseLoyaltyGifts, type LoyaltyGift } from '@/lib/gastronomLoyalty';
import type { FoodPromoCode } from '@/lib/foodPromo';
import { parsePromoCodes } from '@/lib/foodPromo';

export const DEFAULT_PROMO_CODES: FoodPromoCode[] = [
  { code: 'DAMALEM10', type: 'percent', value: 10, min_order: 2500, max_discount: 1500, active: true, label: '−10% другу / себе' },
  { code: 'ALEM500', type: 'fixed', value: 500, min_order: 3000, active: true, label: '−500 ₸ на заказ' },
  { code: 'PIZZA500', type: 'fixed', value: 500, min_order: 3500, active: true, label: '−500 ₸ на заказ' },
  { code: 'OBED15', type: 'percent', value: 15, min_order: 4000, max_discount: 1200, active: true, label: '−15% на обед' },
  { code: 'DOSTAVKA', type: 'free_delivery', value: 0, min_order: 8000, active: true, label: 'Бесплатная доставка' },
  { code: 'SEMYA20', type: 'percent', value: 20, min_order: 12000, max_discount: 3000, active: true, label: '−20% семейный заказ' },
  { code: 'WEEKEND', type: 'percent', value: 12, min_order: 5000, max_discount: 2000, active: true, label: '−12% выходные' },
];

export const REFERRAL_SHARE_MESSAGE =
  'Привет! Заказываю в DAM ALEM 2.0 — доставка по Сортировке.\nПромокод DAMALEM10 — скидка 10% на заказ от 2 500 ₸';

export function resolvePromoCodes(raw?: string): FoodPromoCode[] {
  const parsed = parsePromoCodes(raw);
  return parsed;
}

export const DEFAULT_LOYALTY_GIFTS: LoyaltyGift[] = [
  {
    id: 'dam-gift-fries',
    min_amount: 5000,
    title: 'Картофель фри 150 г',
    description: 'Выберите один подарок бесплатно',
    image_url: getCategoryImage('kombo-fastfud'),
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'dam-gift-lemonade',
    min_amount: 5000,
    title: 'Лимонад 0.5 л',
    description: 'Выберите один подарок бесплатно',
    image_url: getCategoryImage('napitki'),
    is_active: true,
    sort_order: 2,
  },
  {
    id: 'dam-gift-sauce',
    min_amount: 5000,
    title: 'Соус на выбор',
    description: 'Выберите один подарок бесплатно',
    image_url: getCategoryImage('burgery'),
    is_active: true,
    sort_order: 3,
  },
  {
    id: 'dam-gift-dessert',
    min_amount: 10000,
    title: 'Десерт дня',
    description: 'Следующий уровень — десерт бесплатно',
    image_url: getCategoryImage('kombo-fastfud'),
    is_active: true,
    sort_order: 4,
  },
];

export function resolveLoyaltyGifts(raw?: string, enabled = true): LoyaltyGift[] {
  if (!enabled) return [];
  const parsed = parseLoyaltyGifts(raw);
  return parsed;
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
    lines: ['UFO-бургеры, пицца и комбо — горячими к подъезду'],
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
      title: 'Хиты DAM ALEM 2.0',
      subtitle: 'UFO-бургеры, пицца и напитки — всё в одном приложении',
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

export { foodBannerCtaLabel, resolveFoodBannerAction, type FoodBannerAction, type FoodBannerLike } from './foodBannerActions';
