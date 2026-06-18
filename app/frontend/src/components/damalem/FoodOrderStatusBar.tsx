import { CheckCircle2, Circle } from 'lucide-react';

const STEPS = [
  { key: 'new', label: 'Принят' },
  { key: 'in_progress', label: 'Готовится' },
  { key: 'ready', label: 'Готов' },
  { key: 'done', label: 'Доставлен' },
] as const;

function stepIndex(status: string): number {
  if (status === 'cancelled') return -1;
  if (status === 'done' || status === 'delivered' || status === 'completed') return 3;
  if (status === 'ready') return 2;
  if (status === 'in_progress' || status === 'cooking') return 1;
  return 0;
}

interface Props {
  status: string;
  compact?: boolean;
}

export default function FoodOrderStatusBar({ status, compact = false }: Props) {
  if (status === 'cancelled') {
    return <p className="text-xs text-red-400 font-medium">Заказ отменён</p>;
  }

  const current = stepIndex(status);

  if (compact) {
    const label = STEPS[Math.min(current, STEPS.length - 1)]?.label ?? 'Принят';
    return <p className="text-[11px] text-gray-400">{label}</p>;
  }

  return (
    <div className="flex items-center gap-1 mt-2">
      {STEPS.map((step, idx) => {
        const done = idx <= current;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1 min-w-0">
            {done ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-orange-400" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-gray-600" />
            )}
            <span className={`text-[10px] truncate ${done ? 'text-orange-300 font-medium' : 'text-gray-500'}`}>
              {step.label}
            </span>
            {idx < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-0.5 ${idx < current ? 'bg-orange-400/50' : 'bg-gray-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
