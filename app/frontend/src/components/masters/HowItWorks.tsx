import { useState } from 'react';
import { Search, Phone, CheckCircle2, ChevronDown, HelpCircle } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function HowItWorks() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  const steps = [
    { icon: Search, titleKey: 'masters.step1Title', descKey: 'masters.step1Desc' },
    { icon: Phone, titleKey: 'masters.step2Title', descKey: 'masters.step2Desc' },
    { icon: CheckCircle2, titleKey: 'masters.step3Title', descKey: 'masters.step3Desc' },
  ];

  return (
    <section className="mb-8">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-indigo-800 dark:text-indigo-200">
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          {t('masters.howItWorks')}
        </span>
        <ChevronDown className={`w-4 h-4 text-indigo-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {steps.map((step, i) => (
            <div
              key={step.titleKey}
              className="rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                  {i + 1}
                </span>
                <step.icon className="w-4 h-4 text-indigo-500" />
              </div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-1">{t(step.titleKey)}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t(step.descKey)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
