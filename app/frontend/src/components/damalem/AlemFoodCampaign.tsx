import { useStoreTranslations } from '@/i18n/storeTranslations';
import { Gift, Home, Truck } from 'lucide-react';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';
import DamAlemImage from '@/components/damalem/DamAlemImage';

interface Props {
  freeDeliveryFrom: number;
  apartmentPrice: number;
  apartmentFreeFrom: number;
  gifts: LoyaltyGift[];
  formatPrice: (n: number) => string;
  onOpenGifts?: () => void;
}

export default function AlemFoodCampaign({
  freeDeliveryFrom,
  apartmentPrice,
  apartmentFreeFrom,
  gifts,
  formatPrice,
  onOpenGifts,
}: Props) {
  const st = useStoreTranslations();

  const activeGifts = gifts.filter(g => g.is_active);
  const giftFrom = activeGifts.length > 0
    ? Math.min(...activeGifts.map(g => g.min_amount))
    : 0;
  const firstTier = activeGifts.filter(g => g.min_amount === giftFrom);

  return (
    <section className="alem-campaign" aria-label={st("Акции DAM ALEM 2.0")}>
      <div className="alem-campaign__grid">
        {freeDeliveryFrom > 0 && (
          <article className="alem-campaign__card alem-campaign__card--delivery">
            <span className="alem-campaign__icon"><Truck className="h-5 w-5" /></span>
            <div>
              <strong>{st("Бесплатная доставка")}</strong>
              <p>{st("От")} {formatPrice(freeDeliveryFrom)}  {st("по Сортировке. Порог задаёте в админке.")}</p>
            </div>
          </article>
        )}
        {apartmentPrice > 0 && (
          <article className="alem-campaign__card alem-campaign__card--home">
            <span className="alem-campaign__icon"><Home className="h-5 w-5" /></span>
            <div>
              <strong>{st("До квартиры +")}{formatPrice(apartmentPrice)}</strong>
              <p>
                {apartmentFreeFrom > 0
                  ? st("Поднимем до двери. Бесплатно от {0}", [formatPrice(apartmentFreeFrom)])
                  : st("Курьер поднимет заказ до двери")}
              </p>
            </div>
          </article>
        )}
        {giftFrom > 0 && (
          <article className="alem-campaign__card alem-campaign__card--gift">
            <span className="alem-campaign__icon"><Gift className="h-5 w-5" /></span>
            <div>
              <strong>{st("Подарок от")} {formatPrice(giftFrom)}</strong>
              <p>
                {firstTier.length > 1
                  ? st("Выберите один из {0}: {1}", [firstTier.length, firstTier.map(g => g.title).join(', ')])
                  : firstTier[0]?.title || st("Бесплатный подарок к заказу")}
              </p>
            </div>
          </article>
        )}
      </div>

      {firstTier.length > 0 && (
        <div id="alem-gifts" className="alem-campaign__gifts">
          <div className="dam-market-section-head">
            <div>
              <span>{st("От")} {formatPrice(giftFrom)}</span>
              <h2>{st("Выберите подарок")}</h2>
            </div>
          </div>
          <div className="alem-campaign__gifts-row">
            {firstTier.map(gift => (
              <button
                key={gift.id}
                type="button"
                className="alem-campaign__gift"
                onClick={onOpenGifts}
              >
                <div className="alem-campaign__gift-photo">
                  {gift.image_url
                    ? <DamAlemImage src={gift.image_url} alt="" className="h-full w-full object-cover" />
                    : <span aria-hidden>🎁</span>}
                </div>
                <strong>{gift.title}</strong>
                <span>{st("Бесплатно к заказу")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
