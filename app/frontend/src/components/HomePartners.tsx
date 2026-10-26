/** Home page: partners of the project as calm cards + an invitation for local businesses. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Building2, MessageCircle, Phone } from 'lucide-react';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { phoneLink, whatsappLink } from '@/lib/directoryContent';
import { useLanguage } from '@/contexts/LanguageContext';

export default function HomePartners() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const [items, setItems] = useState<PartnerProfile[]>([]);
  useEffect(() => {
    let live = true;
    partnerProfiles.list().then((r) => { if (live) setItems(r.items.filter((p) => p.published)); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return (
    <section className="home-partners a-section" aria-label={kz ? 'Жоба серіктестері' : 'Партнёры проекта'}>
      <div className="a-head">
        <div><span className="a-kicker">{kz ? 'Жақын жердегі қызметтер' : 'Услуги рядом'}</span><h2>{kz ? 'Жоба серіктестері' : 'Партнёры проекта'}</h2></div>
        <Link to="/partners" className="a-more">{kz ? 'Барлығы' : 'Все'}<ArrowRight size={15} /></Link>
      </div>
      <div className="a-partners-grid" style={{ display: 'grid', gap: 10 }}>
        {items.map((p) => {
          const phone = phoneLink(p.phone), wa = whatsappLink(p.whatsapp);
          return (
            <article key={p.slug} className="a-card a-partner">
              <small>{kz ? 'Жоба серіктесі' : 'Партнёр проекта'}</small>
              <h3><Link to={`/partners/${p.slug}`}>{p.name}</Link></h3>
              {p.headline && <p>{p.headline}</p>}
              <div className="a-partner-actions">
                <Link to={`/partners/${p.slug}`}>{kz ? 'Қызметтер' : 'Услуги'}<ArrowUpRight size={15} /></Link>
                {phone && <a href={phone}><Phone size={16} strokeWidth={1.8} />{kz ? 'Қоңырау' : 'Позвонить'}</a>}
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`${p.name}: WhatsApp`}><MessageCircle size={16} strokeWidth={1.8} />WhatsApp</a>}
              </div>
            </article>
          );
        })}
      </div>
      <Link to="/business" className="a-card a-invite">
        <Building2 size={22} strokeWidth={1.8} style={{ color: 'var(--a-accent)', flex: 'none' }} />
        <span style={{ flex: 1 }}><strong>{kz ? 'Ауданда жұмыс істейсіз бе?' : 'Работаете в Сортировке?'}</strong><small>{kz ? 'Өтінім қалдырыңыз — ынтымақтастықты талқылаймыз' : 'Оставьте заявку — обсудим сотрудничество'}</small></span>
        <ArrowRight size={18} />
      </Link>
    </section>
  );
}
