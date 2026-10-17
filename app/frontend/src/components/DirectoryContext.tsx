import { ArrowUpRight, Phone, ChevronDown, Shield, Leaf, Trash2, PlugZap, FileText, HeartHandshake } from 'lucide-react';
import content from '@/content/directory-context';
import { phoneLink } from '@/lib/directoryContent';
import '@/styles/directory-context.css';

export default function DirectoryContext({ kz, query, view }: { kz: boolean; query: string; view: 'all' | 'contacts' | 'guides' | 'leadership' }) {
  const say = (ru: string, kk: string) => kz ? kk : ru;
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (value: string) => words.every(w => value.toLocaleLowerCase().includes(w));
  const leaders = content.leadership.filter(p => matches([p.name, p.role, p.role_kk, p.duties, p.duties_kk, p.phone, p.address].join(' ')));
  const guides = content.guides.filter(g => matches([g.title, g.title_kk, g.body, g.body_kk].join(' ')));
  return <>
    {(view === "all" || view === "guides") && !!guides.length && <section className="directory-guidance" aria-labelledby="guidance-heading">
      <h2 id="guidance-heading">{say('Куда обращаться', 'Қайда жүгіну керек')}</h2>
      <p className="directory-context-intro">{say('Выберите ситуацию: здесь нужный канал и сведения для обращения.', 'Жағдайды таңдаңыз: мұнда қажетті арна және өтінішке арналған мәліметтер бар.')}</p>
      <div className="directory-guidance-list">{guides.map((g, index) => { const Icon = [Shield, Leaf, Trash2, PlugZap, FileText, HeartHandshake][content.guides.indexOf(g)]; return <details key={g.title}>
        <summary><span className="directory-guide-icon"><Icon size={23} /></span><span>{kz ? g.title_kk : g.title}</span><ChevronDown size={19} className="directory-guide-chevron" /></summary>
        <p>{kz ? g.body_kk : g.body}</p>
        <div className="directory-context-links">{g.links.map(([label, url]) => <a key={url} href={url} target={url.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer">{label} ↗</a>)}</div>
      </details>; })}</div>
    </section>}
    {(view === "all" || view === "leadership") && !!leaders.length && <section className="directory-leadership" aria-labelledby="leadership-heading">
      <h2 id="leadership-heading">{say('Руководство района Әлихан Бөкейхан', 'Әлихан Бөкейхан ауданының басшылығы')}</h2>
      <p className="directory-context-intro">{say('Кто отвечает за направление и как записаться на приём. Телефоны ниже — номера приёмных; дату визита уточняйте заранее.', 'Бағытқа кім жауапты және қабылдауға қалай жазылуға болады. Төменде қабылдау бөлмелерінің нөмірлері берілген; бару күнін алдын ала нақтылаңыз.')}</p>
      <div className="directory-leadership-grid">{leaders.map(p => <article key={p.source_url} className="directory-person">
        <img src={p.photo_url} alt={p.name} loading="lazy" width="200" height="220" referrerPolicy="no-referrer" />
        <div className="directory-person-body"><p className="directory-person-role">{kz ? p.role_kk : p.role}</p><h3>{p.name}</h3>
          <p>{kz ? p.duties_kk : p.duties}</p>
          <p><strong>{say('Приём:', 'Қабылдау:')}</strong> {kz ? p.reception_kk : p.reception}</p>
          <p>{say(p.address, 'Қарағанды, Архитектурная көшесі, 13, 1-қабат, Front office')}</p>
          <a className="directory-person-phone" href={phoneLink(p.phone)}><Phone size={16} />{p.phone.replace(/^\+7(\d{4})(\d{2})(\d{2})(\d{2})$/, "+7 ($1) $2-$3-$4")}</a>
          {p.email && <a className="directory-person-email" href={`mailto:${p.email}`}>{p.email}</a>}
          <div className="directory-person-source"><a href={p.source_url} target="_blank" rel="noopener noreferrer">{say('Официальная карточка gov.kz', 'Gov.kz ресми парақшасы')} ↗</a></div>
        </div>
      </article>)}</div>
    </section>}
  </>;
}
