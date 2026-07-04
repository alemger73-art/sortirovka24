import { Heart, Minus, Plus } from 'lucide-react';
import DamAlemImage from '@/components/damalem/DamAlemImage';

export interface DamAlemProductCardProps {
  name: string;
  description?: string;
  priceLabel: string;
  imageUrl: string;
  qtyInCart: number;
  hasOptions?: boolean;
  optionsLabel?: string;
  isFavorite?: boolean;
  weight?: string;
  badge?: 'hit' | 'new' | null;
  variant?: 'grid' | 'row';
  onOpen: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onToggleFavorite?: () => void;
}

export default function DamAlemProductCard({
  name,
  description,
  priceLabel,
  imageUrl,
  qtyInCart,
  hasOptions,
  optionsLabel = 'Выбор',
  isFavorite,
  weight,
  badge,
  variant = 'grid',
  onOpen,
  onAdd,
  onRemove,
  onToggleFavorite,
}: DamAlemProductCardProps) {
  if (variant === 'row') {
    return (
      <article className="dam-product-card dam-animate-in">
        <div
          role="button"
          tabIndex={0}
          className="dam-product-card__media cursor-pointer"
          onClick={onOpen}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
          aria-label={name}
        >
          <DamAlemImage src={imageUrl} alt="" className="h-full w-full object-cover" />
          {onToggleFavorite && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onToggleFavorite(); } }}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 shadow-sm"
            >
              <Heart className={`h-3.5 w-3.5 ${isFavorite ? 'fill-[#FF3B30] text-[#FF3B30]' : 'text-gray-400'}`} />
            </span>
          )}
        </div>
        <div className="dam-product-card__body">
          <button type="button" className="text-left flex-1" onClick={onOpen}>
            <h3 className="dam-product-card__title">{name}</h3>
            {description ? <p className="dam-product-card__desc">{description}</p> : null}
          </button>
          <div className="dam-product-card__footer">
            <span className="dam-product-card__price">{priceLabel}</span>
            <QtyControl qty={qtyInCart} onAdd={onAdd} onRemove={onRemove} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="dam-grid-card dam-animate-in">
      <div
        role="button"
        tabIndex={0}
        className="dam-grid-card__media cursor-pointer"
        onClick={onOpen}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
        aria-label={name}
      >
        <DamAlemImage src={imageUrl} alt="" className="h-full w-full object-cover" />
        {badge === 'hit' ? <span className="dam-grid-card__badge dam-grid-card__badge--hit">Хит</span> : null}
        {badge === 'new' ? <span className="dam-grid-card__badge dam-grid-card__badge--new">New</span> : null}
        {onToggleFavorite ? (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onToggleFavorite(); } }}
            className="dam-grid-card__fav"
          >
            <Heart className={`h-4 w-4 ${isFavorite ? 'fill-[#FF3B30] text-[#FF3B30]' : 'text-white drop-shadow'}`} />
          </span>
        ) : null}
        <div className="dam-grid-card__add-wrap">
          {qtyInCart > 0 ? (
            <QtyControl qty={qtyInCart} onAdd={onAdd} onRemove={onRemove} floating />
          ) : (
            <button type="button" onClick={e => { e.stopPropagation(); onAdd(); }} className="dam-grid-card__add" aria-label="В корзину">
              <Plus className="h-5 w-5 lg:h-6 lg:w-6" />
            </button>
          )}
        </div>
      </div>
      <button type="button" className="dam-grid-card__body text-left w-full" onClick={onOpen}>
        <h3 className="dam-grid-card__title">{name}</h3>
        <div className="mt-1 flex flex-wrap gap-1">
          {weight ? <span className="dam-grid-card__tag">{weight}</span> : null}
          {hasOptions ? <span className="dam-grid-card__tag dam-grid-card__tag--opt">{optionsLabel}</span> : null}
        </div>
        <p className="dam-grid-card__price">{priceLabel}</p>
      </button>
    </article>
  );
}

function QtyControl({
  qty,
  onAdd,
  onRemove,
  floating,
}: {
  qty: number;
  onAdd: () => void;
  onRemove: () => void;
  floating?: boolean;
}) {
  const cls = floating ? 'dam-grid-qty' : 'dam-qty-pill';
  return (
    <div className={cls} onClick={e => e.stopPropagation()}>
      <button type="button" onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-full active:scale-90" aria-label="Убрать">
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[1.25rem] flex-1 text-center text-sm font-bold tabular-nums">{qty}</span>
      <button type="button" onClick={onAdd} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF3B30] text-white active:scale-90" aria-label="Добавить">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
