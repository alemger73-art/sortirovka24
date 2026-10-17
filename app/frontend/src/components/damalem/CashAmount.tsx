import { Input } from '@/components/ui/input';
import { useId } from 'react';
import '@/styles/cashAmount.css';

export default function CashAmount({ total, value, onChange }: {total: number; value: string; onChange: (value: string) => void}) {
  const feedbackId = useId();
  const nextAmount = Math.ceil(total / 5000) * 5000;
  const choices = ['', ...Array.from(new Set([nextAmount, nextAmount + 5000, nextAmount + 10000, 20000, 30000, 50000, 100000])).filter(amount => amount >= total && amount > 0).sort((a, b) => a - b).slice(0, 3).map(String)];
  const given = value === '' ? total : Number(value);
  return <fieldset className="dam-cash-amount space-y-3 rounded-xl border p-3">
    <legend className="px-1 font-semibold">С какой суммы подготовить сдачу?</legend>
    <div className="flex flex-wrap gap-2">{choices.map(v => <button key={v} type="button"
      aria-pressed={value === v} disabled={v !== '' && Number(v) < total}
      className="dam-cash-choice min-h-11 rounded-lg border px-3"
      onClick={() => onChange(v)}>{v ? `${Number(v).toLocaleString('ru-RU')} ₸` : 'Без сдачи'}</button>)}</div>
    <label className="block text-sm">Другая сумма, ₸<Input type="number" inputMode="decimal" min={total} max={100000000}
      className="dam-cash-input" aria-invalid={given < total || !Number.isFinite(given)} aria-describedby={feedbackId}
      value={value} placeholder="Без сдачи" onChange={e => onChange(e.target.value)} /></label>
    {given < total || !Number.isFinite(given) ? <p id={feedbackId} role="alert" className="dam-cash-error text-sm">Сумма должна быть не меньше стоимости заказа</p>
      : <p id={feedbackId} aria-live="polite" className="font-medium">Сдача: {(given-total).toLocaleString('ru-RU')} ₸</p>}
  </fieldset>;
}
