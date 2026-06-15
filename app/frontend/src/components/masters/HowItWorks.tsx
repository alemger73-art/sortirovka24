import { Search, Phone, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function HowItWorks() {
  const { t } = useLanguage();
  const steps = [
    { icon: Search, titleKey: 'masters.step1Title', descKey: 'masters.step1Desc', color: 'from-indigo-500 to-purple-600' },
    { icon: Phone, titleKey: 'masters.step2Title', descKey: 'masters.step2Desc', color: 'from-blue-500 to-cyan-600' },
    { icon: CheckCircle2, titleKey: 'masters.step3Title', descKey: 'masters.step3Desc', color: 'from-emerald-500 to-green-600' },
  ];

  return (
    <section className="mb-12">
      <h2 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">{t('masters.howItWorks')}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{t('masters.howItWorksDesc')}</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((step, i) => (
          <div
            key={step.titleKey}
            className="relative overflow-hidden rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 shadow-sm hover:shadow-lg transition-shadow"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${step.color} opacity-10 rounded-bl-[4rem]`} />
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-white shadow-lg`}>
                <step.icon className="w-5 h-5" />
              </div>
              <span className="text-2xl font-black text-gray-200 dark:text-gray-700">{i + 1}</span>
            </div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-1">{t(step.titleKey)}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{t(step.descKey)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
