import { Link } from 'react-router-dom';
import { Shield, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafetyTipBar } from '@/hooks/useSafetyTip';

export default function SafetyTipBar() {
  const { t } = useLanguage();
  const { visible, tipKey, dismiss } = useSafetyTipBar();

  if (!visible) return null;

  return (
    <div
      className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50 dark:border-indigo-900/50 dark:from-indigo-950/80 dark:to-blue-950/80"
      role="note"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2.5 sm:items-center">
        <Shield className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400 sm:mt-0" aria-hidden />
        <p className="min-w-0 flex-1 text-xs leading-snug text-indigo-900 dark:text-indigo-100 sm:text-sm">
          {t(tipKey)}
          <Link
            to="/inspectors#safety-tips"
            className="ml-1.5 font-medium text-indigo-700 underline-offset-2 hover:underline dark:text-indigo-300"
          >
            {t('safety.bar.more')}
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-indigo-400 transition-colors hover:bg-indigo-100 hover:text-indigo-700 dark:hover:bg-indigo-900/50 dark:hover:text-indigo-200"
          aria-label={t('safety.bar.dismiss')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
