interface NavItem {
  slug: string;
  label: string;
  icon?: string;
}

interface DamAlemCategoryNavProps {
  items: NavItem[];
  activeSlug: string;
  onSelect: (slug: string) => void;
  allLabel: string;
}

export default function DamAlemCategoryNav({ items, activeSlug, onSelect, allLabel }: DamAlemCategoryNavProps) {
  const pills: NavItem[] = [{ slug: 'all', label: allLabel }, ...items];

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-gray-100/80 bg-[#F5F5F5]/95 px-4 py-3 backdrop-blur-md">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {pills.map(p => {
          const active = activeSlug === p.slug;
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => onSelect(p.slug)}
              className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold transition-all ${
                active
                  ? 'bg-[#111111] text-white shadow-md'
                  : 'bg-white text-[#555555] ring-1 ring-gray-200 hover:ring-gray-300'
              }`}
            >
              {p.icon && !active ? <span className="mr-1">{p.icon}</span> : null}
              {p.label.replace(/^[\p{Emoji}\s]+/u, '').trim() || p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
