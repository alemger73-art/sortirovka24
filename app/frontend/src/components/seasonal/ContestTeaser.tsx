/** Home-page invitation to the «Новогодняя Сортировка» contest; shown only while entries or votes are open. */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { contestApi, dayLabel, type ContestView } from '@/lib/contest';

export default function ContestTeaser() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const [view, setView] = useState<ContestView | null>(null);
  useEffect(() => { contestApi.view().then(setView).catch(() => undefined); }, []);
  if (!view || !['apply', 'wait', 'vote'].includes(view.phase)) return null;
  const s = view.settings;
  const text = view.phase === 'apply'
    ? (kz ? `Өтінімдер ${dayLabel(s.apply_to, true)} дейін` : `Заявки до ${dayLabel(s.apply_to, false)}`)
    : view.phase === 'vote'
      ? (kz ? `Дауыс беру ${dayLabel(s.vote_to, true)} дейін` : `Голосование до ${dayLabel(s.vote_to, false)}`)
      : (kz ? `Дауыс беру ${dayLabel(s.vote_from, true)} басталады` : `Голосование с ${dayLabel(s.vote_from, false)}`);
  return (
    <Link to="/konkurs" className="kn-teaser">
      <span className="kn-teaser-icon" aria-hidden="true"><Trophy size={22} /></span>
      <span className="kn-teaser-text">
        <strong>{kz ? 'Ең жаңажылдық аула мен үй' : 'Самый новогодний двор и дом'}</strong>
        <small>{text}. {kz ? 'Жеңімпаздарға — сыйлық' : 'Победителям — подарки'}</small>
      </span>
      <span className="kn-teaser-cta">{view.phase === 'vote' ? (kz ? 'Дауыс беру' : 'Голосовать') : (kz ? 'Қатысу' : 'Участвовать')}</span>
    </Link>
  );
}
