import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface Props {
  className?: string;
}

/** Always-visible escape hatch back to the Sortirovka24 portal home. */
export default function GastronomPortalBar({ className = '' }: Props) {
  return (
    <div className={`bg-slate-100/95 border-b border-slate-200/80 ${className}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 xl:px-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 py-2.5 text-sm text-slate-700 hover:text-blue-700 active:text-blue-800 transition-colors touch-manipulation min-h-[44px]"
          aria-label="Вернуться на главную Сортировка24"
        >
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="font-semibold">Сортировка24</span>
          <span className="text-slate-500 font-normal hidden sm:inline">— главная портала</span>
        </Link>
      </div>
    </div>
  );
}
