import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Phone, MessageCircle, Building2 } from 'lucide-react';
import StorageImg from '@/components/StorageImg';
import { partnerProfiles, type PartnerProfile } from '@/lib/partnerProfiles';
import { phoneLink, whatsappLink } from '@/lib/directoryContent';
import { useLanguage } from '@/contexts/LanguageContext';
import '@/styles/portal-public.css';

export default function PartnerSpotlight({compact=false}:{compact?:boolean}) {
 const {lang}=useLanguage(); const kz=lang==='kz';
 const [items,setItems]=useState<PartnerProfile[]>([]);
 useEffect(()=>{let live=true;partnerProfiles.list().then(r=>{if(live)setItems(r.items.filter(p=>p.published));}).catch(()=>{});return()=>{live=false;};},[]);
 const visible=compact ? items.filter(p=>p.slug==='krovlya-365') : items;
 if(!visible.length)return null;
 return <section className={`home-partners ${compact?'home-partners-context':''}`} aria-label={kz?'Жоба серіктестері':'Партнёры проекта'}>
  <div className="public-section-head"><div><span className="public-kicker">{kz?'Жақын жердегі қызметтер':'Услуги рядом'}</span><h2>{compact ? (kz?'Сұрауыңызға сәйкес':'По вашему запросу') : (kz?'Жоба серіктестері':'Партнёры проекта')}</h2></div><Link to="/partners">{kz?'Барлығы':'Все партнёры'}<ArrowUpRight size={17}/></Link></div>
  <div className="home-partners-grid">{visible.map(p=>{
   const phone=phoneLink(p.phone),wa=whatsappLink(p.whatsapp);
   return <article key={p.slug} className="partner-mini">
    <Link to={`/partners/${p.slug}`} className="partner-mini-photo" aria-label={kz?`${p.name}: компания туралы`:`${p.name}: о компании`}>{p.cover?<StorageImg objectKey={p.cover} alt="" className="h-full w-full object-cover"/>:<Building2 size={28}/>}</Link>
    <div className="partner-mini-body"><div className="partner-mini-title">{p.logo&&<StorageImg objectKey={p.logo} alt="" className="partner-mini-logo"/>}<div><span>{kz?'Жоба серіктесі':'Партнёр проекта'}</span><h3><Link to={`/partners/${p.slug}`}>{p.name}</Link></h3></div></div><p>{p.headline}</p>
     <div className="partner-mini-actions"><Link to={`/partners/${p.slug}`}>{kz?'Қызметтер':'Услуги'}<ArrowUpRight size={15}/></Link>{phone&&<a href={phone} aria-label={kz?`${p.name}: қоңырау шалу`:`Позвонить в ${p.name}`} title={p.phone}><Phone size={17}/></a>}{wa&&<a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`${p.name}: WhatsApp`} title="WhatsApp"><MessageCircle size={18}/></a>}</div>
    </div>
   </article>;
  })}</div>
  {!compact && <Link to="/business" className="business-partner-invite"><Building2 size={21}/><span><strong>{kz?'Ауданда жұмыс істейсіз бе?':'Работаете в Сортировке?'}</strong><small>{kz?'Өтінім қалдырыңыз — ынтымақтастықты талқылаймыз':'Оставьте заявку — обсудим сотрудничество'}</small></span><ArrowUpRight size={20}/></Link>}
 </section>;
}
