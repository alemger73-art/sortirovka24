import adminTranslations from '@/i18n/adminTranslations';
import type { Lang } from '@/i18n/translations';
import { getPublicLanguage } from '@/i18n/publicLocale';

/** Размеры баннеров — синхронизированы с CSS витрины (damAlem.css, Food.tsx, Index.tsx). */

export function getDamAlemPromoBannerSpec(lang: Lang = getPublicLanguage()) {
  const adminT = (key: string) => adminTranslations[key]?.[lang] || adminTranslations[key]?.ru || key;
  return {
  /** Горизонтальная карусель «Спецпредложения» на /food (.dam-promo-banner) */
  placement: adminT('admin.dam.final.217'),
  displayMobile: { width: 288, height: 280, label: '≈288×280 px' },
  displayDesktop: { width: 320, height: 290, label: '≈320×290 px' },
  aspectRatio: adminT('admin.dam.final.218'),
  recommended: { width: 1200, height: 900, label: '1200×900 px' },
  formats: adminT('admin.dam.final.219'),
  maxSizeMb: 20,
  safeZone:
    adminT('admin.dam.final.220'),
} as const;
}
export const DAM_ALEM_PROMO_BANNER_SPEC = getDamAlemPromoBannerSpec('ru');

export function getDamAlemHeroBannerSpec(lang: Lang = getPublicLanguage()) {
  const adminT = (key: string) => adminTranslations[key]?.[lang] || adminTranslations[key]?.ru || key;
  return {
  /** Шапка ресторана на /food (DamAlemHero) */
  placement: adminT('admin.dam.final.221'),
  aspectRatio: adminT('admin.dam.final.222'),
  displayHeight: adminT('admin.dam.final.223'),
  recommended: { width: 1680, height: 720, label: '1680×720 px' },
  formats: adminT('admin.dam.final.219'),
  maxSizeMb: 20,
  safeZone: adminT('admin.dam.final.224'),
} as const;
}
export const DAM_ALEM_HERO_BANNER_SPEC = getDamAlemHeroBannerSpec('ru');

export function getSitePromoBannerSpec(lang: Lang = getPublicLanguage()) {
  const adminT = (key: string) => adminTranslations[key]?.[lang] || adminTranslations[key]?.ru || key;
  return {
  /** Баннеры на главной (Index.tsx) */
  placement: adminT('admin.dam.final.225'),
  displayMobile: { width: adminT('admin.dam.final.226'), height: 176, label: adminT('admin.dam.final.227') },
  displayDesktop: { width: adminT('admin.dam.final.228'), height: 208, label: adminT('admin.dam.final.229') },
  aspectRatio: adminT('admin.dam.final.230'),
  recommended: { width: 1200, height: 600, label: '1200×600 px' },
  formats: adminT('admin.dam.final.219'),
  maxSizeMb: 20,
  safeZone: adminT('admin.dam.final.231'),
} as const;
}
export const SITE_PROMO_BANNER_SPEC = getSitePromoBannerSpec('ru');

export function damAlemPromoBannerSizeHint(short = false, lang: Lang = getPublicLanguage()): string {
  const adminT = (key: string) => adminTranslations[key]?.[lang] || adminTranslations[key]?.ru || key;

  const s = getDamAlemPromoBannerSpec(lang);
  if (short) {
    return adminT('admin.dam.final.232').replace('{0}', () => String(s.recommended.label)).replace('{1}', () => String(s.aspectRatio)).replace('{2}', () => String(s.formats)).replace('{3}', () => String(s.maxSizeMb));
  }
  return [
    adminT('admin.dam.final.233').replace('{0}', () => String(s.recommended.label)).replace('{1}', () => String(s.aspectRatio)),
    adminT('admin.dam.final.234').replace('{0}', () => String(s.displayMobile.label)).replace('{1}', () => String(s.displayDesktop.label)),
    adminT('admin.dam.final.235').replace('{0}', () => String(s.formats)).replace('{1}', () => String(s.maxSizeMb)),
    s.safeZone,
  ].join(' ');
}

export function damAlemHeroBannerSizeHint(short = false, lang: Lang = getPublicLanguage()): string {
  const adminT = (key: string) => adminTranslations[key]?.[lang] || adminTranslations[key]?.ru || key;

  const s = getDamAlemHeroBannerSpec(lang);
  if (short) {
    return adminT('admin.dam.final.236').replace('{0}', () => String(s.recommended.label)).replace('{1}', () => String(s.aspectRatio)).replace('{2}', () => String(s.maxSizeMb));
  }
  return [
    adminT('admin.dam.final.233').replace('{0}', () => String(s.recommended.label)).replace('{1}', () => String(s.aspectRatio)),
    adminT('admin.dam.final.237').replace('{0}', () => String(s.displayHeight)),
    adminT('admin.dam.final.235').replace('{0}', () => String(s.formats)).replace('{1}', () => String(s.maxSizeMb)),
    s.safeZone,
  ].join(' ');
}

export function sitePromoBannerSizeHint(short = false, lang: Lang = getPublicLanguage()): string {
  const adminT = (key: string) => adminTranslations[key]?.[lang] || adminTranslations[key]?.ru || key;

  const s = getSitePromoBannerSpec(lang);
  if (short) {
    return adminT('admin.dam.final.236').replace('{0}', () => String(s.recommended.label)).replace('{1}', () => String(s.aspectRatio)).replace('{2}', () => String(s.maxSizeMb));
  }
  return [
    adminT('admin.dam.final.233').replace('{0}', () => String(s.recommended.label)).replace('{1}', () => String(s.aspectRatio)),
    adminT('admin.dam.final.238').replace('{0}', () => String(s.displayMobile.label)).replace('{1}', () => String(s.displayDesktop.label)),
    adminT('admin.dam.final.235').replace('{0}', () => String(s.formats)).replace('{1}', () => String(s.maxSizeMb)),
    s.safeZone,
  ].join(' ');
}
