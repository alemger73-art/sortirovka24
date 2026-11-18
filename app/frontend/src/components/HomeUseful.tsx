import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useful, type UsefulTeaser } from '@/lib/useful';
import { UsefulTeaserCard } from '@/pages/Useful';

/** Home: the freshest «Полезно знать» card big, the next two small; hidden until something is published. */
export default function HomeUseful() {
  const [items, setItems] = useState<UsefulTeaser[]>([]);
  useEffect(() => { useful.list().then(setItems).catch(() => setItems([])); }, []);
  if (!items.length) return null;
  const [first, ...rest] = items;
  return <section className="uk-home a-section" aria-label="Полезно знать">
    <div className="a-head"><div><span className="a-kicker">Что меняется</span><h2>💡 Полезно знать</h2></div>
      <Link to="/useful" className="a-more">Все<ArrowRight size={15} /></Link></div>
    <UsefulTeaserCard item={first} big />
    {rest.length > 0 && <div className="uk-row">{rest.slice(0, 2).map(item => <UsefulTeaserCard key={item.slug} item={item} />)}</div>}
  </section>;
}
