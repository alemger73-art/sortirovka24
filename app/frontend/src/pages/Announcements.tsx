/**
 * «Объявления» — a simple 3-step form, a friendly list and a detail page.
 * New ads go to the owner's Telegram for one-tap approval (backend: services/ad_moderation.py);
 * the author gets a notice in the cabinet and WhatsApp. Posting is free.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Camera, Check, ChevronLeft, Clock, EyeOff, Flag, Heart, Loader2, MapPin, Megaphone,
  MessageCircle, Pencil, Phone, Plus, Search, Share2, ShieldCheck, Trash2, X,
} from 'lucide-react';
import Layout from '@/components/Layout';
import StorageImg from '@/components/StorageImg';
import MultiImageUpload from '@/components/MultiImageUpload';
import SafetyAlert from '@/components/SafetyAlert';
import { useLanguage } from '@/contexts/LanguageContext';
import { client, withRetry, timeAgo, formatDate } from '@/lib/api';
import { invalidateAllCaches } from '@/lib/cache';
import { getAPIBaseURL } from '@/lib/config';
import { accountApi } from '@/lib/accountApi';
import { getAccountPrefill, getCurrentUser, onAuthChanged, pushCabinetItem } from '@/lib/localAuth';
import { track } from '@/lib/analytics';
import { usePageSeo } from '@/hooks/usePageSeo';
import PromoSlot from '@/components/PromoSlot';
import { adEvent, observeImpression } from '@/lib/adStats';
import {
  type AnnCategory, fetchAnnouncementCategories, filterPublicAnnouncements, getAnnouncementCover,
  loadAnnFavorites, sortAnnouncements, toggleAnnFavorite,
} from '@/lib/announcements';
import { AD_FILTERS, AD_KINDS, AD_KIND_MAP, type AdKind, type Bi, formatAdPrice, formatKzPhone, kindOf, normalizeKzPhone } from '@/lib/adKinds';

function useTx() {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  return { kz, tx: (ru: string, kzText: string) => (kz ? kzText : ru), bi: (v: Bi) => (kz ? v.kz : v.ru) };
}

const DRAFT_KEY = 's24_ad_draft_v1';
type Draft = {
  kind: AdKind | ''; title: string; description: string; price: string; extra: string; address: string;
  photos: string; name: string; phone: string; whatsappSame: boolean; whatsapp: string;
};
const EMPTY: Draft = { kind: '', title: '', description: '', price: '', extra: '', address: '', photos: '', name: '', phone: '', whatsappSame: true, whatsapp: '' };

function loadDraft(): Draft {
  try { return { ...EMPTY, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') || {}) }; } catch { return EMPTY; }
}
function saveDraft(d: Draft) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* storage off */ } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage off */ } }

const field = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-amber-900/40';
const chip = (on: boolean) => `rounded-full border px-3.5 py-2 text-sm font-medium transition ${on ? 'border-amber-500 bg-amber-500 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'}`;

/** A saved ad → the form's draft (the work-schedule line goes back into its chip). */
function draftFromAd(a: any): Draft {
  const kind = (AD_KIND_MAP[String(a.ann_type || '')] ? a.ann_type : '') as AdKind | '';
  const info = kind ? AD_KIND_MAP[kind] : undefined;
  let description = String(a.description || '');
  let extra = '';
  if (info?.extra) {
    const prefix = `${info.extra.label.ru}: `;
    const first = description.split('\n')[0];
    if (first.startsWith(prefix) && info.extra.options.some((o) => o.ru === first.slice(prefix.length))) {
      extra = first.slice(prefix.length);
      description = description.split('\n').slice(1).join('\n');
    }
  }
  const phone = String(a.phone || '');
  const wa = String(a.whatsapp || '');
  const same = !wa || normalizeKzPhone(wa) === normalizeKzPhone(phone);
  return {
    kind, title: String(a.title || ''), description, extra,
    price: kind === 'free' ? '' : String(a.price || ''), address: String(a.address || ''),
    photos: String(a.gallery_images || a.image_url || ''), name: String(a.author_name || ''), phone,
    whatsappSame: same, whatsapp: same ? '' : wa,
  };
}

/* ======================= NEW / EDIT AD: 3 STEPS ======================= */
export function NewAdWizard() { return <AdWizard />; }

export function EditAdWizard() {
  const { tx } = useTx();
  const { id } = useParams();
  const navigate = useNavigate();
  const [initial, setInitial] = useState<{ draft: Draft; status: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    accountApi.getMyAnnouncement(Number(id))
      .then((a: any) => setInitial({ draft: draftFromAd(a), status: String(a.status || '') }))
      .catch(() => { toast.error(tx('Не удалось открыть объявление', 'Хабарландыру ашылмады')); navigate('/cabinet?tab=announcements'); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!initial) return <Layout hideBottomNav hideFooter><div className="flex justify-center py-24 text-gray-400"><Loader2 className="h-7 w-7 animate-spin" /></div></Layout>;
  return <AdWizard editId={Number(id)} initial={initial.draft} />;
}

function AdWizard({ editId, initial }: { editId?: number; initial?: Draft } = {}) {
  const { tx, bi } = useTx();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editing = Boolean(editId);
  const [draft, setDraft] = useState<Draft>(() => {
    if (initial) return initial;
    const d = loadDraft();
    const preset = params.get('type');
    return preset && AD_KIND_MAP[preset] && !d.kind ? { ...d, kind: preset as AdKind } : d;
  });
  const [step, setStep] = useState<1 | 2 | 3>(() => (draft.kind ? 2 : 1));
  const [editingContacts, setEditingContacts] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ id?: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const topRef = useRef<HTMLDivElement>(null);
  const info = draft.kind ? AD_KIND_MAP[draft.kind] : undefined;

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => { const next = { ...d, ...patch }; if (!editing) saveDraft(next); return next; });
    setErrors((e) => (Object.keys(patch).some((k) => e[k]) ? Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))) : e));
  };

  useEffect(() => {
    const apply = () => {
      const p = getAccountPrefill();
      setDraft((d) => ({ ...d, name: d.name || p.name || '', phone: d.phone || p.phone || '' }));
      accountApi.me().then((me: any) => setDraft((d) => ({ ...d, name: d.name || me?.name || '', phone: d.phone || me?.phone || '' }))).catch(() => {});
    };
    apply();
    return onAuthChanged(apply);
  }, []);
  useEffect(() => { topRef.current?.scrollIntoView({ block: 'start' }); if (step === 3 && normalizeKzPhone(draft.phone).length < 11) setEditingContacts(true); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { track('ad_form_step', { step, kind: draft.kind || undefined }); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseKind(kind: AdKind) {
    const extraValid = AD_KIND_MAP[kind].extra?.options.some((o) => o.ru === draft.extra);
    set({ kind, extra: extraValid ? draft.extra : '', price: AD_KIND_MAP[kind].price ? draft.price : '' });
    setStep(2);
  }

  function checkStep2() {
    const e: Record<string, string> = {};
    if (draft.title.trim().length < 3) e.title = tx('Напишите, что это, хотя бы 3 буквы', 'Не екенін жазыңыз, кемінде 3 әріп');
    if (draft.description.trim().length < 10) e.description = tx('Опишите чуть подробнее — хотя бы одно предложение', 'Сәл толығырақ жазыңыз — кемінде бір сөйлем');
    if (info?.extra && draft.kind === 'lost' && !draft.extra) e.extra = tx('Выберите: потеряли или нашли', 'Таңдаңыз: жоғалттыңыз ба, таптыңыз ба');
    setErrors(e);
    if (Object.keys(e).length) { toast.error(Object.values(e)[0]); return false; }
    return true;
  }
  function checkStep3() {
    const e: Record<string, string> = {};
    if (normalizeKzPhone(draft.phone).length < 11) e.phone = tx('Укажите номер телефона, например +7 700 123 45 67', 'Телефон нөмірін жазыңыз, мысалы +7 700 123 45 67');
    if (!draft.whatsappSame && draft.whatsapp && normalizeKzPhone(draft.whatsapp).length < 11) e.whatsapp = tx('Проверьте номер WhatsApp', 'WhatsApp нөмірін тексеріңіз');
    setErrors(e);
    if (Object.keys(e).length) { setEditingContacts(true); toast.error(Object.values(e)[0]); return false; }
    return true;
  }

  function buildPayload() {
    const desc = [draft.extra && info?.extra ? `${info.extra.label.ru}: ${draft.extra}` : '', draft.description.trim()].filter(Boolean).join('\n');
    const phone = `+${normalizeKzPhone(draft.phone)}`;
    const whatsapp = draft.whatsappSame ? phone : (draft.whatsapp ? `+${normalizeKzPhone(draft.whatsapp)}` : '');
    const photos = draft.photos.split(',').map((k) => k.trim()).filter(Boolean);
    return {
      ann_type: draft.kind, title: draft.title.trim(), description: desc, price: info?.price ? draft.price.trim() : (draft.kind === 'free' ? 'Бесплатно' : ''),
      address: draft.address.trim(), phone, whatsapp, author_name: draft.name.trim(), gallery_images: photos.join(','), image_url: photos[0] || null,
    };
  }

  async function submit() {
    if (sending || !checkStep2() || !checkStep3()) return;
    setSending(true);
    if (editId) {
      try {
        await accountApi.updateMyAnnouncement(editId, buildPayload() as any);
        invalidateAllCaches();
        track('ad_edit', { kind: draft.kind });
        toast.success(tx('Сохранено. Объявление снова на проверке — обычно это до часа.', 'Сақталды. Хабарландыру қайта тексерілуде — әдетте бір сағатқа дейін.'));
        navigate('/cabinet?tab=announcements');
      } catch (err: any) {
        const detail = err?.response?.data?.detail || err?.data?.detail || err?.detail;
        toast.error(typeof detail === 'string' ? detail : tx('Не получилось сохранить. Проверьте интернет и попробуйте ещё раз.', 'Сақталмады. Интернетті тексеріп, қайталаңыз.'));
      } finally { setSending(false); }
      return;
    }
    try {
      const res: any = await client.entities.announcements.create({ data: buildPayload() });
      invalidateAllCaches();
      pushCabinetItem('announcements', { title: draft.title, subtitle: info ? bi(info.title) : '', status: 'На модерации' });
      track('ad_submit', { kind: draft.kind, photos: draft.photos ? draft.photos.split(',').filter(Boolean).length : 0 });
      clearDraft();
      setDone({ id: res?.data?.id });
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      const detail = err?.response?.data?.detail || err?.data?.detail;
      toast.error(status === 429 && typeof detail === 'string' ? detail : (typeof detail === 'string' && status === 400 ? detail : tx('Не получилось отправить. Проверьте интернет и попробуйте ещё раз — всё, что вы написали, сохранено.', 'Жіберілмеді. Интернетті тексеріп, қайталаңыз — жазғаныңыз сақталды.')));
    } finally { setSending(false); }
  }

  if (done) return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-14 text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40"><Check className="h-10 w-10 text-green-600" /></div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{tx('Объявление отправлено!', 'Хабарландыру жіберілді!')}</h1>
        <p className="mt-3 text-gray-600 dark:text-slate-300">{tx('Мы проверим его в ближайшее время — обычно в течение часа днём. Как только оно появится на сайте, придёт сообщение в WhatsApp и в личный кабинет.', 'Біз оны жақын арада тексереміз — әдетте күндіз бір сағат ішінде. Сайтқа шыққанда WhatsApp пен жеке кабинетке хабар келеді.')}</p>
        <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-left text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-semibold">{tx('Объявление бесплатное и висит 30 дней.', 'Хабарландыру тегін, 30 күн тұрады.')}</p>
          <p className="mt-1">{tx('Снять, изменить или продлить можно в личном кабинете.', 'Жеке кабинетте алып тастауға, өзгертуге болады.')}</p>
        </div>
        <div className="mt-6 grid gap-3">
          <Link to="/cabinet?tab=announcements" className="rounded-xl bg-amber-500 px-5 py-3.5 font-semibold text-white hover:bg-amber-600">{tx('Мои объявления', 'Менің хабарландыруларым')}</Link>
          <button type="button" onClick={() => { setDraft({ ...EMPTY, name: draft.name, phone: draft.phone }); setDone(null); setStep(1); }} className="rounded-xl border border-gray-200 px-5 py-3.5 font-semibold text-gray-800 dark:border-slate-700 dark:text-slate-100">{tx('Подать ещё одно', 'Тағы біреуін беру')}</button>
          <Link to="/announcements" className="py-2 text-sm font-medium text-amber-700">{tx('Все объявления', 'Барлық хабарландырулар')}</Link>
        </div>
      </div>
    </Layout>
  );

  const steps = [tx('Что', 'Не'), tx('Описание', 'Сипаттама'), tx('Контакты', 'Байланыс')];
  const preview = buildPayload();

  return (
    <Layout hideBottomNav hideFooter>
      <div ref={topRef} className="mx-auto max-w-xl px-4 pb-32 pt-5 scroll-mt-20">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={() => (editing && step <= 2 ? navigate('/cabinet?tab=announcements') : step === 1 ? navigate('/announcements') : setStep((s) => (s - 1) as 1 | 2))} className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-slate-400">
            <ChevronLeft className="h-4 w-4" /> {editing && step <= 2 ? tx('Мои объявления', 'Менің хабарландыруларым') : step === 1 ? tx('Объявления', 'Хабарландырулар') : tx('Назад', 'Артқа')}
          </button>
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">{tx('Бесплатно', 'Тегін')}</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{editing ? tx('Изменить объявление', 'Хабарландыруды өзгерту') : tx('Подать объявление', 'Хабарландыру беру')}</h1>
        {editing && <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{tx('После сохранения объявление снова пройдёт быструю проверку.', 'Сақтағаннан кейін хабарландыру қайта жылдам тексеріледі.')}</p>}
        <ol className="mt-4 grid grid-cols-3 gap-2" aria-label={tx('Шаги', 'Қадамдар')}>
          {steps.map((label, i) => (
            <li key={label} aria-current={step === i + 1 ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${step > i ? 'bg-amber-500' : 'bg-gray-200 dark:bg-slate-700'}`} />
              <p className={`mt-1.5 text-xs ${step === i + 1 ? 'font-semibold text-gray-900 dark:text-slate-100' : 'text-gray-400'}`}>{i + 1}. {label}</p>
            </li>
          ))}
        </ol>

        {step === 1 && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{tx('Что хотите разместить?', 'Не орналастырғыңыз келеді?')}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {AD_KINDS.map((k) => (
                <button key={k.kind} type="button" data-kind={k.kind} onClick={() => chooseKind(k.kind)}
                  className={`flex min-h-[112px] flex-col items-start rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${draft.kind === k.kind ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200 dark:bg-amber-900/20' : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
                  <span className="text-3xl leading-none" aria-hidden>{k.emoji}</span>
                  <span className="mt-2 font-semibold text-gray-900 dark:text-slate-100">{bi(k.title)}</span>
                  <span className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-slate-400">{bi(k.hint)}</span>
                </button>
              ))}
            </div>
            <p className="mt-5 flex items-start gap-2 text-sm text-gray-500 dark:text-slate-400"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />{tx('Каждое объявление проверяем вручную — так на сайте нет мошенников и спама.', 'Әр хабарландыруды қолмен тексереміз — сайтта алаяқтар мен спам болмайды.')}</p>
          </section>
        )}

        {step === 2 && info && (
          <section className="mt-6 space-y-5">
            <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              <span aria-hidden>{info.emoji}</span>{bi(info.title)}<Pencil className="h-3.5 w-3.5 opacity-60" />
            </button>

            {info.extra && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-800 dark:text-slate-200">{bi(info.extra.label)}</p>
                <div className="flex flex-wrap gap-2">
                  {info.extra.options.map((o) => (
                    <button key={o.ru} type="button" aria-pressed={draft.extra === o.ru} onClick={() => set({ extra: draft.extra === o.ru ? '' : o.ru })} className={chip(draft.extra === o.ru)}>{bi(o)}</button>
                  ))}
                </div>
                {errors.extra && <p className="mt-1 text-sm text-red-600">{errors.extra}</p>}
              </div>
            )}

            <div>
              <label htmlFor="ad-title" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-slate-200">{tx('Заголовок', 'Тақырып')}</label>
              <input id="ad-title" value={draft.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} placeholder={bi(info.titlePlaceholder)} className={`${field} ${errors.title ? 'border-red-400' : ''}`} aria-invalid={!!errors.title} />
              <div className="mt-1 flex justify-between text-xs"><span className="text-red-600">{errors.title}</span><span className="text-gray-400">{draft.title.length}/80</span></div>
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-slate-200"><Camera className="h-4 w-4" />{tx('Фото', 'Фото')} <span className="font-normal text-gray-400">· {tx('до 5 шт.', '5 данаға дейін')}</span></p>
              <p className="mb-2 text-xs text-gray-500 dark:text-slate-400">{bi(info.photoHint)}</p>
              <MultiImageUpload value={draft.photos} onChange={(v: string) => set({ photos: v })} folder="announcements" maxImages={5} />
            </div>

            {info.price && (
              <div>
                <label htmlFor="ad-price" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-slate-200">{bi(info.price.label)}</label>
                <input id="ad-price" inputMode="text" value={draft.price} maxLength={60} onChange={(e) => set({ price: e.target.value })} placeholder={bi(info.price.placeholder)} className={field} />
                <div className="mt-2 flex flex-wrap gap-2">
                  {info.price.chips.map((c) => (
                    <button key={c.ru} type="button" onClick={() => set({ price: draft.price === c.ru ? '' : (/^\d/.test(draft.price) && c.ru.startsWith('В ') ? `${draft.price.replace(/\s*(в месяц|в сутки)$/i, '')} ${c.ru.toLowerCase()}` : c.ru) })} className={chip(draft.price === c.ru || draft.price.toLowerCase().endsWith(c.ru.toLowerCase()))}>{bi(c)}</button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label htmlFor="ad-desc" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-slate-200">{tx('Описание', 'Сипаттама')}</label>
              <textarea id="ad-desc" value={draft.description} maxLength={3000} rows={5} onChange={(e) => set({ description: e.target.value })} placeholder={bi(info.descPlaceholder)} className={`${field} resize-y ${errors.description ? 'border-red-400' : ''}`} aria-invalid={!!errors.description} />
              <div className="mt-1 flex justify-between text-xs"><span className="text-red-600">{errors.description}</span><span className="text-gray-400">{draft.description.length}/3000</span></div>
            </div>

            <div>
              <label htmlFor="ad-address" className="mb-1.5 block text-sm font-medium text-gray-800 dark:text-slate-200"><MapPin className="mr-1 inline h-4 w-4" />{tx('Где', 'Қай жерде')} <span className="font-normal text-gray-400">· {tx('необязательно', 'міндетті емес')}</span></label>
              <input id="ad-address" value={draft.address} maxLength={120} onChange={(e) => set({ address: e.target.value })} placeholder={tx('Например: Сортировка, ул. Ермекова', 'Мысалы: Сортировка, Ермеков к-сі')} className={field} />
              <div className="mt-2 flex flex-wrap gap-2">
                {['Сортировка', 'Караганда', 'Майкудук', 'Пришахтинск'].map((p) => (
                  <button key={p} type="button" onClick={() => set({ address: draft.address === p ? '' : p })} className={chip(draft.address === p)}>{p}</button>
                ))}
              </div>
            </div>
          </section>
        )}

        {step === 3 && info && (
          <section className="mt-6 space-y-5">
            <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{tx('Как с вами связаться', 'Сізбен қалай байланысу')}</p>
                  {!editingContacts && <>
                    <p className="mt-1 text-base text-gray-800 dark:text-slate-200">{draft.name || tx('Без имени', 'Атысыз')}</p>
                    <p className="text-base font-medium text-gray-900 dark:text-slate-100">{draft.phone ? formatKzPhone(draft.phone) : <span className="text-red-600">{tx('Нужен номер телефона', 'Телефон нөмірі керек')}</span>}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{draft.whatsappSame ? tx('WhatsApp на этом же номере', 'WhatsApp осы нөмірде') : draft.whatsapp ? `WhatsApp: ${formatKzPhone(draft.whatsapp)}` : tx('Без WhatsApp', 'WhatsApp жоқ')}</p>
                  </>}
                </div>
                {!editingContacts && <button type="button" onClick={() => setEditingContacts(true)} className="text-sm font-semibold text-amber-700">{tx('Изменить', 'Өзгерту')}</button>}
              </div>
              {editingContacts && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label htmlFor="ad-name" className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">{tx('Имя', 'Аты')}</label>
                    <input id="ad-name" value={draft.name} maxLength={60} autoComplete="name" onChange={(e) => set({ name: e.target.value })} className={field} />
                  </div>
                  <div>
                    <label htmlFor="ad-phone" className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">{tx('Телефон', 'Телефон')}</label>
                    <input id="ad-phone" type="tel" inputMode="tel" value={draft.phone} maxLength={20} autoComplete="tel" onChange={(e) => set({ phone: e.target.value })} placeholder="+7 700 123 45 67" className={`${field} ${errors.phone ? 'border-red-400' : ''}`} aria-invalid={!!errors.phone} />
                    {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
                    <input type="checkbox" checked={draft.whatsappSame} onChange={(e) => set({ whatsappSame: e.target.checked })} className="h-5 w-5 rounded accent-amber-500" />
                    {tx('WhatsApp на этом же номере', 'WhatsApp осы нөмірде')}
                  </label>
                  {!draft.whatsappSame && (
                    <div>
                      <label htmlFor="ad-wa" className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-300">{tx('Номер WhatsApp (если есть)', 'WhatsApp нөмірі (бар болса)')}</label>
                      <input id="ad-wa" type="tel" inputMode="tel" value={draft.whatsapp} maxLength={20} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="+7 700 123 45 67" className={field} />
                      {errors.whatsapp && <p className="mt-1 text-sm text-red-600">{errors.whatsapp}</p>}
                    </div>
                  )}
                  <button type="button" onClick={() => { if (normalizeKzPhone(draft.phone).length >= 11) { setErrors({}); setEditingContacts(false); } else checkStep3(); }} className="text-sm font-semibold text-amber-700">{tx('Готово', 'Дайын')}</button>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-gray-900 dark:text-slate-100">{tx('Так увидят ваше объявление', 'Хабарландыруыңыз осылай көрінеді')}</p>
              <AdCard ad={{ ...preview, created_at: new Date().toISOString() }} preview />
            </div>
            <p className="text-xs leading-relaxed text-gray-500 dark:text-slate-400">
              {tx('Нажимая «Опубликовать», вы соглашаетесь с ', '«Жариялау» түймесін басу арқылы сіз ')}
              <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="underline">{tx('правилами сайта', 'сайт ережелерімен')}</Link>
              {tx('. Запрещены оружие, лекарства, алкоголь, табак, услуги для взрослых и любые просьбы о предоплате.', ' келісесіз. Қару, дәрі, алкоголь, темекі, ересектерге арналған қызметтер және алдын ала төлем сұрауға тыйым салынады.')}
            </p>
          </section>
        )}
      </div>

      {step > 1 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-xl gap-3">
            <button type="button" onClick={() => setStep((s) => (s - 1) as 1 | 2)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-700 dark:border-slate-700 dark:text-slate-200" aria-label={tx('Назад', 'Артқа')}><ArrowLeft className="h-5 w-5" /></button>
            {step === 2 ? (
              <button type="button" data-testid="ad-next" onClick={() => { if (checkStep2()) setStep(3); }} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 font-semibold text-white hover:bg-amber-600">{tx('Дальше', 'Әрі қарай')} <ArrowRight className="h-5 w-5" /></button>
            ) : (
              <button type="button" data-testid="ad-submit" disabled={sending} onClick={() => void submit()} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                {sending ? <><Loader2 className="h-5 w-5 animate-spin" />{tx('Отправляем…', 'Жіберілуде…')}</> : <><Check className="h-5 w-5" />{editing ? tx('Сохранить', 'Сақтау') : tx('Опубликовать', 'Жариялау')}</>}
              </button>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}

/* ======================= CARD ======================= */
function AdCard({ ad, preview, favorite, onFavorite }: { ad: any; preview?: boolean; favorite?: boolean; onFavorite?: (e: React.MouseEvent) => void }) {
  const { tx, bi } = useTx();
  const seenRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (preview || !seenRef.current || ownsAd(ad)) return;
    return observeImpression(seenRef.current, () => adEvent(ad.id, 'impression'));
  }, [ad.id, preview]); // eslint-disable-line react-hooks/exhaustive-deps
  const k = kindOf(ad);
  const cover = getAnnouncementCover(ad);
  const price = formatAdPrice(ad.price);
  const body = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-amber-50 dark:bg-slate-800">
        {cover ? <StorageImg objectKey={cover} alt={ad.title} className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center text-5xl opacity-70" aria-hidden>{k?.emoji || '📢'}</div>}
        {k && <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold text-gray-800 shadow-sm">{k.emoji} {bi(k.title)}</span>}
        {onFavorite && (
          <button type="button" onClick={onFavorite} aria-pressed={favorite} aria-label={tx('В избранное', 'Таңдаулыға')} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow">
            <Heart className={`h-4 w-4 ${favorite ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
          </button>
        )}
      </div>
      <div className="p-3">
        {price && <p className="text-base font-bold text-gray-900 dark:text-slate-100">{price}</p>}
        <h3 className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug text-gray-800 dark:text-slate-200">{ad.title || tx('Заголовок', 'Тақырып')}</h3>
        <p className="mt-1.5 truncate text-xs text-gray-400">{[ad.address, ad.created_at ? timeAgo(ad.created_at) : ''].filter(Boolean).join(' · ')}</p>
      </div>
    </>
  );
  const cls = 'block overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition dark:border-slate-800 dark:bg-slate-900';
  if (preview) return <div className={`${cls} mx-auto max-w-[260px]`}>{body}</div>;
  return <Link ref={seenRef} to={`/announcements/${ad.id}`} className={`${cls} hover:-translate-y-0.5 hover:shadow-md`}>{body}</Link>;
}

/* ======================= LIST ======================= */
export function AdsList() {
  const { tx, bi } = useTx();
  const [params, setParams] = useSearchParams();
  const filter = AD_FILTERS.some((f) => f.key === params.get('type')) ? params.get('type') || '' : '';
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [favorites, setFavorites] = useState<number[]>(() => loadAnnFavorites());
  const [visible, setVisible] = useState(24);
  const searchTimer = useRef<number>();

  usePageSeo({ title: tx('Объявления — Сортировка, Караганда', 'Хабарландырулар — Сортировка, Қарағанды'), description: tx('Бесплатные объявления Сортировки и Караганды: продам, куплю, работа, услуги, аренда, потерял/нашёл.', 'Сортировка мен Қарағандының тегін хабарландырулары.') });

  async function load() {
    setLoading(true); setLoadError(false);
    try {
      const all: any[] = [];
      let skip = 0;
      for (let i = 0; i < 10; i++) {
        const res = await withRetry(() => client.entities.announcements.query({ sort: '-created_at', skip, limit: 200 }));
        const batch = res.data?.items || [];
        all.push(...batch); skip += batch.length;
        if (!batch.length || skip >= Number(res.data?.total ?? skip)) break;
      }
      setItems(filterPublicAnnouncements(all));
    } catch { setLoadError(true); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => { setVisible(24); }, [filter, query, favOnly]);
  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    if (query.trim().length >= 3) searchTimer.current = window.setTimeout(() => track('search', { area: 'объявления', q: query.trim().slice(0, 60) }), 1200);
  }, [query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of AD_FILTERS) c[f.key] = f.kinds.length ? items.filter((a) => f.kinds.includes(a.ann_type)).length : items.length;
    return c;
  }, [items]);
  const shown = useMemo(() => {
    const f = AD_FILTERS.find((x) => x.key === filter);
    const q = query.trim().toLowerCase();
    return sortAnnouncements(items.filter((a) => {
      if (f?.kinds.length && !f.kinds.includes(a.ann_type)) return false;
      if (favOnly && !favorites.includes(a.id)) return false;
      return !q || [a.title, a.description, a.address, a.price].some((p) => String(p || '').toLowerCase().includes(q));
    }), 'new');
  }, [items, filter, query, favOnly, favorites]);

  const postLink = filter === 'job' ? '/announcements/new?type=job' : filter && AD_KIND_MAP[filter] ? `/announcements/new?type=${filter}` : '/announcements/new';

  return (
    <Layout>
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-5">
        <div className="rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 p-5 text-white shadow-sm sm:p-7">
          <h1 className="text-2xl font-bold sm:text-3xl">{tx('Объявления', 'Хабарландырулар')}</h1>
          <p className="mt-1 text-sm text-white/90 sm:text-base">{tx('Продать, купить, найти работу или мастера — рядом с домом', 'Сату, сатып алу, жұмыс не шебер табу — үйдің жанынан')}</p>
          <Link to={postLink} data-testid="ad-post" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-orange-600 shadow hover:bg-orange-50">
            <Plus className="h-5 w-5" /> {tx('Подать бесплатно', 'Тегін беру')}
          </Link>
        </div>

        <div className="sticky top-14 z-20 -mx-4 mt-4 bg-gray-50/95 px-4 pb-2 pt-2 backdrop-blur dark:bg-slate-950/95">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tx('Поиск по объявлениям', 'Хабарландырулардан іздеу')} placeholder={tx('Что ищете? Например, велосипед', 'Не іздейсіз? Мысалы, велосипед')} className={`${field} pl-11`} />
          </div>
          <div className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
            {AD_FILTERS.map((f) => (
              <button key={f.key || 'all'} type="button" aria-pressed={filter === f.key && !favOnly} onClick={() => { setFavOnly(false); const p = new URLSearchParams(params); if (f.key) p.set('type', f.key); else p.delete('type'); setParams(p, { replace: true }); }}
                className={`${chip(filter === f.key && !favOnly)} shrink-0 whitespace-nowrap`}>
                {f.emoji} {bi(f.title)}{counts[f.key] ? <span className="ml-1 opacity-70">{counts[f.key]}</span> : null}
              </button>
            ))}
            <button type="button" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)} className={`${chip(favOnly)} shrink-0 whitespace-nowrap`}>❤️ {tx('Избранное', 'Таңдаулы')}{favorites.length ? ` ${favorites.length}` : ''}</button>
          </div>
        </div>

        {loadError ? (
          <div role="alert" className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950/40">
            <p>{tx('Не удалось загрузить объявления.', 'Хабарландырулар жүктелмеді.')}</p>
            <button type="button" onClick={() => void load()} className="mt-3 rounded-xl bg-amber-500 px-4 py-2 font-medium text-white">{tx('Повторить', 'Қайталау')}</button>
          </div>
        ) : loading ? (
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-60 animate-pulse rounded-2xl bg-gray-200 dark:bg-slate-800" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-10 text-center">
            <Megaphone className="mx-auto h-12 w-12 text-amber-300" />
            <p className="mt-3 font-semibold text-gray-800 dark:text-slate-100">{query || filter || favOnly ? tx('Ничего не нашлось', 'Ештеңе табылмады') : tx('Пока объявлений нет', 'Әзірге хабарландыру жоқ')}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{tx('Станьте первым — это бесплатно и занимает минуту.', 'Бірінші болыңыз — тегін және бір минут қана.')}</p>
            <Link to={postLink} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-3 font-semibold text-white"><Plus className="h-5 w-5" />{tx('Подать объявление', 'Хабарландыру беру')}</Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-gray-500 dark:text-slate-400" aria-live="polite">{shown.length} {tx('объявл.', 'хабарл.')}</p>
            <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {shown.slice(0, visible).map((ad, i) => (
                <Fragment key={ad.id}>
                  <AdCard ad={ad} favorite={favorites.includes(ad.id)} onFavorite={(e) => { e.preventDefault(); e.stopPropagation(); setFavorites(toggleAnnFavorite(ad.id)); }} />
                  {(i === 5 || (shown.length <= 6 && i === shown.length - 1)) && <div className="col-span-full"><PromoSlot placement="ads_list" context={`${query} ${filter}`} prefer={filter === 'services' || /кровл|крыш|ремонт|строит/i.test(query) ? 'partner' : undefined} /></div>}
                </Fragment>
              ))}
            </div>
            {shown.length > visible && <div className="mt-6 text-center"><button type="button" onClick={() => setVisible((v) => v + 24)} className="rounded-xl border border-gray-200 bg-white px-6 py-3 font-medium dark:border-slate-700 dark:bg-slate-900">{tx('Показать ещё', 'Тағы көрсету')}</button></div>}
          </>
        )}
        <Link to="/cabinet?tab=announcements" className="mt-8 block text-center text-sm font-medium text-amber-700">{tx('Мои объявления', 'Менің хабарландыруларым')} →</Link>
      </div>
    </Layout>
  );
}

/* ======================= DETAIL ======================= */
const REPORT_REASONS: Bi[] = [
  { ru: 'Мошенник, просит предоплату', kz: 'Алаяқ, алдын ала төлем сұрайды' },
  { ru: 'Уже продано / неактуально', kz: 'Сатылып кетті / өзекті емес' },
  { ru: 'Запрещённый товар', kz: 'Тыйым салынған тауар' },
  { ru: 'Неверная цена или фото', kz: 'Баға не фото дұрыс емес' },
];

function ownsAd(ad: any) {
  const user = getCurrentUser();
  if (!user) return false;
  if (ad.user_id) return String(ad.user_id) === String(user.id);
  const a = normalizeKzPhone(ad.phone || ''); const b = normalizeKzPhone(user.phone || '');
  return Boolean(a && a === b);
}

export function AdDetail() {
  const { tx, bi } = useTx();
  const { id } = useParams();
  const navigate = useNavigate();
  const [ad, setAd] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [photo, setPhoto] = useState(0);
  const [fav, setFav] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [similar, setSimilar] = useState<any[]>([]);
  const k = ad ? kindOf(ad) : undefined;
  const photos: string[] = ad ? Array.from(new Set([ad.image_url, ...String(ad.gallery_images || '').split(',')].map((s) => String(s || '').trim()).filter(Boolean))) : [];
  const description = ad ? String(ad.description || ad.title || '').replace(/\s+/g, ' ').trim().slice(0, 160) : '';

  usePageSeo({
    title: ad?.title, description, image: photos[0],
    structuredData: ad && ['sell', 'rent', 'services', 'free'].includes(ad.ann_type) ? {
      '@context': 'https://schema.org', '@type': 'Product', name: ad.title, description, image: photos[0] || '/icon-512-v4.png',
      offers: /^\d/.test(String(ad.price || '')) ? { '@type': 'Offer', price: String(ad.price).replace(/\D/g, ''), priceCurrency: 'KZT', availability: 'https://schema.org/InStock' } : undefined,
    } : null,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false); setAd(null); setPhoto(0);
    withRetry(() => client.entities.announcements.get({ id: id! }))
      .then((res: any) => {
        if (cancelled) return;
        setAd(res.data); setFav(loadAnnFavorites().includes(Number(id)));
        track('ad_view', { id: Number(id), kind: res.data?.ann_type });
        client.entities.announcements.query({ sort: '-created_at', limit: 40 }).then((r: any) => {
          if (!cancelled) setSimilar(filterPublicAnnouncements(r.data?.items || []).filter((x: any) => x.id !== res.data?.id && x.ann_type === res.data?.ann_type).slice(0, 4));
        }).catch(() => {});
      })
      .catch((e: any) => { if (!cancelled && (e?.response?.status ?? e?.status) !== 404) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, retry]);

  const isOwner = ad ? ownsAd(ad) : false;
  const isPublic = ad ? filterPublicAnnouncements([ad]).length > 0 : false;
  // A real view for the owner's statistics (not the owner, once per person per day — the server checks too).
  useEffect(() => { if (ad && isPublic && !isOwner) adEvent(ad.id, 'view', true); }, [ad?.id, isPublic, isOwner]); // eslint-disable-line react-hooks/exhaustive-deps
  const phoneDigits = normalizeKzPhone(ad?.phone || '');
  const waDigits = normalizeKzPhone(ad?.whatsapp || '');
  const waText = encodeURIComponent(tx(`Здравствуйте! Пишу по объявлению «${ad?.title || ''}» на Сортировка 24`, `Сәлеметсіз бе! Сортировка 24-тегі «${ad?.title || ''}» хабарландыруы бойынша жазып отырмын`));

  async function share() {
    const url = `${location.origin}/announcements/${ad.id}`;
    track('ad_share', { id: ad.id });
    if (!isOwner) adEvent(ad.id, 'share', true);
    try {
      if (navigator.share) { await navigator.share({ title: ad.title, text: formatAdPrice(ad.price) || ad.title, url }); return; }
      await navigator.clipboard.writeText(url); toast.success(tx('Ссылка скопирована', 'Сілтеме көшірілді'));
    } catch { /* cancelled */ }
  }
  async function sendReport() {
    if (reason.trim().length < 3 || reporting) return;
    setReporting(true);
    try {
      const r = await fetch(`${getAPIBaseURL().replace(/\/$/, '')}/api/v1/entities/announcements/${ad.id}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }) });
      if (!r.ok && r.status !== 202) throw new Error(String(r.status));
      toast.success(tx('Спасибо! Мы проверим объявление.', 'Рахмет! Хабарландыруды тексереміз.'));
      setReportOpen(false); setReason('');
    } catch { toast.error(tx('Не получилось отправить. Попробуйте позже.', 'Жіберілмеді. Кейінірек көріңіз.')); } finally { setReporting(false); }
  }
  async function unpublish() {
    if (!window.confirm(tx('Снять объявление с сайта?', 'Хабарландыруды сайттан алып тастау керек пе?'))) return;
    setBusy(true);
    try { await accountApi.unpublishMyAnnouncement(Number(ad.id)); invalidateAllCaches(); toast.success(tx('Снято с сайта', 'Сайттан алынды')); navigate('/cabinet?tab=announcements'); }
    catch { toast.error(tx('Не получилось. Попробуйте ещё раз.', 'Болмады. Қайталап көріңіз.')); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(tx('Удалить объявление навсегда?', 'Хабарландыруды біржола жою керек пе?'))) return;
    setBusy(true);
    try { await accountApi.deleteMyAnnouncement(Number(ad.id)); invalidateAllCaches(); toast.success(tx('Удалено', 'Жойылды')); navigate('/cabinet?tab=announcements'); }
    catch { toast.error(tx('Не получилось. Попробуйте ещё раз.', 'Болмады. Қайталап көріңіз.')); } finally { setBusy(false); }
  }

  if (loading) return <Layout><div className="mx-auto max-w-3xl px-4 py-6"><div className="aspect-[4/3] animate-pulse rounded-2xl bg-gray-200 dark:bg-slate-800" /><div className="mt-4 h-6 w-2/3 animate-pulse rounded bg-gray-200 dark:bg-slate-800" /></div></Layout>;
  if (error) return <Layout><div role="alert" className="mx-auto max-w-3xl px-4 py-12 text-center"><p>{tx('Не удалось загрузить объявление.', 'Хабарландыру жүктелмеді.')}</p><button type="button" className="mt-3 rounded-xl border px-4 py-2" onClick={() => setRetry((v) => v + 1)}>{tx('Повторить', 'Қайталау')}</button></div></Layout>;
  if (!ad || (!isPublic && !isOwner)) return <Layout><div className="mx-auto max-w-3xl px-4 py-14 text-center"><p className="text-5xl" aria-hidden>🔎</p><p className="mt-3 font-semibold text-gray-800 dark:text-slate-100">{tx('Объявление снято или ещё на проверке', 'Хабарландыру алынды немесе тексерілуде')}</p><Link to="/announcements" className="mt-4 inline-block font-medium text-amber-700">{tx('Все объявления', 'Барлық хабарландырулар')}</Link></div></Layout>;

  const statusText: Record<string, Bi> = { pending: { ru: 'на проверке — обычно до часа', kz: 'тексерілуде — әдетте бір сағатқа дейін' }, rejected: { ru: 'не прошло проверку — исправьте и сохраните', kz: 'тексеруден өтпеді — түзетіп, сақтаңыз' } };

  return (
    <Layout hideBottomNav={!isOwner && isPublic && phoneDigits.length >= 11}>
      <div className="mx-auto max-w-3xl px-4 pb-32 pt-4">
        <Link to={k ? `/announcements?type=${k.group === 'work' ? 'job' : k.kind}` : '/announcements'} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-slate-400"><ChevronLeft className="h-4 w-4" />{k ? bi(k.title) : tx('Объявления', 'Хабарландырулар')}</Link>

        {isOwner && !isPublic && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" /><span>{tx('Ваше объявление ', 'Сіздің хабарландыруыңыз ')}{bi(statusText[ad.status] || { ru: 'сейчас не показывается', kz: 'қазір көрсетілмейді' })}</span>
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-slate-900">
          <div className="relative aspect-[4/3] bg-amber-50 dark:bg-slate-800">
            {photos.length ? <StorageImg objectKey={photos[photo]} alt={ad.title} className="h-full w-full object-contain" />
              : <div className="flex h-full items-center justify-center text-7xl opacity-70" aria-hidden>{k?.emoji || '📢'}</div>}
            {photos.length > 1 && <>
              <button type="button" aria-label={tx('Предыдущее фото', 'Алдыңғы фото')} onClick={() => setPhoto((p) => (p - 1 + photos.length) % photos.length)} className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"><ArrowLeft className="h-5 w-5" /></button>
              <button type="button" aria-label={tx('Следующее фото', 'Келесі фото')} onClick={() => setPhoto((p) => (p + 1) % photos.length)} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow"><ArrowRight className="h-5 w-5" /></button>
              <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">{photo + 1}/{photos.length}</span>
            </>}
            <div className="absolute right-2 top-2 flex gap-2">
              <button type="button" onClick={() => void share()} aria-label={tx('Поделиться', 'Бөлісу')} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow"><Share2 className="h-5 w-5 text-gray-700" /></button>
              <button type="button" onClick={() => { const next = toggleAnnFavorite(Number(ad.id)); setFav(next.includes(Number(ad.id))); }} aria-pressed={fav} aria-label={tx('В избранное', 'Таңдаулыға')} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow"><Heart className={`h-5 w-5 ${fav ? 'fill-red-500 text-red-500' : 'text-gray-700'}`} /></button>
            </div>
          </div>
          {photos.length > 1 && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto p-2">
              {photos.map((p, i) => <button key={p} type="button" onClick={() => setPhoto(i)} aria-label={`${tx('Фото', 'Фото')} ${i + 1}`} className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${i === photo ? 'border-amber-500' : 'border-transparent'}`}><StorageImg objectKey={p} alt="" className="h-full w-full object-cover" /></button>)}
            </div>
          )}

          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
              {k && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{k.emoji} {bi(k.title)}</span>}
              {ad.created_at && <span>{formatDate(ad.created_at)}</span>}
              {ad.views_count ? <span>· {ad.views_count} {tx('просмотров', 'қаралым')}</span> : null}
            </div>
            <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-slate-100">{ad.title}</h1>
            {ad.price && <p className="mt-1 text-2xl font-bold text-orange-600">{formatAdPrice(ad.price)}</p>}
            {ad.address && <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-300"><MapPin className="h-4 w-4 text-gray-400" />{ad.address}</p>}
            <div className="mt-4 whitespace-pre-line leading-relaxed text-gray-800 dark:text-slate-200">{ad.description}</div>
            {ad.author_name && <p className="mt-5 text-sm text-gray-500 dark:text-slate-400">{tx('Автор', 'Автор')}: <span className="font-medium text-gray-800 dark:text-slate-200">{ad.author_name}</span></p>}

            <div className="mt-5"><SafetyAlert variant="announcement_detail" /></div>

            {isOwner ? (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-slate-800">
                <Link to={`/announcements/${ad.id}/edit`} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white"><Pencil className="h-4 w-4" />{tx('Изменить', 'Өзгерту')}</Link>
                {isPublic && <button type="button" disabled={busy} onClick={() => void unpublish()} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold dark:border-slate-700"><EyeOff className="h-4 w-4" />{tx('Снять с сайта', 'Сайттан алу')}</button>}
                <button type="button" disabled={busy} onClick={() => void remove()} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600"><Trash2 className="h-4 w-4" />{tx('Удалить', 'Жою')}</button>
              </div>
            ) : (
              <button type="button" onClick={() => setReportOpen(true)} className="mt-5 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 dark:text-slate-400"><Flag className="h-4 w-4" />{tx('Пожаловаться', 'Шағымдану')}</button>
            )}
          </div>
        </div>

        {!isOwner && <PromoSlot placement="ad_detail" context={`${ad.title} ${ad.description || ''}`} prefer={ad.ann_type === 'services' ? 'partner' : undefined} className="mt-6" />}

        {similar.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-slate-100">{tx('Похожие объявления', 'Ұқсас хабарландырулар')}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{similar.map((s) => <AdCard key={s.id} ad={s} />)}</div>
          </section>
        )}
      </div>

      {!isOwner && isPublic && phoneDigits.length >= 11 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur dark:border-slate-700 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-3xl gap-3">
            <a href={`tel:+${phoneDigits}`} onClick={() => { track('ad_contact', { id: ad.id, way: 'call', kind: ad.ann_type }); adEvent(ad.id, 'phone', true); }} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 font-semibold text-white"><Phone className="h-5 w-5" />{tx('Позвонить', 'Қоңырау шалу')}</a>
            {waDigits.length >= 11 && <a href={`https://wa.me/${waDigits}?text=${waText}`} target="_blank" rel="noopener noreferrer" onClick={() => { track('ad_contact', { id: ad.id, way: 'whatsapp', kind: ad.ann_type }); adEvent(ad.id, 'whatsapp', true); }} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 font-semibold text-white"><MessageCircle className="h-5 w-5" />WhatsApp</a>}
          </div>
        </div>
      )}

      {reportOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label={tx('Жалоба', 'Шағым')} onClick={() => setReportOpen(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] dark:bg-slate-900 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">{tx('Что не так?', 'Не дұрыс емес?')}</h2><button type="button" aria-label={tx('Закрыть', 'Жабу')} onClick={() => setReportOpen(false)}><X className="h-5 w-5" /></button></div>
            <div className="mt-3 grid gap-2">
              {REPORT_REASONS.map((r) => <button key={r.ru} type="button" aria-pressed={reason === r.ru} onClick={() => setReason(r.ru)} className={`rounded-xl border px-4 py-3 text-left text-sm ${reason === r.ru ? 'border-red-400 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200' : 'border-gray-200 dark:border-slate-700'}`}>{bi(r)}</button>)}
              <input value={REPORT_REASONS.some((r) => r.ru === reason) ? '' : reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={tx('Или напишите своими словами', 'Немесе өз сөзіңізбен жазыңыз')} className={field} />
            </div>
            <button type="button" disabled={reason.trim().length < 3 || reporting} onClick={() => void sendReport()} className="mt-4 h-12 w-full rounded-xl bg-red-600 font-semibold text-white disabled:opacity-50">{reporting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : tx('Отправить жалобу', 'Шағым жіберу')}</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
