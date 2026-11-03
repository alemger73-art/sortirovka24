/** Home page: the district's partner shops as a big photo banner — real goods, price from, free delivery. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Truck } from 'lucide-react';
import { money, partnerShop, type ShopSummary } from '@/lib/partnerShop';
import { useLanguage } from '@/contexts/LanguageContext';

export default function HomeShops() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const [shops, setShops] = useState<ShopSummary[]>([]);
  useEffect(() => {
    let live = true;
    partnerShop.list().then((s) => { if (live) setShops(s.filter((x) => x.products > 0)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (!shops.length) return null;
  return (
    <section className="a-section" aria-label={kz ? 'Аудан дүкендері' : 'Магазины района'}>
      <div className="a-head">
        <div><span className="a-kicker">{kz ? 'Үйге жеткізумен' : 'С доставкой до двери'}</span><h2>{kz ? 'Аудан дүкендері' : 'Магазины района'}</h2></div>
      </div>
      <div className={shops.length > 1 ? 'a-scroll' : undefined}>
        {shops.map((s) => (
          <Link key={s.slug} to={`/shop/${s.slug}`} className={`a-shop${shops.length > 1 ? ' a-shop-many' : ''}`} style={{ background: s.accent }}>
            <div className="a-shop-text">
              <span className="a-shop-who">{s.logo && <img src={s.logo} alt="" />}{kz ? 'Серіктес дүкен' : 'Магазин-партнёр'}</span>
              <strong>{s.name}</strong>
              {s.headline && <p>{s.headline}</p>}
              <ul>
                <li>{s.products} {kz ? 'тауар' : 'товаров'} · {kz ? 'бастап' : 'от'} {money(s.from_price)}</li>
                {s.free_zones.length > 0 && <li><Truck size={15} />{kz ? 'Тегін' : 'Бесплатно'}: {s.free_zones.join(', ')}</li>}
              </ul>
              <span className="a-shop-go">{kz ? 'Дүкенді ашу' : 'Открыть магазин'}<ArrowRight size={17} /></span>
            </div>
            {s.photos.length >= 3 && <div className="a-shop-photos" aria-hidden="true">
              {s.photos.slice(0, 3).map((src) => <img key={src} src={src} alt="" loading="lazy" />)}
            </div>}
          </Link>
        ))}
      </div>
    </section>
  );
}
