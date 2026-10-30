/**
 * The invitation itself: what guests see. Used on the public page, in the builder preview and as examples.
 * Premium parts: an envelope that opens with a tap (and starts the music — browsers allow sound only after a tap),
 * original background music, falling petals / gold sparkles, a full-screen cover photo, gallery, our story, add-to-calendar.
 * The envelope is the one big moment: the flap opens, the card slides out and becomes the page. Everything respects «reduce motion».
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { KIND_INFO, MUSIC_INFO, dateParts, eventTime, kzAnd, photoUrl, type ToyData } from '@/lib/toyInvites';
import { GoldDefs, OyuDivider, OyuFrame, Shanyrak } from '@/components/toy/ToyOrnaments';
// Fonts ship with the site (both have Kazakh letters ә ғ қ ң ө ұ ү һ і) — no waiting for Google Fonts on a slow phone.
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/600.css';
import '@/styles/toy.css';

type Lang = 'kz' | 'ru';
export type RsvpPayload = { name: string; coming: boolean; guests: number; wish: string };

const UI: Record<Lang, Record<string, string>> = {
  kz: { and: '', days: 'күн', hours: 'сағат', mins: 'минут', secs: 'секунд', place: 'Той өтетін орын', map: 'Картадан ашу', copy: 'Мекенжайды көшіру', copied: 'Көшірілді',
    program: 'Той бағдарламасы', hosts: 'Той иелері', rsvp: 'Келетініңізді растаңыз', name: 'Аты-жөніңіз', yes: 'Келемін', no: 'Келе алмаймын', count: 'Неше адам келеді',
    wish: 'Тілегіңіз (міндетті емес)', send: 'Жауап жіберу', sending: 'Жіберілуде…', again: 'Жауапты өзгерту', thanks: 'Рақмет!', errName: 'Аты-жөніңізді жазыңыз',
    errSend: 'Жіберілмеді. Интернетті тексеріп, қайталап көріңіз.', yesText: '{n}, сізді күтеміз! Қонақ саны: {g}.', noText: '{n}, өкінішті. Жауап бергеніңізге рақмет!',
    foot: 'Шақыру «Сортировка 24» сервисінде жасалды', make: 'Өз шақыруыңызды жасау →', ex: 'Мысалы: Ерлан Серікұлы', demoAnswer: 'Бұл — үлгі. Нағыз шақыруда жауап той иесіне жетеді.',
    invited: 'Сіз тойға шақырылдыңыз', open: 'Шақыруды ашу', tap: 'Ашу үшін мөрді басыңыз', withMusic: 'музыкамен', musicOn: 'Музыканы қосу', musicOff: 'Музыканы өшіру',
    gallery: 'Біздің сәттер', galleryOne: 'Фотосуреттер', story: 'Біздің тарихымыз', calendar: 'Күнтізбеге қосу', untilToy: 'Тойға дейін', close: 'Жабу' },
  ru: { and: 'и', days: 'дней', hours: 'часов', mins: 'минут', secs: 'секунд', place: 'Место проведения', map: 'Открыть на карте', copy: 'Скопировать адрес', copied: 'Скопировано',
    program: 'Программа вечера', hosts: 'Хозяева тоя', rsvp: 'Подтвердите участие', name: 'Ваше имя', yes: 'Приду', no: 'Не смогу прийти', count: 'Сколько человек придёт',
    wish: 'Пожелание (необязательно)', send: 'Отправить ответ', sending: 'Отправляем…', again: 'Изменить ответ', thanks: 'Спасибо!', errName: 'Напишите ваше имя',
    errSend: 'Не отправилось. Проверьте интернет и попробуйте ещё раз.', yesText: '{n}, ждём вас! Гостей: {g}.', noText: '{n}, жаль, что не получится. Спасибо, что ответили!',
    foot: 'Приглашение создано в сервисе «Сортировка 24»', make: 'Создать своё приглашение →', ex: 'Например: Ерлан Серикович', demoAnswer: 'Это пример. В настоящем приглашении ответ уходит хозяину тоя.',
    invited: 'Вы приглашены на той', open: 'Открыть приглашение', tap: 'Нажмите на печать, чтобы открыть', withMusic: 'с музыкой', musicOn: 'Включить музыку', musicOff: 'Выключить музыку',
    gallery: 'Наши моменты', galleryOne: 'Фотографии', story: 'Наша история', calendar: 'Добавить в календарь', untilToy: 'До тоя', close: 'Закрыть' },
};

function useCountdown(target: Date) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  let s = Math.max(0, Math.floor((target.getTime() - now) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
  return { d, h, m, s };
}

/** Background music with a soft fade in; pauses when the page is hidden. */
function useMusic(track: string | undefined) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const want = useRef(false);
  const src = track && track !== 'none' ? MUSIC_INFO[track as keyof typeof MUSIC_INFO]?.src : '';
  useEffect(() => {
    if (!src) return undefined;
    const a = new Audio(src);
    a.loop = true; a.preload = 'none'; a.volume = 0;
    a.onplay = () => setPlaying(true); a.onpause = () => setPlaying(false);
    audio.current = a;
    const onVis = () => { if (document.hidden) a.pause(); else if (want.current) void a.play().catch(() => {}); };
    document.addEventListener('visibilitychange', onVis);
    return () => { document.removeEventListener('visibilitychange', onVis); a.pause(); a.src = ''; audio.current = null; setPlaying(false); };
  }, [src]);
  const play = useCallback(() => {
    const a = audio.current; if (!a) return;
    want.current = true;
    a.volume = 0;
    void a.play().then(() => {
      let v = 0; const id = window.setInterval(() => { v = Math.min(0.6, v + 0.05); a.volume = v; if (v >= 0.6) window.clearInterval(id); }, 120);
    }).catch(() => {});
  }, []);
  const stop = useCallback(() => { want.current = false; audio.current?.pause(); }, []);
  return { has: Boolean(src), playing, play, stop };
}

const PARTICLES = Array.from({ length: 16 }, (_, i) => ({ left: (i * 61) % 100, delay: (i * 1.7) % 11, dur: 9 + ((i * 7) % 8), size: 8 + ((i * 5) % 9), drift: (i % 2 ? 1 : -1) * (20 + (i * 13) % 50) }));
function Particles({ effect }: { effect?: string }) {
  if (!effect || effect === 'none') return null;
  return (
    <div className={`toy-fx toy-fx--${effect}`} aria-hidden="true">
      {PARTICLES.map((p, i) => <i key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, width: p.size, height: p.size, ['--drift' as string]: `${p.drift}px` }} />)}
    </div>
  );
}

function icsFile(data: ToyData, title: string) {
  const start = eventTime(data);
  const end = new Date(start.getTime() + 5 * 3600000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (v: string) => v.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sortirovka24//Toy//RU', 'BEGIN:VEVENT', `UID:toy-${f(start)}-${Math.random().toString(36).slice(2)}@sortirovka24.kz`,
    `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`, `SUMMARY:${esc(title)}`, `LOCATION:${esc([data.place, data.address].filter(Boolean).join(', '))}`,
    'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

export default function ToyInviteView({ data, onRsvp, previewNote, demo, startLang, showFooter = true, contained = false, noIntro = false }: {
  data: ToyData; onRsvp?: (p: RsvpPayload) => Promise<void>; previewNote?: string; demo?: boolean; startLang?: Lang; showFooter?: boolean;
  /** Inside a phone mock-up: overlays stay inside the frame. */ contained?: boolean; noIntro?: boolean;
}) {
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
  const story = (lang === 'kz' ? data.story_kz || data.story_ru : data.story_ru || data.story_kz) || '';
  const and = lang === 'kz' ? kzAnd(data.name1) : t.and;
  const program = data.program.filter((p) => (lang === 'kz' ? p.kz : p.ru) || p.kz || p.ru);
  const photos = (data.photos || []).map((p) => photoUrl(p));
  const cover = photos[0] || data.photo || '';
  const gallery = photos.slice(1);
  const who = [data.name1 || (lang === 'kz' ? 'Есім' : 'Имя'), info.two ? data.name2 || (lang === 'kz' ? 'Есім' : 'Имя') : ''].filter(Boolean);

  const music = useMusic(data.music);
  const [opened, setOpened] = useState(noIntro || data.intro === false);
  const [opening, setOpening] = useState(false);
  useEffect(() => { if (noIntro || data.intro === false) setOpened(true); }, [noIntro, data.intro]);
  function openEnvelope() {
    if (opening) return;
    music.play();
    setOpening(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => setOpened(true), reduce ? 10 : 2600);
  }
  const [zoom, setZoom] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  async function copyAddress() {
    try { await navigator.clipboard.writeText([data.place, data.address].filter(Boolean).join(', ')); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* not allowed */ }
  }
  function addToCalendar() {
    const title = `${who.join(lang === 'kz' ? ` ${and} ` : ' и ')} — ${info.title[lang]}`;
    const blob = new Blob([icsFile(data, title)], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'toy.ics'; document.body.appendChild(a); a.click();
    window.setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
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

  const names = (cls: string) => (
    <p className={cls}>
      <span>{who[0]}</span>
      {who[1] && <><span className="amp">{and}</span><span>{who[1]}</span></>}
    </p>
  );
  const dateBlock = (
    <div className="toy-date" aria-label={`${dp.day} ${dp.monthGen} ${dp.year}, ${data.time}`}>
      <span className="side">{dp.weekday}</span>
      <span className="day">{dp.day}</span>
      <span className="side">{dp.month}<br />{dp.year}</span>
    </div>
  );

  return (
    <div className={`toy-card${contained ? ' is-contained' : ''}${opened ? ' is-open' : ''}`} data-theme-name={data.theme} lang={lang === 'kz' ? 'kk' : 'ru'}>
      <GoldDefs />
      {opened && <Particles effect={data.effect} />}

      {!opened && (
        <div className={`toy-stage${opening ? ' is-opening' : ''}`} role="dialog" aria-label={t.invited} data-testid="toy-envelope">
          {!fixed && (
            <div className="toy-lang toy-stage-lang" role="group" aria-label="Тіл / Язык">
              <button type="button" aria-pressed={lang === 'kz'} onClick={() => setLang('kz')}>ҚАЗ</button>
              <button type="button" aria-pressed={lang === 'ru'} onClick={() => setLang('ru')}>РУС</button>
            </div>
          )}
          <p className="toy-stage-title">{t.invited}</p>
          <div className="env">
            <div className="env-back" />
            <div className="env-card">
              <OyuFrame className="env-card-frame">
                <p className="toy-kicker">{info.kicker[lang]}</p>
                {names('env-names')}
                <p className="env-date">{dp.day} {dp.monthGen} {dp.year}</p>
              </OyuFrame>
            </div>
            <div className="env-front" />
            <div className="env-flap"><div className="env-flap-paper" /><div className="env-flap-liner" /></div>
            <button type="button" className="env-seal" onClick={openEnvelope} aria-label={t.open} data-testid="toy-open">
              <Shanyrak className="env-seal-mark" />
            </button>
          </div>
          <p className="toy-stage-hint">{t.tap}{music.has && <span> · ♪ {t.withMusic}</span>}</p>
        </div>
      )}

      {music.has && opened && (
        <button type="button" className={`toy-music${music.playing ? ' is-on' : ''}`} onClick={() => (music.playing ? music.stop() : music.play())}
          aria-label={music.playing ? t.musicOff : t.musicOn} aria-pressed={music.playing} data-testid="toy-music">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 18.5a2.5 2.5 0 1 1-2-2.45V5.6l11-2.2v11.1a2.5 2.5 0 1 1-2-2.45V6.1l-7 1.4z" /></svg>
          {!music.playing && <span>{t.musicOn}</span>}
        </button>
      )}

      {cover && (
        <header className="toy-cover">
          <img src={cover} alt="" />
          <div className="toy-cover-text">
            {demo && <span className="toy-demo">{lang === 'kz' ? 'Үлгі' : 'Пример'}</span>}
            <p className="toy-kicker">{info.kicker[lang]}</p>
            {names('toy-names')}
            <p className="toy-cover-date">{dp.day} {dp.monthGen} {dp.year}</p>
          </div>
        </header>
      )}

      <div className="toy-col">
        {(!fixed || demo) && !cover && (
          <div className="toy-top">
            {demo ? <span className="toy-demo">{lang === 'kz' ? 'Үлгі' : 'Пример'}</span> : <span />}
          </div>
        )}
        {!fixed && (
          <div className={`toy-lang toy-lang-float${cover ? ' on-cover' : ''}`} role="group" aria-label="Тіл / Язык">
            <button type="button" aria-pressed={lang === 'kz'} onClick={() => setLang('kz')}>ҚАЗ</button>
            <button type="button" aria-pressed={lang === 'ru'} onClick={() => setLang('ru')}>РУС</button>
          </div>
        )}
        {previewNote && <p className="toy-preview-note" role="status">{previewNote}</p>}

        {!cover && (
          <OyuFrame className="toy-hero-frame">
            <Shanyrak className="toy-emblem" />
            <p className="toy-kicker">{info.kicker[lang]}</p>
            {names('toy-names')}
          </OyuFrame>
        )}

        <section className="toy-sheet toy-intro">
          {lead && <p className="toy-lead">{lead}</p>}
          <OyuDivider />
          {dateBlock}
          <p className="toy-time">{data.time}</p>
          <div className="toy-count" role="timer" aria-label={t.untilToy}>
            <div><b>{left.d}</b><span>{t.days}</span></div>
            <i aria-hidden="true" />
            <div><b>{pad(left.h)}</b><span>{t.hours}</span></div>
            <i aria-hidden="true" />
            <div><b>{pad(left.m)}</b><span>{t.mins}</span></div>
            <i aria-hidden="true" />
            <div><b>{pad(left.s)}</b><span>{t.secs}</span></div>
          </div>
          <button type="button" className="toy-btn ghost" onClick={addToCalendar} data-testid="toy-calendar">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.6" d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" /></svg>{t.calendar}</button>
        </section>

        {story && (
          <section className="toy-sec">
            <h2>{t.story}</h2>
            <p className="toy-story">{story}</p>
          </section>
        )}

        {gallery.length > 0 && (
          <section className="toy-sec" aria-label={info.two ? t.gallery : t.galleryOne}>
            <h2>{info.two ? t.gallery : t.galleryOne}</h2>
            <div className={`toy-gallery n${Math.min(gallery.length, 5)}`}>
              {gallery.map((src, i) => (
                <button key={src} type="button" className="toy-shot" onClick={() => setZoom(src)} aria-label={`${i + 2}`}>
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}

        {(data.place || data.address) && (
          <section className="toy-sec">
            <h2>{t.place}</h2>
            <div className="toy-sheet toy-place">
              {data.place && <b>{data.place}</b>}
              {data.address && <p>{data.address}</p>}
              <div className="toy-actions">
                {mapHref && <a className="toy-btn solid" href={mapHref} target="_blank" rel="noopener noreferrer">{t.map}</a>}
                <button type="button" className="toy-btn ghost" onClick={() => void copyAddress()}>{copied ? t.copied : t.copy}</button>
              </div>
            </div>
          </section>
        )}

        {program.length > 0 && (
          <section className="toy-sec">
            <h2>{t.program}</h2>
            <ol className="toy-program">
              {program.map((p, i) => <li key={i}><time>{p.time}</time><span>{(lang === 'kz' ? p.kz : p.ru) || p.kz || p.ru}</span></li>)}
            </ol>
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
          <div className="toy-sheet">
            {done ? (
              <div className="toy-thanks" role="status">
                <b>{t.thanks}</b>
                <p>{(coming ? t.yesText : t.noText).replace('{n}', name.trim()).replace('{g}', String(guests))}</p>
                {!onRsvp && <p>{t.demoAnswer}</p>}
                <div className="toy-actions" style={{ justifyContent: 'center' }}><button type="button" className="toy-btn ghost" onClick={() => setDone(false)}>{t.again}</button></div>
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
                    <span className="toy-form-label">{t.count}</span>
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

        <OyuDivider className="toy-end" />
        {showFooter && (
          <footer className="toy-foot">
            <p>{t.foot}</p>
            <p><a href="/toy">{t.make}</a></p>
          </footer>
        )}
      </div>

      {zoom && (
        <div className="toy-zoom" role="dialog" aria-modal="true" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
          <button type="button" className="toy-btn solid" onClick={() => setZoom(null)}>{t.close}</button>
        </div>
      )}
    </div>
  );
}
