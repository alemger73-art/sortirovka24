import { Link } from 'react-router-dom';
import { Shield, AlertTriangle, Phone, Ban, HeartHandshake } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { SAFETY_AWARENESS_CARD_KEYS } from '@/lib/safetyTips';

const CARD_ICONS = {
  scam: Shield,
  drugs: Ban,
  online: AlertTriangle,
  emergency: Phone,
  report: HeartHandshake,
} as const;

const CARD_COLORS = {
  scam: 'from-blue-500 to-indigo-600',
  drugs: 'from-rose-500 to-red-600',
  online: 'from-amber-500 to-orange-600',
  emergency: 'from-red-500 to-rose-600',
  report: 'from-emerald-500 to-teal-600',
} as const;

export default function SafetyAwarenessCards() {
  const { t } = useLanguage();

  return (
    <section id="safety-tips" className="scroll-mt-20 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{t('safety.cards.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('safety.cards.subtitle')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {SAFETY_AWARENESS_CARD_KEYS.map((key) => {
            const Icon = CARD_ICONS[key];
            return (
              <article
                key={key}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-950"
              >
                <div className={`flex items-center gap-2 bg-gradient-to-r px-4 py-2.5 ${CARD_COLORS[key]}`}>
                  <Icon className="h-4 w-4 text-white" aria-hidden />
                  <h3 className="text-sm font-bold text-white">{t(`safety.cards.${key}.title`)}</h3>
                </div>
                <p className="px-4 py-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {t(`safety.cards.${key}.text`)}
                </p>
              </article>
            );
          })}
        </div>

        <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
          {t('safety.cards.footer')}{' '}
          <Link to="/complaints/new" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            {t('safety.cards.complaintLink')}
          </Link>
        </p>
      </div>
    </section>
  );
}
