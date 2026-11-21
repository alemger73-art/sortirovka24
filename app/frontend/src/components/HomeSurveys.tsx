/** Home: a bonus banner while a survey is running (hidden when there is nothing left to answer). */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { surveyApi, type SurveyCard } from '@/lib/surveys';

export default function HomeSurveys() {
  const { lang } = useLanguage();
  const say = (ru: string, kz: string) => (lang === 'kz' ? kz : ru);
  const [survey, setSurvey] = useState<SurveyCard | null>(null);
  useEffect(() => {
    surveyApi.list().then((r) => setSurvey(r.items.find((s) => !s.done && s.reward > 0) || null)).catch(() => setSurvey(null));
  }, []);
  if (!survey) return null;
  return (
    <section className="home-duo-tile" aria-label={say('Опрос за бонусы', 'Бонусқа сауалнама')}>
      <Link to={`/surveys/${survey.id}`} data-testid="home-survey"
        className="flex h-full flex-col gap-2 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 p-3.5 text-white shadow-md transition hover:shadow-lg active:scale-[.99] md:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20"><Gift size={26} /></span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] leading-tight md:text-lg">{say(`+${survey.reward} бонусов за опрос`, `Сауалнама үшін +${survey.reward} бонус`)}</b>
          <span className="mt-1 line-clamp-2 block text-xs text-white/85">{survey.title} · {survey.minutes} {say('мин', 'мин')}</span>
        </span>
      </Link>
    </section>
  );
}
