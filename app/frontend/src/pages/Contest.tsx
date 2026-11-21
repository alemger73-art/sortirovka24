/**
 * «Новогодняя Сортировка» — /konkurs: the most festive yard and house of the district.
 * Residents send photos, the owner checks them, everyone signed in votes once per nomination, the owner names winners.
 */
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, Gift, Home, Loader2, Trash2, Trees, Trophy, X } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePageSeo } from '@/hooks/usePageSeo';
import { getAccountToken } from '@/lib/accountApi';
import { openAuthPrompt } from '@/lib/localAuth';
import { shrinkPhoto } from '@/lib/photo';
import { contestApi, dayLabel, photoUrl, type ContestView, type Nomination, type OwnEntry, type PublicEntry } from '@/lib/contest';
import '@/styles/contest.css';

type Say = (ru: string, kz: string) => string;
const MAX_PHOTOS = 5;
const errText = (e: unknown) => (e instanceof Error ? e.message : 'Не получилось, попробуйте ещё раз');

const NOMINATIONS: Record<Nomination, { ru: string; kz: string; hintRu: string; hintKz: string; Icon: typeof Trees }> = {
  yard: { ru: 'Новогодний двор', kz: 'Жаңажылдық аула', hintRu: 'Двор или подъезд, который украсили всем домом', hintKz: 'Бүкіл үймен безендірілген аула не подъезд', Icon: Trees },
  house: { ru: 'Новогодний дом', kz: 'Жаңажылдық үй', hintRu: 'Частный дом, балкон или окно', hintKz: 'Жеке үй, балкон немесе терезе', Icon: Home },
};

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
function EntryCard({ entry, say, canVote, votedHere, busy, onVote }: {
  entry: PublicEntry; say: Say; canVote: boolean; votedHere: boolean; busy: boolean; onVote: () => void;
}) {
  return (
    <article className={`kn-card${entry.place ? ` is-place-${entry.place}` : ''}`}>
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
          {canVote && !entry.mine && (
            <button type="button" className="kn-vote" onClick={onVote} disabled={busy || votedHere}>
              {votedHere ? <><Check size={16} />{say('Ваш голос', 'Сіздің дауыс')}</> : say('Голосовать', 'Дауыс беру')}
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
        {(Object.keys(NOMINATIONS) as Nomination[]).map((n) => {
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
              placeholder={nomination === 'yard' ? say('Например: Двор на Уранова, 10', 'Мысалы: Уранов, 10 аула') : say('Например: Дом с оленями', 'Мысалы: Бұғылы үй')} />
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
    title: say('Новогодняя Сортировка — конкурс на лучший двор и дом', 'Жаңажылдық Сортировка — үздік аула мен үй байқауы'),
    description: say('Украсьте двор или дом к Новому году, пришлите фото и получите подарок. Голосуют жители Сортировки.', 'Аулаңызды не үйіңізді безендіріп, фото жіберіп, сыйлық алыңыз.'),
  });
  const [view, setView] = useState<ContestView | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Nomination>('yard');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => contestApi.view().then(setView).catch((e) => setError(errText(e))), []);
  useEffect(() => { void load(); }, [load]);

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
            <p className="kn-lead">{say('Украсьте двор или дом, пришлите фото — жители района выберут самые красивые. Победители получат подарки к Новому году.',
              'Аулаңызды не үйіңізді безендіріп, фото жіберіңіз — аудан тұрғындары ең әдемісін таңдайды. Жеңімпаздар сыйлық алады.')}</p>
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
            <div><h2><Gift size={20} />{say('Подарки', 'Сыйлықтар')}</h2><p>{kz ? view.settings.prizes_kz : view.settings.prizes_ru}</p></div>
          </section>

          {view.mine.entries.length > 0 && (
            <section className="kn-own">
              <h2>{say('Ваши заявки', 'Сіздің өтінімдеріңіз')}</h2>
              {view.mine.entries.map((e) => (
                <div key={e.id} className="kn-own-row">
                  {e.photos[0] && <img src={photoUrl(e.photos[0])} alt="" />}
                  <div><strong>{e.title}</strong><small>{kz ? NOMINATIONS[e.nomination].kz : NOMINATIONS[e.nomination].ru}</small></div>
                  <span className={`kn-status is-${e.status}`}>{statusText[e.status]}</span>
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
                {(Object.keys(NOMINATIONS) as Nomination[]).map((n) => (
                  <button key={n} type="button" role="tab" aria-selected={tab === n} onClick={() => setTab(n)}>{kz ? NOMINATIONS[n].kz : NOMINATIONS[n].ru}</button>
                ))}
              </div>
              {view.phase === 'vote' && (
                <p className="kn-note">{view.mine.votes[tab]
                  ? say('Вы уже проголосовали в этой номинации. Спасибо!', 'Бұл номинацияда дауыс бердіңіз. Рақмет!')
                  : say('Один голос в каждой номинации. Выберите самый красивый.', 'Әр номинацияда бір дауыс. Ең әдемісін таңдаңыз.')}</p>
              )}
              {shown.length ? (
                <div className="kn-grid">
                  {shown.map((e) => (
                    <EntryCard key={e.id} entry={e} say={say} busy={busy} canVote={view.phase === 'vote' && !view.mine.votes[tab]}
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
              <li>{say('Участвуют дворы, подъезды, частные дома, балконы и окна Сортировки.', 'Сортировканың аулалары, подъездері, жеке үйлері, балкондары мен терезелері қатыса алады.')}</li>
              <li>{say('Одна заявка в каждой номинации от одного номера телефона.', 'Бір телефон нөмірінен әр номинацияға бір өтінім.')}</li>
              <li>{say('Каждую заявку проверяем перед публикацией. Имена и телефоны участников не показываем.', 'Әр өтінімді жарияламас бұрын тексереміз. Қатысушылардың аты мен телефоны көрсетілмейді.')}</li>
              <li>{say('Голосуют жители, вошедшие по номеру телефона: один голос в каждой номинации, за себя голосовать нельзя.', 'Телефон нөмірімен кірген тұрғындар дауыс береді: әр номинацияда бір дауыс, өзіңізге беруге болмайды.')}</li>
            </ul>
          </section>
        </div>
      </div>
    </Layout>
  );
}
