import { Heart, Minus, Plus } from 'lucide-react';

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
  onOpen,
  onAdd,
  onRemove,
  onToggleFavorite,
}: DamAlemProductCardProps) {
  return (
    <article className="dam-product-card dam-animate-in">
      <button type="button" className="dam-product-card__media" onClick={onOpen} aria-label={name}>
        <img src={imageUrl} alt="" loading="lazy" />
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
      </button>

      <div className="dam-product-card__body">
        <button type="button" className="text-left flex-1" onClick={onOpen}>
          <h3 className="dam-product-card__title">{name}</h3>
          {description ? <p className="dam-product-card__desc">{description}</p> : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {weight ? (
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">{weight}</span>
            ) : null}
            {hasOptions ? (
              <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-600">{optionsLabel}</span>
            ) : null}
          </div>
        </button>

        <div className="dam-product-card__footer">
          <span className="dam-product-card__price">{priceLabel}</span>
          {qtyInCart > 0 ? (
            <div className="dam-qty-pill">
              <button type="button" onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-full active:scale-90" aria-label="Убрать">
                <Minus className="h-4 w-4" />
              </button>
              <span className="min-w-[1.25rem] flex-1 text-center text-sm font-bold tabular-nums">{qtyInCart}</span>
              <button type="button" onClick={onAdd} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF3B30] text-white active:scale-90" aria-label="Добавить">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={onAdd} className="dam-btn-add" aria-label="В корзину">
              <Plus className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
