import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

type AppLogoProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
};

const sizes = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
};

/** Brand mark: blue pin with "24" — matches launcher icon. */
export default function AppLogo({ className, size = 'md', showText = false }: AppLogoProps) {
  const { t: publicT } = useLanguage();
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src="/icon-192.png"
        alt="Sortirovka24"
        className={cn('rounded-2xl shadow-sm object-cover', sizes[size])}
      />
      {showText && (
        <div className="leading-tight">
          <p className="text-base font-bold text-gray-900 dark:text-white">Сортировка 24</p>
          <p className="text-xs text-gray-500 dark:text-white/60">{publicT("header.portalDesc")}</p>
        </div>
      )}
    </div>
  );
}
