import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Play } from 'lucide-react';
import Layout from '@/components/Layout';
import { usePageSeo } from '@/hooks/usePageSeo';
import { track } from '@/lib/analytics';
import { useLanguage } from '@/contexts/LanguageContext';
import { inLang, loadInstructions, type GuideLang, type Instruction } from '@/lib/instructions';
import '@/styles/instructions.css';

const SUPPORT_WA = 'https://wa.me/77004280280';

export function InstructionItem({ item }: { item: Instruction }) {
  const guide = inLang(item, useLanguage().lang === 'kz' ? 'kz' : 'ru');
  return <Link to={`/instructions/${item.slug}`} className="ins-item" onClick={() => track('instruction_open', { guide: item.slug })}>
    <span className="ins-thumb"><img src={guide.poster} alt="" loading="lazy" /><span><Play size={26} fill="currentColor" /></span>{guide.duration && <small>{guide.duration}</small>}</span>
    <span><b>{guide.title}</b><p>{guide.summary}</p></span>
  </Link>;
}

const LANG_NAMES: Record<GuideLang, string> = { ru: 'Русский', kz: 'Қазақша' };

function GuidePage({ item }: { item: Instruction }) {
  const siteLang: GuideLang = useLanguage().lang === 'kz' ? 'kz' : 'ru';
  const [lang, setLang] = useState<GuideLang>(siteLang);
  const guide = inLang(item, lang);
  const kz = lang === 'kz' && !!item.kz;
  usePageSeo({ title: `${item.title} — Инструкции`, description: item.summary, image: item.poster });
  return <article>
    {item.kz && <div className="ins-langs" role="group" aria-label="Язык видео / Бейне тілі">
      {(['ru', 'kz'] as const).map(code => <button key={code} type="button" aria-pressed={lang === code}
        onClick={() => { setLang(code); track('instruction_lang', { guide: item.slug, lang: code }); }}>{LANG_NAMES[code]}</button>)}
    </div>}
    <video key={guide.video} className="ins-video" src={guide.video} poster={guide.poster} controls playsInline preload="metadata"
      onPlay={() => track('instruction_play', { guide: item.slug, lang })} />
    <h1 className="ins-h1">{guide.title}</h1>
    {guide.steps.length > 0 && <ol className="ins-steps">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol>}
    <a className="ins-help" href={SUPPORT_WA} target="_blank" rel="noopener noreferrer"><MessageCircle size={20} />{kz ? 'Шықпады ма? Бізге жазыңыз' : 'Не получилось? Напишите нам'}</a>
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
