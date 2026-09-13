import { useStoreTranslations } from '@/i18n/storeTranslations';
import { CheckCircle2, Circle } from 'lucide-react';

const STEPS = [
  { key: 'new', label: 'Оформлен' },
  { key: 'in_progress', label: 'Готовится' },
  { key: 'ready', label: 'Готов' },
  { key: 'in_delivery', label: 'Доставка' },
  { key: 'done', label: 'Завершён' },
] as const;

function stepIndex(status: string): number {
  if (status === 'cancelled') return -1;
  if (status === 'done' || status === 'delivered' || status === 'completed') return 4;
  if (status === 'ready') return 2;
  if (status === 'in_progress') return 3;
  if (status === 'preparing' || status === 'cooking') return 1;
  if (status === 'confirmed') return 1;
  return 0;
}

interface Props {
  status: string;
  compact?: boolean;
  deliveryMethod?: string;
}

export default function FoodOrderStatusBar({ status, compact = false, deliveryMethod }: Props) {
  const st = useStoreTranslations();

  if (status === 'cancelled') {
    return <p className="text-xs text-red-400 font-medium">{st("Заказ отменён")}</p>;
  }

  const current = stepIndex(status);

  if (compact) {
    const label = STEPS[Math.min(current, STEPS.length - 1)]?.label ?? st("Принят");
    return <p className="text-[11px] text-gray-400">{st(label)}</p>;
  }

  return (
    <div className="flex items-center gap-1 mt-2">
      {STEPS.map((step, idx) => {
        if (deliveryMethod === 'pickup' && step.key === 'in_delivery') return null;
        const done = idx <= current;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1 min-w-0">
            {done ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-gray-600" />
            )}
            <span className={`text-[10px] truncate ${done ? 'text-orange-600 font-semibold dark:text-orange-300' : 'text-gray-400 dark:text-gray-500'}`}>
              {st(step.label)}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-0.5 ${idx < current ? 'bg-orange-400/60 dark:bg-orange-400/50' : 'bg-gray-200 dark:bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
