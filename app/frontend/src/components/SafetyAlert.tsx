import { Shield } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { SafetyAlertVariant } from '@/lib/safetyTips';

export default function SafetyAlert({ variant }: { variant: SafetyAlertVariant }) {
  const { t } = useLanguage();

  return (
    <div
      className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900/60 dark:bg-indigo-950/40"
      role="note"
    >
      <Shield className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" aria-hidden />
      <p className="text-sm leading-relaxed text-indigo-900 dark:text-indigo-100">
        {t(`safety.alert.${variant}`)}
      </p>
    </div>
  );
}
