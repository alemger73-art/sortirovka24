import { Globe, Moon, Sun } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';

/** The same preferences are used by the portal, customer cabinet and partner panels. */
export default function AppearanceControls() {
  const { lang, setLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const themeLabel = t(theme === 'dark' ? 'theme.light' : 'theme.dark');
  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <button type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-foreground transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <button type="button" onClick={() => setLang(lang === 'ru' ? 'kz' : 'ru')}
        aria-label={t('lang.switch')} title={t(lang === 'ru' ? 'lang.kz' : 'lang.ru')}
        className="flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Globe className="h-4 w-4" />{lang === 'ru' ? 'KZ' : 'RU'}
      </button>
    </div>
  );
}
