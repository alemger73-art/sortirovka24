import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useful, type UsefulTeaser } from '@/lib/useful';
import { UsefulTeaserCard } from '@/pages/Useful';

/** Home: «Полезно знать» as one swipeable row of small cards, freshest first; hidden until something is published. */
export default function HomeUseful() {
  const [items, setItems] = useState<UsefulTeaser[]>([]);
  const kz = useLanguage().lang === 'kz';
  useEffect(() => { useful.list().then(setItems).catch(() => setItems([])); }, []);
  if (!items.length) return null;
  return <section className="uk-home a-section" aria-label={kz ? 'Білген жөн' : 'Полезно знать'}>
    <div className="a-head"><div><span className="a-kicker">{kz ? 'Өзгерістер' : 'Что меняется'}</span><h2>💡 {kz ? 'Білген жөн' : 'Полезно знать'}</h2></div>
      <Link to="/useful" className="a-more">{kz ? 'Барлығы' : 'Все'}<ArrowRight size={15} /></Link></div>
    <div className="a-scroll uk-strip">{items.slice(0, 8).map(item => <UsefulTeaserCard key={item.slug} item={item} mini />)}</div>
  </section>;
}
