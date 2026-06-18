interface NavItem {
  slug: string;
  label: string;
  icon?: string;
  id?: number;
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
    <div className="flex gap-2 overflow-x-auto scrollbar-hide py-0.5">
      {pills.map((p, idx) => {
        const active = activeSlug === p.slug;
        const key = p.slug === 'all' ? 'all' : `cat-${p.id ?? idx}-${p.slug}`;
        const label = p.label.replace(/^[\p{Emoji}\s]+/u, '').trim() || p.label;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(p.slug)}
            className={`dam-category-pill ${active ? 'dam-category-pill--active' : 'dam-category-pill--idle'}`}
          >
            {!active && p.icon ? <span className="mr-1">{p.icon}</span> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
