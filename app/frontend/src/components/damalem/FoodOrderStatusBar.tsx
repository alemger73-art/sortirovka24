import { useLanguage } from '@/contexts/LanguageContext';
import { CheckCircle2, Circle, Clock3 } from 'lucide-react';

export default function FoodOrderStatusBar({status, compact = false, deliveryMethod}: {status: string; compact?: boolean; deliveryMethod?: string}) {
  const {t} = useLanguage();
  if (status === 'cancelled') return <p className="text-sm text-red-600 dark:text-red-300">{t('cabinet.orderStatus.cancelled')}</p>;
  const stages = ['new', 'confirmed', 'preparing', 'ready', ...(deliveryMethod === 'pickup' || deliveryMethod === 'dine_in' ? [] : ['in_progress']), 'done'];
  const labels: Record<string,string> = {new:t('workflow.new'), confirmed:t('workflow.accepted'), preparing:t('workflow.preparing'), ready:t('workflow.ready'), in_progress:t('workflow.transit'), done:t((deliveryMethod === 'pickup' || deliveryMethod === 'dine_in') ? 'cabinet.orderStatus.done' : 'workflow.done')};
  const current = Math.max(0, stages.indexOf(['delivered','completed'].includes(status) ? 'done' : status));
  if (compact) return <p className="text-xs text-muted-foreground">{labels[stages[current]]}</p>;
  return <ol aria-live="polite" className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">{stages.map((stage,i) => <li key={stage} aria-current={i === current ? 'step' : undefined} className={`flex items-start gap-2 rounded-xl p-3 text-xs ${i === current ? 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200 font-bold' : i < current ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}>{i < current ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : i === current ? <Clock3 className="h-4 w-4 shrink-0" /> : <Circle className="h-4 w-4 shrink-0" />}<span>{labels[stage]}</span></li>)}</ol>;
}
