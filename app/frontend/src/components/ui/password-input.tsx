import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';
import { useLanguage } from '@/contexts/LanguageContext';

export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  const [visible, setVisible] = useState(false);
  const { lang } = useLanguage();
  const label = lang === 'kz'
    ? (visible ? 'Құпиясөзді жасыру' : 'Құпиясөзді көрсету')
    : (visible ? 'Скрыть пароль' : 'Показать пароль');
  return <div className="relative">
    <Input {...props} type={visible ? 'text' : 'password'} className={`pr-12 ${props.className || ''}`} />
    <button type="button" disabled={props.disabled} aria-label={label} title={label}
      aria-pressed={visible} onClick={() => setVisible(value => !value)}
      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground focus-visible:outline focus-visible:outline-2">
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  </div>;
}
