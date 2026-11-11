import { useId, useState, type ReactNode } from 'react';
import { Gift, Minus, Plus } from 'lucide-react';
import { useStoreTranslations } from '@/i18n/storeTranslations';
import DamAlemImage from '@/components/damalem/DamAlemImage';

/** Building blocks of the one-screen cart + checkout. State lives in the page; these only draw it. */

/** «бонус / бонуса / бонусов» for a Russian template; Kazakh templates do not use it. */
export function ruBonusNoun(n: number): string {
  const tens = Math.abs(n) % 100, ones = tens % 10;
  if (ones === 1 && tens !== 11) return 'бонус';
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return 'бонуса';
  return 'бонусов';
}

export interface OrderLineView {
  key: string;
  name: string;
  image: string;
  modifiers?: string;
  quantity: number;
  linePrice: number;
}

export function OrderLines({ lines, formatPrice, onQty, onEdit }: {
  lines: OrderLineView[];
  formatPrice: (n: number) => string;
  onQty: (index: number, delta: number) => void;
  onEdit?: (index: number) => void;
}) {
  const st = useStoreTranslations();
  return <ul className="dam-os-lines">
    {lines.map((line, index) => <li key={line.key} className="dam-os-line" data-testid="dam-cart-line">
      <DamAlemImage src={line.image} alt="" className="dam-os-line__img" width={160} />
      <span className="dam-os-line__text">
        {onEdit && line.modifiers
          ? <button type="button" className="dam-os-line__name" onClick={() => onEdit(index)}>{line.name}</button>
          : <span className="dam-os-line__name">{line.name}</span>}
        {line.modifiers ? <small>{line.modifiers}</small> : null}
        <strong>{formatPrice(line.linePrice)}</strong>
      </span>
      <span className="dam-os-stepper">
        <button type="button" onClick={() => onQty(index, -1)} aria-label={st('Убрать одну порцию: {0}', [line.name])}><Minus className="h-5 w-5" aria-hidden="true" /></button>
        <strong aria-live="polite">{line.quantity}</strong>
        <button type="button" onClick={() => onQty(index, 1)} aria-label={st('Добавить ещё порцию: {0}', [line.name])} data-testid="dam-cart-qty-plus"><Plus className="h-5 w-5" aria-hidden="true" /></button>
      </span>
    </li>)}
  </ul>;
}

/** The free gift: chosen automatically once the threshold is reached (tap to change), or how much is left. */
export function GiftRow({ chosen, choiceCount, left, progress, formatPrice, onChange, onBrowse }: {
  chosen: string | null;
  choiceCount: number;
  left: number;
  progress: number;
  formatPrice: (n: number) => string;
  onChange: () => void;
  onBrowse: () => void;
}) {
  const st = useStoreTranslations();
  if (chosen) {
    return <button type="button" className="dam-os-gift" onClick={onChange} disabled={choiceCount < 2} data-testid="dam-gift">
      <Gift className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="flex-1">{st('Ваш подарок: {0}', [chosen])}</span>
      {choiceCount > 1 ? <span className="dam-os-gift__change">{st('Сменить')}</span> : null}
    </button>;
  }
  if (left <= 0) return null;
  return <div className="dam-os-gift dam-os-gift--todo" data-testid="dam-gift">
    <span>{st('Добавьте ещё на {0} — получите подарок', [formatPrice(left)])}</span>
    <span className="dam-os-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
    <button type="button" className="dam-os-link" onClick={onBrowse}>{st('Добавить из меню')}</button>
  </div>;
}

/** Two or three mutually exclusive choices, drawn as one pill. */
export function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return <div role="group" aria-label={label} className="dam-os-segmented" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map(option => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}
  </div>;
}

export function Field({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: ReactNode }) {
  const id = useId();
  return <div className="dam-os-field">
    <label htmlFor={id}>{label}</label>
    {children(id)}
    {hint}
  </div>;
}

/** A secondary part of the form, closed until asked for. */
export function Disclosure({ label, defaultOpen = false, children, testId }: { label: string; defaultOpen?: boolean; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className="dam-os-disclosure">
    <button type="button" className="dam-os-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} data-testid={testId}>{label}</button>
    {open ? <div id={id}>{children}</div> : null}
  </div>;
}

export function BonusToggle({ points, discount, on, maxPercent, formatPrice, onToggle }: {
  points: number;
  discount: number;
  on: boolean;
  maxPercent: number;
  formatPrice: (n: number) => string;
  onToggle: (on: boolean) => void;
}) {
  const st = useStoreTranslations();
  const amount = Math.floor(points);
  return <button type="button" role="switch" aria-checked={on} className="dam-os-card dam-os-bonus" onClick={() => onToggle(!on)} data-testid="dam-bonus-toggle">
    <span className="dam-os-coin" aria-hidden="true">Б</span>
    <span className="flex-1">
      <strong>{st('Списать {0} {1}', [amount.toLocaleString('ru-RU'), ruBonusNoun(amount)])}</strong>
      <small>−{formatPrice(discount)} · {st('до {0}% заказа', [maxPercent])}</small>
    </span>
    <span className="dam-os-switch" aria-hidden="true"><span /></span>
  </button>;
}

export interface SummaryRow { label: string; value: string; discount?: boolean }

export function SummaryRows({ rows }: { rows: SummaryRow[] }) {
  return <dl className="dam-os-summary" data-testid="dam-order-summary">
    {rows.map(row => <div key={row.label}><dt>{row.label}</dt><dd className={row.discount ? 'is-discount' : ''}>{row.value}</dd></div>)}
  </dl>;
}
