import { Gift, Sparkles } from 'lucide-react';
import { resolveImageSrc } from '@/lib/storage';
import type { LoyaltyGift } from '@/lib/gastronomLoyalty';
import { formatMoney } from '@/lib/gastronomLoyalty';

interface Props {
  gifts: LoyaltyGift[];
  formatPrice?: (n: number) => string;
}

export default function DamAlemLoyaltyShowcase({ gifts, formatPrice = formatMoney }: Props) {
  const active = gifts.filter(g => g.is_active).sort((a, b) => a.min_amount - b.min_amount);
  if (active.length === 0) return null;

  return (
    <section className="dam-loyalty-showcase dam-animate-in">
      <div className="dam-loyalty-showcase__glow" />
      <div className="relative z-10 p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
            <Gift className="h-5 w-5 text-white" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-white">Подарки к заказу</h2>
            <p className="text-xs text-white/75">Чем больше сумма — тем приятнее бонус</p>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
          {active.map((g, i) => (
            <article key={g.id} className="dam-loyalty-tier shrink-0" style={{ animationDelay: `${i * 60}ms` }}>
              {g.image_url ? (
                <img src={resolveImageSrc(g.image_url) || g.image_url} alt="" className="dam-loyalty-tier__img" />
              ) : (
                <span className="dam-loyalty-tier__emoji">🎁</span>
              )}
              <p className="dam-loyalty-tier__title">{g.title}</p>
              <p className="dam-loyalty-tier__from">от {formatPrice(g.min_amount)}</p>
            </article>
          ))}
        </div>

        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-white/80">
          <Sparkles className="h-3.5 w-3.5" />
          Подарок добавится автоматически при оформлении
        </p>
      </div>
    </section>
  );
}
