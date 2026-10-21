/** Home page: partners of the project as calm cards + an invitation for local businesses. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, MessageCircle, Phone } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
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
    <section className="home-partners h2-section" aria-label={kz ? 'Жоба серіктестері' : 'Партнёры проекта'}>
      <div className="h2-head">
        <h2>{kz ? 'Аудан серіктестері' : 'Партнёры района'}</h2>
        <Link to="/partners" className="h2-more">{kz ? 'Барлығы' : 'Все'}<ChevronRight size={16} /></Link>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((p) => {
          const phone = phoneLink(p.phone), wa = whatsappLink(p.whatsapp);
          return (
            <article key={p.slug} className="h2-card h2-partner">
              <Link to={`/partners/${p.slug}`} className="h2-partner-logo" aria-label={p.name}>
                {p.logo ? <StorageImg objectKey={p.logo} alt="" className="h-full w-full object-cover" /> : p.cover ? <StorageImg objectKey={p.cover} alt="" className="h-full w-full object-cover" /> : <Building2 size={24} strokeWidth={1.8} />}
              </Link>
              <div style={{ flex: 1, minWidth: 0 }}>
                <small>{kz ? 'Жоба серіктесі' : 'Партнёр проекта'}</small>
                <h3><Link to={`/partners/${p.slug}`}>{p.name}</Link></h3>
                {p.headline && <p>{p.headline}</p>}
                <div className="h2-partner-actions">
                  <Link to={`/partners/${p.slug}`}>{kz ? 'Қызметтер' : 'Услуги'}</Link>
                  {phone && <a href={phone} aria-label={kz ? `${p.name}: қоңырау шалу` : `Позвонить в ${p.name}`}><Phone size={18} strokeWidth={1.8} /></a>}
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`${p.name}: WhatsApp`}><MessageCircle size={18} strokeWidth={1.8} /></a>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <Link to="/business" className="h2-invite">
        <span style={{ flex: 1 }}><strong>{kz ? 'Ауданда жұмыс істейсіз бе?' : 'Работаете в Сортировке?'}</strong><small>{kz ? 'Өтінім қалдырыңыз — ынтымақтастықты талқылаймыз' : 'Оставьте заявку — обсудим сотрудничество'}</small></span>
        <ChevronRight size={18} />
      </Link>
    </section>
  );
}
