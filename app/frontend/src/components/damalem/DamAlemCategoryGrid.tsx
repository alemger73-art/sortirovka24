import { ChevronRight } from 'lucide-react';
import { getCategoryVisual } from '@/lib/damAlemImages';
import DamAlemImage from '@/components/damalem/DamAlemImage';

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

function countLabel(n: number): string {
  if (n === 1) return '1 блюдо';
  if (n < 5) return `${n} блюда`;
  return `${n} блюд`;
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
      <div className="dam-section-header">
        <h2 className="dam-section-title text-zinc-900">{title}</h2>
        <p className="dam-section-header__sub">{subtitle}</p>
      </div>
      <div className="dam-cat-grid">
        {categories.map((cat, idx) => {
          const visual = getCategoryVisual(cat.slug);
          return (
            <button
              key={cat.slug}
              type="button"
              onClick={() => onSelect(cat.slug)}
              className="dam-cat-tile group"
              style={{ animationDelay: `${idx * 30}ms` }}
            >
              <DamAlemImage
                src={visual.image}
                alt=""
                className="dam-cat-tile__photo"
              />
              <div
                className="dam-cat-tile__overlay"
                style={{
                  background: `linear-gradient(to top, ${visual.accent}eb 0%, ${visual.accent}66 32%, transparent 68%)`,
                }}
              />
              <div className="dam-cat-tile__content">
                <div className="dam-cat-tile__head">
                  <span className="dam-cat-tile__emoji" aria-hidden>{visual.emoji}</span>
                  <span className="dam-cat-tile__name">{cat.name}</span>
                </div>
                <div className="dam-cat-tile__meta">
                  <span className="dam-cat-tile__count">{countLabel(cat.itemCount)}</span>
                  <ChevronRight className="dam-cat-tile__chevron h-3.5 w-3.5 shrink-0" aria-hidden />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
