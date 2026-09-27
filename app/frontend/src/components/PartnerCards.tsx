import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, MapPin, Store } from 'lucide-react';
import StorageImg from './StorageImg';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { useLanguage } from '@/contexts/LanguageContext';

export function PartnerCard({ profile: p }: { profile: PartnerProfile }) {
  const { lang } = useLanguage();
  return <Link to={`/partners/${p.slug}`} className="group overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 transition hover:shadow-lg focus-visible:ring-2 focus-visible:ring-emerald-500">
    <div className="relative h-48 overflow-hidden bg-slate-100 dark:bg-slate-800">
      {p.cover ? <StorageImg objectKey={p.cover} alt={p.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <Store className="m-auto h-full w-16 text-slate-400" />}
      <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-900">{p.category}</span>
    </div>
    <div className="p-5">
      <div className="flex items-center gap-3">{p.logo && <StorageImg objectKey={p.logo} alt="" className="h-12 w-12 rounded-xl object-contain" />}<h3 className="min-w-0 flex-1 text-xl font-bold">{p.name}</h3><ArrowUpRight className="h-5 w-5 shrink-0 text-emerald-600" /></div>
      <p className="mt-3 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{p.headline}</p>
      {p.area && <p className="mt-3 flex gap-2 text-xs text-gray-500"><MapPin className="h-4 w-4 shrink-0" />{p.area}</p>}
      {p.offer && <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{p.offer}</p>}
      <p className="mt-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400">{lang === 'kz' ? 'Компания туралы →' : 'О компании и услугах →'}</p>
    </div>
  </Link>;
}

export default function PartnerCards() {
  const { lang } = useLanguage();
  const [items, setItems] = useState<PartnerProfile[]>([]);
  useEffect(() => { let live = true; partnerProfiles.list().then(r => { if(live) setItems(r.items); }).catch(() => {}); return () => {live = false;}; }, []);
  if (!items.length) return null;
  return <section aria-label="Партнёры района" className="space-y-5">
    <div className="flex items-end justify-between gap-4"><div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-emerald-600">{lang === 'kz' ? 'Жақын жердегі бизнес' : 'Местный бизнес'}</p><h2 className="text-2xl font-bold">{lang === 'kz' ? 'Аудан серіктестері' : 'Партнёры района'}</h2></div><Link to="/partners" className="shrink-0 text-sm font-semibold text-emerald-600">{lang === 'kz' ? 'Барлығы →' : 'Все партнёры →'}</Link></div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{items.slice(0,3).map(p => <PartnerCard key={p.slug} profile={p} />)}</div>
  </section>;
}
