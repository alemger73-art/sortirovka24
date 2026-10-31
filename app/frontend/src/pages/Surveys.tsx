/**
 * Опросы за бонусы.
 * /surveys — active surveys with their reward; /surveys/:id — one question per screen, then the bonus.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardList, Gift, Loader2, Lock, ShieldCheck, Timer } from 'lucide-react';
import Layout from '@/components/Layout';
import { getAccountToken } from '@/lib/accountApi';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageSeo } from '@/hooks/usePageSeo';
import { answered, surveyApi, type Answer, type Question, type SubmitResult, type SurveyCard, type SurveyOpen } from '@/lib/surveys';
import '@/styles/survey.css';

type Say = (ru: string, kz: string) => string;
function useSay(): Say {
  const { lang } = useLanguage();
  return (ru, kz) => (lang === 'kz' ? kz : ru);
}
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось, попробуйте ещё раз');
const SCALE = [1, 2, 3, 4, 5];

/* ============================== /surveys ============================== */
export function SurveysPage() {
  const say = useSay();
  usePageSeo({ title: 'Опросы за бонусы — Сортировка 24', description: 'Ответьте на короткий опрос о районе и получите 500 бонусов на еду в DÄM ALEM.' });
  const [items, setItems] = useState<SurveyCard[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { surveyApi.list().then((r) => setItems(r.items)).catch((e) => setError(errText(e))); }, []);
  const open = items?.filter((s) => !s.done) || [];
  const done = items?.filter((s) => s.done) || [];

  return (
    <Layout>
      <div className="sv">
        <header className="sv-hero">
          <div className="sv-w">
            <span className="sv-kicker">{say('Сортировка 24', 'Сортировка 24')}</span>
            <h1>{say('Опросы за бонусы', 'Бонусқа сауалнама')}</h1>
            <p>{say('Ответьте на пару вопросов о районе — бонусы сразу придут на счёт. Ими можно оплатить еду в DÄM ALEM.',
              'Аудан туралы бірнеше сұраққа жауап беріңіз — бонустар бірден шотқа түседі. Олармен DÄM ALEM-де тамақ төлеуге болады.')}</p>
          </div>
        </header>
        <div className="sv-w sv-pad">
          {error && <p className="sv-error" role="alert">{error}</p>}
          {!items && !error && <div className="sv-skel" aria-label={say('Загрузка', 'Жүктелуде')}><span /><span /></div>}
          {items && !open.length && (
            <div className="sv-empty">
              <ClipboardList size={30} />
              <b>{say('Сейчас новых опросов нет', 'Қазір жаңа сауалнама жоқ')}</b>
              <p>{say('Загляните позже — о новых опросах пишем в «Сортировка Официал».', 'Кейін кіріңіз — жаңа сауалнамалар туралы «Сортировка Официал»-да жазамыз.')}</p>
            </div>
          )}
          {open.map((s) => (
            <Link key={s.id} to={`/surveys/${s.id}`} className="sv-card" data-testid="survey-card">
              <div className="sv-card-top">
                {s.reward > 0 ? <span className="sv-reward"><Gift size={16} />+{s.reward} {say('бонусов', 'бонус')}</span> : <span className="sv-reward sv-reward--off">{say('Без бонуса', 'Бонуссыз')}</span>}
                <span className="sv-meta"><Timer size={14} />{s.minutes} {say('мин', 'мин')} · {s.questions} {say('вопр.', 'сұрақ')}</span>
              </div>
              <h2>{s.title}</h2>
              {s.intro && <p>{s.intro}</p>}
              {s.places_left !== null && s.places_left > 0 && s.places_left <= 50 && <span className="sv-left">{say(`Осталось мест с бонусом: ${s.places_left}`, `Бонусты орын қалды: ${s.places_left}`)}</span>}
              <span className="sv-go">{say('Пройти', 'Өту')}<ArrowRight size={18} /></span>
            </Link>
          ))}
          {done.length > 0 && (
            <section className="sv-done-list">
              <h3>{say('Вы уже прошли', 'Сіз өттіңіз')}</h3>
              {done.map((s) => <p key={s.id}><CheckCircle2 size={16} />{s.title}</p>)}
            </section>
          )}
          <ul className="sv-rules">
            <li><ShieldCheck size={18} />{say('Ответы анонимные: мы видим только общие цифры, без имён и телефонов.', 'Жауаптар жасырын: аты-жөні мен телефонсыз тек жалпы сандарды көреміз.')}</li>
            <li><Gift size={18} />{say('Один опрос — один бонус на человека. Бонусы действуют 30 дней.', 'Бір сауалнама — бір адамға бір бонус. Бонустар 30 күн жарамды.')}</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}

/* ============================== /surveys/:id ============================== */
export function SurveyRunPage() {
  const say = useSay();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const authed = Boolean(getAccountToken());
  const [survey, setSurvey] = useState<SurveyOpen | null>(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(-1); // -1 = intro
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  usePageSeo({ title: `${survey?.title || 'Опрос'} — Сортировка 24`, description: 'Короткий опрос жителей Сортировки за бонусы.' });

  const load = useCallback(() => {
    setError('');
    surveyApi.open(id).then(setSurvey).catch((e) => setError(errText(e)));
  }, [id]);
  useEffect(() => { if (authed && id) load(); }, [authed, id, load]);

  const questions = survey?.questions || [];
  const q = questions[step];
  const canNext = useMemo(() => !q || !q.required || answered(q, answers[q.id]), [q, answers]);
  const setAnswer = (a: Answer) => q && setAnswers((all) => ({ ...all, [q.id]: a }));

  async function submit() {
    if (!survey) return;
    setSending(true); setError('');
    try { setResult(await surveyApi.submit(survey.id, answers)); window.scrollTo({ top: 0 }); }
    catch (e) { setError(errText(e)); }
    finally { setSending(false); }
  }

  if (!authed) {
    return (
      <Layout><div className="sv"><div className="sv-w sv-pad">
        <div className="sv-panel sv-center">
          <Lock size={30} />
          <h1>{say('Войдите, чтобы пройти опрос', 'Сауалнамадан өту үшін кіріңіз')}</h1>
          <p>{say('Бонус начисляется на ваш аккаунт — так он не потеряется. Вход по номеру телефона, это минута.', 'Бонус аккаунтыңызға түседі. Телефон нөмірі арқылы кіру — бір минут.')}</p>
          <Link className="sv-btn sv-btn--main" to={`/account?redirect=${encodeURIComponent(`/surveys/${id}`)}`} data-testid="survey-login">{say('Войти', 'Кіру')}</Link>
        </div>
      </div></div></Layout>
    );
  }
  if (error && !survey) {
    return (
      <Layout><div className="sv"><div className="sv-w sv-pad">
        <div className="sv-panel sv-center">
          <p className="sv-error" role="alert">{error}</p>
          <Link className="sv-btn sv-btn--ghost" to="/surveys">{say('Все опросы', 'Барлық сауалнама')}</Link>
        </div>
      </div></div></Layout>
    );
  }
  if (!survey) return <Layout><div className="sv"><div className="sv-w sv-pad"><div className="sv-skel"><span /><span /></div></div></div></Layout>;

  if (result || survey.done) {
    const ok = result ? result.rewarded > 0 : false;
    return (
      <Layout><div className="sv"><div className="sv-w sv-pad">
        <div className={`sv-panel sv-center sv-finish${ok ? ' is-bonus' : ''}`} data-testid="survey-finish">
          {ok ? <span className="sv-bonus-big">+{result!.rewarded}</span> : <CheckCircle2 size={40} />}
          <h1>{result ? say('Спасибо за ответы!', 'Жауаптарыңызға рахмет!') : say('Вы уже прошли этот опрос', 'Сіз бұл сауалнамадан өттіңіз')}</h1>
          {result && <p>{result.message}</p>}
          <div className="sv-row">
            {ok && <Link className="sv-btn sv-btn--main" to="/food">{say('Потратить в DÄM ALEM', 'DÄM ALEM-де жұмсау')}</Link>}
            <Link className="sv-btn sv-btn--ghost" to="/surveys">{say('Другие опросы', 'Басқа сауалнамалар')}</Link>
          </div>
        </div>
      </div></div></Layout>
    );
  }

  if (step < 0) {
    return (
      <Layout><div className="sv"><div className="sv-w sv-pad">
        <button type="button" className="sv-back" onClick={() => navigate('/surveys')}><ArrowLeft size={18} />{say('Все опросы', 'Барлық сауалнама')}</button>
        <div className="sv-panel">
          {survey.reward > 0 && <span className="sv-reward"><Gift size={16} />+{survey.reward} {say('бонусов в DÄM ALEM', 'DÄM ALEM бонусы')}</span>}
          <h1 className="sv-title">{survey.title}</h1>
          {survey.intro && <p className="sv-intro">{survey.intro}</p>}
          <ul className="sv-rules">
            <li><ClipboardList size={18} />{say(`${questions.length} вопросов, примерно ${Math.max(1, Math.round(questions.length * 15 / 60))} мин.`, `${questions.length} сұрақ, шамамен ${Math.max(1, Math.round(questions.length * 15 / 60))} мин.`)}</li>
            <li><ShieldCheck size={18} />{say('Ответы анонимные. Отвечайте честно — слишком быстрые ответы бонус не получают.', 'Жауаптар жасырын. Шын жауап беріңіз — тым жылдам жауаптарға бонус берілмейді.')}</li>
          </ul>
          {!survey.phone_verified && survey.reward > 0 && (
            <p className="sv-warn">{say('Чтобы получить бонус, подтвердите номер телефона: ', 'Бонус алу үшін телефон нөмірін растаңыз: ')}
              <Link to="/cabinet?tab=settings">{say('кабинет → настройки', 'кабинет → баптаулар')}</Link></p>
          )}
          <button type="button" className="sv-btn sv-btn--main" onClick={() => setStep(0)} data-testid="survey-start">{say('Начать', 'Бастау')}<ArrowRight size={18} /></button>
        </div>
      </div></div></Layout>
    );
  }

  const last = step === questions.length - 1;
  return (
    <Layout><div className="sv"><div className="sv-w sv-pad">
      <div className="sv-progress" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={step + 1}
        aria-label={say(`Вопрос ${step + 1} из ${questions.length}`, `${questions.length} сұрақтың ${step + 1}-сі`)}>
        <span style={{ width: `${((step + 1) / questions.length) * 100}%` }} />
      </div>
      <p className="sv-step">{say(`Вопрос ${step + 1} из ${questions.length}`, `${questions.length} сұрақтың ${step + 1}-сі`)}</p>
      <div className="sv-panel" key={q.id}>
        <h2 className="sv-q">{q.text}{!q.required && <span className="sv-optional"> · {say('можно пропустить', 'өткізуге болады')}</span>}</h2>
        {q.type === 'multi' && <p className="sv-hint">{say('Можно выбрать несколько', 'Бірнешеуін таңдауға болады')}</p>}
        <QuestionInput q={q} value={answers[q.id]} onChange={setAnswer} say={say} />
      </div>
      {error && <p className="sv-error" role="alert">{error}</p>}
      <div className="sv-nav">
        <button type="button" className="sv-btn sv-btn--ghost" onClick={() => setStep((s) => s - 1)}><ArrowLeft size={18} />{say('Назад', 'Артқа')}</button>
        {last
          ? <button type="button" className="sv-btn sv-btn--main" disabled={!canNext || sending} onClick={() => void submit()} data-testid="survey-send">
              {sending ? <Loader2 className="sv-spin" size={18} /> : <Check size={18} />}{say('Отправить', 'Жіберу')}</button>
          : <button type="button" className="sv-btn sv-btn--main" disabled={!canNext} onClick={() => setStep((s) => s + 1)} data-testid="survey-next">
              {say('Дальше', 'Келесі')}<ArrowRight size={18} /></button>}
      </div>
    </div></div></Layout>
  );
}

function QuestionInput({ q, value, onChange, say }: { q: Question; value: Answer | undefined; onChange: (a: Answer) => void; say: Say }) {
  const choices = value?.choices || [];
  if (q.type === 'scale') {
    return (
      <div className="sv-scale" role="radiogroup" aria-label={q.text}>
        <div className="sv-scale-row">
          {SCALE.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={value?.value === n} className={value?.value === n ? 'is-on' : ''} onClick={() => onChange({ value: n })}>{n}</button>
          ))}
        </div>
        <div className="sv-scale-ends"><span>1 — {q.low}</span><span>5 — {q.high}</span></div>
      </div>
    );
  }
  if (q.type === 'text') {
    return <textarea className="sv-text" rows={4} maxLength={2000} value={value?.text || ''} placeholder={say('Ваш ответ', 'Жауабыңыз')}
      aria-label={q.text} onChange={(e) => onChange({ text: e.target.value })} />;
  }
  const multi = q.type === 'multi';
  const toggle = (i: number) => onChange(multi
    ? { ...value, choices: choices.includes(i) ? choices.filter((c) => c !== i) : [...choices, i] }
    : { choices: [i] });
  return (
    <div className="sv-options" role={multi ? 'group' : 'radiogroup'} aria-label={q.text}>
      {q.options!.map((label, i) => {
        const on = choices.includes(i);
        return (
          <button key={i} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} className={`sv-option${on ? ' is-on' : ''}`} onClick={() => toggle(i)}>
            <span className={`sv-tick${multi ? ' is-square' : ''}`}>{on && <Check size={14} />}</span>{label}
          </button>
        );
      })}
      {q.other && (
        <input className="sv-other" maxLength={300} value={value?.other || ''} placeholder={say('Свой вариант', 'Өз нұсқаңыз')} aria-label={say('Свой вариант', 'Өз нұсқаңыз')}
          onChange={(e) => onChange(multi ? { ...value, choices, other: e.target.value } : { choices: e.target.value.trim() ? [] : choices, other: e.target.value })} />
      )}
    </div>
  );
}
