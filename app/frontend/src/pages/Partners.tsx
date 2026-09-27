import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Check, MapPin, Phone, MessageCircle, Play, Store } from 'lucide-react';
import Layout from '@/components/Layout';
import StorageImg from '@/components/StorageImg';
import { PartnerCard } from '@/components/PartnerCards';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { phoneLink, whatsappLink, httpsLink } from '@/lib/directoryContent';
import { usePageSeo } from '@/hooks/usePageSeo';
import { useLanguage } from '@/contexts/LanguageContext';

export default function Partners() {
  const { slug } = useParams();
  const { lang } = useLanguage();
  const [items, setItems] = useState<PartnerProfile[]>([]);
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setProfile(null);
    (slug ? partnerProfiles.get(slug).then(p => { if(active) setProfile(p); }) : partnerProfiles.list().then(r => { if(active) setItems(r.items); }))
      .catch(e => { if(active) setError(e.message); }).finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  }, [slug, retry]);
  usePageSeo({ title: profile ? `${profile.name} — ${profile.category}, Караганда` : slug ? undefined : 'Партнёры района Сортировка', description: profile?.headline || (slug ? undefined : 'Местные компании: услуги, работы и контакты. Свяжитесь с партнёром напрямую.'), image: profile?.cover });
  const button = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-3 sm:px-5 py-3 text-sm sm:text-base font-semibold transition hover:opacity-90';
  const contact = profile && (whatsappLink(profile.whatsapp) || phoneLink(profile.phone));
  return <Layout><main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 pb-28">
    <Link to={slug ? '/partners' : '/'} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm text-gray-500"><ArrowLeft className="h-4 w-4" />{slug ? (lang === 'kz' ? 'Аудан серіктестері' : 'Партнёры района') : (lang === 'kz' ? 'Басты бет' : 'На главную')}</Link>
    {loading ? <p role="status" className="py-16 text-center">{lang === 'kz' ? 'Жүктелуде…' : 'Загружаем информацию…'}</p> : error ? <div role="alert" className="rounded-3xl border p-8"><p>{error}</p><button className={button} onClick={() => setRetry(x=>x+1)}>Повторить</button></div> : !slug ? <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm font-semibold text-emerald-600">Sortirovka 24</p><h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{lang === 'kz' ? 'Аудан серіктестері' : 'Партнёры района'}</h1><p className="mt-3 max-w-xl text-gray-500">{lang === 'kz' ? 'Жергілікті компаниялар, қызметтер және байланыс деректері.' : 'Знакомьтесь с местными компаниями, смотрите работы и связывайтесь напрямую.'}</p></div><Link to="/business" className={`${button} border`}>{lang === 'kz' ? 'Серіктес болу' : 'Стать партнёром'}<ArrowUpRight className="h-4 w-4" /></Link></div>
      <input aria-label="Поиск компании или услуги" placeholder={lang === 'kz' ? 'Компания немесе қызмет іздеу' : 'Найти компанию или услугу'} value={search} onChange={e=>setSearch(e.target.value)} className="mb-6 w-full rounded-2xl border bg-transparent p-4" />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{items.filter(p=>`${p.name} ${p.category} ${p.headline} ${p.area} ${p.services.join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())).map(p=><PartnerCard key={p.slug} profile={p}/>)}</div>
      {!items.some(p=>`${p.name} ${p.category} ${p.headline} ${p.area} ${p.services.join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())) && <p className="py-12 text-center text-gray-500">{lang === 'kz' ? 'Компаниялар табылмады.' : search ? 'Ничего не найдено. Попробуйте другое название или услугу.' : 'Здесь скоро появятся компании района.'}</p>}
    </> : profile && <>
      <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white">
        <div className="grid md:grid-cols-2"><div className="p-6 sm:p-10 lg:p-12">
          <div className="flex items-center gap-4">{profile.logo && <StorageImg objectKey={profile.logo} alt={`Логотип ${profile.name}`} className="h-20 w-20 rounded-2xl object-contain" />}<div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">{lang === 'kz' ? 'Біздің серіктес' : 'Наш партнёр'}</p><h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{profile.name}</h1></div></div>
          <p className="mt-7 text-2xl font-semibold leading-snug">{profile.headline}</p><p className="mt-5 flex gap-2 text-sm text-slate-300"><MapPin className="h-5 w-5 shrink-0" />{profile.area}</p>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">{whatsappLink(profile.whatsapp) && <a href={`${whatsappLink(profile.whatsapp)}?text=${encodeURIComponent(`Здравствуйте! Нашёл ${profile.name} на Сортировка 24. Хочу узнать об услугах.`)}`} target="_blank" rel="noopener noreferrer" className={`${button} bg-emerald-500 text-slate-950`}><MessageCircle className="h-5 w-5" />WhatsApp</a>}{phoneLink(profile.phone) && <a href={phoneLink(profile.phone)!} className={`${button} border border-white/25`}><Phone className="h-5 w-5" />{lang === 'kz' ? 'Қоңырау шалу' : 'Позвонить'}</a>}</div>
        </div><div className="min-h-64 md:min-h-96">{profile.cover ? <StorageImg objectKey={profile.cover} alt={profile.name} priority className="h-64 md:h-full md:max-h-[560px] w-full object-cover" /> : <Store className="m-auto h-full w-24 text-slate-700" />}</div></div>
      </section>
      <nav aria-label="Разделы компании" className="my-6 flex flex-wrap gap-2 text-sm font-semibold">{[['about','О компании'],['services','Услуги'],['works','Работы'],['contacts','Контакты']].map(([id,label])=><a key={id} href={`#${id}`} className="rounded-full border px-4 py-3 hover:bg-emerald-50 dark:hover:bg-emerald-950">{label}</a>)}</nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-10 min-w-0"><section id="about" className="scroll-mt-24"><h2 className="text-2xl font-bold">О компании</h2><p className="mt-4 whitespace-pre-line leading-relaxed text-gray-600 dark:text-gray-300">{profile.description}</p></section>
        <section id="services" className="scroll-mt-24"><h2 className="text-2xl font-bold">Чем можем помочь</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{profile.services.map(s=><div key={s} className="flex gap-3 rounded-2xl border p-4"><Check className="h-5 w-5 shrink-0 text-emerald-600" /><span>{s}</span></div>)}</div></section>
        {!!profile.works.length && <section id="works" className="scroll-mt-24"><h2 className="text-2xl font-bold">Работы и видео</h2><p className="mt-2 text-sm text-gray-500">Материалы компании. Откройте публикацию, чтобы посмотреть все фото и видео.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{profile.works.map((w,i)=><article key={i} className="overflow-hidden rounded-2xl border"><a href={httpsLink(w.source) || undefined} target="_blank" rel="noopener noreferrer" className="group relative block"><StorageImg objectKey={w.image} alt={w.title} className="aspect-[4/3] w-full object-cover" />{w.kind==='video' && <span className="absolute inset-0 flex items-center justify-center"><Play className="h-14 w-14 rounded-full bg-black/60 p-4 text-white" /></span>}</a><div className="p-4"><h3 className="font-bold">{w.title}</h3>{w.caption && <p className="mt-2 text-sm text-gray-500">{w.caption}</p>}{httpsLink(w.source) && <a href={w.source} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-emerald-600">{w.kind==='video' ? 'Смотреть видео' : 'Смотреть публикацию'}<ArrowUpRight className="h-4 w-4" /></a>}</div></article>)}</div></section>}
        </div><aside id="contacts" className="scroll-mt-24 space-y-4"><div className="rounded-3xl border bg-white p-6 dark:bg-gray-900"><h2 className="text-xl font-bold">Контакты</h2><dl className="mt-5 space-y-5 text-sm">{[["Телефон",profile.phone],["Работаем",profile.area],["Адрес",profile.address],["Часы работы",profile.hours]].filter(([,v])=>v).map(([k,v])=><div key={k}><dt className="text-gray-500">{k}</dt><dd className="mt-1 font-medium break-words">{v}</dd></div>)}</dl>{!profile.address && <p className="mt-5 text-sm text-gray-500">Место встречи и выезд согласуйте с компанией.</p>}{httpsLink(profile.instagram) && <a href={profile.instagram} target="_blank" rel="noopener noreferrer" className={`${button} mt-5 w-full border`}>Instagram<ArrowUpRight className="h-4 w-4" /></a>}</div>
        {profile.offer && <div className="rounded-3xl bg-emerald-50 p-6 dark:bg-emerald-950"><p className="text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Для жителей района</p><h2 className="mt-3 text-xl font-bold">{profile.offer}</h2>{profile.offer_terms && <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{profile.offer_terms}</p>}{contact && <a href={contact} className={`${button} mt-4 w-full bg-emerald-600 text-white`}>Уточнить условия</a>}</div>}
        </aside>
      </div>
    </>}
  </main></Layout>;
}
