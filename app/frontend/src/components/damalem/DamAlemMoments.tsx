import { useStoreTranslations } from '@/i18n/storeTranslations';

/** Mood photos for the DAM ALEM menu: who our food is for. Shipped as static files in /food/moments. */
const MOMENTS = [
  { src: '/food/moments/family-pizza.webp', caption: 'Пицца на всю семью' },
  { src: '/food/moments/friends-burgers.webp', caption: 'Бургеры под футбол' },
  { src: '/food/moments/family-manty.webp', caption: 'Манты и лагман к ужину' },
  { src: '/food/moments/kids-nuggets.webp', caption: 'Наггетсы для детей' },
  { src: '/food/moments/couple-tea.webp', caption: 'Чай и пицца зимним вечером' },
  { src: '/food/moments/courier.webp', caption: 'Привезём горячим' },
];

export default function DamAlemMoments() {
  const st = useStoreTranslations();
  return (
    <section className="dam-market-hits dam-moments" aria-labelledby="dam-moments-title">
      <div className="dam-market-section-head">
        <div>
          <h2 id="dam-moments-title">{st('Вкусно вместе')}</h2>
        </div>
      </div>
      <div className="dam-market-hits__row">
        {MOMENTS.map(moment => (
          <figure key={moment.src} className="dam-moments__card">
            <img src={moment.src} alt={st(moment.caption)} loading="lazy" decoding="async" width={480} height={270} />
            <figcaption>{st(moment.caption)}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
