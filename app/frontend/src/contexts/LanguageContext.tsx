import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import translations, { Lang } from '@/i18n/translations';

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  /** Get localized field from a DB entity: picks name_ru or name_kz etc. */
  localized: (obj: Record<string, any>, field: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

function detectLanguage(): Lang {
  // 1. Check localStorage
  const stored = localStorage.getItem('app_lang');
  if (stored === 'ru' || stored === 'kz') return stored;

  // 2. Check browser language
  const browserLang = navigator.language || (navigator as any).userLanguage || '';
  if (browserLang.startsWith('kk') || browserLang.startsWith('kz')) return 'kz';

  // 3. Default to Russian
  return 'ru';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLanguage);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('app_lang', newLang);
    document.documentElement.lang = newLang === 'kz' ? 'kk' : 'ru';
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'kz' ? 'kk' : 'ru';
  }, [lang]);

  const t = useCallback((key: string): string => {
    const entry = translations[key];
    if (!entry) {
      console.warn(`[i18n] Missing translation key: "${key}"`);
      return key;
    }
    return entry[lang] || entry.ru || key;
  }, [lang]);

  /** Get localized field from DB entity. E.g. localized(item, 'name') returns item.name_kz or item.name_ru */
  const localized = useCallback((obj: Record<string, any>, field: string): string => {
    if (!obj) return '';
    const localizedField = `${field}_${lang}`;
    const fallbackField = `${field}_ru`;
    // Try localized field first, then fallback to _ru, then plain field
    return obj[localizedField] || obj[fallbackField] || obj[field] || '';
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, localized }}>
      <div className="transition-opacity duration-200">
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export default LanguageContext;