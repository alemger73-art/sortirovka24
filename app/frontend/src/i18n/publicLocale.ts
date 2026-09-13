import type { Lang } from './translations';

/** Safe outside React too: legacy formatters use the same saved preference as useLanguage. */
export function getPublicLanguage(): Lang {
  try {
    const stored = localStorage.getItem('app_lang');
    if (stored === 'kz' || stored === 'ru') return stored;
  } catch { /* Storage can be unavailable in private or embedded browsers. */ }
  const documentLanguage = typeof document === 'undefined' ? '' : document.documentElement.lang;
  if (/^(kk|kz)/i.test(documentLanguage)) return 'kz';
  if (/^ru/i.test(documentLanguage)) return 'ru';
  const browser = typeof navigator === 'undefined' ? '' : navigator.language;
  return /^(kk|kz)/i.test(browser) ? 'kz' : 'ru';
}

export function getPublicLocale(lang: Lang = getPublicLanguage()): 'kk-KZ' | 'ru-RU' {
  return lang === 'kz' ? 'kk-KZ' : 'ru-RU';
}

export function formatPublicText(t: (key: string) => string, key: string, values: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (token, name: string) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
}
