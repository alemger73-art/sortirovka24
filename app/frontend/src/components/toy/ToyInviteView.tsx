/**
 * The invitation itself: what guests see. Used on the public page, in the builder preview and as examples.
 * Premium parts: an envelope that opens with a tap (and starts the music — browsers allow sound only after a tap),
 * original background music, falling petals / gold sparkles, photo in an arch + gallery, our story, add-to-calendar,
 * blocks that softly appear while scrolling. Everything respects «reduce motion».
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { KIND_INFO, MUSIC_INFO, dateParts, eventTime, kzAnd, photoUrl, type ToyData } from '@/lib/toyInvites';
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

let fontsLoaded = false;
function loadFonts() {
  if (fontsLoaded || typeof document === 'undefined') return;
  fontsLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Montserrat:wght@400;500;600&display=swap';
  document.head.appendChild(link);
}

function Shanyrak({ className = 'toy-shanyrak' }: { className?: string }) {
  const poles = [[120, 42, 120, 8], [120, 198, 120, 232], [42, 120, 8, 120], [198, 120, 232, 120], [65, 65, 41, 41], [175, 65, 199, 41], [65, 175, 41, 199], [175, 175, 199, 199],
    [90, 48, 78, 16], [150, 48, 162, 16], [90, 192, 78, 224], [150, 192, 162, 224], [48, 90, 16, 78], [48, 150, 16, 162], [192, 90, 224, 78], [192, 150, 224, 162]];
  return (
    <svg className={className} viewBox="0 0 240 240" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <circle cx="120" cy="120" r="112" strokeOpacity=".25" />
        <g className="spin"><circle cx="120" cy="120" r="96" strokeWidth="1.5" strokeDasharray="2 7" strokeOpacity=".7" /></g>
        <circle className="draw" cx="120" cy="120" r="78" strokeWidth="2" pathLength={1} />
        <circle cx="120" cy="120" r="70" strokeOpacity=".6" />
        <path className="draw" pathLength={1} d="M120 50 Q 150 120 120 190 M120 50 Q 90 120 120 190 M50 120 Q 120 150 190 120 M50 120 Q 120 90 190 120" strokeWidth="2" />
        <g strokeWidth="1.2" strokeOpacity=".75">{poles.map(([a, b, c, d]) => <line key={`${a}-${b}-${c}`} x1={a} y1={b} x2={c} y2={d} />)}</g>
      </g>
    </svg>
  );
}
function Ornament() {
  return (
    <svg className="toy-orn" viewBox="0 0 180 28" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path className="draw" pathLength={1} d="M90 22 C 90 10, 78 4, 70 9 C 63 13, 66 22, 73 20 C 78 18, 76 12, 72 13" />
      <path className="draw" pathLength={1} d="M90 22 C 90 10, 102 4, 110 9 C 117 13, 114 22, 107 20 C 102 18, 104 12, 108 13" />
      <path d="M8 22 H 60 M120 22 H 172" strokeOpacity=".5" />
    </g></svg>
  );
}
/** Corner ою for the envelope and the photo frame. */
function Corner({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M4 60 V 22 C 4 12, 12 4, 22 4 H 60" strokeOpacity=".7" />
      <path d="M14 50 C 14 34, 22 26, 30 26 C 38 26, 40 34, 34 38 C 29 41, 25 36, 28 33" />
      <path d="M50 14 C 34 14, 26 22, 26 30" />
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

/** Blocks appear softly while scrolling. */
function useReveal(root: React.RefObject<HTMLElement>, deps: unknown[]) {
  useEffect(() => {
    const el = root.current; if (!el) return undefined;
    const items = Array.from(el.querySelectorAll<HTMLElement>('.toy-rv:not(.is-in)'));
    if (!('IntersectionObserver' in window)) { items.forEach((i) => i.classList.add('is-in')); return undefined; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    items.forEach((i) => io.observe(i));
    return () => io.disconnect();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
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
    window.setTimeout(() => setOpened(true), reduce ? 10 : 1500);
  }
  const root = useRef<HTMLDivElement>(null);
  useReveal(root, [opened, lang, gallery.length, program.length]);
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

  return (
    <div ref={root} className={`toy-card${contained ? ' is-contained' : ''}${opened ? ' is-open' : ''}`} data-theme-name={data.theme} lang={lang === 'kz' ? 'kk' : 'ru'}>
      <div className="toy-pattern" aria-hidden="true" />
      {opened && <Particles effect={data.effect} />}

      {!opened && (
        <div className={`toy-envelope${opening ? ' is-opening' : ''}`} role="dialog" aria-label={t.invited} data-testid="toy-envelope">
          <div className="toy-door l" aria-hidden="true"><Corner className="toy-corner tl" /><Corner className="toy-corner bl" /></div>
          <div className="toy-door r" aria-hidden="true"><Corner className="toy-corner tr" /><Corner className="toy-corner br" /></div>
          <div className="toy-env-body">
            {!fixed && (
              <div className="toy-lang toy-env-lang" role="group" aria-label="Тіл / Язык">
                <button type="button" aria-pressed={lang === 'kz'} onClick={() => setLang('kz')}>ҚАЗ</button>
                <button type="button" aria-pressed={lang === 'ru'} onClick={() => setLang('ru')}>РУС</button>
              </div>
            )}
            <p className="toy-kicker">{t.invited}</p>
            <p className="toy-env-names">{who[0]}{who[1] && <><span className="amp">{and}</span>{who[1]}</>}</p>
            <p className="toy-env-date">{dp.day} {dp.monthGen} {dp.year}</p>
            <button type="button" className="toy-seal" onClick={openEnvelope} aria-label={t.open} data-testid="toy-open">
              <Shanyrak className="toy-seal-mark" />
            </button>
            <p className="toy-env-tap">{t.tap}{music.has ? <><br /><span>♪ {t.withMusic}</span></> : null}</p>
          </div>
        </div>
      )}

      {music.has && opened && (
        <button type="button" className={`toy-music${music.playing ? ' is-on' : ''}`} onClick={() => (music.playing ? music.stop() : music.play())}
          aria-label={music.playing ? t.musicOff : t.musicOn} aria-pressed={music.playing} data-testid="toy-music">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 18.5a2.5 2.5 0 1 1-2-2.45V5.6l11-2.2v11.1a2.5 2.5 0 1 1-2-2.45V6.1l-7 1.4z" /></svg>
          {!music.playing && <span>{t.musicOn}</span>}
        </button>
      )}

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
          {cover ? (
            <div className="toy-arch toy-rv">
              <Corner className="toy-corner tl" /><Corner className="toy-corner tr" />
              <div className="toy-arch-img"><img src={cover} alt="" /></div>
            </div>
          ) : <div className="toy-rv"><Shanyrak /></div>}
          <p className="toy-kicker toy-rv">{info.kicker[lang]}</p>
          <h1 className="toy-names toy-rv">
            {who[0]}
            {who[1] && <><span className="amp">{and}</span>{who[1]}</>}
          </h1>
          {lead && <p className="toy-lead toy-rv">{lead}</p>}
          <div className="toy-rv"><Ornament /></div>
          <div className="toy-date toy-rv" aria-label={`${dp.day} ${dp.monthGen} ${dp.year}, ${data.time}`}>
            <div className="side">{dp.month}</div>
            <div className="day">{dp.day}</div>
            <div className="side">{dp.weekday} · {data.time}</div>
          </div>
          <p className="toy-until toy-rv">{t.untilToy}</p>
          <div className="toy-count toy-rv" role="timer" aria-label={t.untilToy}>
            <div><b>{left.d}</b><span>{t.days}</span></div>
            <div><b>{pad(left.h)}</b><span>{t.hours}</span></div>
            <div><b>{pad(left.m)}</b><span>{t.mins}</span></div>
            <div><b>{pad(left.s)}</b><span>{t.secs}</span></div>
          </div>
          <div className="toy-actions toy-center toy-rv"><button type="button" className="toy-btn" onClick={addToCalendar} data-testid="toy-calendar">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" /></svg>{t.calendar}</button></div>
        </header>

        {story && (
          <section className="toy-sec toy-rv">
            <h2>{t.story}</h2>
            <p className="toy-story">{story}</p>
          </section>
        )}

        {gallery.length > 0 && (
          <section className="toy-sec toy-rv" aria-label={info.two ? t.gallery : t.galleryOne}>
            <h2>{info.two ? t.gallery : t.galleryOne}</h2>
            <div className="toy-gallery">
              {gallery.map((src, i) => (
                <button key={src} type="button" className="toy-shot" style={{ ['--i' as string]: i }} onClick={() => setZoom(src)} aria-label={`${i + 2}`}>
                  <img src={src} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}

        {(data.place || data.address) && (
          <section className="toy-sec toy-rv">
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
          <section className="toy-sec toy-rv">
            <h2>{t.program}</h2>
            <div className="toy-panel">
              <ol className="toy-program">
                {program.map((p, i) => <li key={i}><time>{p.time}</time><span>{(lang === 'kz' ? p.kz : p.ru) || p.kz || p.ru}</span></li>)}
              </ol>
            </div>
          </section>
        )}

        {data.hosts && (
          <section className="toy-sec toy-hosts toy-rv">
            <h2>{t.hosts}</h2>
            <b>{data.hosts}</b>
          </section>
        )}

        <section className="toy-sec toy-rv">
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
            <Ornament />
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
