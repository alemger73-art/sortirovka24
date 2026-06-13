import { ChevronRight, LayoutGrid } from 'lucide-react';

export interface CatalogCategoryItem {
  id: number;
  name: string;
  is_alcohol?: boolean;
}

interface Props {
  categories: CatalogCategoryItem[];
  selectedId: number | null;
  onSelectAll: () => void;
  onSelectCategory: (id: number, isAlcohol: boolean) => void;
}

export default function CatalogCategoryStrip({
  categories,
  selectedId,
  onSelectAll,
  onSelectCategory,
}: Props) {
  return (
    <div className="lg:hidden space-y-2.5">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <LayoutGrid className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-tight">Каталог</p>
            <p className="text-[11px] text-emerald-700/90 leading-tight">Листайте категории влево →</p>
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
              selectedId === null
                ? 'bg-emerald-600 text-white border-2 border-emerald-600 shadow-md shadow-emerald-600/25 scale-[1.02]'
                : 'bg-white text-emerald-800 border-2 border-emerald-200 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/80'
            }`}
          >
            Все
          </button>
          {categories.map((cat) => {
            const active = selectedId === cat.id;
            const alcohol = !!cat.is_alcohol;
            return (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectCategory(cat.id, alcohol)}
                className={`shrink-0 snap-start max-w-[min(72vw,16rem)] px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all touch-manipulation whitespace-nowrap ${
                  active
                    ? alcohol
                      ? 'bg-amber-600 text-white border-2 border-amber-600 shadow-md shadow-amber-600/25 scale-[1.02]'
                      : 'bg-emerald-600 text-white border-2 border-emerald-600 shadow-md shadow-emerald-600/25 scale-[1.02]'
                    : alcohol
                      ? 'bg-amber-50 text-amber-900 border-2 border-amber-200 shadow-sm hover:border-amber-300'
                      : 'bg-white text-emerald-800 border-2 border-emerald-200 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/80'
                }`}
              >
                {cat.name}
                {alcohol ? ' 21+' : ''}
              </button>
            );
          })}
          <span
            className="shrink-0 snap-start flex items-center pl-1 pr-3 text-emerald-600/50"
            aria-hidden
          >
            <ChevronRight className="h-5 w-5" />
          </span>
        </div>
      </div>
    </div>
  );
}
