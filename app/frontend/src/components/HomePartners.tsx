/** Home page: partners of the project as calm cards + an invitation for local businesses. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Building2, MessageCircle, Phone } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { track } from '@/lib/analytics';
import { partnerShop } from '@/lib/partnerShop';
import { phoneLink, whatsappLink } from '@/lib/directoryContent';
import { useLanguage } from '@/contexts/LanguageContext';

export default function HomePartners() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const [items, setItems] = useState<PartnerProfile[]>([]);
  const [shops, setShops] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    // every published partner, the main ones (featured) first — the owner wants them side by side here too
    partnerProfiles.list().then((r) => { if (live) setItems(r.items.filter((p) => p.published).sort((x, y) => Number(y.featured) - Number(x.featured))); }).catch(() => {});
    partnerShop.list().then((s) => { if (live) setShops(s.map((x) => x.slug)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return (
    <section className="home-partners a-section" aria-label={kz ? 'Жоба серіктестері' : 'Партнёры проекта'}>
      {items.length > 0 && <><div className="a-head">
        <div><span className="a-kicker">{kz ? 'Жақын жердегі қызметтер' : 'Услуги рядом'}</span><h2>{kz ? 'Жоба серіктестері' : 'Партнёры проекта'}</h2></div>
        <Link to="/partners" className="a-more">{kz ? 'Барлығы' : 'Все'}<ArrowRight size={15} /></Link>
      </div>
      <div className="a-partners-grid" style={{ display: 'grid', gap: 10 }}>
        {items.map((p) => {
          const phone = phoneLink(p.phone), wa = whatsappLink(p.whatsapp);
          // the offer to point at: the highlighted price, otherwise the first one
          const price = p.prices.find((x) => x.featured) || p.prices[0];
          return (
            <article key={p.slug} className="a-card a-partner">
              <small>{p.featured ? (kz ? 'Жарнама · Басты серіктес' : 'Реклама · Главный партнёр') : (kz ? 'Жарнама · Жоба серіктесі' : 'Реклама · Партнёр проекта')}</small>
              <div className="a-partner-title">
                {p.logo && <StorageImg objectKey={p.logo} alt="" className="a-partner-logo" />}
                <h3><Link to={`/partners/${p.slug}`}>{p.name}</Link></h3>
              </div>
              {p.headline && <p>{p.headline}</p>}
              {price && <Link to={`/partners/${p.slug}#prices`} className="a-partner-price"><span>{price.title}</span><b>{price.price}</b>{price.old_price && <s>{price.old_price}</s>}</Link>}
              <div className="a-partner-actions">
                {p.lead.enabled
                  ? <Link to={`/partners/${p.slug}#lead`} className="a-partner-shop" onClick={() => track('promo_click', { promo: 'partner_lead', place: 'home', partner: p.slug })}>{p.lead.button}<ArrowUpRight size={15} /></Link>
                  : shops.includes(p.slug)
                  ? <Link to={`/shop/${p.slug}`} className="a-partner-shop">{kz ? 'Тапсырыс беру' : 'Выбрать и заказать'}<ArrowUpRight size={15} /></Link>
                  : <Link to={`/partners/${p.slug}`}>{kz ? 'Қызметтер' : 'Услуги'}<ArrowUpRight size={15} /></Link>}
                {p.lead.enabled && <Link to={`/partners/${p.slug}`}>{kz ? 'Толығырақ' : 'Подробнее'}</Link>}
                {phone && <a href={phone}><Phone size={16} strokeWidth={1.8} />{kz ? 'Қоңырау' : 'Позвонить'}</a>}
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`${p.name}: WhatsApp`}><MessageCircle size={16} strokeWidth={1.8} />WhatsApp</a>}
              </div>
            </article>
          );
        })}
      </div></>}
      <Link to="/business" className="a-card a-invite">
        <Building2 size={22} strokeWidth={1.8} style={{ color: 'var(--a-accent)', flex: 'none' }} />
        <span style={{ flex: 1 }}><strong>{kz ? 'Ауданда жұмыс істейсіз бе?' : 'Работаете в Сортировке?'}</strong><small>{kz ? 'Өтінім қалдырыңыз — ынтымақтастықты талқылаймыз' : 'Оставьте заявку — обсудим сотрудничество'}</small></span>
        <ArrowRight size={18} />
      </Link>
    </section>
  );
}
