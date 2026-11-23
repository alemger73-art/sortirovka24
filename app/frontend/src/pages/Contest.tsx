/**
 * «Новогодняя Сортировка» — /konkurs: yard, house, window/balcony, snowman and New Year pet of the district.
 * Residents send photos, the owner checks them, everyone signed in votes once a day in each nomination (each voting day
 * is a ticket in the voters' draw), participants share their entry link, the owner names winners and holds the draw.
 * /konkurs?e=ID opens that entry.
 */
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppWindow, Camera, Check, Gift, Home, Loader2, PawPrint, Share2, Snowflake, Ticket, Trash2, Trees, Trophy, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageSeo } from '@/hooks/usePageSeo';
import { getAccountToken } from '@/lib/accountApi';
import { openAuthPrompt } from '@/lib/localAuth';
import { shrinkPhoto } from '@/lib/photo';
import { contestApi, dayLabel, entryLink, photoUrl, type ContestView, type Nomination, type OwnEntry, type PublicEntry } from '@/lib/contest';
import '@/styles/contest.css';

type Say = (ru: string, kz: string) => string;
const MAX_PHOTOS = 5;
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось, попробуйте ещё раз');

type NominationInfo = { ru: string; kz: string; tabRu: string; tabKz: string; hintRu: string; hintKz: string; exampleRu: string; exampleKz: string; Icon: typeof Trees };
const NOMINATIONS: Record<Nomination, NominationInfo> = {
  yard: { ru: 'Новогодний двор', kz: 'Жаңажылдық аула', tabRu: 'Двор', tabKz: 'Аула', hintRu: 'Двор или подъезд, который украсили всем домом', hintKz: 'Бүкіл үймен безендірілген аула не подъезд',
    exampleRu: 'Двор на Уранова, 10', exampleKz: 'Уранов, 10 аула', Icon: Trees },
  house: { ru: 'Новогодний дом', kz: 'Жаңажылдық үй', tabRu: 'Дом', tabKz: 'Үй', hintRu: 'Частный дом снаружи: фасад, ворота, ёлка во дворе', hintKz: 'Жеке үй сырттай: қасбет, қақпа, аулада шырша',
    exampleRu: 'Дом с оленями', exampleKz: 'Бұғылы үй', Icon: Home },
  window: { ru: 'Окно или балкон', kz: 'Терезе не балкон', tabRu: 'Окно/балкон', tabKz: 'Терезе/балкон', hintRu: 'Для многоэтажек: украшенное окно или балкон', hintKz: 'Көпқабатты үйлерге: безендірілген терезе не балкон',
    exampleRu: 'Балкон-гирлянда', exampleKz: 'Шамшырақты балкон', Icon: AppWindow },
  snowman: { ru: 'Снеговик Сортировки', kz: 'Сортировка аққаласы', tabRu: 'Снеговик', tabKz: 'Аққала', hintRu: 'Слепите снеговика во дворе — всей семьёй или с соседями', hintKz: 'Аулада аққала жасаңыз — отбасымен не көршілермен',
    exampleRu: 'Снеговик-машинист', exampleKz: 'Машинист аққала', Icon: Snowflake },
  pet: { ru: 'Новогодний питомец', kz: 'Жаңажылдық үй жануары', tabRu: 'Питомец', tabKz: 'Жануар', hintRu: 'Кот, собака или другой любимец в праздничном образе', hintKz: 'Мысық, ит не басқа жануар мерекелік бейнеде',
    exampleRu: 'Кот Барсик в колпаке', exampleKz: 'Қалпақ киген Барсик', Icon: PawPrint },
};
const NOMINATION_KEYS = Object.keys(NOMINATIONS) as Nomination[];

/** Phone share sheet when there is one, otherwise WhatsApp — the chats where neighbours are. */
async function shareEntry(entry: { id: number; title: string }, say: Say) {
  const url = entryLink(entry.id);
  const text = say(`Проголосуйте за «${entry.title}» в конкурсе «Новогодняя Сортировка» — голосовать можно каждый день!`,
    `«Жаңажылдық Сортировка» байқауында «${entry.title}» үшін дауыс беріңіз — күн сайын дауыс беруге болады!`);
  if (navigator.share) {
    try { await navigator.share({ title: say('Новогодняя Сортировка', 'Жаңажылдық Сортировка'), text, url }); return; } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
    }
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function askLogin(say: Say, why: 'vote' | 'apply') {
  openAuthPrompt('/konkurs', why === 'vote'
    ? { title: say('Войдите, чтобы проголосовать', 'Дауыс беру үшін кіріңіз'), text: say('Голос привязан к номеру телефона — так никто не накрутит.', 'Дауыс телефон нөміріне байланады — ешкім алдай алмайды.') }
    : { title: say('Войдите, чтобы участвовать', 'Қатысу үшін кіріңіз'), text: say('Заявку подают по номеру телефона, чтобы мы могли связаться с победителем.', 'Жеңімпазбен хабарласу үшін өтінім телефон нөмірі арқылы беріледі.') });
}

/* ------------------------------ steps ------------------------------ */
function Steps({ view, say, kz }: { view: ContestView; say: Say; kz: boolean }) {
  const s = view.settings;
  const steps = [
    { key: 'apply', title: say('Заявки', 'Өтінімдер'), when: `${dayLabel(s.apply_from, kz)} – ${dayLabel(s.apply_to, kz)}` },
    { key: 'vote', title: say('Голосование', 'Дауыс беру'), when: `${dayLabel(s.vote_from, kz)} – ${dayLabel(s.vote_to, kz)}` },
    { key: 'results', title: say('Итоги и подарки', 'Қорытынды мен сыйлықтар'), when: dayLabel(nextDay(s.vote_to), kz) },
  ];
  const order = ['soon', 'apply', 'wait', 'vote', 'results'];
  const at = order.indexOf(view.phase);
  return (
    <ol className="kn-steps">
      {steps.map((st) => {
        const pos = order.indexOf(st.key);
        const state = view.phase === st.key ? 'now' : at > pos ? 'done' : 'next';
        return (
          <li key={st.key} className={`kn-step is-${state}`}>
            <span className="kn-step-dot" aria-hidden="true">{state === 'done' ? <Check size={14} /> : null}</span>
            <strong>{st.title}</strong><small>{st.when}</small>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------ entry card ------------------------------ */
function EntryCard({ entry, say, canVote, votedHere, busy, focused, onVote }: {
  entry: PublicEntry; say: Say; canVote: boolean; votedHere: boolean; busy: boolean; focused: boolean; onVote: () => void;
}) {
  return (
    <article id={`kn-e-${entry.id}`} className={`kn-card${entry.place ? ` is-place-${entry.place}` : ''}${focused ? ' is-focused' : ''}`}>
      <div className="kn-photos" tabIndex={0} aria-label={say('Фото участника', 'Қатысушы фотолары')}>
        {entry.photos.map((p, i) => <img key={p} src={photoUrl(p)} alt={i === 0 ? entry.title : ''} loading="lazy" decoding="async" />)}
      </div>
      {entry.photos.length > 1 && <span className="kn-count">{say(`${entry.photos.length} фото →`, `${entry.photos.length} фото →`)}</span>}
      {entry.place && <span className="kn-place"><Trophy size={14} />{say(`${entry.place} место`, `${entry.place} орын`)}</span>}
      <div className="kn-card-body">
        <h3>{entry.title}</h3>
        <p className="kn-street">{entry.street}</p>
        {entry.about && <p className="kn-about">{entry.about}</p>}
        <div className="kn-card-foot">
          {entry.votes !== null && <span className="kn-votes">{say(`Голосов: ${entry.votes}`, `Дауыс: ${entry.votes}`)}</span>}
          {entry.mine && <span className="kn-mine">{say('Ваша заявка', 'Сіздің өтінім')}</span>}
          <button type="button" className="kn-icon" onClick={() => void shareEntry(entry, say)} aria-label={say('Поделиться', 'Бөлісу')}><Share2 size={18} /></button>
          {(canVote || votedHere) && !entry.mine && (
            <button type="button" className="kn-vote" onClick={onVote} disabled={busy || votedHere}>
              {votedHere ? <><Check size={16} />{say('Голос на сегодня', 'Бүгінгі дауыс')}</> : say('Голосовать', 'Дауыс беру')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/* ------------------------------ apply form ------------------------------ */
function ApplyForm({ say, kz, own, onDone }: { say: Say; kz: boolean; own: OwnEntry[]; onDone: () => void }) {
  const [nomination, setNomination] = useState<Nomination>('yard');
  const existing = own.find((e) => e.nomination === nomination);
  const [title, setTitle] = useState('');
  const [street, setStreet] = useState('');
  const [about, setAbout] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [agree, setAgree] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(existing?.title || ''); setStreet(existing?.street || ''); setAbout(existing?.about || ''); setPhotos(existing?.photos || []);
  }, [existing]);

  const locked = existing?.status === 'published';

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!getAccountToken()) { askLogin(say, 'apply'); return; }
    setUploading(true);
    try {
      const room = MAX_PHOTOS - photos.length;
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        added.push((await contestApi.uploadPhoto(await shrinkPhoto(file, 1600, 0.8))).key);
      }
      setPhotos((p) => [...p, ...added]);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!getAccountToken()) { askLogin(say, 'apply'); return; }
    setSending(true);
    try {
      await contestApi.submit({ nomination, title, street, about, photos });
      toast.success(say('Заявка отправлена. Мы проверим её и опубликуем.', 'Өтінім жіберілді. Тексеріп, жариялаймыз.'));
      onDone();
    } catch (err) {
      toast.error(errText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="kn-form" onSubmit={submit} id="apply">
      <h2>{say('Подать заявку', 'Өтінім беру')}</h2>
      <div className="kn-noms" role="radiogroup" aria-label={say('Номинация', 'Номинация')}>
        {NOMINATION_KEYS.map((n) => {
          const N = NOMINATIONS[n];
          return (
            <button type="button" role="radio" aria-checked={nomination === n} key={n} onClick={() => setNomination(n)} className="kn-nom">
              <N.Icon size={20} /><span><strong>{kz ? N.kz : N.ru}</strong><small>{kz ? N.hintKz : N.hintRu}</small></span>
            </button>
          );
        })}
      </div>
      {locked ? (
        <p className="kn-note">{say('Ваша заявка в этой номинации уже участвует.', 'Бұл номинациядағы өтініміңіз қатысып жатыр.')}</p>
      ) : (
        <>
          {existing?.status === 'rejected' && (
            <p className="kn-note is-warn">{say('Заявку вернули на доработку', 'Өтінім қайтарылды')}{existing.reason ? `: ${existing.reason}` : ''}</p>
          )}
          <label className="kn-field" htmlFor="kn-title">{say('Название', 'Атауы')}
            <input id="kn-title" value={title} maxLength={80} required minLength={3} onChange={(e) => setTitle(e.target.value)}
              placeholder={say(`Например: ${NOMINATIONS[nomination].exampleRu}`, `Мысалы: ${NOMINATIONS[nomination].exampleKz}`)} />
          </label>
          <label className="kn-field" htmlFor="kn-street">{say('Улица', 'Көше')}
            <input id="kn-street" value={street} maxLength={80} required minLength={3} onChange={(e) => setStreet(e.target.value)}
              placeholder={say('Только улица и номер дома, без квартиры', 'Тек көше мен үй нөмірі, пәтерсіз')} />
          </label>
          <label className="kn-field" htmlFor="kn-about">{say('Пара слов (необязательно)', 'Бірер сөз (міндетті емес)')}
            <textarea id="kn-about" value={about} maxLength={500} rows={3} onChange={(e) => setAbout(e.target.value)}
              placeholder={say('Кто украшал, что придумали своими руками', 'Кім безендірді, не ойлап таптыңыздар')} />
          </label>
          <div className="kn-field">
            {say(`Фото (до ${MAX_PHOTOS})`, `Фото (${MAX_PHOTOS}-ке дейін)`)}
            <div className="kn-thumbs">
              {photos.map((p) => (
                <span key={p} className="kn-thumb">
                  <img src={photoUrl(p)} alt="" />
                  <button type="button" aria-label={say('Убрать фото', 'Фотоны алып тастау')} onClick={() => setPhotos((all) => all.filter((x) => x !== p))}><X size={14} /></button>
                </span>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button type="button" className="kn-add" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 className="kn-spin" size={22} /> : <Camera size={22} />}
                  <span>{say('Добавить', 'Қосу')}</span>
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
          </div>
          <label className="kn-check" htmlFor="kn-agree">
            <input id="kn-agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
            <span>{say('Фото сделаны мной. На них нет лиц детей, номеров машин и квартир. Согласен на публикацию на сайте и в «Сортировка Официал».',
              'Фотоларды өзім түсірдім. Оларда балалардың беті, көлік және пәтер нөмірлері жоқ. Сайтта және «Сортировка Официал»-да жариялауға келісемін.')}</span>
          </label>
          <button type="submit" className="kn-primary" disabled={sending || uploading || !agree || photos.length === 0}>
            {sending ? <Loader2 className="kn-spin" size={18} /> : null}
            {existing ? say('Отправить заново', 'Қайта жіберу') : say('Отправить заявку', 'Өтінімді жіберу')}
          </button>
        </>
      )}
    </form>
  );
}

/* ------------------------------ page ------------------------------ */
export default function ContestPage() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const say: Say = useCallback((ru, k) => (kz ? k : ru), [kz]);
  usePageSeo({
    title: say('Новогодняя Сортировка — конкурс двора, дома, снеговика и питомца', 'Жаңажылдық Сортировка — аула, үй, аққала және үй жануары байқауы'),
    description: say('Украсьте двор, дом или балкон, слепите снеговика, нарядите питомца — пришлите фото. Голосуйте каждый день и выигрывайте подарки.',
      'Аулаңызды, үйіңізді не балконды безендіріңіз, аққала жасаңыз — фото жіберіңіз. Күн сайын дауыс беріп, сыйлық ұтыңыз.'),
  });
  const [view, setView] = useState<ContestView | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Nomination>('yard');
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const focusId = Number(params.get('e')) || 0;

  const load = useCallback(() => contestApi.view().then(setView).catch((e) => setError(errText(e))), []);
  useEffect(() => { void load(); }, [load]);

  // A shared link opens the entry's nomination and scrolls to it once the list is there.
  const focusEntry = view?.entries.find((e) => e.id === focusId);
  useEffect(() => {
    if (!focusEntry) return;
    setTab(focusEntry.nomination);
    const timer = window.setTimeout(() => document.getElementById(`kn-e-${focusEntry.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    return () => window.clearTimeout(timer);
  }, [focusEntry]);

  const shown = useMemo(() => (view?.entries || []).filter((e) => e.nomination === tab), [view, tab]);

  async function vote(entry: PublicEntry) {
    if (!getAccountToken()) { askLogin(say, 'vote'); return; }
    setBusy(true);
    try {
      await contestApi.vote(entry.id);
      toast.success(say('Спасибо, голос принят!', 'Рақмет, дауысыңыз қабылданды!'));
      await load();
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(entry: OwnEntry) {
    setBusy(true);
    try { await contestApi.withdraw(entry.id); await load(); } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  if (error) return <Layout><div className="kn"><p className="kn-empty" role="alert">{error}</p></div></Layout>;
  if (!view) return <Layout><div className="kn kn-loading"><Loader2 className="kn-spin" size={28} /></div></Layout>;

  const statusText = { pending: say('На проверке', 'Тексерілуде'), published: say('Участвует', 'Қатысуда'), rejected: say('Нужно поправить', 'Түзету керек') };

  return (
    <Layout>
      <div className="kn">
        <section className="kn-hero">
          <div className="kn-in">
            <p className="kn-kicker">{say('Конкурс Сортировка 24', 'Сортировка 24 байқауы')}</p>
            <h1><span className="kn-script">{say('Новогодняя', 'Жаңажылдық')}</span> {say('Сортировка', 'Сортировка')}</h1>
            <p className="kn-lead">{say('Украсьте двор, дом или балкон, слепите снеговика, нарядите питомца — пришлите фото. Жители голосуют каждый день, победители и голосующие получат подарки.',
              'Аулаңызды, үйіңізді не балконды безендіріңіз, аққала жасаңыз, үй жануарыңызды киіндіріңіз — фото жіберіңіз. Тұрғындар күн сайын дауыс береді, жеңімпаздар мен дауыс бергендер сыйлық алады.')}</p>
            {view.phase === 'off' ? (
              <p className="kn-note">{say('Конкурс сейчас не проводится.', 'Байқау қазір өткізілмейді.')}</p>
            ) : (
              <>
                <Steps view={view} say={say} kz={kz} />
                {view.phase === 'apply' && <a href="#apply" className="kn-primary">{say('Участвовать', 'Қатысу')}</a>}
                {view.phase === 'vote' && <a href="#entries" className="kn-primary">{say('Голосовать', 'Дауыс беру')}</a>}
              </>
            )}
          </div>
        </section>

        <div className="kn-in kn-body">
          <section className="kn-prizes">
            <img src="/seasonal/gift.webp" alt="" width={300} height={213} />
            <div>
              <h2><Gift size={20} />{say('Подарки', 'Сыйлықтар')}</h2><p>{kz ? view.settings.prizes_kz : view.settings.prizes_ru}</p>
              {(kz ? view.settings.sponsors_kz : view.settings.sponsors_ru) && (
                <p className="kn-sponsors">{say('Спонсоры: ', 'Демеушілер: ')}{kz ? view.settings.sponsors_kz : view.settings.sponsors_ru}</p>
              )}
            </div>
          </section>

          {view.phase !== 'off' && (
            <section className="kn-draw">
              <h2><Ticket size={20} />{say('Розыгрыш для голосующих', 'Дауыс бергендерге ұтыс')}</h2>
              <p>{kz ? view.settings.draw_kz : view.settings.draw_ru}</p>
              {view.signed_in && ['vote', 'results'].includes(view.phase) && (
                <p className="kn-tickets">{say(`Ваши билетики: ${view.mine.tickets}`, `Сіздің билеттеріңіз: ${view.mine.tickets}`)}</p>
              )}
              {view.draw.length > 0 && (
                <div className="kn-winners"><strong>{say('Выиграли подарки:', 'Сыйлық ұтқандар:')}</strong>
                  <ul>{view.draw.map((w) => <li key={w}>{w}</li>)}</ul></div>
              )}
            </section>
          )}

          {view.mine.entries.length > 0 && (
            <section className="kn-own">
              <h2>{say('Ваши заявки', 'Сіздің өтінімдеріңіз')}</h2>
              {view.mine.entries.map((e) => (
                <div key={e.id} className="kn-own-row">
                  {e.photos[0] && <img src={photoUrl(e.photos[0])} alt="" />}
                  <div><strong>{e.title}</strong><small>{kz ? NOMINATIONS[e.nomination].kz : NOMINATIONS[e.nomination].ru}</small></div>
                  <span className={`kn-status is-${e.status}`}>{statusText[e.status]}</span>
                  {e.status === 'published' && (
                    <button type="button" className="kn-icon" onClick={() => void shareEntry(e, say)} aria-label={say('Позвать голосовать', 'Дауысқа шақыру')}><Share2 size={18} /></button>
                  )}
                  {view.phase === 'apply' && (
                    <button type="button" className="kn-icon" onClick={() => void withdraw(e)} disabled={busy} aria-label={say('Отозвать заявку', 'Өтінімді кері алу')}><Trash2 size={18} /></button>
                  )}
                </div>
              ))}
            </section>
          )}

          {view.phase === 'apply' && <ApplyForm say={say} kz={kz} own={view.mine.entries} onDone={() => void load()} />}

          {view.phase !== 'off' && view.phase !== 'soon' && (
            <section id="entries" className="kn-entries">
              <div className="kn-tabs" role="tablist">
                {NOMINATION_KEYS.map((n) => (
                  <button key={n} type="button" role="tab" aria-selected={tab === n} onClick={() => setTab(n)}>{kz ? NOMINATIONS[n].tabKz : NOMINATIONS[n].tabRu}</button>
                ))}
              </div>
              {view.phase === 'vote' && (
                <p className="kn-note">{view.mine.votes[tab]
                  ? say('Сегодня вы уже голосовали здесь — приходите завтра, это ещё один билетик в розыгрыше!', 'Бүгін осында дауыс бердіңіз — ертең келіңіз, бұл ұтыста тағы бір билет!')
                  : say('Голосовать можно раз в день в каждой номинации. Каждый день голосования — билетик в розыгрыше подарков.', 'Әр номинацияда күніне бір рет дауыс беруге болады. Дауыс берген әр күн — ұтыста бір билет.')}</p>
              )}
              {shown.length ? (
                <div className="kn-grid">
                  {shown.map((e) => (
                    <EntryCard key={e.id} entry={e} say={say} busy={busy} focused={e.id === focusId} canVote={view.phase === 'vote' && !view.mine.votes[tab]}
                      votedHere={view.mine.votes[tab] === e.id} onVote={() => void vote(e)} />
                  ))}
                </div>
              ) : (
                <p className="kn-empty">{view.phase === 'apply'
                  ? say('Заявки появятся здесь после проверки. Станьте первым!', 'Өтінімдер тексерілген соң осында шығады. Бірінші болыңыз!')
                  : say('В этой номинации пока нет участников.', 'Бұл номинацияда әзірге қатысушы жоқ.')}</p>
              )}
            </section>
          )}

          <section className="kn-rules">
            <h2>{say('Правила', 'Ережелер')}</h2>
            <ul>
              <li>{say('Участвуют дворы, подъезды, частные дома, балконы и окна Сортировки, снеговики и питомцы жителей района.', 'Сортировканың аулалары, подъездері, жеке үйлері, балкондары мен терезелері, аудан тұрғындарының аққалалары мен үй жануарлары қатыса алады.')}</li>
              <li>{say('Одна заявка в каждой номинации от одного номера телефона.', 'Бір телефон нөмірінен әр номинацияға бір өтінім.')}</li>
              <li>{say('Каждую заявку проверяем перед публикацией. Имена и телефоны участников не показываем.', 'Әр өтінімді жарияламас бұрын тексереміз. Қатысушылардың аты мен телефоны көрсетілмейді.')}</li>
              <li>{say('Голосуют жители, вошедшие по номеру телефона: раз в день в каждой номинации, за себя голосовать нельзя.', 'Телефон нөмірімен кірген тұрғындар дауыс береді: әр номинацияда күніне бір рет, өзіңізге беруге болмайды.')}</li>
              <li>{say('Каждый день, когда вы голосовали, — билетик в розыгрыше для голосующих. Чем больше дней, тем больше шансов. Розыгрыш — после голосования, один подарок в одни руки.',
                'Дауыс берген әр күн — дауыс бергендер ұтысындағы билет. Күн көп болған сайын мүмкіндік көп. Ұтыс дауыс беру аяқталған соң, бір адамға бір сыйлық.')}</li>
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  );
}
