/**
 * «Справочник Сортировки» — made for one job: find the right number fast and call.
 * Top: emergency numbers, then a menu of all sections (contacts, участковые, автобусы, руководство, госуслуги, ошибка),
 * so nothing has to be found by scrolling. Each section opens in place (?section=), the page stays short.
 * Contacts come from the admin (directory_entries).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowUpRight, BookUser, Bus, ChevronDown, ChevronRight, Clock, Copy, Droplets, Flame, Globe, HeartPulse, Landmark, MapPin, MessageCircle,
  Phone, Search, ShieldCheck, Thermometer, Trash2, Users, X, Zap, type LucideIcon,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { client, withRetry, sortDirectoryEntries } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { useModules } from '@/hooks/useModules';
import { emergencyContacts, phoneLink, httpsLink, whatsappLink, readyForDirectory, type DirectoryEntry } from '@/lib/directoryContent';
import { directoryHelp, publicDirectorySource } from '@/lib/directoryHelp';
import { directoryPublicCopy } from '@/lib/directoryPublicCopy';
import { GROUPS, OTHER_GROUP, SITUATIONS, groupOf, smartMatch, type Situation } from '@/lib/directorySituations';
import content from '@/content/directory-context';
import '@/styles/dir.css';

const SIT_ICONS: Record<string, LucideIcon> = { water: Droplets, power: Zap, heat: Thermometer, gas: Flame, trash: Trash2, police: ShieldCheck, doctor: HeartPulse, akimat: Landmark };
const SOS_SHORT: Record<string, [string, string]> = { 112: ['Помощь', 'Көмек'], 101: ['Пожар', 'Өрт'], 102: ['Полиция', 'Полиция'], 103: ['Скорая', 'Жедел'], 104: ['Газ', 'Газ'] };
const GOV = [
  { ru: 'Прикрепиться к поликлинике', kz: 'Емханаға тіркелу', href: 'https://beta.egov.kz/services/3176' },
  { ru: 'Записаться в ЦОН', kz: 'ХҚКО-ға кезек брондау', href: 'https://beta.egov.kz/services/3134?lang=ru' },
  { ru: 'Обращение в госорган — eOtinish', kz: 'Мемлекеттік органға өтініш — eOtinish', href: 'https://eotinish.kz/ru' },
  { ru: 'Очередь в детский сад', kz: 'Балабақша кезегі', href: 'https://beta.egov.kz/services/3042' },
  { ru: 'Проверить лицензию', kz: 'Лицензияны тексеру', href: 'https://beta.egov.kz/services/3173' },
];

function displayPhone(value = '') {
  if (/^\+77212\d{6}$/.test(value)) return value.replace(/^\+7(\d{4})(\d{2})(\d{2})(\d{2})$/, '+7 ($1) $2-$3-$4');
  if (/^\+7\d{10}$/.test(value)) return value.replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/, '+7 ($1) $2-$3-$4');
  return value;
}
function shortPhone(value = '') {
  if (/^\+77212\d{6}$/.test(value)) return value.replace(/^\+77212(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3');
  return displayPhone(value);
}

export default function Directory() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const say = (ru: string, kk: string) => (kz ? kk : ru);
  const { isEnabled } = useModules();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const group = params.get('g') || '';
  const sit = SITUATIONS.find((s) => s.id === params.get('s')) || null;
  const rawSection = params.get('section') || '';
  const view: View = rawSection === 'leadership' || rawSection === 'services' ? rawSection : 'contacts';
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const gen = useRef(0);

  async function load() {
    const v = ++gen.current; setLoading(true); setError(false);
    try {
      const all: DirectoryEntry[] = [];
      for (let skip = 0; ; skip += 200) {
        const res = await withRetry(() => client.entities.directory_entries.query({ sort: 'id', skip, limit: 200 }));
        const page = res.data?.items || []; all.push(...page);
        if (page.length < 200 || all.length >= (res.data?.total ?? Infinity)) break;
      }
      if (v === gen.current) setEntries(sortDirectoryEntries(all.filter(readyForDirectory)));
    } catch { if (v === gen.current) setError(true); } finally { if (v === gen.current) setLoading(false); }
  }
  useEffect(() => { void load(); return () => { gen.current++; }; }, []);
  // Old link ?section=guides lands on «Что случилось?».
  useEffect(() => {
    if (rawSection === 'guides') window.setTimeout(() => document.getElementById('dir-situations')?.scrollIntoView({ block: 'start' }), 300);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function openView(next: View) {
    const p = new URLSearchParams(); if (next !== 'contacts') p.set('section', next);
    setParams(p, { replace: false });
    const menu = document.getElementById('dir-menu');
    if (menu && menu.getBoundingClientRect().top < 0) menu.scrollIntoView({ block: 'start' });
  }

  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (rawSection === 'guides') next.delete('section'); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); };
  const intro = (e: DirectoryEntry) => (directoryHelp(e, kz).intro || directoryPublicCopy(e).intro || '').trim();
  const haystack = (e: DirectoryEntry) => [e.entry_name, e.category, e.address, e.phone, intro(e)].join(' ');
  const shown = entries.filter((e) => (!group || groupOf(e.category) === group) && smartMatch(haystack(e), query));
  const groupsUsed = useMemo(() => [...GROUPS, OTHER_GROUP].filter((g) => entries.some((e) => groupOf(e.category) === g.id)), [entries]);
  const sitEntries = sit ? entries.filter(sit.pick) : [];
  const akimat = entries.filter((e) => groupOf(e.category) === 'akimat');

  function pickSituation(id: string) {
    set('s', sit?.id === id ? '' : id);
    if (sit?.id !== id) window.setTimeout(() => document.getElementById('dir-sit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }

  return (
    <Layout>
      <div className="dir">
        <header className="dir-hero">
          <div className="dir-w">
            <span className="dir-kicker">{say('Сортировка 24 · справочник', 'Сортировка 24 · анықтамалық')}</span>
            <h1>{say('Справочник Сортировки', 'Сортировка анықтамалығы')}</h1>
            <p>{say('Куда звонить, если нет воды, света или тепла, нужен врач или участковый.', 'Су, жарық не жылу болмаса, дәрігер не учаскелік керек болса — қайда қоңырау шалу керек.')}</p>
            <div className="dir-sos" aria-label={say('Экстренные номера', 'Шұғыл нөмірлер')}>
              {emergencyContacts.map((e) => (
                <a key={e.number} href={`tel:${e.number}`} aria-label={`${e.number} — ${kz ? e.kz : e.ru}`}>
                  <b>{e.number}</b><span className="dir-sos-long">{kz ? e.kz : e.ru}</span><span className="dir-sos-short">{SOS_SHORT[e.number]?.[kz ? 1 : 0]}</span>
                </a>
              ))}
            </div>
          </div>
        </header>

        <div className="dir-w dir-body">
          <nav id="dir-menu" className="dir-menu" aria-label={say('Разделы справочника', 'Анықтамалық бөлімдері')}>
            <MenuTile icon={BookUser} active={view === 'contacts'} onClick={() => openView('contacts')} title={say('Службы и контакты', 'Байланыстар')} sub={entries.length ? say(`${entries.length} номеров: вода, свет, врачи, школы`, `${entries.length} нөмір: су, жарық, дәрігер, мектеп`) : say('Вода, свет, врачи, школы', 'Су, жарық, дәрігер, мектеп')} />
            {isEnabled('inspectors') && <MenuTile icon={ShieldCheck} to="/inspectors" title={say('Участковые', 'Учаскелік')} sub={say('Найти своего по адресу', 'Мекенжай бойынша табу')} />}
            {isEnabled('transport') && <MenuTile icon={Bus} to="/transport" title={say('Автобусы', 'Автобустар')} sub={say('Маршруты и остановки', 'Бағыттар мен аялдамалар')} />}
            <MenuTile icon={Users} active={view === 'leadership'} onClick={() => openView('leadership')} title={say('Руководство района', 'Аудан басшылығы')} sub={say('Аким, заместители, приём', 'Әкім, орынбасарлар, қабылдау')} />
            <MenuTile icon={Globe} active={view === 'services'} onClick={() => openView('services')} title={say('Госуслуги онлайн', 'Онлайн қызметтер')} sub={say('eGov, ЦОН, eOtinish, 1414', 'eGov, ХҚКО, eOtinish, 1414')} />
            <MenuTile icon={MessageCircle} to="/report-problem" title={say('Сообщить о проблеме', 'Хабарлау')} sub={say('Или об ошибке в номере', 'Мәселе не нөмір қатесі')} />
          </nav>

          {view === 'contacts' && <>
          <section id="dir-situations" aria-labelledby="dir-sit-h">
            <h2 id="dir-sit-h">{say('Что случилось?', 'Не болды?')}</h2>
            <div className="dir-sits">
              {SITUATIONS.map((s) => {
                const Icon = SIT_ICONS[s.id] || Phone;
                return (
                  <button key={s.id} type="button" data-sit={s.id} aria-pressed={sit?.id === s.id} onClick={() => pickSituation(s.id)}>
                    <Icon size={22} aria-hidden="true" /><span>{kz ? s.title.kz : s.title.ru}</span>
                  </button>
                );
              })}
            </div>
            {sit && <SituationPanel sit={sit} rows={sitEntries} kz={kz} intro={intro} onClose={() => set('s', '')} inspectors={isEnabled('inspectors')} />}
          </section>

          <section id="dir-contacts" aria-labelledby="dir-all-h">
            <div className="dir-head">
              <h2 id="dir-all-h">{say('Все контакты', 'Барлық байланыстар')}</h2>
              <label className="dir-search">
                <Search size={18} aria-hidden="true" />
                <input value={query} onChange={(e) => set('q', e.target.value)} aria-label={say('Поиск по справочнику', 'Анықтамалықтан іздеу')} placeholder={say('Например: вода, школа 46, почта', 'Мысалы: су, 46 мектеп, пошта')} />
                {query && <button type="button" onClick={() => set('q', '')} aria-label={say('Очистить поиск', 'Іздеуді тазалау')}><X size={16} /></button>}
              </label>
            </div>
            {groupsUsed.length > 1 && (
              <div className="dir-chips" role="group" aria-label={say('Разделы', 'Бөлімдер')}>
                <button type="button" aria-pressed={!group} onClick={() => set('g', '')}>{say('Все', 'Барлығы')}</button>
                {groupsUsed.map((g) => <button key={g.id} type="button" aria-pressed={group === g.id} onClick={() => set('g', group === g.id ? '' : g.id)}>{kz ? g.kz : g.ru}</button>)}
              </div>
            )}
            <div aria-live="polite">
              {loading ? <p className="dir-state">{say('Загружаем контакты…', 'Байланыстар жүктелуде…')}</p>
                : error ? (
                  <div className="dir-state" role="alert">
                    <b>{say('Не удалось загрузить контакты', 'Байланыстар жүктелмеді')}</b>
                    <p>{say('Экстренные номера наверху работают всегда.', 'Жоғарыдағы шұғыл нөмірлер әрқашан жұмыс істейді.')}</p>
                    <button type="button" onClick={() => void load()}>{say('Повторить', 'Қайталау')}</button>
                  </div>
                ) : !shown.length ? (
                  <div className="dir-state">
                    <b>{entries.length ? say('Ничего не найдено', 'Ештеңе табылмады') : say('Контакты скоро появятся', 'Байланыстар жақында пайда болады')}</b>
                    {entries.length > 0 && <p>{say('Попробуйте другое слово или выберите ситуацию выше.', 'Басқа сөзді қолданыңыз немесе жоғарыдан жағдайды таңдаңыз.')}</p>}
                    {(query || group) && <button type="button" onClick={() => setParams({}, { replace: true })}>{say('Показать все', 'Барлығын көрсету')}</button>}
                  </div>
                ) : (
                  [...GROUPS, OTHER_GROUP].filter((g) => shown.some((e) => groupOf(e.category) === g.id)).map((g) => (
                    <section key={g.id} className="dir-group" aria-label={kz ? g.kz : g.ru}>
                      <h3>{kz ? g.kz : g.ru}</h3>
                      <ul className="dir-rows">{shown.filter((e) => groupOf(e.category) === g.id).map((e) => <ContactRow key={e.id} e={e} kz={kz} intro={intro(e)} />)}</ul>
                    </section>
                  ))
                )}
            </div>
          </section>
          </>}

          {view === 'services' && (
          <section id="dir-gov" aria-labelledby="dir-gov-h">
            <h2 id="dir-gov-h">{say('Госуслуги онлайн', 'Мемлекеттік қызметтер онлайн')}</h2>
            <p className="dir-sub">{say('Открываются на официальных сайтах eGov и eOtinish. Помощь — единый контакт-центр 1414.', 'eGov және eOtinish ресми сайттарында ашылады. Көмек — 1414 бірыңғай байланыс орталығы.')}</p>
            <ul className="dir-links">
              {GOV.map((g) => <li key={g.href}><a href={g.href} target="_blank" rel="noopener noreferrer"><span>{kz ? g.kz : g.ru}</span><ArrowUpRight size={18} /></a></li>)}
              <li><a href="tel:1414"><span>{say('Помощь с госуслугами — 1414', 'Мемлекеттік қызмет бойынша көмек — 1414')}</span><Phone size={18} /></a></li>
            </ul>
          </section>
          )}

          {view === 'leadership' && (
          <section id="dir-leaders" aria-labelledby="dir-lead-h">
            <h2 id="dir-lead-h">{say('Руководство района Әлихан Бөкейхан', 'Әлихан Бөкейхан ауданының басшылығы')}</h2>
            <p className="dir-sub">{say('Личный приём — Архитектурная, 13, 1 этаж. Запись через приёмную:', 'Жеке қабылдау — Архитектурная, 13, 1-қабат. Қабылдау бөлмесі арқылы жазылу:')} <a className="dir-inline-phone" href={phoneLink(content.leadership[0]?.phone)}>{displayPhone(content.leadership[0]?.phone)}</a></p>
            <ul className="dir-leaders">
              {content.leadership.map((p) => (
                <li key={p.source_url}>
                  <img src={p.photo_url} alt="" loading="lazy" referrerPolicy="no-referrer" width="56" height="56" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }} />
                  <div>
                    <small>{kz ? p.role_kk : p.role}</small>
                    <b>{p.name}</b>
                    <span>{say('Приём', 'Қабылдау')}: {kz ? p.reception_kk : p.reception}{p.duties ? ` · ${kz ? p.duties_kk : p.duties}` : ''}</span>
                  </div>
                </li>
              ))}
            </ul>
            {akimat.length > 0 && <>
              <h3 className="dir-lead-sub">{say('Акимат района — телефоны', 'Аудан әкімдігі — телефондар')}</h3>
              <ul className="dir-rows">{akimat.map((e) => <ContactRow key={e.id} e={e} kz={kz} intro={intro(e)} />)}</ul>
            </>}
          </section>
          )}

          <p className="dir-note">{say('Номера взяты с официальных сайтов и из 2ГИС. Перед визитом уточняйте часы приёма.', 'Нөмірлер ресми сайттардан және 2ГИС-тен алынған. Барар алдында қабылдау уақытын нақтылаңыз.')}</p>
        </div>
      </div>
    </Layout>
  );
}

type View = 'contacts' | 'leadership' | 'services';

function MenuTile({ icon: Icon, title, sub, to, onClick, active }: { icon: LucideIcon; title: string; sub: string; to?: string; onClick?: () => void; active?: boolean }) {
  const inner = <><span className="dir-menu-ic"><Icon size={22} aria-hidden="true" /></span><span className="dir-menu-tx"><b>{title}</b><small>{sub}</small></span><ChevronRight className="dir-menu-go" size={18} aria-hidden="true" /></>;
  return to ? <Link to={to} className="dir-menu-tile">{inner}</Link>
    : <button type="button" className="dir-menu-tile" aria-pressed={!!active} onClick={onClick}>{inner}</button>;
}

function SituationPanel({ sit, rows, kz, intro, onClose, inspectors }: { sit: Situation; rows: DirectoryEntry[]; kz: boolean; intro: (e: DirectoryEntry) => string; onClose: () => void; inspectors: boolean }) {
  const say = (ru: string, kk: string) => (kz ? kk : ru);
  const links = (sit.links || []).filter((l) => l.href !== '/inspectors' || inspectors);
  return (
    <div id="dir-sit-panel" className="dir-sit-panel" role="region" aria-label={kz ? sit.title.kz : sit.title.ru}>
      <div className="dir-sit-top">
        <h3>{kz ? sit.title.kz : sit.title.ru}</h3>
        <button type="button" onClick={onClose} aria-label={say('Закрыть', 'Жабу')}><X size={18} /></button>
      </div>
      <p>{kz ? sit.tip.kz : sit.tip.ru}</p>
      <ul className="dir-rows">
        {(sit.extra || []).map((x) => (
          <li key={x.number} className="dir-row dir-row--sos">
            <div className="dir-row-main"><span className="dir-row-text"><b>{kz ? x.label.kz : x.label.ru}</b></span>
              <a className="dir-call" href={`tel:${x.number}`}><Phone size={16} />{x.number}</a></div>
          </li>
        ))}
        {rows.map((e) => <ContactRow key={e.id} e={e} kz={kz} intro={intro(e)} />)}
      </ul>
      {links.length > 0 && (
        <div className="dir-sit-links">
          {links.map((l) => l.href.startsWith('/') ? <Link key={l.href} to={l.href}>{kz ? l.label.kz : l.label.ru}<ArrowUpRight size={15} /></Link>
            : <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">{kz ? l.label.kz : l.label.ru}<ArrowUpRight size={15} /></a>)}
        </div>
      )}
    </div>
  );
}

function ContactRow({ e, kz, intro }: { e: DirectoryEntry; kz: boolean; intro: string }) {
  const say = (ru: string, kk: string) => (kz ? kk : ru);
  const [open, setOpen] = useState(false);
  const phone = phoneLink(e.phone);
  const wa = whatsappLink(e.whatsapp);
  const map = httpsLink(e.map_url);
  const site = httpsLink(publicDirectorySource(e.website));
  const steps = directoryHelp(e, kz).steps;
  const hasMore = Boolean(e.address || e.opening_hours || wa || site || steps.length);
  async function copy() {
    try { await navigator.clipboard.writeText(e.phone || ''); toast.success(say('Номер скопирован', 'Нөмір көшірілді')); } catch { toast.error(say('Не удалось скопировать', 'Көшіру мүмкін болмады')); }
  }
  return (
    <li className="dir-row" data-testid="dir-row">
      <div className="dir-row-main">
        <button type="button" className="dir-row-text" aria-expanded={hasMore ? open : undefined} onClick={() => hasMore && setOpen((v) => !v)} disabled={!hasMore}>
          <b>{e.entry_name}</b>
          {intro && <span>{intro}</span>}
          {hasMore && <i className="dir-more">{open ? say('Скрыть', 'Жасыру') : say('Подробнее', 'Толығырақ')}<ChevronDown size={14} /></i>}
        </button>
        {phone ? <a className="dir-call" href={phone} aria-label={`${say('Позвонить', 'Қоңырау шалу')}: ${e.entry_name}, ${displayPhone(e.phone)}`}><Phone size={16} />{shortPhone(e.phone)}</a>
          : site ? <a className="dir-call dir-call--site" href={site} target="_blank" rel="noopener noreferrer"><Globe size={16} />{say('Открыть', 'Ашу')}</a> : null}
      </div>
      {open && (
        <div className="dir-row-more">
          {e.address && <p><MapPin size={15} />{map ? <a href={map} target="_blank" rel="noopener noreferrer">{e.address}</a> : e.address}</p>}
          {e.opening_hours && <p><Clock size={15} />{e.opening_hours}</p>}
          {steps.length > 0 && <ul className="dir-steps">{steps.map((s) => <li key={s}>{s}</li>)}</ul>}
          <div className="dir-row-actions">
            {phone && <button type="button" onClick={() => void copy()}><Copy size={15} />{displayPhone(e.phone)}</button>}
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={15} />WhatsApp</a>}
            {site && <a href={site} target="_blank" rel="noopener noreferrer"><Globe size={15} />{say('Сайт', 'Сайт')}</a>}
            {map && <a href={map} target="_blank" rel="noopener noreferrer"><MapPin size={15} />2ГИС</a>}
          </div>
        </div>
      )}
    </li>
  );
}
