import { ChevronRight, LayoutGrid } from 'lucide-react';

export interface PharmacyCategoryItem {
  id: number;
  name: string;
  is_rx?: boolean;
}

interface Props {
  categories: PharmacyCategoryItem[];
  selectedId: number | null;
  onSelectAll: () => void;
  onSelectCategory: (id: number) => void;
  accent?: 'teal' | 'rose';
  title?: string;
}

export default function PharmacyCategoryStrip({
  categories,
  selectedId,
  onSelectAll,
  onSelectCategory,
  accent = 'teal',
  title = 'Каталог',
}: Props) {
  const rose = accent === 'rose';
  const iconWrap = rose ? 'bg-red-100 text-[#C41E14]' : 'bg-teal-100 text-teal-700';
  const hint = rose ? 'text-[#C41E14]/90' : 'text-teal-700/90';
  const activeBtn = rose
    ? 'bg-[#FF3B30] text-white border-2 border-[#FF3B30] shadow-md shadow-[#FF3B30]/25 scale-[1.02]'
    : 'bg-teal-600 text-white border-2 border-teal-600 shadow-md shadow-teal-600/25 scale-[1.02]';
  const idleBtn = rose
    ? 'bg-white text-[#C41E14] border-2 border-red-200 shadow-sm hover:border-red-300 hover:bg-red-50/80'
    : 'bg-white text-teal-800 border-2 border-teal-200 shadow-sm hover:border-teal-300 hover:bg-teal-50/80';
  const chevron = rose ? 'text-[#FF3B30]/50' : 'text-teal-600/50';

  return (
    <div className="lg:hidden space-y-2.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
            <LayoutGrid className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight">{title}</p>
            <p className={`text-[11px] leading-tight ${hint}`}>Листайте категории влево →</p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400 pb-0.5">
          Свайп
        </span>
      </div>

      <div className="relative -mx-1">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-gray-50 via-gray-50/80 to-transparent"
          aria-hidden
        />
        <div
          className="flex gap-2.5 overflow-x-auto pb-1 pt-0.5 px-0.5 snap-x snap-mandatory scroll-smooth touch-pan-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Категории каталога"
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedId === null}
            onClick={onSelectAll}
            className={`shrink-0 snap-start px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all touch-manipulation ${
              selectedId === null ? activeBtn : idleBtn
            }`}
          >
            Все
          </button>
          {categories.map((cat) => {
            const active = selectedId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectCategory(cat.id)}
                className={`shrink-0 snap-start max-w-[min(72vw,16rem)] px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all touch-manipulation whitespace-nowrap ${
                  active ? activeBtn : idleBtn
                }`}
              >
                {cat.name}
                {cat.is_rx ? ' Rx' : ''}
              </button>
            );
          })}
          <span
            className={`shrink-0 snap-start flex items-center pl-1 pr-3 ${chevron}`}
            aria-hidden
          >
            <ChevronRight className="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>
  );
}
