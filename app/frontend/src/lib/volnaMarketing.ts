import { getCategoryImage } from '@/lib/damAlemImages';

export const VOLNA_FOOD_PROMO_CODE = 'DAMALEM10';

export interface VolnaCrossPromo {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
  image: string;
  badge?: string;
}

export function buildVolnaCrossPromos(): VolnaCrossPromo[] {
  return [
    {
      id: 'dam-alem-snacks',
      title: 'Закуски к напиткам',
      subtitle: 'Шашлык, пицца и горячие блюда — закажите в DAM ALEM 2.0 с доставкой по Сортировке',
      cta: 'Открыть DAM ALEM 2.0',
      href: '/food',
      image: getCategoryImage('shashlyki'),
      badge: 'Партнёр',
    },
    {
      id: 'dam-alem-party',
      title: 'Компания собралась?',
      subtitle: 'Добавьте еду из DAM ALEM 2.0 — промокод DAMALEM10 даёт −10% от 2 500 ₸',
      cta: 'Заказать еду',
      href: '/food?promo=DAMALEM10',
      image: getCategoryImage('pizza-30'),
      badge: '−10%',
    },
    {
      id: 'dam-alem-combo',
      title: 'Вино + ужин',
      subtitle: 'После алкоголя из VOLNA — доставим горячий ужин из DAM ALEM 2.0 за 30–60 мин',
      cta: 'Смотреть меню',
      href: '/food',
      image: getCategoryImage('kompleksnye-obedy'),
    },
  ];
}
