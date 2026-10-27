/**
 * «Шақыру» — electronic invitations to a той.
 * /toy — what it is and the price; /toy/new and /toy/edit/:id — builder; /toy/my — my invitations and guests;
 * /toy/:slug — the invitation guests open (no site header, made for WhatsApp links).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, Copy, Eye, Loader2, MessageCircle, Pencil, Plus, Send, Trash2, Users, X,
} from 'lucide-react';
import Layout from '@/components/Layout';
import ToyInviteView from '@/components/toy/ToyInviteView';
import { getAccountToken } from '@/lib/accountApi';
import { track, visitorId } from '@/lib/analytics';
import { usePageSeo } from '@/hooks/usePageSeo';
import {
  KINDS, KIND_INFO, PROGRAMS, SAMPLE, TEXTS, emptyData, tenge, toyApi,
  type ToyData, type ToyGuest, type ToyInvite, type ToyKind, type ToyTheme,
} from '@/lib/toyInvites';
import '@/styles/ads.css';

const THEMES: { id: ToyTheme; ru: string; swatch: [string, string] }[] = [
  { id: 'night', ru: 'Вечерний', swatch: ['#0d2430', '#d4b26a'] },
  { id: 'pomegranate', ru: 'Гранатовый', swatch: ['#3a0f17', '#e3b867'] },
  { id: 'ivory', ru: 'Светлый', swatch: ['#f7f3ea', '#a8823b'] },
  { id: 'sky', ru: 'Небесный', swatch: ['#eaf4fb', '#2b7bb9'] },
];
const STATUS: Record<string, { ru: string; cls: string }> = {
  draft: { ru: 'Черновик', cls: 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-300' },
  pending: { ru: 'Ждём оплату', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' },
  published: { ru: 'Открыто для гостей', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200' },
  rejected: { ru: 'Не опубликовано', cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200' },
};
const field = 'w-full rounded-xl border border-[var(--ads-line)] bg-[var(--ads-panel)] px-4 py-3 text-base outline-none transition focus:border-[#3864ed] focus:ring-4 focus:ring-[#3864ed]/15';
const label = 'mb-1.5 block text-sm font-medium';

function usePrice() {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => { toyApi.config().then((c) => setPrice(c.price)).catch(() => setPrice(4990)); }, []);
  return price;
}
const fmtDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; };
const whoOf = (d: ToyData) => [d.name1, KIND_INFO[d.kind]?.two ? d.name2 : ''].filter(Boolean).join(' и ');

/* ======================= LANDING ======================= */
export function ToyLanding() {
  const price = usePrice();
  usePageSeo({ title: 'Электронное приглашение на той — Сортировка 24', description: 'Красивое приглашение на свадьбу, қыз ұзату, сүндет той, тұсаукесер и юбилей на казахском и русском. Ответы гостей, карта, программа — одна ссылка для WhatsApp.' });
  const steps = [
    { t: 'Выберите той', d: 'Свадьба, қыз ұзату, сүндет той, тұсаукесер или юбилей.' },
    { t: 'Заполните данные', d: 'Имена, дата, ресторан. Красивый текст на казахском и русском уже готов — его можно поправить.' },
    { t: 'Выберите оформление', d: 'Четыре стиля, сразу видно, как увидят гости.' },
    { t: 'Оплатите и разошлите', d: 'После оплаты Kaspi вы получите ссылку для WhatsApp. Ответы гостей — у вас в кабинете.' },
  ];
  return (
    <Layout>
      <div className="ads-surface pb-20">
        <header className="ads-hero">
          <div className="ads-shell relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0">
              <span className="ads-kicker">Сортировка 24 · Шақыру</span>
              <h1>Приглашение <span>на той</span></h1>
              <p>Красивое электронное приглашение на казахском и русском. Гости открывают одну ссылку из WhatsApp: дата, обратный отсчёт, карта, программа — и сразу отвечают, придут ли.</p>
              <div className="ads-hero-facts">
                <span><Check className="h-4 w-4" />Ответы гостей у вас в кабинете</span>
                <span><Check className="h-4 w-4" />Готово за 10 минут</span>
                <span><Check className="h-4 w-4" />Оплата Kaspi</span>
              </div>
              <div className="ads-hero-actions">
                <Link to="/toy/new" data-testid="toy-create" className="ads-btn ads-btn-primary"><Plus className="h-5 w-5" />Создать приглашение</Link>
                <Link to="/toy/my" className="ads-btn ads-btn-glass">Мои приглашения</Link>
              </div>
              {price != null && <p className="mt-4 !text-sm">Стоимость — <b className="text-white">{tenge(price)}</b> за приглашение. Сделать и посмотреть можно бесплатно, платите только когда всё нравится.</p>}
            </div>
            <div className="toy-phone hidden lg:block"><ToyInviteView data={SAMPLE} demo showFooter={false} /></div>
          </div>
        </header>

        <div className="ads-shell">
          <section className="mt-10">
            <h2 className="text-2xl font-bold tracking-tight">Как это работает</h2>
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((s, i) => (
                <li key={s.t} className="ads-panel p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ads-accent-soft)] font-bold text-[var(--ads-accent)]">{i + 1}</span>
                  <b className="mt-3 block">{s.t}</b>
                  <p className="mt-1 text-sm text-[var(--ads-muted)]">{s.d}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-10">
            <h2 className="text-2xl font-bold tracking-tight">Для какого тоя</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              {KINDS.map((k) => (
                <Link key={k} to={`/toy/new?kind=${k}`} className="ads-card p-4 transition hover:border-[#3864ed]">
                  <b>{KIND_INFO[k].title.ru}</b>
                  <span className="mt-1 text-sm text-[var(--ads-muted)]">{KIND_INFO[k].hint.ru}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-10 lg:hidden">
            <h2 className="text-2xl font-bold tracking-tight">Так увидят гости</h2>
            <div className="toy-phone mt-4"><ToyInviteView data={SAMPLE} demo showFooter={false} /></div>
          </section>
        </div>
      </div>
    </Layout>
  );
}

/* ======================= BUILDER ======================= */
const DRAFT_KEY = 's24_toy_draft_v1';
function loadDraft(): ToyData | null { try { const v = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return v && v.kind ? { ...emptyData(v.kind), ...v } : null; } catch { return null; } }

export function ToyBuilder() {
  const { id } = useParams();
  const editId = id ? Number(id) : null;
  const navigate = useNavigate();
  const price = usePrice();
  const [data, setData] = useState<ToyData | null>(() => {
    if (editId) return null;
    const kind = new URLSearchParams(location.search).get('kind') as ToyKind | null;
    const saved = loadDraft();
    if (kind && KIND_INFO[kind] && (!saved || saved.kind !== kind)) return emptyData(kind);
    return saved || emptyData('wedding');
  });
  const [invite, setInvite] = useState<ToyInvite | null>(null);
  const [step, setStep] = useState(editId ? 2 : 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  usePageSeo({ title: 'Создать приглашение на той — Сортировка 24' });

  useEffect(() => {
    if (!editId) return;
    toyApi.get(editId).then((inv) => { setInvite(inv); setData({ ...emptyData(inv.data.kind), ...inv.data }); })
      .catch(() => { toast.error('Не удалось открыть приглашение'); navigate('/toy/my'); });
  }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (data && !editId) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch { /* storage off */ } } }, [data, editId]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  if (!data) return <Layout><div className="flex justify-center py-24 text-gray-400"><Loader2 className="h-7 w-7 animate-spin" /></div></Layout>;
  const info = KIND_INFO[data.kind];
  const set = (patch: Partial<ToyData>) => { setData((d) => (d ? { ...d, ...patch } : d)); setError(''); };

  function chooseKind(kind: ToyKind) {
    const keepText = data!.text_kz !== TEXTS[data!.kind].kz || data!.text_ru !== TEXTS[data!.kind].ru;
    set({ kind, theme: KIND_INFO[kind].theme, ...(keepText ? {} : { text_kz: TEXTS[kind].kz, text_ru: TEXTS[kind].ru }),
      program: PROGRAMS[kind].map((p) => ({ ...p })), name2: KIND_INFO[kind].two ? data!.name2 : '' });
    setStep(2);
  }
  function checkDetails() {
    if (!data!.name1.trim()) return `Напишите: ${info.name1.ru.toLowerCase()}`;
    if (info.two && !data!.name2.trim()) return `Напишите: ${info.name2!.ru.toLowerCase()}`;
    if (!data!.date) return 'Укажите дату тоя';
    if (!/^\d\d:\d\d$/.test(data!.time)) return 'Укажите время начала';
    if (!data!.place.trim()) return 'Напишите, где проходит той';
    return '';
  }
  async function save(): Promise<ToyInvite | null> {
    const problem = checkDetails();
    if (problem) { setError(problem); setStep(2); return null; }
    if (!getAccountToken()) { navigate(`/account?redirect=${encodeURIComponent(location.pathname + location.search)}`); return null; }
    setBusy(true);
    try {
      const saved = invite ? await toyApi.update(invite.id, data!) : await toyApi.create(data!);
      setInvite(saved);
      if (!invite) { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage off */ } track('toy_create', { kind: data!.kind }); window.history.replaceState(null, '', `/toy/edit/${saved.id}`); }
      return saved;
    } catch (e: any) { setError(e?.message || 'Не получилось сохранить'); return null; } finally { setBusy(false); }
  }
  async function saveAndFinish() { if (await save()) setStep(4); }
  async function pay() {
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    try { const inv = await toyApi.publish(saved.id); setInvite(inv); track('toy_publish', { kind: data!.kind }); toast.success('Ссылка на оплату отправлена в WhatsApp'); }
    catch (e: any) { setError(e?.message || 'Не получилось отправить'); } finally { setBusy(false); }
  }

  const steps = ['Той', 'Данные', 'Оформление', 'Готово'];
  const preview = <div className="toy-phone"><ToyInviteView key={`${data.theme}-${data.langs}`} data={data} demo showFooter={false} /></div>;

  return (
    <Layout hideBottomNav>
      <div className="ads-surface pb-28">
        <div className="ads-shell pt-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button type="button" onClick={() => (step > 1 ? setStep(step - 1) : navigate('/toy'))} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--ads-muted)]"><ArrowLeft className="h-4 w-4" />{step > 1 ? 'Назад' : 'Приглашения'}</button>
            {price != null && <span className="ads-chip">{tenge(price)} · оплата после просмотра</span>}
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{editId ? 'Изменить приглашение' : 'Приглашение на той'}</h1>
          <ol className="mt-4 grid grid-cols-4 gap-2" aria-label="Шаги">
            {steps.map((s, i) => (
              <li key={s} aria-current={step === i + 1 ? 'step' : undefined}>
                <button type="button" disabled={i + 1 > step && !invite} onClick={() => setStep(i + 1)} className="w-full text-left">
                  <div className={`h-1.5 rounded-full ${step > i ? 'bg-[#3864ed]' : 'bg-[var(--ads-line)]'}`} />
                  <p className={`mt-1.5 text-xs ${step === i + 1 ? 'font-semibold' : 'text-[var(--ads-muted)]'}`}>{i + 1}. {s}</p>
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0">
              {step === 1 && (
                <section>
                  <h2 className="text-lg font-semibold">Какой той?</h2>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {KINDS.map((k) => (
                      <button key={k} type="button" data-kind={k} onClick={() => chooseKind(k)} aria-pressed={data.kind === k}
                        className={`ads-card p-4 text-left ${data.kind === k ? '!border-[#3864ed] ring-2 ring-[#3864ed]/30' : ''}`}>
                        <b>{KIND_INFO[k].title.ru}</b>
                        <span className="mt-1 text-sm text-[var(--ads-muted)]">{KIND_INFO[k].hint.ru}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {step === 2 && (
                <section className="space-y-5">
                  <button type="button" onClick={() => setStep(1)} className="ads-chip">{info.title.ru}<Pencil className="h-3.5 w-3.5" /></button>
                  <div className={`grid gap-4 ${info.two ? 'sm:grid-cols-2' : ''}`}>
                    <div><label htmlFor="toy-name1" className={label}>{info.name1.ru}</label><input id="toy-name1" className={field} value={data.name1} maxLength={40} onChange={(e) => set({ name1: e.target.value })} placeholder={info.two ? 'Айбек' : 'Имя'} /></div>
                    {info.two && <div><label htmlFor="toy-name2" className={label}>{info.name2!.ru}</label><input id="toy-name2" className={field} value={data.name2} maxLength={40} onChange={(e) => set({ name2: e.target.value })} placeholder="Аружан" /></div>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label htmlFor="toy-date" className={label}>Дата</label><input id="toy-date" type="date" className={field} value={data.date} onChange={(e) => set({ date: e.target.value })} /></div>
                    <div><label htmlFor="toy-time" className={label}>Начало</label><input id="toy-time" type="time" className={field} value={data.time} onChange={(e) => set({ time: e.target.value })} /></div>
                  </div>
                  <div><label htmlFor="toy-place" className={label}>Где проходит той</label><input id="toy-place" className={field} value={data.place} maxLength={80} onChange={(e) => set({ place: e.target.value })} placeholder="Ресторан «Мерей»" /></div>
                  <div><label htmlFor="toy-address" className={label}>Адрес <span className="font-normal text-[var(--ads-muted)]">· гости смогут открыть его на карте</span></label><input id="toy-address" className={field} value={data.address} maxLength={160} onChange={(e) => set({ address: e.target.value })} placeholder="Караганда, ул. Ермекова, 12" /></div>
                  <div><label htmlFor="toy-map" className={label}>Ссылка на 2ГИС <span className="font-normal text-[var(--ads-muted)]">· необязательно</span></label><input id="toy-map" className={field} value={data.map_url} maxLength={300} onChange={(e) => set({ map_url: e.target.value.trim() })} placeholder="https://2gis.kz/karaganda/firm/…" /></div>
                  <div><label htmlFor="toy-hosts" className={label}>Той иелері — хозяева тоя</label><input id="toy-hosts" className={field} value={data.hosts} maxLength={120} onChange={(e) => set({ hosts: e.target.value })} placeholder="Нұрлан – Гүлнар" /></div>
                  <div>
                    <p className={label}>Язык приглашения</p>
                    <div className="flex flex-wrap gap-2">
                      {([['both', 'Қазақша и русский'], ['kz', 'Только қазақша'], ['ru', 'Только русский']] as const).map(([v, t]) => (
                        <button key={v} type="button" aria-pressed={data.langs === v} onClick={() => set({ langs: v })} className="ads-pill">{t}</button>
                      ))}
                    </div>
                  </div>
                  {data.langs !== 'ru' && <div><label htmlFor="toy-text-kz" className={label}>Текст на казахском <span className="font-normal text-[var(--ads-muted)]">· уже готов, можно поправить</span></label><textarea id="toy-text-kz" className={`${field} min-h-[110px]`} value={data.text_kz} maxLength={700} onChange={(e) => set({ text_kz: e.target.value })} /></div>}
                  {data.langs !== 'kz' && <div><label htmlFor="toy-text-ru" className={label}>Текст на русском</label><textarea id="toy-text-ru" className={`${field} min-h-[110px]`} value={data.text_ru} maxLength={700} onChange={(e) => set({ text_ru: e.target.value })} /></div>}
                  <div>
                    <p className={label}>Программа</p>
                    <div className="space-y-2">
                      {data.program.map((p, i) => (
                        <div key={i} className="grid grid-cols-[92px_minmax(0,1fr)_auto] gap-2">
                          <input aria-label="Время" type="time" className={field} value={p.time} onChange={(e) => set({ program: data.program.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)) })} />
                          <input aria-label="Что происходит" className={field} value={p.ru} maxLength={120} onChange={(e) => { const v = e.target.value; set({ program: data.program.map((x, j) => (j === i ? { ...x, ru: v, kz: PROGRAMS[data.kind].find((d) => d.ru === v)?.kz || '' } : x)) }); }} />
                          <button type="button" aria-label="Убрать пункт" onClick={() => set({ program: data.program.filter((_, j) => j !== i) })} className="flex h-12 w-11 items-center justify-center rounded-xl border border-[var(--ads-line)] text-[var(--ads-muted)]"><X className="h-4 w-4" /></button>
                        </div>
                      ))}
                      {data.program.length < 8 && <button type="button" onClick={() => set({ program: [...data.program, { time: '', kz: '', ru: '' }] })} className="text-sm font-semibold text-[var(--ads-accent)]">+ Добавить пункт</button>}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ads-muted)]">Стандартные пункты уже переведены на казахский. Свои пункты гости увидят как написано.</p>
                  </div>
                  {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
                  <button type="button" data-testid="toy-next" onClick={() => { const p = checkDetails(); if (p) setError(p); else setStep(3); }} className="ads-btn ads-btn-primary w-full sm:w-auto">Дальше: оформление<ArrowRight className="h-5 w-5" /></button>
                </section>
              )}

              {step === 3 && (
                <section>
                  <h2 className="text-lg font-semibold">Оформление</h2>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {THEMES.map((th) => (
                      <button key={th.id} type="button" aria-pressed={data.theme === th.id} data-theme-pick={th.id} onClick={() => set({ theme: th.id })}
                        className={`ads-card p-3 text-left ${data.theme === th.id ? '!border-[#3864ed] ring-2 ring-[#3864ed]/30' : ''}`}>
                        <span className="flex h-16 items-center justify-center rounded-xl" style={{ background: th.swatch[0] }}><span className="h-8 w-8 rounded-full border-2" style={{ borderColor: th.swatch[1] }} /></span>
                        <b className="mt-2 text-sm">{th.ru}</b>
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 lg:hidden">{preview}</div>
                  {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
                  <button type="button" data-testid="toy-save" disabled={busy} onClick={() => void saveAndFinish()} className="ads-btn ads-btn-primary mt-6 w-full sm:w-auto">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{getAccountToken() ? 'Сохранить' : 'Войти и сохранить'}</button>
                </section>
              )}

              {step === 4 && invite && (
                <section className="ads-panel p-6">
                  {invite.status === 'published' ? <>
                    <h2 className="text-xl font-bold">Приглашение открыто для гостей 🎉</h2>
                    <p className="mt-2 text-[var(--ads-muted)]">Изменения сохранены — гости уже видят новую версию.</p>
                  </> : invite.status === 'pending' ? <>
                    <h2 className="text-xl font-bold">Ждём оплату</h2>
                    <p className="mt-2 text-[var(--ads-muted)]">Ссылка на оплату Kaspi отправлена вам в WhatsApp. Как только оплата придёт, приглашение откроется для гостей, и мы сообщим об этом.</p>
                  </> : <>
                    <h2 className="text-xl font-bold">Сохранено</h2>
                    <p className="mt-2 text-[var(--ads-muted)]">Посмотрите приглашение так, как его увидят гости. Если всё нравится — опубликуйте: ссылка на оплату придёт в WhatsApp.</p>
                  </>}
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link to={`/toy/${invite.slug}`} className="ads-btn border border-[var(--ads-line)]"><Eye className="h-5 w-5" />Посмотреть как гость</Link>
                    {invite.status !== 'published' && invite.status !== 'pending' && (
                      <button type="button" data-testid="toy-pay" disabled={busy} onClick={() => void pay()} className="ads-btn ads-btn-primary">{busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}Опубликовать{price != null ? ` — ${tenge(price)}` : ''}</button>
                    )}
                    <Link to="/toy/my" className="ads-btn border border-[var(--ads-line)]">Мои приглашения</Link>
                  </div>
                  {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
                </section>
              )}
            </div>
            <aside className="hidden lg:sticky lg:top-20 lg:block">{preview}</aside>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ======================= MY INVITATIONS ======================= */
export function ToyMine() {
  const [items, setItems] = useState<ToyInvite[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [guests, setGuests] = useState<Record<number, ToyGuest[]>>({});
  usePageSeo({ title: 'Мои приглашения — Сортировка 24' });
  const load = () => toyApi.mine().then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { void load(); }, []);

  async function toggleGuests(id: number) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    try { const g = await toyApi.guests(id); setGuests((m) => ({ ...m, [id]: g.items })); } catch { toast.error('Не удалось загрузить гостей'); }
  }
  async function copy(link: string) { try { await navigator.clipboard.writeText(link); toast.success('Ссылка скопирована'); } catch { toast.info(link); } }
  async function remove(inv: ToyInvite) {
    if (!window.confirm('Удалить приглашение? Гости больше не смогут его открыть.')) return;
    try { await toyApi.remove(inv.id); setItems((l) => (l || []).filter((x) => x.id !== inv.id)); } catch { toast.error('Не получилось удалить'); }
  }
  const waText = (inv: ToyInvite) => encodeURIComponent(`Сізді тойымызға шақырамыз! Приглашаем вас на наш той: ${inv.link}`);

  return (
    <Layout>
      <div className="ads-surface pb-20">
        <div className="ads-shell pt-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><span className="block text-[11px] font-bold uppercase tracking-[.1em] text-[var(--ads-accent)]">Шақыру</span><h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Мои приглашения</h1></div>
            <Link to="/toy/new" className="ads-btn ads-btn-primary"><Plus className="h-5 w-5" />Новое приглашение</Link>
          </div>
          {items === null ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[var(--ads-muted)]" /></div>
            : items.length === 0 ? (
              <div className="ads-panel mt-6 px-6 py-12 text-center">
                <p className="text-lg font-bold">Пока нет приглашений</p>
                <p className="mt-1 text-sm text-[var(--ads-muted)]">Сделайте первое — это займёт 10 минут, а заплатить нужно только когда всё понравится.</p>
                <Link to="/toy/new" className="ads-btn ads-btn-primary mt-5"><Plus className="h-5 w-5" />Создать приглашение</Link>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {items.map((inv) => {
                  const st = STATUS[inv.status] || STATUS.draft;
                  return (
                    <li key={inv.id} className="ads-panel p-5" data-testid="toy-mine-item">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.ru}</span>
                        <span className="text-xs text-[var(--ads-muted)]">{KIND_INFO[inv.data.kind]?.title.ru} · {fmtDate(inv.data.date)} {inv.data.time}</span>
                      </div>
                      <p className="mt-2 text-lg font-bold">{whoOf(inv.data)}</p>
                      {inv.status === 'published' && (
                        <p className="mt-1 text-sm text-[var(--ads-muted)]">Открыли: <b className="text-[var(--ads-ink)]">{inv.views || 0}</b> · придут: <b className="text-[var(--ads-ink)]">{inv.guests?.people || 0}</b> чел. ({inv.guests?.coming || 0} ответов) · не смогут: {inv.guests?.declined || 0}</p>
                      )}
                      {inv.status === 'pending' && <p className="mt-1 text-sm text-[var(--ads-muted)]">Ссылка на оплату {inv.price ? tenge(inv.price) : ''} в WhatsApp. После оплаты приглашение откроется для гостей.</p>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link to={`/toy/${inv.slug}`} className="ads-btn min-h-[42px] border border-[var(--ads-line)] px-4 text-sm"><Eye className="h-4 w-4" />Открыть</Link>
                        <Link to={`/toy/edit/${inv.id}`} className="ads-btn min-h-[42px] border border-[var(--ads-line)] px-4 text-sm"><Pencil className="h-4 w-4" />Изменить</Link>
                        {inv.status === 'published' ? <>
                          <button type="button" onClick={() => void copy(inv.link)} className="ads-btn min-h-[42px] border border-[var(--ads-line)] px-4 text-sm"><Copy className="h-4 w-4" />Ссылка</button>
                          <a href={`https://wa.me/?text=${waText(inv)}`} target="_blank" rel="noopener noreferrer" className="ads-btn min-h-[42px] bg-[#16a34a] px-4 text-sm text-white"><MessageCircle className="h-4 w-4" />Разослать</a>
                          <button type="button" onClick={() => void toggleGuests(inv.id)} aria-expanded={open === inv.id} className="ads-btn ads-btn-primary min-h-[42px] px-4 text-sm"><Users className="h-4 w-4" />Гости<ChevronDown className={`h-4 w-4 transition ${open === inv.id ? 'rotate-180' : ''}`} /></button>
                        </> : inv.status !== 'pending' ? (
                          <Link to={`/toy/edit/${inv.id}`} onClick={() => track('toy_pay_from_list')} className="ads-btn ads-btn-primary min-h-[42px] px-4 text-sm"><Send className="h-4 w-4" />Опубликовать</Link>
                        ) : null}
                        <button type="button" onClick={() => void remove(inv)} aria-label="Удалить" className="ads-btn min-h-[42px] border border-red-200 px-3 text-sm text-red-600 dark:border-red-900"><Trash2 className="h-4 w-4" /></button>
                      </div>
                      {open === inv.id && (
                        <div className="mt-4 border-t border-[var(--ads-line)] pt-4">
                          {!guests[inv.id] ? <Loader2 className="h-5 w-5 animate-spin" /> : guests[inv.id].length === 0 ? <p className="text-sm text-[var(--ads-muted)]">Пока никто не ответил. Разошлите ссылку в WhatsApp.</p> : (
                            <ul className="divide-y divide-[var(--ads-line)]">
                              {guests[inv.id].map((g, i) => (
                                <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 text-sm">
                                  <b>{g.name}</b>
                                  <span className={g.coming ? 'text-green-700 dark:text-green-400' : 'text-[var(--ads-muted)]'}>{g.coming ? `придёт · ${g.guests} чел.` : 'не сможет'}</span>
                                  {g.wish && <span className="basis-full text-[var(--ads-muted)]">«{g.wish}»</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
        </div>
      </div>
    </Layout>
  );
}

/* ======================= PUBLIC INVITATION ======================= */
export function ToyPublic() {
  const { slug = '' } = useParams();
  const [state, setState] = useState<{ data: ToyData; preview: boolean; owner: boolean } | 'missing' | null>(null);
  useEffect(() => {
    toyApi.publicGet(slug).then((r) => setState({ data: r.data, preview: r.preview, owner: r.owner })).catch(() => setState('missing'));
  }, [slug]);
  const title = useMemo(() => (state && state !== 'missing' ? `${whoOf(state.data)} — шақыру` : 'Шақыру'), [state]);
  usePageSeo({ title, description: 'Приглашение на той' });

  if (state === null) return <div className="flex min-h-screen items-center justify-center bg-[#0d2430] text-[#d4b26a]"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (state === 'missing') return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0d2430] px-6 text-center text-[#f6efe1]">
      <p className="text-xl font-semibold">Шақыру табылмады</p>
      <p className="text-sm text-[#b9c6c4]">Приглашение не найдено или ещё не опубликовано. Проверьте ссылку у хозяев тоя.</p>
      <a href="/toy" className="mt-2 text-sm text-[#d4b26a] underline">Что такое «Шақыру»</a>
    </div>
  );
  return (
    <div className="toy-public min-h-screen">
      {state.owner && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-center gap-3 bg-[#101d36] px-4 py-2 text-sm text-white">
          <span>{state.preview ? 'Предпросмотр: гости увидят приглашение после оплаты' : 'Так видят гости'}</span>
          <Link to="/toy/my" className="font-semibold text-[#9fbcff] underline">Мои приглашения</Link>
        </div>
      )}
      <ToyInviteView data={state.data} onRsvp={state.preview ? undefined : async (p) => { await toyApi.rsvp(slug, { visitor: visitorId(), ...p }); track('toy_rsvp', { coming: p.coming }); }} />
    </div>
  );
}
