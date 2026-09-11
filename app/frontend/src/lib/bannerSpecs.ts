/** Размеры баннеров — синхронизированы с CSS витрины (damAlem.css, Food.tsx, Index.tsx). */

export const DAM_ALEM_PROMO_BANNER_SPEC = {
  /** Горизонтальная карусель «Спецпредложения» на /food (.dam-promo-banner) */
  placement: 'Карусель «Спецпредложения» на странице /food',
  displayMobile: { width: 288, height: 280, label: '≈288×280 px' },
  displayDesktop: { width: 320, height: 290, label: '≈320×290 px' },
  aspectRatio: '4:3 (фото кадрируется под карточку)',
  recommended: { width: 1200, height: 900, label: '1200×900 px' },
  formats: 'JPG, PNG или WebP',
  maxSizeMb: 20,
  safeZone:
    'Еда — вверху или справа. Нижняя часть затемняется для текста и кнопки. Текст на само фото добавлять не нужно.',
} as const;

export const DAM_ALEM_HERO_BANNER_SPEC = {
  /** Шапка ресторана на /food (DamAlemHero) */
  placement: 'Фон шапки на /food (Настройки → фоновое изображение)',
  aspectRatio: '21:9 на широком экране, 16:10 на телефоне',
  displayHeight: '220–320 px по высоте, на всю ширину блока',
  recommended: { width: 1680, height: 720, label: '1680×720 px' },
  formats: 'JPG, PNG или WebP',
  maxSizeMb: 20,
  safeZone: 'Логотип и текст — слева; не размещайте важное по центру и справа.',
} as const;

export const SITE_PROMO_BANNER_SPEC = {
  /** Баннеры на главной (Index.tsx) */
  placement: 'Промо-блоки на главной странице',
  displayMobile: { width: 'на всю ширину', height: 176, label: 'высота 176 px' },
  displayDesktop: { width: '½ колонки', height: 208, label: 'высота 208 px' },
  aspectRatio: '≈2:1 (широкий горизонтальный)',
  recommended: { width: 1200, height: 600, label: '1200×600 px' },
  formats: 'JPG, PNG или WebP',
  maxSizeMb: 20,
  safeZone: 'Текст и кнопка — в нижней трети кадра.',
} as const;

export function damAlemPromoBannerSizeHint(short = false): string {
  const s = DAM_ALEM_PROMO_BANNER_SPEC;
  if (short) {
    return `${s.recommended.label}, ${s.aspectRatio}, ${s.formats}, до ${s.maxSizeMb} МБ`;
  }
  return [
    `Рекомендуемый файл: ${s.recommended.label} (${s.aspectRatio}).`,
    `На экране: ${s.displayMobile.label} (телефон) / ${s.displayDesktop.label} (планшет и ПК).`,
    `${s.formats}, до ${s.maxSizeMb} МБ.`,
    s.safeZone,
  ].join(' ');
}

export function damAlemHeroBannerSizeHint(short = false): string {
  const s = DAM_ALEM_HERO_BANNER_SPEC;
  if (short) {
    return `${s.recommended.label}, ${s.aspectRatio}, до ${s.maxSizeMb} МБ`;
  }
  return [
    `Рекомендуемый файл: ${s.recommended.label} (${s.aspectRatio}).`,
    `Высота на сайте: ${s.displayHeight}.`,
    `${s.formats}, до ${s.maxSizeMb} МБ.`,
    s.safeZone,
  ].join(' ');
}

export function sitePromoBannerSizeHint(short = false): string {
  const s = SITE_PROMO_BANNER_SPEC;
  if (short) {
    return `${s.recommended.label}, ${s.aspectRatio}, до ${s.maxSizeMb} МБ`;
  }
  return [
    `Рекомендуемый файл: ${s.recommended.label} (${s.aspectRatio}).`,
    `На экране: ${s.displayMobile.label} (моб.) / ${s.displayDesktop.label} (десктоп).`,
    `${s.formats}, до ${s.maxSizeMb} МБ.`,
    s.safeZone,
  ].join(' ');
}
