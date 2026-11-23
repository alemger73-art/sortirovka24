import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, MessageCircle, Phone } from 'lucide-react';
import Layout from '@/components/Layout';
import { usePageSeo } from '@/hooks/usePageSeo';
import { track } from '@/lib/analytics';
import { getAccountToken } from '@/lib/accountApi';
import { percent, useful, type UsefulCard, type UsefulResults, type UsefulTeaser } from '@/lib/useful';
import '@/styles/useful.css';

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export function UsefulTeaserCard({ item, big = false, mini = false }: { item: UsefulTeaser; big?: boolean; mini?: boolean }) {
  return <Link to={`/useful/${item.slug}`} className={`uk-teaser${big ? ' uk-teaser--big' : ''}${mini ? ' uk-teaser--mini' : ''}`} onClick={() => track('useful_open', { card: item.slug })}>
    {item.image_url && <img src={item.image_url} alt="" loading="lazy" />}
    <span className="uk-teaser-body">
      {item.badge && <span className="uk-badge">{item.badge}</span>}
      <b>{item.title}</b>
      {big && item.summary && <span className="uk-summary">{item.summary}</span>}
    </span>
  </Link>;
}

function Poll({ card, onResults }: { card: UsefulCard; onResults: (r: UsefulResults) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!card.poll) return null;
  const voted = card.poll_results.mine !== null;
  const choose = async (choice: number) => {
    if (!getAccountToken()) { navigate(`/account?redirect=${encodeURIComponent(location.pathname)}`); return; }
    setBusy(true); setError('');
    try {
      onResults(await useful.vote(card.slug, choice));
      track('useful_vote', { card: card.slug, choice });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не получилось');
    } finally { setBusy(false); }
  };
  return <section className="uk-block uk-poll">
    <h2>{card.poll.question}</h2>
    {card.poll.options.map((option, i) => <button key={option} type="button" disabled={busy} onClick={() => choose(i)}
      className={card.poll_results.mine === i ? 'is-mine' : ''}>
      {voted && <span className="uk-bar" style={{ width: `${percent(card.poll_results, i)}%` }} />}
      <span className="uk-option">{option}</span>
      {voted && <span className="uk-pct">{percent(card.poll_results, i)}%</span>}
    </button>)}
    <p className="uk-note">{voted ? `Проголосовали ${card.poll_results.total} — можно изменить ответ` : getAccountToken() ? 'Нажмите на вариант — увидите, что думают соседи' : 'Войдите, чтобы проголосовать и увидеть результаты'}</p>
    {error && <p className="uk-error">{error}</p>}
  </section>;
}

function CardPage({ slug }: { slug: string }) {
  const [card, setCard] = useState<UsefulCard | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    useful.get(slug).then(c => active && setCard(c)).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [slug]);
  usePageSeo({ title: card ? `${card.title} — Полезно знать` : undefined, description: card?.summary, image: card?.image_url });
  if (failed) return <p className="uk-empty">Карточка не найдена. <Link to="/useful">Все карточки</Link></p>;
  if (!card) return <p className="uk-empty">Загружаем…</p>;
  return <article className="uk-card">
    {card.video_url
      ? <video className="uk-video" src={card.video_url} poster={card.image_url || undefined} controls playsInline preload="metadata"
          onPlay={() => track('useful_video', { card: card.slug })} />
      : card.image_url && <img className="uk-cover" src={card.image_url} alt="" />}
    <div className="uk-head">
      {card.badge && <span className="uk-badge">{card.badge}</span>}
      <h1>{card.title}</h1>
      <p className="uk-meta">Полезно знать · {dateLabel(card.created_at)}</p>
    </div>
    <section className="uk-block"><h2>Что меняется</h2><ul>{card.changes.map(x => <li key={x}>{x}</li>)}</ul></section>
    {(card.actions.length > 0 || card.phones.length > 0) && <section className="uk-block uk-do">
      <h2><CheckCircle2 size={20} />Что делать вам</h2>
      {card.actions.length > 0 && <ul>{card.actions.map(x => <li key={x}>{x}</li>)}</ul>}
      {card.phones.length > 0 && <div className="uk-phones">{card.phones.map(p =>
        <a key={p.number} href={`tel:${p.number}`} onClick={() => track('useful_call', { card: card.slug, number: p.number })}>
          <Phone size={16} /><b>{p.number}</b><small>{p.label}</small></a>)}</div>}
    </section>}
    <Poll card={card} onResults={r => setCard({ ...card, poll_results: r })} />
    {card.discussion_post_id && <Link className="uk-discuss" to={`/dom/post/${card.discussion_post_id}`} onClick={() => track('useful_discuss', { card: card.slug })}>
      <MessageCircle size={20} />Обсудить с соседями</Link>}
    {card.source && <p className="uk-source">Источник: {card.source.url
      ? <a href={card.source.url} target="_blank" rel="noopener noreferrer">{card.source.title}<ExternalLink size={12} /></a>
      : card.source.title}</p>}
  </article>;
}

function ListPage() {
  const [items, setItems] = useState<UsefulTeaser[] | null>(null);
  useEffect(() => { useful.list().then(setItems).catch(() => setItems([])); }, []);
  usePageSeo({ title: 'Полезно знать — Сортировка 24', description: 'Что меняется для жителей Сортировки и что делать: законы, выплаты, тарифы — коротко и по делу.' });
  return <>
    <h1 className="uk-title">💡 Полезно знать</h1>
    <p className="uk-lead">Что меняется для жителей и что с этим делать — коротко и по делу.</p>
    {items === null ? <p className="uk-empty">Загружаем…</p> : items.length === 0 ? <p className="uk-empty">Скоро здесь появятся первые карточки.</p>
      : <div className="uk-list">{items.map((item, i) => <UsefulTeaserCard key={item.slug} item={item} big={i === 0} />)}</div>}
  </>;
}

export default function UsefulPage() {
  const { slug } = useParams();
  return <Layout><div className="uk-page">
    <Link to={slug ? '/useful' : '/'} className="uk-back"><ArrowLeft size={16} />{slug ? 'Полезно знать' : 'На главную'}</Link>
    {slug ? <CardPage slug={slug} /> : <ListPage />}
  </div></Layout>;
}
