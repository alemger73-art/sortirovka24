import { MapPin, ShoppingBag, UtensilsCrossed } from 'lucide-react';

interface Props {
  step: 1 | 2 | 3;
  cartCount?: number;
}

const STEPS = [
  { n: 1 as const, label: 'Выберите блюда', Icon: UtensilsCrossed },
  { n: 2 as const, label: 'Корзина', Icon: ShoppingBag },
  { n: 3 as const, label: 'Адрес и оплата', Icon: MapPin },
];

export default function DamAlemStepsBar({ step, cartCount = 0 }: Props) {
  return (
    <div className="dam-steps">
      {STEPS.map(({ n, label, Icon }, i) => {
        const active = step === n;
        const done = step > n;
        return (
          <div key={n} className="dam-steps__item">
            {i > 0 ? <div className={`dam-steps__line ${done || active ? 'dam-steps__line--on' : ''}`} /> : null}
            <div className={`dam-steps__dot ${active ? 'dam-steps__dot--active' : ''} ${done ? 'dam-steps__dot--done' : ''}`}>
              <Icon className="h-4 w-4 lg:h-[1.125rem] lg:w-[1.125rem]" />
              {n === 2 && cartCount > 0 ? (
                <span className="dam-steps__badge">{cartCount > 9 ? '9+' : cartCount}</span>
              ) : null}
            </div>
            <span className={`dam-steps__label ${active ? 'dam-steps__label--active' : ''}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
