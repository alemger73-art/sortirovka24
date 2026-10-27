/** The invitation itself: what guests see. Used on the public page, in the builder preview and as examples. */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { KIND_INFO, dateParts, eventTime, kzAnd, type ToyData } from '@/lib/toyInvites';
import '@/styles/toy.css';

type Lang = 'kz' | 'ru';
export type RsvpPayload = { name: string; coming: boolean; guests: number; wish: string };

const UI: Record<Lang, Record<string, string>> = {
  kz: { and: '', days: 'күн', hours: 'сағат', mins: 'минут', secs: 'секунд', place: 'Той өтетін орын', map: 'Картадан ашу', copy: 'Мекенжайды көшіру', copied: 'Көшірілді',
    program: 'Той бағдарламасы', hosts: 'Той иелері', rsvp: 'Келетініңізді растаңыз', name: 'Аты-жөніңіз', yes: 'Келемін', no: 'Келе алмаймын', count: 'Неше адам келеді',
    wish: 'Тілегіңіз (міндетті емес)', send: 'Жауап жіберу', sending: 'Жіберілуде…', again: 'Жауапты өзгерту', thanks: 'Рақмет!', errName: 'Аты-жөніңізді жазыңыз',
    errSend: 'Жіберілмеді. Интернетті тексеріп, қайталап көріңіз.', yesText: '{n}, сізді күтеміз! Қонақ саны: {g}.', noText: '{n}, өкінішті. Жауап бергеніңізге рақмет!',
    foot: 'Шақыру «Сортировка 24» сервисінде жасалды', make: 'Өз шақыруыңызды жасау →', ex: 'Мысалы: Ерлан Серікұлы', demoAnswer: 'Бұл — үлгі. Нағыз шақыруда жауап той иесіне жетеді.' },
  ru: { and: 'и', days: 'дней', hours: 'часов', mins: 'минут', secs: 'секунд', place: 'Место проведения', map: 'Открыть на карте', copy: 'Скопировать адрес', copied: 'Скопировано',
    program: 'Программа вечера', hosts: 'Хозяева тоя', rsvp: 'Подтвердите участие', name: 'Ваше имя', yes: 'Приду', no: 'Не смогу прийти', count: 'Сколько человек придёт',
    wish: 'Пожелание (необязательно)', send: 'Отправить ответ', sending: 'Отправляем…', again: 'Изменить ответ', thanks: 'Спасибо!', errName: 'Напишите ваше имя',
    errSend: 'Не отправилось. Проверьте интернет и попробуйте ещё раз.', yesText: '{n}, ждём вас! Гостей: {g}.', noText: '{n}, жаль, что не получится. Спасибо, что ответили!',
    foot: 'Приглашение создано в сервисе «Сортировка 24»', make: 'Создать своё приглашение →', ex: 'Например: Ерлан Серикович', demoAnswer: 'Это пример. В настоящем приглашении ответ уходит хозяину тоя.' },
};

let fontsLoaded = false;
function loadFonts() {
  if (fontsLoaded || typeof document === 'undefined') return;
  fontsLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Montserrat:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

function Shanyrak() {
  const poles = [[120, 42, 120, 8], [120, 198, 120, 232], [42, 120, 8, 120], [198, 120, 232, 120], [65, 65, 41, 41], [175, 65, 199, 41], [65, 175, 41, 199], [175, 175, 199, 199],
    [90, 48, 78, 16], [150, 48, 162, 16], [90, 192, 78, 224], [150, 192, 162, 224], [48, 90, 16, 78], [48, 150, 16, 162], [192, 90, 224, 78], [192, 150, 224, 162]];
  return (
    <svg className="toy-shanyrak" viewBox="0 0 240 240" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <circle cx="120" cy="120" r="112" strokeOpacity=".25" />
        <g className="spin"><circle cx="120" cy="120" r="96" strokeWidth="1.5" strokeDasharray="2 7" strokeOpacity=".7" /></g>
        <circle cx="120" cy="120" r="78" strokeWidth="2" />
        <circle cx="120" cy="120" r="70" strokeOpacity=".6" />
        <path d="M120 50 Q 150 120 120 190 M120 50 Q 90 120 120 190 M50 120 Q 120 150 190 120 M50 120 Q 120 90 190 120" strokeWidth="2" />
        <g strokeWidth="1.2" strokeOpacity=".75">{poles.map(([a, b, c, d]) => <line key={`${a}-${b}-${c}`} x1={a} y1={b} x2={c} y2={d} />)}</g>
      </g>
    </svg>
  );
}
function Ornament() {
  return (
    <svg className="toy-orn" viewBox="0 0 180 28" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M90 22 C 90 10, 78 4, 70 9 C 63 13, 66 22, 73 20 C 78 18, 76 12, 72 13" />
      <path d="M90 22 C 90 10, 102 4, 110 9 C 117 13, 114 22, 107 20 C 102 18, 104 12, 108 13" />
      <path d="M8 22 H 60 M120 22 H 172" strokeOpacity=".5" />
    </g></svg>
  );
}

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  let s = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
  return { d, h, m, s };
}

export default function ToyInviteView({ data, onRsvp, previewNote, demo, startLang, showFooter = true }: {
  data: ToyData; onRsvp?: (p: RsvpPayload) => Promise<void>; previewNote?: string; demo?: boolean; startLang?: Lang; showFooter?: boolean;
}) {
  useEffect(loadFonts, []);
  const fixed: Lang | null = data.langs === 'kz' ? 'kz' : data.langs === 'ru' ? 'ru' : null;
  const [lang, setLang] = useState<Lang>(fixed || startLang || 'kz');
  useEffect(() => { if (fixed) setLang(fixed); }, [fixed]);
  const t = UI[lang];
  const info = KIND_INFO[data.kind] || KIND_INFO.wedding;
  const dp = dateParts(data.date, lang);
  const when = useMemo(() => eventTime(data), [data.date, data.time]); // eslint-disable-line react-hooks/exhaustive-deps
  const left = useCountdown(when);
  const pad = (n: number) => String(n).padStart(2, '0');
  const lead = lang === 'kz' ? data.text_kz : data.text_ru;
  const and = lang === 'kz' ? kzAnd(data.name1) : t.and;
  const program = data.program.filter((p) => (lang === 'kz' ? p.kz : p.ru) || p.kz || p.ru);

  const [copied, setCopied] = useState(false);
  async function copyAddress() {
    try { await navigator.clipboard.writeText([data.place, data.address].filter(Boolean).join(', ')); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* not allowed */ }
  }

  // Guest answer.
  const [name, setName] = useState('');
  const [coming, setComing] = useState(true);
  const [guests, setGuests] = useState(1);
  const [wish, setWish] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) { setError(t.errName); return; }
    setError(''); setSending(true);
    try { if (onRsvp) await onRsvp({ name: name.trim(), coming, guests, wish: wish.trim() }); setDone(true); }
    catch (err: any) { setError(err?.message && !/^HTTP/.test(err.message) ? err.message : t.errSend); }
    finally { setSending(false); }
  }
  const mapHref = data.map_url || (data.address || data.place ? `https://2gis.kz/karaganda/search/${encodeURIComponent([data.place, data.address].filter(Boolean).join(' '))}` : '');

  return (
    <div className="toy-card" data-theme-name={data.theme} lang={lang === 'kz' ? 'kk' : 'ru'}>
      <div className="toy-col">
        <div className="toy-top">
          {demo ? <span className="demo">{lang === 'kz' ? 'Үлгі' : 'Пример'} · Сортировка 24</span> : <span />}
          {!fixed && (
            <div className="toy-lang" role="group" aria-label="Тіл / Язык">
              <button type="button" aria-pressed={lang === 'kz'} onClick={() => setLang('kz')}>ҚАЗ</button>
              <button type="button" aria-pressed={lang === 'ru'} onClick={() => setLang('ru')}>РУС</button>
            </div>
          )}
        </div>
        {previewNote && <p className="toy-preview-note" role="status">{previewNote}</p>}

        <header className="toy-hero">
          {data.photo ? <div className="toy-photo"><img src={data.photo} alt="" /></div> : <Shanyrak />}
          <p className="toy-kicker">{info.kicker[lang]}</p>
          <h1 className="toy-names">
            {data.name1 || (lang === 'kz' ? 'Есім' : 'Имя')}
            {info.two && <><span className="amp">{and}</span>{data.name2 || (lang === 'kz' ? 'Есім' : 'Имя')}</>}
          </h1>
          {lead && <p className="toy-lead">{lead}</p>}
          <Ornament />
          <div className="toy-date" aria-label={`${dp.day} ${dp.monthGen} ${dp.year}, ${data.time}`}>
            <div className="side">{dp.month}</div>
            <div className="day">{dp.day}</div>
            <div className="side">{dp.weekday} · {data.time}</div>
          </div>
          <div className="toy-count" role="timer" aria-label={lang === 'kz' ? 'Тойға дейін' : 'До тоя'}>
            <div><b>{left.d}</b><span>{t.days}</span></div>
            <div><b>{pad(left.h)}</b><span>{t.hours}</span></div>
            <div><b>{pad(left.m)}</b><span>{t.mins}</span></div>
            <div><b>{pad(left.s)}</b><span>{t.secs}</span></div>
          </div>
        </header>

        {(data.place || data.address) && (
          <section className="toy-sec">
            <h2>{t.place}</h2>
            <div className="toy-panel toy-place">
              {data.place && <b>{data.place}</b>}
              {data.address && <p>{data.address}</p>}
              <div className="toy-actions">
                {mapHref && <a className="toy-btn solid" href={mapHref} target="_blank" rel="noopener noreferrer">{t.map}</a>}
                <button type="button" className="toy-btn" onClick={() => void copyAddress()}>{copied ? t.copied : t.copy}</button>
              </div>
            </div>
          </section>
        )}

        {program.length > 0 && (
          <section className="toy-sec">
            <h2>{t.program}</h2>
            <div className="toy-panel">
              <ol className="toy-program">
                {program.map((p, i) => <li key={i}><time>{p.time}</time><span>{(lang === 'kz' ? p.kz : p.ru) || p.kz || p.ru}</span></li>)}
              </ol>
            </div>
          </section>
        )}

        {data.hosts && (
          <section className="toy-sec toy-hosts">
            <h2>{t.hosts}</h2>
            <b>{data.hosts}</b>
          </section>
        )}

        <section className="toy-sec">
          <h2>{t.rsvp}</h2>
          <div className="toy-panel">
            {done ? (
              <div className="toy-thanks" role="status">
                <b>{t.thanks}</b>
                <p>{(coming ? t.yesText : t.noText).replace('{n}', name.trim()).replace('{g}', String(guests))}</p>
                {!onRsvp && <p>{t.demoAnswer}</p>}
                <div className="toy-actions" style={{ justifyContent: 'center' }}><button type="button" className="toy-btn" onClick={() => setDone(false)}>{t.again}</button></div>
              </div>
            ) : (
              <form className="toy-form" onSubmit={(e) => void submit(e)} noValidate>
                <label htmlFor="toy-guest-name">{t.name}
                  <input id="toy-guest-name" value={name} maxLength={80} autoComplete="name" placeholder={t.ex} onChange={(e) => setName(e.target.value)} />
                </label>
                <div className="toy-choice" role="group" aria-label={t.rsvp}>
                  <button type="button" aria-pressed={coming} onClick={() => setComing(true)}>{t.yes}</button>
                  <button type="button" aria-pressed={!coming} onClick={() => setComing(false)}>{t.no}</button>
                </div>
                {coming && (
                  <div className="toy-form-row">
                    <span style={{ display: 'block', fontSize: 13, color: 'var(--t-mist)', marginBottom: 6 }}>{t.count}</span>
                    <div className="toy-step">
                      <button type="button" aria-label="−" onClick={() => setGuests((g) => Math.max(1, g - 1))}>−</button>
                      <output aria-live="polite">{guests}</output>
                      <button type="button" aria-label="+" onClick={() => setGuests((g) => Math.min(10, g + 1))}>+</button>
                    </div>
                  </div>
                )}
                <label htmlFor="toy-guest-wish">{t.wish}
                  <textarea id="toy-guest-wish" value={wish} maxLength={400} onChange={(e) => setWish(e.target.value)} />
                </label>
                {error && <p className="toy-err" role="alert">{error}</p>}
                <button type="submit" className="toy-btn solid" disabled={sending} data-testid="toy-rsvp-send">{sending ? t.sending : t.send}</button>
              </form>
            )}
          </div>
        </section>

        {showFooter && (
          <footer className="toy-foot">
            <p>{t.foot}</p>
            <p><a href="/toy">{t.make}</a></p>
          </footer>
        )}
      </div>
    </div>
  );
}
