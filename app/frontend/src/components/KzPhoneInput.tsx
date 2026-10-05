import type { InputHTMLAttributes } from 'react';
import { kzNationalDigits } from '@/lib/kzPhone';
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & { value: string; onChange: (value: string) => void };
export default function KzPhoneInput({ value, onChange, className, ...props }: Props) {
  return <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-500 dark:border-gray-700 dark:bg-gray-950">
    <span className="pl-4 font-medium text-gray-900 dark:text-white" aria-hidden="true">+7</span>
    <input {...props} type="tel" inputMode="tel" autoComplete="tel-national" maxLength={24} value={kzNationalDigits(value)} onChange={event => onChange('+7' + kzNationalDigits(event.target.value))} placeholder="700 123 45 67" className={'min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-gray-900 outline-none dark:text-white ' + (className || '')} />
  </div>;
}
