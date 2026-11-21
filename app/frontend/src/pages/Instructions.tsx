import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Play } from 'lucide-react';
import Layout from '@/components/Layout';
import { usePageSeo } from '@/hooks/usePageSeo';
import { track } from '@/lib/analytics';
import { loadInstructions, type Instruction } from '@/lib/instructions';
import '@/styles/instructions.css';

const SUPPORT_WA = 'https://wa.me/77004280280';

export function InstructionItem({ item }: { item: Instruction }) {
  return <Link to={`/instructions/${item.slug}`} className="ins-item" onClick={() => track('instruction_open', { guide: item.slug })}>
    <span className="ins-thumb"><img src={item.poster} alt="" loading="lazy" /><span><Play size={26} fill="currentColor" /></span><small>{item.duration}</small></span>
    <span><b>{item.title}</b><p>{item.summary}</p></span>
  </Link>;
}

function GuidePage({ item }: { item: Instruction }) {
  usePageSeo({ title: `${item.title} — Инструкции`, description: item.summary, image: item.poster });
  return <article>
    <video className="ins-video" src={item.video} poster={item.poster} controls playsInline preload="metadata"
      onPlay={() => track('instruction_play', { guide: item.slug })} />
    <h1 className="ins-h1">{item.title}</h1>
    {item.steps.length > 0 && <ol className="ins-steps">{item.steps.map(step => <li key={step}>{step}</li>)}</ol>}
    <a className="ins-help" href={SUPPORT_WA} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} />Не получилось? Напишите нам</a>
  </article>;
}

export default function InstructionsPage() {
  const { slug } = useParams();
  const [items, setItems] = useState<Instruction[] | null>(null);
  useEffect(() => { loadInstructions().then(setItems); }, []);
  usePageSeo(slug ? {} : { title: 'Инструкции — Сортировка 24', description: 'Короткие видео по шагам: как установить приложение и пользоваться Сортировка 24.' });
  const item = slug && items ? items.find(i => i.slug === slug) : undefined;
  return <Layout><div className="ins-page">
    <Link to={slug ? '/instructions' : '/more'} className="ins-back"><ArrowLeft size={16} />{slug ? 'Все инструкции' : 'Назад'}</Link>
    {items === null ? <p className="ins-empty">Загружаем…</p>
      : slug ? (item ? <GuidePage item={item} /> : <p className="ins-empty">Инструкция не найдена. <Link to="/instructions">Все инструкции</Link></p>)
      : <>
        <h1 className="ins-title">📺 Инструкции</h1>
        <p className="ins-lead">Короткие видео по шагам — как всё устроено на Сортировке 24.</p>
        <div className="ins-list">{items.map(i => <InstructionItem key={i.slug} item={i} />)}</div>
      </>}
  </div></Layout>;
}
