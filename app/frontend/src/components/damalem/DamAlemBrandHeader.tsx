import { Star } from 'lucide-react';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import DamAlemImage from '@/components/damalem/DamAlemImage';
import { DAM_ALEM_CDN, resolveDamAlemHeroImage } from '@/lib/damAlemImages';

interface Props {
  title?: string;
  subtitle?: string;
  heroImage?: string;
  brandPhoto?: string;
  rating?: number;
  primaryCtaLabel?: string;
  onPrimaryCta?: () => void;
}

/** Compact brand header — replaces tall promo hero */
export default function DamAlemBrandHeader({
  title,
  subtitle,
  heroImage,
  brandPhoto,
  rating = 4.9,
  primaryCtaLabel = 'К комбо',
  onPrimaryCta,
}: Props) {
  const bg = resolveDamAlemHeroImage(heroImage, brandPhoto);
  const brandLabel = title?.trim() || DAM_ALEM_BRAND;
  const tagline = subtitle?.trim() || 'Горячая еда с доставкой по Сортировке';

  return (
    <header className="dam-brand-header" aria-label={brandLabel}>
      <div className="dam-brand-header__media">
        <DamAlemImage
          src={bg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          fallbacks={[DAM_ALEM_CDN.hero, DAM_ALEM_CDN.food]}
        />
        <div className="dam-brand-header__scrim" aria-hidden />
      </div>
      <div className="dam-brand-header__content">
        <div className="min-w-0 flex-1">
          <p className="dam-brand-header__mark">{DAM_ALEM_BRAND}</p>
          <h1 className="dam-brand-header__title">{brandLabel}</h1>
          <p className="dam-brand-header__tagline line-clamp-2">{tagline}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="dam-brand-header__rating">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {rating.toFixed(1)}
          </span>
          {onPrimaryCta ? (
            <button type="button" onClick={onPrimaryCta} className="dam-brand-header__cta">
              {primaryCtaLabel}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
