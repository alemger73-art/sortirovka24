import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Newspaper, Search, ArrowUpRight, ChevronLeft, Share2, Clock, Instagram } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import StorageImg from '@/components/StorageImg';
import { StorageGallery } from '@/components/MultiImageUpload';
import { client, NEWS_CATEGORIES, getPublicCategoryLabel, formatDate } from '@/lib/api';
import { splitNewsContent, youtubeVideo } from '@/lib/news';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageSeo } from '@/hooks/usePageSeo';
import '@/styles/news.css';

type NewsItem = { id:number; title:string; content?:string; short_description?:string; category:string; image_url?:string; gallery_images?:string; youtube_url?:string; published?:boolean; created_at?:string };
const copy = {
 ru: { title:'Новости Сортировки', intro:'Что происходит рядом: события, важные объявления и истории нашего района.', latest:'Последние события', search:'Поиск по новостям', empty:'Новостей пока нет', noResults:'Ничего не найдено', hint:'Попробуйте другую тему или поисковый запрос.', error:'Не удалось загрузить новости', retry:'Повторить', more:'Показать ещё', read:'Читать новость', share:'Поделиться', copied:'Ссылка скопирована', minutes:'мин. чтения', author:'Редакция Сортировка 24', related:'Читайте также', instagram:'Открыть публикацию в Instagram', back:'Все новости', reset:'Сбросить', notFound:'Новость не найдена или снята с публикации', lead:'В центре внимания', end:'Вы прочитали новость', source:'Эта новость также опубликована в Instagram.', loading:'Загружаем новости…' },
 kz: { title:'Сұрыптау жаңалықтары', intro:'Ауданымыздың оқиғалары, маңызды хабарландырулары және тұрғындардың әңгімелері.', latest:'Соңғы оқиғалар', search:'Жаңалықтардан іздеу', empty:'Әзірге жаңалық жоқ', noResults:'Ештеңе табылмады', hint:'Басқа тақырыпты немесе іздеу сөзін таңдаңыз.', error:'Жаңалықтарды жүктеу мүмкін болмады', retry:'Қайталау', more:'Тағы көрсету', read:'Жаңалықты оқу', share:'Бөлісу', copied:'Сілтеме көшірілді', minutes:'мин. оқу', author:'Сұрыптау 24 редакциясы', related:'Сондай-ақ оқыңыз', instagram:'Instagram жарияланымын ашу', back:'Барлық жаңалықтар', reset:'Тазарту', notFound:'Жаңалық табылмады немесе жариялаудан алынды', lead:'Назарда', end:'Жаңалықты оқып шықтыңыз', source:'Бұл жаңалық Instagram-да да жарияланған.', loading:'Жаңалықтар жүктелуде…' },
};
function useNewsText() { const language=useLanguage(); return { ...language, text:copy[language.lang === 'kz' ? 'kz' : 'ru'] }; }
function NewsCard({item,featured=false}:{item:NewsItem;featured?:boolean}) {
 const {t,localized,text,lang}=useNewsText();
 return <Link to={`/news/${item.id}`} className={`news-card ${featured?'news-featured':''}`}>
  <div className="news-card-image">{item.image_url?<StorageImg objectKey={item.image_url} alt="" className="w-full h-full object-cover"/>:<div className="news-placeholder"><Newspaper size={48}/></div>}</div>
  <div className="news-card-copy"><div className="news-meta"><span className="news-category">{getPublicCategoryLabel(item.category,t)}</span><time>{item.created_at?formatDate(item.created_at,lang):''}</time></div>
  {featured&&<p className="news-eyebrow">{text.lead}</p>}<h2>{localized(item,'title')}</h2><p className="news-summary">{localized(item,'short_description') || splitNewsContent(localized(item,'content') || '').content.slice(0,180)}</p><span className="news-read">{text.read}<ArrowUpRight size={18}/></span></div>
 </Link>;
}
export function NewsList() {
 const {text,t}=useNewsText(); const [items,setItems]=useState<NewsItem[]>([]);const [category,setCategory]=useState('');const [search,setSearch]=useState('');const [term,setTerm]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState(false);const [total,setTotal]=useState(0);const [retry,setRetry]=useState(0);const generation=useRef(0);const busy=useRef(false);
 useEffect(()=>{const timer=setTimeout(()=>setTerm(search.trim()),300);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{ const version=++generation.current;setItems([]);setTotal(0);void load(0,version);return()=>{generation.current++;}; },[category,term,retry]);
 async function load(skip:number,version=generation.current) {
  busy.current=true;setLoading(true);setError(false);
  try {const query:Record<string,unknown>={published:true};if(category)query.category=category;if(term)query.search=term;
   const res=await client.entities.news.query({query,sort:'-created_at',skip,limit:12} as any);
   if(version!==generation.current)return;const data=res.data;setItems(previous=>skip?[...previous,...(data?.items||[])]:data?.items||[]);setTotal(data?.total||0);
  } catch {if(version===generation.current)setError(true);} finally {if(version===generation.current){setLoading(false);busy.current=false;}}
 }
 return <Layout><div className="news-surface"><div className="news-shell"><header className="news-header"><p className="news-eyebrow">SORTIROVKA 24 · {text.latest}</p><h1>{text.title}</h1><p>{text.intro}</p></header>
  <section className="news-tools" aria-label={text.search}><label className="news-search"><Search size={20}/><input aria-label={text.search} placeholder={text.search} value={search} maxLength={200} onChange={e=>setSearch(e.target.value)}/></label><div className="news-topics"><button aria-pressed={!category} onClick={()=>setCategory('')}>{t('common.all')}</button>{NEWS_CATEGORIES.map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{getPublicCategoryLabel(c,t)}</button>)}</div></section>
  {items.length>0&&<div className="news-grid">{items.map((item,i)=><NewsCard key={item.id} item={item} featured={i===0&&!category&&!term}/>)}</div>}
  {loading&&<p role="status" className="news-state">{text.loading}</p>}
  {error&&<div role="alert" className="news-state"><h2>{text.error}</h2><button onClick={()=>items.length?load(items.length):setRetry(x=>x+1)}>{text.retry}</button></div>}
  {!loading&&!error&&!items.length&&<div className="news-state"><Newspaper size={44}/><h2>{category||term?text.noResults:text.empty}</h2>{(category||term)&&<><p>{text.hint}</p><button onClick={()=>{setCategory('');setSearch('');setTerm('');}}>{text.reset}</button></>}</div>}
  {!loading&&!error&&items.length<total&&<button className="news-more" onClick={()=>{if(!busy.current)void load(items.length);}}>{text.more}</button>}
 </div></div></Layout>;
}
export function NewsDetail() {
 const {id}=useParams();const {text,localized,t,lang}=useNewsText();const [item,setItem]=useState<NewsItem|null>(null);const [related,setRelated]=useState<NewsItem[]>([]);const [state,setState]=useState('loading');const [retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;setItem(null);setRelated([]);setState('loading');
  client.entities.news.get({id:id!}).then(res=>{if(!active)return;if(!res.data?.published){setState('missing');return;}setItem(res.data);setState('ready');}).catch((e:any)=>{if(active)setState(e?.response?.status===404?'missing':'error');});
  client.entities.news.query({query:{published:true},sort:'-created_at',limit:4}).then(res=>{if(active)setRelated((res.data?.items||[]).filter((x:NewsItem)=>String(x.id)!==id).slice(0,3));}).catch(()=>{});
  return()=>{active=false;};
 },[id,retry]);
 const title=item?localized(item,'title'):'';const body=splitNewsContent(item?localized(item,'content')||localized(item,'short_description')||'':'');const lead=item?localized(item,'short_description'):'';const video=youtubeVideo(item?.youtube_url);const minutes=Math.max(1,Math.ceil(body.content.split(/\s+/).filter(Boolean).length/180));
 usePageSeo({title,description:lead||body.content.slice(0,160),image:item?.image_url,type:'article',structuredData:item?{'@context':'https://schema.org','@type':'NewsArticle',headline:title,datePublished:item.created_at,author:{'@type':'Organization',name:'Сортировка 24'},image:item.image_url||'/icon-512.png'}:null});
 async function share(){try{const url=new URL(`/news/${id}`,window.location.origin).href;if(navigator.share)await navigator.share({title,url});else{await navigator.clipboard.writeText(url);toast.success(text.copied);}}catch(e){if((e as Error)?.name!=='AbortError')toast.error(text.error);}}
 return <Layout><div className="news-surface"><div className="news-shell"><Link to="/news" className="news-back"><ChevronLeft size={18}/>{text.back}</Link>
 {state!=='ready'?<div className="news-state" role={state==='error'?'alert':'status'}><h1>{state==='loading'?text.loading:state==='missing'?text.notFound:text.error}</h1>{state==='error'&&<button onClick={()=>setRetry(x=>x+1)}>{text.retry}</button>}</div>:item&&<>
 <article className="news-article"><header><span className="news-category">{getPublicCategoryLabel(item.category,t)}</span><h1>{title}</h1><div className="news-meta"><span>{text.author}</span><time>{item.created_at?formatDate(item.created_at,lang):''}</time><span><Clock size={15}/>{minutes} {text.minutes}</span><button onClick={share}><Share2 size={17}/>{text.share}</button></div>{lead&&<p className="news-lead">{lead}</p>}</header>
 {item.image_url&&<StorageImg objectKey={item.image_url} alt={title} className="news-cover"/>}
 <div className="news-body">{body.content.split(/\n+/).filter(Boolean).map((line,i)=><p key={i}>{line}</p>)}</div>
 {item.gallery_images&&<div className="news-gallery"><StorageGallery keys={item.gallery_images}/></div>}
 {video&&<iframe src={video} title="YouTube" className="news-video" loading="lazy" allowFullScreen/>}
 {body.instagram&&<aside className="news-instagram"><Instagram size={28}/><div><p>{text.source}</p><a href={body.instagram} target="_blank" rel="noopener noreferrer">{text.instagram}<ArrowUpRight size={18}/></a></div></aside>}
 <footer className="news-article-end"><p>{text.end}</p><button onClick={share}><Share2 size={17}/>{text.share}</button><Link to="/news">{text.back}</Link></footer></article>
 {related.length>0&&<section className="news-related"><h2>{text.related}</h2><div className="news-grid">{related.map(x=><NewsCard key={x.id} item={x}/>)}</div></section>}
 </>}
 </div></div></Layout>;
}
