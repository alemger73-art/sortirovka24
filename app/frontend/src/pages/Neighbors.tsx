/**
 * «Мой дом» — neighbours of one house.
 * /dom — landing (guests) → address form → the house: feed of posts (авария / вопрос / объявление / потеряно) and neighbours;
 * /dom/post/:id — one post with comments. Phones and flat numbers are never shown to neighbours.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowUpRight, Building2, Camera, Check, ChevronDown, Crown, Flag, Home, Loader2, Lock, MessageCircle,
  MoreHorizontal, Pin, Plus, RefreshCw, Send, Settings, ShieldCheck, Trash2, Users, X,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { getAccountToken } from '@/lib/accountApi';
import { timeAgo } from '@/lib/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageSeo } from '@/hooks/usePageSeo';
import {
  KINDS, helpFor, kindInfo, kzEntrance, nbApi, shrinkPhoto,
  type NbAddress, type NbConfirm, type NbHouse, type NbKind, type NbMember, type NbPost, type NbPostFull,
} from '@/lib/neighbors';
import '@/styles/dom.css';

const SITE = 'https://www.sortirovka24.kz';
type Say = (ru: string, kz: string) => string;
function useSay(): [Say, boolean, 'ru' | 'kz'] {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  return [(ru, k) => (kz ? k : ru), kz, kz ? 'kz' : 'ru'];
}
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось, попробуйте ещё раз');
const inviteText = (title: string) => `Соседи (${title})! На Сортировка 24 появился «Мой дом» — пишем про аварии, собрания и вопросы по дому, видно кто из соседей уже здесь. Присоединяйтесь: ${SITE}/dom`;

/* ============================== /dom ============================== */
export function NeighborsPage() {
  const [say] = useSay();
  usePageSeo({ title: 'Мой дом — соседи — Сортировка 24', description: 'Соседи вашего дома на Сортировке: аварии, вопросы, объявления и собрания — без общих чатов и без номеров телефонов.' });
  const authed = Boolean(getAccountToken());
  const [params, setParams] = useSearchParams();
  const editing = params.get('edit') === '1';
  const [state, setState] = useState<{ member: NbMember | null; confirm?: NbConfirm; suggested_name?: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try { setState(await nbApi.me()); } catch (e) { setError(errText(e)); }
  }, []);
  useEffect(() => { if (authed) void load(); }, [authed, load]);

  if (!authed) return <Layout><Landing /></Layout>;
  if (error) return <Layout><div className="dom"><div className="dom-w dom-pad"><Problem text={error} onRetry={() => void load()} /></div></div></Layout>;
  if (!state) return <Layout><div className="dom"><Skeleton /></div></Layout>;
  if (!state.member || editing) {
    return (
      <Layout>
        <div className="dom">
          <AddressForm member={state.member} suggested={state.suggested_name || ''}
            onSaved={(r) => { setState(r); setParams({}, { replace: true }); window.scrollTo({ top: 0 }); }}
            onCancel={state.member ? () => setParams({}, { replace: true }) : undefined}
            onLeft={() => { setState({ member: null, suggested_name: state.suggested_name }); setParams({}, { replace: true }); toast.success(say('Адрес и ваши записи удалены', 'Мекенжай мен жазбаларыңыз жойылды')); }} />
        </div>
      </Layout>
    );
  }
  return <Layout><House member={state.member} confirm={state.confirm!} onChange={(r) => setState((s) => ({ ...s, ...r }))} reload={load} /></Layout>;
}

/* ---------------- landing for guests ---------------- */
function Landing() {
  const [say] = useSay();
  const [stats, setStats] = useState<{ neighbours: number; houses: number } | null>(null);
  useEffect(() => { nbApi.streets().then((r) => setStats(r.stats)).catch(() => {}); }, []);
  const points: [typeof Users, string, string][] = [
    [Users, say('Видно соседей по дому и подъезду', 'Үй мен кіреберіс бойынша көршілер көрінеді'), say('Только имя и подъезд. Телефон и квартира скрыты.', 'Тек аты мен кіреберіс. Телефон мен пәтер жасырын.')],
    [MessageCircle, say('Вопросы и аварии — не чат', 'Сұрақтар мен апаттар — чат емес'), say('«Почему нет света во 2 подъезде?» — и ответы под записью.', '«2-кіреберісте неге жарық жоқ?» — жауаптар жазба астында.')],
    [ShieldCheck, say('Только настоящие жильцы', 'Тек нағыз тұрғындар'), say('Каждого подтверждают соседи или квитанция.', 'Әркімді көршілер немесе түбіртек растайды.')],
  ];
  return (
    <div className="dom">
      <header className="dom-hero dom-hero--land">
        <div className="dom-w">
          <span className="dom-kicker">{say('Сортировка 24 · новое', 'Сортировка 24 · жаңа')}</span>
          <h1>{say('Мой дом', 'Менің үйім')}</h1>
          <p>{say('Соседи вашего дома в одном месте: аварии, собрания, вопросы и находки. Без шумных общих чатов.', 'Үйіңіздің көршілері бір жерде: апаттар, жиналыстар, сұрақтар. Шулы чаттарсыз.')}</p>
          <Link className="dom-btn dom-btn--light" to="/account?redirect=%2Fdom" data-testid="dom-login">{say('Войти и указать адрес', 'Кіру және мекенжайды көрсету')}<ArrowUpRight size={18} /></Link>
          {stats && stats.neighbours > 0 && <p className="dom-hero-stat">{say(`Уже ${stats.neighbours} соседей из ${stats.houses} домов`, `${stats.houses} үйден ${stats.neighbours} көрші қосылды`)}</p>}
        </div>
      </header>
      <div className="dom-w dom-pad">
        <ul className="dom-points">
          {points.map(([Icon, title, text]) => <li key={title}><span><Icon size={22} /></span><div><b>{title}</b><p>{text}</p></div></li>)}
        </ul>
        <PreviewCard />
      </div>
    </div>
  );
}

function PreviewCard() {
  const [say] = useSay();
  return (
    <div className="dom-preview" aria-hidden="true">
      <p className="dom-label">{say('Так это выглядит', 'Осылай көрінеді')}</p>
      <article className="dom-post dom-post--alarm">
        <div className="dom-post-top"><span className="dom-kind dom-kind--alarm">⚡ {say('Авария', 'Апат')}</span><span className="dom-time">{say('12 мин назад', '12 мин бұрын')}</span></div>
        <p className="dom-author">Айгуль · {say('2 подъезд', '2-кіреберіс')}</p>
        <p className="dom-body">{say('Во 2 подъезде с утра нет света, на площадке тоже темно. Кто-нибудь уже звонил?', '2-кіреберісте таңнан бері жарық жоқ. Біреу қоңырау шалды ма?')}</p>
        <div className="dom-actions"><span className="dom-metoo is-on">✋ {say('У меня тоже', 'Менде де')} · 14</span><span className="dom-cm"><MessageCircle size={16} />3</span></div>
      </article>
    </div>
  );
}

/* ---------------- address form ---------------- */
function AddressForm({ member, suggested, onSaved, onCancel, onLeft }: {
  member: NbMember | null; suggested: string;
  onSaved: (r: { member: NbMember; confirm: NbConfirm }) => void; onCancel?: () => void; onLeft: () => void;
}) {
  const [say] = useSay();
  const [streets, setStreets] = useState<string[]>([]);
  const [a, setA] = useState<NbAddress>(() => ({
    kind: member?.kind || 'flat', street: member?.street || '', house: member?.house || '', entrance: member?.entrance ? String(member.entrance) : '',
    flat: member?.flat || '', display_name: member?.display_name || suggested, anonymous: member?.anonymous || false, consent: Boolean(member),
  }));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [leaving, setLeaving] = useState(false);
  useEffect(() => { nbApi.streets().then((r) => setStreets(r.streets)).catch(() => {}); }, []);
  const set = <K extends keyof NbAddress>(k: K, v: NbAddress[K]) => { setA((x) => ({ ...x, [k]: v })); setErr(''); };
  const norm = (v: string) => v.toLocaleLowerCase().replace(/ё/g, 'е').replace(/^(ул\.?|улица)\s*/, '');
  const matches = streets.filter((s) => !a.street || norm(s).includes(norm(a.street))).slice(0, 8);
  const flat = a.kind === 'flat';

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!a.street.trim()) return setErr(say('Выберите улицу', 'Көшені таңдаңыз'));
    if (!a.house.trim()) return setErr(say('Укажите номер дома', 'Үй нөмірін жазыңыз'));
    if (flat && !a.entrance) return setErr(say('Укажите подъезд', 'Кіреберісті жазыңыз'));
    if (flat && !a.flat) return setErr(say('Укажите квартиру — её никто не увидит', 'Пәтерді жазыңыз — оны ешкім көрмейді'));
    if (!a.consent) return setErr(say('Поставьте галочку согласия', 'Келісім белгісін қойыңыз'));
    setBusy(true);
    try { onSaved(await nbApi.save(a)); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }
  async function leave() {
    setBusy(true);
    try { await nbApi.leave(); onLeft(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <header className="dom-hero dom-hero--slim">
        <div className="dom-w">
          {onCancel && <button type="button" className="dom-back" onClick={onCancel}><ArrowLeft size={18} />{say('Назад к дому', 'Үйге оралу')}</button>}
          <h1>{member ? say('Мой адрес', 'Менің мекенжайым') : say('Где вы живёте?', 'Қай жерде тұрасыз?')}</h1>
          <p>{say('Соседи увидят только ваше имя и подъезд. Квартира и телефон — никогда.', 'Көршілер тек атыңыз бен кіреберісті көреді. Пәтер мен телефон — ешқашан.')}</p>
        </div>
      </header>
      <form className="dom-w dom-pad dom-form" onSubmit={submit} noValidate>
        <div className="dom-seg" role="radiogroup" aria-label={say('Тип дома', 'Үй түрі')}>
          {(['flat', 'private'] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={a.kind === k} onClick={() => set('kind', k)}>
              {k === 'flat' ? <Building2 size={20} /> : <Home size={20} />}
              <span><b>{k === 'flat' ? say('Многоэтажка', 'Көпқабатты үй') : say('Частный дом', 'Жеке үй')}</b>
                <small>{k === 'flat' ? say('Соседи по дому и подъезду', 'Үй мен кіреберіс көршілері') : say('Соседи по улице', 'Көше көршілері')}</small></span>
            </button>
          ))}
        </div>

        <label className="dom-field dom-street">
          <span>{say('Улица', 'Көше')}</span>
          <input id="dom-street" value={a.street} autoComplete="off" placeholder={say('Например: Жекибаева', 'Мысалы: Жекибаева')}
            onChange={(e) => { set('street', e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            role="combobox" aria-expanded={open && matches.length > 0} aria-controls="dom-street-list" />
          {open && matches.length > 0 && !streets.includes(a.street) && (
            <ul id="dom-street-list" role="listbox" className="dom-suggest">
              {matches.map((s) => <li key={s} role="option" aria-selected={false}><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { set('street', s); setOpen(false); }}>{s}</button></li>)}
            </ul>
          )}
          {a.street && streets.length > 0 && !streets.some((s) => norm(s) === norm(a.street)) && !matches.length && (
            <small className="dom-note">{say('Такой улицы нет в нашем списке — проверим вручную.', 'Бұл көше тізімде жоқ — қолмен тексереміз.')}</small>
          )}
        </label>

        <div className={flat ? 'dom-row3' : 'dom-row1'}>
          <label className="dom-field"><span>{say('Дом', 'Үй')}</span>
            <input id="dom-house" value={a.house} inputMode="text" placeholder="135" onChange={(e) => set('house', e.target.value)} /></label>
          {flat && <label className="dom-field"><span>{say('Подъезд', 'Кіреберіс')}</span>
            <input id="dom-entrance" value={a.entrance} inputMode="numeric" placeholder="3" onChange={(e) => set('entrance', e.target.value.replace(/\D/g, '').slice(0, 2))} /></label>}
          {flat && <label className="dom-field"><span>{say('Квартира', 'Пәтер')} <Lock size={12} aria-label={say('скрыто', 'жасырын')} /></span>
            <input id="dom-flat" value={a.flat} inputMode="numeric" placeholder="41" onChange={(e) => set('flat', e.target.value.slice(0, 8))} /></label>}
        </div>
        {flat && <p className="dom-hint"><Lock size={14} />{say('Номер квартиры видите только вы — он нужен для проверки, что вы живёте в этом доме.', 'Пәтер нөмірін тек сіз көресіз — ол тексеру үшін ғана керек.')}</p>}

        <label className="dom-field"><span>{say('Как вас называть соседям', 'Көршілерге атыңыз')}</span>
          <input id="dom-name" value={a.display_name} maxLength={30} placeholder={say('Например: Айгуль', 'Мысалы: Айгүл')} onChange={(e) => set('display_name', e.target.value)} /></label>
        <label className="dom-check"><input type="checkbox" checked={a.anonymous} onChange={(e) => set('anonymous', e.target.checked)} />
          <span>{say('Не показывать имя — писать как', 'Атымды көрсетпеу — былай жазу:')} «{flat ? say(`Сосед из ${a.entrance || 'N'} подъезда`, `${a.entrance || 'N'}-кіреберістің көршісі`) : say('Сосед с улицы', 'Көшедегі көрші')}»</span></label>
        <label className="dom-check"><input id="dom-consent" type="checkbox" checked={a.consent} onChange={(e) => set('consent', e.target.checked)} />
          <span>{say('Согласен(на), чтобы подтверждённые соседи видели моё имя и подъезд. Адрес можно удалить в любой момент.', 'Расталған көршілер атым мен кіреберісімді көруіне келісемін. Мекенжайды кез келген уақытта жоюға болады.')}</span></label>

        {err && <p className="dom-err" role="alert">{err}</p>}
        <button className="dom-btn dom-btn--main" type="submit" disabled={busy} data-testid="dom-save">
          {busy ? <Loader2 className="dom-spin" size={18} /> : <Check size={18} />}{member ? say('Сохранить', 'Сақтау') : say('Готово — к моему дому', 'Дайын — үйіме')}
        </button>
        {member && member.status === 'confirmed' && <p className="dom-note">{say('Если смените дом, соседям нужно будет подтвердить вас заново.', 'Үйді ауыстырсаңыз, көршілер сізді қайта растауы керек.')}</p>}

        {member && (
          <div className="dom-danger">
            {!leaving ? <button type="button" onClick={() => setLeaving(true)}><Trash2 size={16} />{say('Удалить мой адрес и все мои записи', 'Мекенжайым мен барлық жазбаларымды жою')}</button> : (
              <div>
                <p>{say('Удалим адрес, ваши записи и комментарии. Вернуть нельзя.', 'Мекенжай, жазбалар мен пікірлер жойылады. Қайтару мүмкін емес.')}</p>
                <div className="dom-danger-row">
                  <button type="button" className="is-red" disabled={busy} onClick={() => void leave()} data-testid="dom-leave">{say('Да, удалить', 'Иә, жою')}</button>
                  <button type="button" onClick={() => setLeaving(false)}>{say('Отмена', 'Болдырмау')}</button>
                </div>
              </div>
            )}
          </div>
        )}
        
      </form>
    </>
  );
}

/* ---------------- the house ---------------- */
function House({ member, confirm, onChange, reload }: {
  member: NbMember; confirm: NbConfirm; onChange: (r: { member: NbMember; confirm: NbConfirm }) => void; reload: () => Promise<void>;
}) {
  const [say, kz] = useSay();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'people' ? 'people' : 'feed';
  const [house, setHouse] = useState<NbHouse | null>(null);
  const confirmed = member.status === 'confirmed';
  const loadHouse = useCallback(() => nbApi.house().then(setHouse).catch(() => {}), []);
  useEffect(() => { void loadHouse(); }, [loadHouse, member.status]);
  const waiting = house?.waiting.filter((w) => !w.i_confirmed).length || 0;

  return (
    <div className="dom">
      <header className="dom-hero">
        <div className="dom-w">
          <div className="dom-hero-row">
            <span className="dom-kicker">{say('Мой дом', 'Менің үйім')}</span>
            <Link to="/dom?edit=1" className="dom-icon-btn" aria-label={say('Мой адрес и настройки', 'Мекенжай және баптаулар')}><Settings size={18} /></Link>
          </div>
          <h1>{member.title}</h1>
          <p className="dom-hero-meta">
            {member.entrance ? <>{kzEntrance(member.entrance, kz)} · </> : null}
            {say('вы', 'сіз')}: {member.public_name}{member.role === 'elder' && <> · <Crown size={14} /> {say('старший по дому', 'үй ағасы')}</>}
          </p>
          {house && <p className="dom-hero-count"><Users size={16} />{confirmed || house.total ? say(`${house.total} соседей на портале`, `Порталда ${house.total} көрші`) : ''}</p>}
        </div>
      </header>

      <div className="dom-w dom-pad">
        {!confirmed && <ConfirmCard member={member} confirm={confirm} onChange={onChange} reload={reload} />}

        <div className="dom-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'feed'} onClick={() => setParams({}, { replace: true })}>{say('Лента дома', 'Үй таспасы')}</button>
          <button type="button" role="tab" aria-selected={tab === 'people'} onClick={() => setParams({ tab: 'people' }, { replace: true })}>
            {say('Соседи', 'Көршілер')}{house && house.total > 0 && <small>{house.total}</small>}{confirmed && waiting > 0 && <i className="dom-dot" aria-label={say('ждут подтверждения', 'растауды күтуде')}>{waiting}</i>}
          </button>
        </div>
        {tab === 'feed' ? <Feed member={member} confirmed={confirmed} /> : <People member={member} house={house} confirmed={confirmed} reload={loadHouse} />}
      </div>
    </div>
  );
}

function ConfirmCard({ member, confirm, onChange, reload }: {
  member: NbMember; confirm: NbConfirm; onChange: (r: { member: NbMember; confirm: NbConfirm }) => void; reload: () => Promise<void>;
}) {
  const [say] = useSay();
  const [busy, setBusy] = useState(false);
  const [showProof, setShowProof] = useState(confirm.needed === 0);
  const input = useRef<HTMLInputElement>(null);
  const share = `https://wa.me/?text=${encodeURIComponent(inviteText(member.title))}`;
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const image = await shrinkPhoto(file);
      onChange(await nbApi.proof(image));
      toast.success(say('Квитанция отправлена на проверку', 'Түбіртек тексеруге жіберілді'));
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  const waitingProof = confirm.proof_waiting;
  return (
    <section className="dom-confirm" aria-labelledby="dom-confirm-h" data-testid="dom-confirm">
      <h2 id="dom-confirm-h"><ShieldCheck size={20} />{say('Подтвердите, что живёте здесь', 'Осы жерде тұратыныңызды растаңыз')}</h2>
      <p>{say('Пока можно только читать ленту. Писать и видеть соседей — после подтверждения: так в доме будут только свои.', 'Әзірге тек оқуға болады. Жазу және көршілерді көру — растаудан кейін.')}</p>
      {confirm.needed > 0 && (
        <div className="dom-confirm-way">
          <b>{say('Способ 1. Соседи подтвердят', '1-тәсіл. Көршілер растайды')}</b>
          <div className="dom-progress" aria-label={say(`Подтвердили ${confirm.got} из ${confirm.needed}`, `${confirm.needed}-ден ${confirm.got} растады`)}>
            {Array.from({ length: confirm.needed }).map((_, i) => <span key={i} className={i < confirm.got ? 'is-on' : ''}><Check size={14} /></span>)}
            <em>{say(`${confirm.got} из ${confirm.needed}`, `${confirm.needed}-ден ${confirm.got}`)}</em>
          </div>
          <p>{say('Соседи увидят вас во вкладке «Соседи» и нажмут «Да, это сосед». Напомните им:', 'Көршілер сізді «Көршілер» бөлімінен көріп, растайды. Еске салыңыз:')}</p>
          <div className="dom-row-btns">
            <a className="dom-btn dom-btn--wa" href={share} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} />{say('Написать соседям в WhatsApp', 'WhatsApp-та жазу')}</a>
            <button type="button" className="dom-btn dom-btn--ghost" onClick={() => void reload()}><RefreshCw size={16} />{say('Проверить', 'Тексеру')}</button>
          </div>
          {!showProof && <button type="button" className="dom-link" onClick={() => setShowProof(true)}>{say('Или подтвердить квитанцией', 'Немесе түбіртекпен растау')}<ChevronDown size={14} /></button>}
        </div>
      )}
      {showProof && (
        <div className="dom-confirm-way">
          <b>{confirm.needed > 0 ? say('Способ 2. Фото квитанции', '2-тәсіл. Түбіртек фотосы') : say('Вы первый житель дома на портале — подтвердите квитанцией', 'Сіз порталдағы үйдің алғашқы тұрғынысыз — түбіртекпен растаңыз')}</b>
          {waitingProof ? (
            <p className="dom-ok"><Check size={16} />{say('Квитанция получена. Проверим в течение дня — придёт уведомление. Фото удалим сразу после проверки.', 'Түбіртек алынды. Бір күн ішінде тексереміз. Фото тексерістен кейін бірден жойылады.')}</p>
          ) : (
            <>
              <p>{say('Квитанция за свет, воду или газ, где видны адрес и фамилия. Суммы можно закрыть пальцем. Фото видит только администратор и удаляет сразу после проверки.', 'Жарық, су немесе газ түбіртегі — мекенжай мен тегі көрінсін. Сомаларды жабуға болады. Фотоны тек әкімші көреді және тексерістен кейін жояды.')}</p>
              <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} data-testid="dom-proof-input" />
              <button type="button" className="dom-btn dom-btn--main" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? <Loader2 className="dom-spin" size={18} /> : <Camera size={18} />}{say('Сфотографировать квитанцию', 'Түбіртекті суретке түсіру')}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ---------------- feed ---------------- */
const FILTERS: { id: string; ru: string; kz: string }[] = [
  { id: '', ru: 'Все', kz: 'Барлығы' }, { id: 'entrance', ru: 'Мой подъезд', kz: 'Менің кіреберісім' },
  ...KINDS.map((k) => ({ id: k.id, ru: `${k.emoji} ${k.title.ru}`, kz: `${k.emoji} ${k.title.kz}` })),
];

function Feed({ member, confirmed }: { member: NbMember; confirmed: boolean }) {
  const [say, kz] = useSay();
  const [filter, setFilter] = useState('');
  const [items, setItems] = useState<NbPost[] | null>(null);
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [writing, setWriting] = useState(false);
  const gen = useRef(0);
  const query = (f: string, before = '') => ({ before, kind: f && f !== 'entrance' ? f : '', entrance: f === 'entrance' });

  const load = useCallback(async (f: string) => {
    const v = ++gen.current; setError(''); setItems(null);
    try { const r = await nbApi.feed(query(f)); if (v === gen.current) { setItems(r.items); setNext(r.next); } }
    catch (e) { if (v === gen.current) setError(errText(e)); }
  }, []);
  useEffect(() => { void load(filter); }, [filter, load]);
  // Back to the tab after a while → fresh posts without reloading the page.
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible') void load(filter); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [filter, load]);

  async function more() {
    setBusy(true);
    try { const r = await nbApi.feed(query(filter, next)); setItems((x) => [...(x || []), ...r.items.filter((p) => !(x || []).some((o) => o.id === p.id))]); setNext(r.next); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  const filters = FILTERS.filter((f) => f.id !== 'entrance' || member.entrance);

  return (
    <section aria-label={say('Лента дома', 'Үй таспасы')}>
      {confirmed && (
        <button type="button" className="dom-compose-open" onClick={() => setWriting(true)} data-testid="dom-write">
          <span className="dom-compose-av"><Plus size={20} /></span>
          <span><b>{say('Написать соседям', 'Көршілерге жазу')}</b><small>{say('Авария, вопрос, объявление или находка', 'Апат, сұрақ, хабарландыру немесе табылған зат')}</small></span>
        </button>
      )}
      <div className="dom-chips" role="group" aria-label={say('Фильтр', 'Сүзгі')}>
        {filters.map((f) => <button key={f.id || 'all'} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{kz ? f.kz : f.ru}</button>)}
      </div>
      {error ? <Problem text={error} onRetry={() => void load(filter)} />
        : !items ? <div className="dom-list">{[0, 1, 2].map((i) => <div key={i} className="dom-post dom-skel" />)}</div>
          : !items.length ? (
            <div className="dom-empty">
              <b>{filter ? say('Здесь пока пусто', 'Әзірге бос') : say('В доме пока тихо', 'Үйде әзірге тыныш')}</b>
              <p>{confirmed ? say('Напишите первым — например, про собрание или неисправный лифт. И позовите соседей:', 'Бірінші болып жазыңыз. Көршілерді шақырыңыз:') : say('Как только соседи что-то напишут, это появится здесь.', 'Көршілер жазғанда осында пайда болады.')}</p>
              <a className="dom-btn dom-btn--wa" href={`https://wa.me/?text=${encodeURIComponent(inviteText(member.title))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} />{say('Позвать соседей', 'Көршілерді шақыру')}</a>
            </div>
          ) : (
            <div className="dom-list">
              {items.map((p) => <PostCard key={p.id} post={p} confirmed={confirmed} onChange={(np) => setItems((x) => (np ? x!.map((o) => (o.id === np.id ? np : o)) : x!.filter((o) => o.id !== p.id)))} />)}
              {next && <button type="button" className="dom-btn dom-btn--ghost dom-more" disabled={busy} onClick={() => void more()}>{busy ? <Loader2 className="dom-spin" size={16} /> : null}{say('Показать ещё', 'Тағы көрсету')}</button>}
            </div>
          )}
      {writing && <Composer member={member} onClose={() => setWriting(false)} onPosted={(p) => { setWriting(false); setFilter(''); setItems((x) => [p, ...(x || [])]); }} />}
    </section>
  );
}

function Composer({ member, onClose, onPosted }: { member: NbMember; onClose: () => void; onPosted: (p: NbPost) => void }) {
  const [say, kz] = useSay();
  const [kind, setKind] = useState<NbKind>('question');
  const [body, setBody] = useState('');
  const [only, setOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    area.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc); document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [onClose]);
  const placeholders: Record<NbKind, [string, string]> = {
    alarm: ['Например: во 2 подъезде нет света с 8 утра', 'Мысалы: 2-кіреберісте таңғы 8-ден бері жарық жоқ'],
    question: ['Например: кто знает, когда починят домофон?', 'Мысалы: домофонды қашан жөндейді?'],
    notice: ['Например: в субботу в 11:00 собрание жильцов у 1 подъезда', 'Мысалы: сенбі күні 11:00-де жиналыс'],
    lost: ['Например: нашла ключи у подъезда, с синим брелоком', 'Мысалы: кіреберіс жанынан кілт таптым'],
  };
  async function send() {
    if (body.trim().length < 5) return toast.error(say('Напишите чуть подробнее', 'Толығырақ жазыңыз'));
    setBusy(true);
    try { onPosted(await nbApi.create(kind, body, only)); toast.success(kind === 'alarm' || kind === 'notice' ? say('Опубликовано — соседи получат уведомление', 'Жарияланды — көршілерге хабар барады') : say('Опубликовано', 'Жарияланды')); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  return (
    <div className="dom-sheet-wrap" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dom-sheet" role="dialog" aria-modal="true" aria-labelledby="dom-sheet-h">
        <div className="dom-sheet-top"><h2 id="dom-sheet-h">{say('Написать соседям', 'Көршілерге жазу')}</h2>
          <button type="button" className="dom-icon-btn dom-icon-btn--soft" onClick={onClose} aria-label={say('Закрыть', 'Жабу')}><X size={18} /></button></div>
        <div className="dom-kinds" role="radiogroup" aria-label={say('Что случилось', 'Не болды')}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} data-kind={k.id} onClick={() => setKind(k.id)}>
              <span aria-hidden="true">{k.emoji}</span><b>{kz ? k.title.kz : k.title.ru}</b><small>{kz ? k.hint.kz : k.hint.ru}</small>
            </button>
          ))}
        </div>
        <textarea ref={area} id="dom-body" value={body} maxLength={1500} rows={4} placeholder={placeholders[kind][kz ? 1 : 0]} onChange={(e) => setBody(e.target.value)} />
        <div className="dom-sheet-foot">
          {member.entrance ? <label className="dom-check dom-check--small"><input type="checkbox" checked={only} onChange={(e) => setOnly(e.target.checked)} />
            <span>{say(`Только про ${member.entrance} подъезд`, `Тек ${member.entrance}-кіреберіс туралы`)}</span></label> : <span />}
          <span className="dom-count">{body.length}/1500</span>
        </div>
        {(kind === 'alarm' || kind === 'notice') && <p className="dom-hint">{say('Соседи получат уведомление. Пишите по делу.', 'Көршілерге хабарлама барады. Іс бойынша жазыңыз.')}</p>}
        <button type="button" className="dom-btn dom-btn--main" disabled={busy} onClick={() => void send()} data-testid="dom-send">
          {busy ? <Loader2 className="dom-spin" size={18} /> : <Send size={18} />}{say('Опубликовать', 'Жариялау')}
        </button>
      </div>
    </div>
  );
}

function PostCard({ post, confirmed, onChange, full = false }: { post: NbPost; confirmed: boolean; onChange: (p: NbPost | null) => void; full?: boolean }) {
  const [say, kz, lang] = useSay();
  const [menu, setMenu] = useState(false);
  const info = kindInfo(post.kind);
  const help = post.kind === 'alarm' ? helpFor(post.body) : null;
  async function meToo() {
    if (!confirmed) return toast(say('Отмечать можно после подтверждения адреса', 'Мекенжай расталғаннан кейін белгілеуге болады'));
    const optimistic = { ...post, i_me_too: !post.i_me_too, me_too: post.me_too + (post.i_me_too ? -1 : 1) };
    onChange(optimistic);
    try { const r = await nbApi.meToo(post.id); onChange({ ...optimistic, ...r }); } catch (e) { onChange(post); toast.error(errText(e)); }
  }
  async function act(kind: 'report' | 'delete' | 'pin') {
    setMenu(false);
    try {
      if (kind === 'report') { const r = await nbApi.report('post', post.id); toast.success(r.hidden ? say('Запись скрыта', 'Жазба жасырылды') : say('Жалоба отправлена', 'Шағым жіберілді')); if (r.hidden) onChange(null); }
      if (kind === 'delete') { await nbApi.remove(post.id); toast.success(say('Удалено', 'Жойылды')); onChange(null); }
      if (kind === 'pin') { const r = await nbApi.pin(post.id); onChange({ ...post, pinned: r.pinned }); }
    } catch (e) { toast.error(errText(e)); }
  }
  const meTooLabel = post.kind === 'alarm' ? say('У меня тоже', 'Менде де') : say('Важно', 'Маңызды');
  return (
    <article className={`dom-post dom-post--${post.kind}`} data-testid="dom-post">
      <div className="dom-post-top">
        <span className={`dom-kind dom-kind--${post.kind}`}>{info.emoji} {kz ? info.title.kz : info.title.ru}</span>
        {post.pinned && <span className="dom-pin"><Pin size={13} />{say('Закреплено', 'Бекітілген')}</span>}
        {post.entrance && <span className="dom-tag">{kzEntrance(post.entrance, kz)}</span>}
        <span className="dom-time">{timeAgo(post.created_at, lang)}</span>
        {confirmed && (
          <div className="dom-menu">
            <button type="button" className="dom-icon-btn dom-icon-btn--plain" aria-label={say('Ещё действия', 'Басқа әрекеттер')} aria-expanded={menu} onClick={() => setMenu((v) => !v)}><MoreHorizontal size={18} /></button>
            {menu && (
              <div className="dom-menu-pop" role="menu">
                {post.can_moderate && <button type="button" role="menuitem" onClick={() => void act('pin')}><Pin size={15} />{post.pinned ? say('Открепить', 'Босату') : say('Закрепить', 'Бекіту')}</button>}
                {(post.mine || post.can_moderate) && <button type="button" role="menuitem" onClick={() => void act('delete')}><Trash2 size={15} />{say('Удалить', 'Жою')}</button>}
                {!post.mine && <button type="button" role="menuitem" onClick={() => void act('report')}><Flag size={15} />{say('Пожаловаться', 'Шағымдану')}</button>}
              </div>
            )}
          </div>
        )}
      </div>
      <p className="dom-author">{post.author.name}{post.author.entrance && !post.author.name.includes('подъезд') ? ` · ${kzEntrance(post.author.entrance, kz)}` : ''}{post.author.elder && <span className="dom-elder"><Crown size={12} />{say('старший', 'үй ағасы')}</span>}{post.mine && <span className="dom-you">{say('вы', 'сіз')}</span>}</p>
      {full ? <p className="dom-body">{post.body}</p> : <Link to={`/dom/post/${post.id}`} className="dom-body dom-body--clamp">{post.body}</Link>}
      {help && <Link className="dom-help" to={help.href}><ShieldCheck size={15} />{kz ? help.label.kz : help.label.ru}<ArrowUpRight size={14} /></Link>}
      <div className="dom-actions">
        <button type="button" className={`dom-metoo${post.i_me_too ? ' is-on' : ''}`} aria-pressed={post.i_me_too} onClick={() => void meToo()} data-testid="dom-metoo">
          <span aria-hidden="true">{post.kind === 'alarm' ? '✋' : '👍'}</span>{meTooLabel}{post.me_too > 0 && <b>{post.me_too}</b>}
        </button>
        {!full && <Link className="dom-cm" to={`/dom/post/${post.id}`} aria-label={say(`Комментарии: ${post.comments}`, `Пікірлер: ${post.comments}`)}><MessageCircle size={16} />{post.comments > 0 ? post.comments : say('Ответить', 'Жауап беру')}</Link>}
      </div>
    </article>
  );
}

/* ---------------- people ---------------- */
function People({ member, house, confirmed, reload }: { member: NbMember; house: NbHouse | null; confirmed: boolean; reload: () => Promise<void> }) {
  const [say, kz] = useSay();
  const [busy, setBusy] = useState<number | null>(null);
  if (!house) return <div className="dom-list"><div className="dom-post dom-skel" /></div>;
  if (!confirmed || house.locked) {
    return <div className="dom-empty"><Lock size={22} /><b>{say('Соседей видно после подтверждения', 'Көршілер растаудан кейін көрінеді')}</b>
      <p>{say(`В доме уже ${house.total} подтверждённых соседей. Так мы защищаем жильцов от посторонних.`, `Үйде ${house.total} расталған көрші бар. Осылай тұрғындарды бөтендерден қорғаймыз.`)}</p></div>;
  }
  async function confirmOne(id: number) {
    setBusy(id);
    try { const r = await nbApi.confirm(id); toast.success(r.confirmed ? say('Сосед подтверждён', 'Көрші расталды') : say('Спасибо! Нужно ещё одно подтверждение', 'Рахмет! Тағы бір растау керек')); await reload(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  }
  const groups = new Map<string, typeof house.people>();
  for (const p of house.people) { const k = p.entrance ? String(p.entrance) : ''; groups.set(k, [...(groups.get(k) || []), p]); }
  const keys = [...groups.keys()].sort((a, b) => (a === String(member.entrance) ? -1 : b === String(member.entrance) ? 1 : Number(a) - Number(b)));
  return (
    <section aria-label={say('Соседи', 'Көршілер')}>
      {house.waiting.length > 0 && (
        <div className="dom-waiting" data-testid="dom-waiting">
          <h3>{say('Ждут подтверждения', 'Растауды күтуде')}</h3>
          <p>{say('Подтверждайте только тех, кого знаете как соседа.', 'Тек көрші екенін білетіндерді растаңыз.')}</p>
          <ul className="dom-people">
            {house.waiting.map((w) => (
              <li key={w.id}><span className="dom-av">{w.name.slice(0, 1)}</span><div><b>{w.name}</b><small>{kzEntrance(w.entrance, kz) || say('частный дом', 'жеке үй')}</small></div>
                {w.i_confirmed ? <span className="dom-ok-chip"><Check size={14} />{say('Вы подтвердили', 'Растадыңыз')}</span>
                  : <button type="button" className="dom-btn dom-btn--small" disabled={busy === w.id} onClick={() => void confirmOne(w.id)}>{busy === w.id ? <Loader2 className="dom-spin" size={14} /> : <Check size={14} />}{say('Да, это сосед', 'Иә, көршім')}</button>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {keys.map((k) => (
        <div key={k || 'street'} className="dom-group">
          <h3>{k ? (k === String(member.entrance) ? say(`${k} подъезд — ваш`, `${k}-кіреберіс — сіздікі`) : kzEntrance(Number(k), kz)) : say('Соседи по улице', 'Көше көршілері')}<small>{groups.get(k)!.length}</small></h3>
          <ul className="dom-people">
            {groups.get(k)!.map((p) => <li key={p.id}><span className="dom-av">{p.name.slice(0, 1)}</span><div><b>{p.name}{p.me && <span className="dom-you">{say('вы', 'сіз')}</span>}</b>
              <small>{p.elder ? say('Старший по дому', 'Үй ағасы') : say('Сосед', 'Көрші')}</small></div>{p.elder && <Crown size={16} className="dom-crown" />}</li>)}
          </ul>
        </div>
      ))}
      <a className="dom-btn dom-btn--wa dom-invite" href={`https://wa.me/?text=${encodeURIComponent(inviteText(member.title))}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={18} />{say('Позвать соседей в WhatsApp', 'Көршілерді WhatsApp арқылы шақыру')}</a>
    </section>
  );
}

/* ============================== /dom/post/:id ============================== */
export function NeighborPostPage() {
  const [say, , lang] = useSay();
  usePageSeo({ title: 'Мой дом — запись — Сортировка 24', description: 'Обсуждение в «Мой дом».' });
  const { id } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<NbPostFull | null>(null);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError('');
    try {
      const [p, me] = await Promise.all([nbApi.get(Number(id)), nbApi.me()]);
      setPost(p); setConfirmed(me.member?.status === 'confirmed');
    } catch (e) { setError(errText(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function send(ev: React.FormEvent) {
    ev.preventDefault();
    if (text.trim().length < 2) return;
    setBusy(true);
    try { setPost(await nbApi.comment(Number(id), text)); setText(''); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  async function commentAct(cid: number, kind: 'delete' | 'report') {
    try {
      if (kind === 'delete') { await nbApi.removeComment(cid); toast.success(say('Удалено', 'Жойылды')); }
      else { const r = await nbApi.report('comment', cid); toast.success(r.hidden ? say('Комментарий скрыт', 'Пікір жасырылды') : say('Жалоба отправлена', 'Шағым жіберілді')); }
      await load();
    } catch (e) { toast.error(errText(e)); }
  }

  return (
    <Layout>
      <div className="dom">
        <div className="dom-w dom-pad dom-thread-page">
          <Link to="/dom" className="dom-back dom-back--dark"><ArrowLeft size={18} />{say('Лента дома', 'Үй таспасы')}</Link>
          {error ? <Problem text={error} onRetry={() => void load()} />
            : !post ? <div className="dom-post dom-skel" />
              : (
                <>
                  {post.hidden && <p className="dom-err">{say('Запись скрыта по жалобам соседей — её видите только вы.', 'Жазба шағымдар бойынша жасырылды — оны тек сіз көресіз.')}</p>}
                  <PostCard post={post} confirmed={confirmed} full onChange={(p) => (p ? setPost({ ...post, ...p }) : navigate('/dom'))} />
                  <h2 className="dom-thread-h">{post.thread.length ? say(`Ответы соседей · ${post.thread.length}`, `Көршілердің жауаптары · ${post.thread.length}`) : say('Пока без ответов', 'Әзірге жауап жоқ')}</h2>
                  <ul className="dom-thread">
                    {post.thread.map((c) => (
                      <li key={c.id} className={c.is_author ? 'is-author' : ''}>
                        <span className="dom-av">{c.author.name.slice(0, 1)}</span>
                        <div>
                          <p className="dom-c-top"><b>{c.author.name}</b>{c.is_author && <span className="dom-tag">{say('автор', 'автор')}</span>}{c.author.elder && <span className="dom-elder"><Crown size={12} /></span>}<span className="dom-time">{timeAgo(c.created_at, lang)}</span></p>
                          <p className="dom-c-body">{c.body}</p>
                          {confirmed && <div className="dom-c-acts">
                            {c.mine ? <button type="button" onClick={() => void commentAct(c.id, 'delete')}>{say('Удалить', 'Жою')}</button>
                              : <button type="button" onClick={() => void commentAct(c.id, 'report')}>{say('Пожаловаться', 'Шағымдану')}</button>}
                          </div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {confirmed ? (
                    <form className="dom-reply" onSubmit={send}>
                      <textarea id="dom-reply" value={text} rows={1} maxLength={800} placeholder={say('Ответить соседям…', 'Көршілерге жауап…')}
                        onChange={(e) => { setText(e.target.value); e.currentTarget.style.height = 'auto'; e.currentTarget.style.height = `${Math.min(160, e.currentTarget.scrollHeight)}px`; }} />
                      <button type="submit" className="dom-icon-btn dom-icon-btn--send" disabled={busy || text.trim().length < 2} aria-label={say('Отправить', 'Жіберу')} data-testid="dom-reply-send">
                        {busy ? <Loader2 className="dom-spin" size={18} /> : <Send size={18} />}</button>
                    </form>
                  ) : <p className="dom-note dom-note--box"><Lock size={14} />{say('Отвечать можно после подтверждения адреса.', 'Мекенжай расталғаннан кейін жауап беруге болады.')}</p>}
                  
                </>
              )}
        </div>
      </div>
    </Layout>
  );
}

/* ---------------- small parts ---------------- */
function Problem({ text, onRetry }: { text: string; onRetry: () => void }) {
  const [say] = useSay();
  return <div className="dom-empty" role="alert"><b>{text}</b><button type="button" className="dom-btn dom-btn--ghost" onClick={onRetry}><RefreshCw size={16} />{say('Повторить', 'Қайталау')}</button></div>;
}
function Skeleton() {
  return <><div className="dom-hero"><div className="dom-w"><div className="dom-skel-line" /><div className="dom-skel-line dom-skel-line--big" /></div></div>
    <div className="dom-w dom-pad"><div className="dom-list">{[0, 1].map((i) => <div key={i} className="dom-post dom-skel" />)}</div></div></>;
}
