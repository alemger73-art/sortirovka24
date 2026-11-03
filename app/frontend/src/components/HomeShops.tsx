/** Home page: the district's partner shops as compact cards — name, a line about the goods, price from, two photos. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Truck } from 'lucide-react';
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
      <div className="a-shops">
        {shops.map((s) => (
          <Link key={s.slug} to={`/shop/${s.slug}`} className="a-shop" style={{ background: s.accent }}>
            <span className="a-shop-text">
              <strong>{s.logo && <img src={s.logo} alt="" />}{s.name}</strong>
              {s.headline && <span className="a-shop-line">{s.headline}</span>}
              <small>{s.products} {kz ? 'тауар' : 'товаров'} · {kz ? 'бастап' : 'от'} {money(s.from_price)}{s.free_zones.length > 0 && <> · <Truck size={13} />{kz ? 'тегін' : 'бесплатно'}: {s.free_zones[0]}</>}</small>
            </span>
            {s.photos.length > 0 && <span className="a-shop-photos" aria-hidden="true">
              {s.photos.slice(0, 2).map((src) => <img key={src} src={src} alt="" loading="lazy" />)}
            </span>}
            <ChevronRight size={20} className="a-shop-go" aria-hidden="true" />
          </Link>
        ))}
      </div>
    </section>
  );
}
