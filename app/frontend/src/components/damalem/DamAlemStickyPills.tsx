import { useEffect, useRef } from 'react';

export interface StickyPill {
  id: string;
  label: string;
}

interface Props {
  pills: StickyPill[];
  activeId: string;
  onSelect: (id: string) => void;
  searchOpen?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onToggleSearch?: () => void;
  searchPlaceholder?: string;
  cartCount?: number;
  onOpenCart?: () => void;
  id?: string;
}

/** Sticky category pills + optional search / cart for continuous menu feed */
export default function DamAlemStickyPills({
  pills,
  activeId,
  onSelect,
  searchOpen,
  searchValue = '',
  onSearchChange,
  onToggleSearch,
  searchPlaceholder = 'Поиск…',
  cartCount = 0,
  onOpenCart,
  id,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [activeId]);

  return (
    <div id={id} className="dam-sticky-pills">
      {searchOpen ? (
        <div className="flex items-center gap-2 px-1 pb-2">
          <input
            type="search"
            autoFocus
            value={searchValue}
            onChange={e => onSearchChange?.(e.target.value)}
            placeholder={searchPlaceholder}
            className="dam-search !h-11"
            aria-label={searchPlaceholder}
          />
          <button
            type="button"
            onClick={onToggleSearch}
            className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-600"
          >
            Готово
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div ref={scrollerRef} className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-hide py-0.5">
            {pills.map(p => {
              const active = activeId === p.id;
              return (
                <button
                  key={p.id}
                  ref={active ? activeRef : undefined}
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={`dam-category-pill ${active ? 'dam-category-pill--active' : 'dam-category-pill--idle'}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {onToggleSearch ? (
            <button
              type="button"
              onClick={onToggleSearch}
              className="dam-sticky-pills__icon-btn"
              aria-label="Поиск"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
              </svg>
            </button>
          ) : null}
          {onOpenCart ? (
            <button
              type="button"
              onClick={onOpenCart}
              className={`dam-sticky-pills__icon-btn relative ${cartCount > 0 ? 'dam-sticky-pills__icon-btn--accent' : ''}`}
              aria-label="Корзина"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l3-8H6.4M7 13L5.4 5M7 13l-2 9h14M10 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" />
              </svg>
              {cartCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold text-[#FF3B30]">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
