import { ChevronRight } from 'lucide-react';
import { getCategoryVisual } from '@/lib/damAlemImages';

export interface CategoryGridItem {
  slug: string;
  name: string;
  itemCount: number;
}

interface Props {
  categories: CategoryGridItem[];
  onSelect: (slug: string) => void;
  title?: string;
  subtitle?: string;
}

export default function DamAlemCategoryGrid({
  categories,
  onSelect,
  title = 'Что закажем?',
  subtitle = 'Выберите категорию — откроется меню с фото и ценами',
}: Props) {
  if (categories.length === 0) return null;

  return (
    <section className="dam-animate-in">
      <div className="mb-4">
        <h2 className="dam-section-title text-zinc-900">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((cat, idx) => {
          const visual = getCategoryVisual(cat.slug);
          return (
            <button
              key={cat.slug}
              type="button"
              onClick={() => onSelect(cat.slug)}
              className="dam-cat-tile group"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <img
                src={visual.image}
                alt=""
                className="dam-cat-tile__photo"
                loading="lazy"
              />
              <div
                className="dam-cat-tile__overlay"
                style={{ background: visual.gradient }}
              />
              <div className="dam-cat-tile__content">
                <span className="dam-cat-tile__emoji" aria-hidden>{visual.emoji}</span>
                <span className="dam-cat-tile__name">{cat.name}</span>
                <span className="dam-cat-tile__count">
                  {cat.itemCount} {cat.itemCount === 1 ? 'блюдо' : cat.itemCount < 5 ? 'блюда' : 'блюд'}
                </span>
              </div>
              <span className="dam-cat-tile__arrow">
                <ChevronRight className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
