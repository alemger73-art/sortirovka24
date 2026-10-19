import { foodOrderStatusKey } from '@/lib/foodOrderStatus';
import { useLanguage } from '@/contexts/LanguageContext';
import { CheckCircle2, Clock3 } from 'lucide-react';

/** Order progress: a segmented bar, the current step in words and what comes next.
 *  Fits any width (the old 2-column grid broke words letter by letter on phones). */
export default function FoodOrderStatusBar({status, compact = false, deliveryMethod}: {status: string; compact?: boolean; deliveryMethod?: string}) {
  const {t, lang} = useLanguage();
  if (status === 'cancelled') return <p className="text-sm text-red-600 dark:text-red-300">{t('cabinet.orderStatus.cancelled')}</p>;
  const stages = ['new', 'confirmed', 'preparing', 'ready', ...(deliveryMethod === 'pickup' || deliveryMethod === 'dine_in' ? [] : ['in_progress']), 'done'];
  const labels = Object.fromEntries(stages.map(stage => [stage, t(foodOrderStatusKey(stage, deliveryMethod))]));
  const current = Math.max(0, stages.indexOf(['delivered','completed'].includes(status) ? 'done' : status));
  if (compact) return <p className="text-xs text-muted-foreground">{labels[stages[current]]}</p>;
  const finished = current === stages.length - 1;
  const next = finished ? '' : labels[stages[current + 1]];
  return <div aria-live="polite" className="mt-3 space-y-2">
    <div className="flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={stages.length} aria-valuenow={current + 1} aria-valuetext={labels[stages[current]]}>
      {stages.map((stage, i) => <span key={stage} className={`h-1.5 flex-1 rounded-full ${i < current || finished ? 'bg-emerald-500' : i === current ? 'bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'}`} />)}
    </div>
    <p className={`flex items-center gap-2 text-sm font-semibold ${finished ? 'text-emerald-700 dark:text-emerald-300' : 'text-orange-700 dark:text-orange-300'}`}>
      {finished ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Clock3 className="h-4 w-4 shrink-0" />}{labels[stages[current]]}
    </p>
    {next && <p className="text-xs text-muted-foreground">{lang === 'kz' ? 'Келесі' : 'Дальше'}: {next}</p>}
  </div>;
}
