import { reportError, track } from '@/lib/analytics';
import { LEGAL_VERSION } from '@/content/legal';
import KzPhoneInput from '@/components/KzPhoneInput';
import { isCompleteKzPhone } from '@/lib/kzPhone';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, Loader2, MessageCircle, Send, ShieldCheck, Smartphone } from 'lucide-react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { accountApi, setAccountToken, type OtpChannel } from '@/lib/accountApi';
import { safeInternalPath } from '@/lib/pwa';
import { humanizeApiError } from '@/lib/apiErrors';
import { cacheAccountProfile } from '@/lib/localAuth';
import { linkPushTokenToAccount, syncWebPushSubscriptionToAccount } from '@/lib/pushNotifications';

type Step = 'phone' | 'code' | 'whatsapp';
/** whatsapp: we send nothing — the person sends our number the ready text from waUrl, the page polls with loginId. */
type Draft = { name: string; phone: string; accepted: boolean; step: Step; sentVia: OtpChannel | null; botUrl: string; waUrl?: string; loginId?: string; expiresAt: number; cooldownUntil: number; savedAt?: number };
const DRAFT_KEY = 's24_login_draft';
function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null') as Draft | null;
    if (!d || Date.now() - (d.savedAt || 0) > 15 * 60_000) return null;
    if (d.step !== 'phone' && d.expiresAt < Date.now()) d.step = 'phone';
    return d;
  } catch { return null; }
}
function saveDraft(d: Draft) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: Date.now() })); } catch { /* optional */ } }
/** A sign-in the person could not finish because of us (not a typo, wrong code or too many tries) reaches the
 *  owner at once as a site error in Telegram: e.g. a document edition the server does not know blocks everyone. */
function reportAuthFailure(error: unknown, step: string) {
  const status = (error as { status?: number })?.status ?? 0;
  if (status === 409 || status === 428 || status >= 500) {
    reportError(new Error(`Регистрация/вход не прошли на шаге «${step}» (HTTP ${status}): ${(error as Error)?.message || ''}`.slice(0, 600)), 'auth');
  }
}
export function clearLoginDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* optional */ } }

export default function QuickAccountAuth({ onPasswordLogin }: { onPasswordLogin: () => void }) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const text = (ru: string, kk: string) => kz ? kk : ru;
  const location = useLocation();
  const navigate = useNavigate();
  const [draft] = useState(loadDraft);
  const [google, setGoogle] = useState(false);
  const [step, setStep] = useState<Step>(draft?.step || 'phone');
  const [channels, setChannels] = useState<OtpChannel[]>([]);
  const [sentVia, setSentVia] = useState<OtpChannel | null>(draft?.sentVia || null);
  const [subjectName, setSubjectName] = useState(draft?.name || '');
  const nameReady = subjectName.trim().length >= 2;
  const [phone, setPhone] = useState(draft?.phone || '');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(!!draft?.accepted);
  const [dataAccepted, setDataAccepted] = useState(!!draft?.accepted);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [botUrl, setBotUrl] = useState(draft?.botUrl || '');
  const [waUrl, setWaUrl] = useState(draft?.waUrl || '');
  const [loginId, setLoginId] = useState(draft?.loginId || '');
  const [cooldown, setCooldown] = useState(draft ? Math.max(0, Math.round((draft.cooldownUntil - Date.now()) / 1000)) : 0);
  const [expires, setExpires] = useState(draft ? Math.max(0, Math.round((draft.expiresAt - Date.now()) / 1000)) : 0);
  // Keep what the person typed if the page reloads while they are in WhatsApp/Telegram.
  useEffect(() => { saveDraft({ name: subjectName, phone, accepted: accepted && dataAccepted, step, sentVia, botUrl, waUrl, loginId,
    expiresAt: Date.now() + expires * 1000, cooldownUntil: Date.now() + cooldown * 1000 }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjectName, phone, accepted, dataAccepted, step, sentVia, botUrl, waUrl, loginId]);
  const field = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white';
  const button = 'w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
  useEffect(() => { accountApi.googleStatus().then(r => setGoogle(r.enabled)).catch(() => setGoogle(false)); }, []);
  useEffect(() => { accountApi.otpChannels('signin').then(r => setChannels(r.channels)).catch(() => setChannels([])); }, []);
  useEffect(() => { track('login_open'); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { setCooldown(v => Math.max(0, v - 1)); setExpires(v => Math.max(0, v - 1)); }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function googleLogin() {
    if (!accepted || !dataAccepted || !nameReady || busy) return;
    const target = new URLSearchParams(location.search).get('redirect');
    if (target) sessionStorage.setItem('s24-auth-return', safeInternalPath(target, '/cabinet'));
    else sessionStorage.removeItem('s24-auth-return');
    setBusy(true);
    try { const result = await accountApi.startGoogle(lang, accepted && dataAccepted, subjectName.trim()); window.location.assign(result.url); }
    catch (e) { setError(humanizeApiError(e)); setBusy(false); }
  }

  async function sendCode(channel?: OtpChannel) {
    if (busy || (cooldown > 0 && channel === sentVia)) return;
    const missing = !nameReady ? text('Напишите ваше имя.', 'Атыңызды жазыңыз.')
      : !isCompleteKzPhone(phone) ? text('Введите номер телефона полностью: +7 и 10 цифр.', 'Телефон нөмірін толық енгізіңіз: +7 және 10 цифр.')
      : !accepted || !dataAccepted ? text('Отметьте обе галочки согласия ниже — без них мы не можем создать кабинет.', 'Төмендегі екі келісімді белгілеңіз — оларсыз кабинет ашу мүмкін емес.')
      : '';
    if (missing) { setError(missing); return; }
    const digits = phone.replace(/\D/g, '');
    if (!/^(?:[78]\d{10}|\d{10})$/.test(digits)) { setError(text('Введите номер +7 и 10 цифр.', '+7 және 10 цифрдан тұратын нөмірді енгізіңіз.')); return; }
    setBusy(true); setError('');
    try {
      const r = await accountApi.requestSignInCode(phone, subjectName.trim(), lang, channel);
      const via = (r.channel || channel || null) as OtpChannel | null;
      track('login_code_requested', { channel: via || 'sms' });
      setSentVia(via); setBotUrl(r.bot_url || ''); setCooldown(r.resend_after_seconds); setExpires(r.ttl_seconds);
      if (r.wa_url && r.login_id) { setWaUrl(r.wa_url); setLoginId(r.login_id); setStep('whatsapp'); return; }
      setCode(''); setStep('code');
      setHint(r.on_screen_code_hint || (r.sms_pending_moderation
        ? text('Сообщение ожидает отправки. Это может занять несколько минут.', 'Хабарлама жіберілуді күтуде. Бұл бірнеше минут алуы мүмкін.')
        : via === 'telegram' ? text('Код пришёл в Telegram.', 'Код Telegram-ға келді.')
        : text('Код отправлен по SMS.', 'Код SMS арқылы жіберілді.')));
    } catch (e) { setError(humanizeApiError(e)); reportAuthFailure(e, 'код'); }
    finally { setBusy(false); }
  }

  async function signedIn(r: { token: string; role: string }) {
    setAccountToken(r.token); clearLoginDraft();
    track('login_success', { channel: sentVia || 'sms' });
    void linkPushTokenToAccount(); void syncWebPushSubscriptionToAccount();
    try { const me = await accountApi.me(); cacheAccountProfile({ id: me.id, name: me.name, phone: me.phone, email: me.email, avatar: me.avatar }); } catch { /* Cabinet can retry its profile fetch. */ }
    const target = new URLSearchParams(location.search).get('redirect');
    navigate(target ? safeInternalPath(target, '/cabinet') : r.role === 'seller' ? '/cabinet/partner' : r.role === 'master' ? '/cabinet/master' : '/cabinet', { replace: true });
  }

  async function confirm() {
    if (busy || !/^\d{6}$/.test(code) || expires === 0) return;
    setBusy(true); setError('');
    try {
      await signedIn(await accountApi.confirmSignInCode({ phone, code, language: lang, agreement_accepted: accepted, privacy_accepted: dataAccepted, legal_version: LEGAL_VERSION, legal_subject_name: subjectName.trim() }));
    } catch (e) { setError(humanizeApiError(e)); reportAuthFailure(e, 'вход'); }
    finally { setBusy(false); }
  }

  // WhatsApp: wait until our number has received the person's message, then the same sign-in as with a code.
  useEffect(() => {
    if (step !== 'whatsapp' || !loginId) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const r = await accountApi.whatsAppSignInStatus({ login_id: loginId, language: lang, agreement_accepted: accepted, privacy_accepted: dataAccepted, legal_version: LEGAL_VERSION, legal_subject_name: subjectName.trim() });
        if (r.status === 'done' && !stopped) { stopped = true; window.clearInterval(timer); await signedIn(r); }
      } catch (e) {
        const status = (e as { status?: number })?.status ?? 0;
        if (status >= 400 && status < 500 && status !== 429) { stopped = true; window.clearInterval(timer); setLoginId(''); setError(humanizeApiError(e)); reportAuthFailure(e, 'вход WhatsApp'); }
      }
    }, 2500);
    return () => { stopped = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loginId]);

  return <Layout><div className="mx-auto max-w-md px-4 py-10">
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
      <Gift className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
      <p><strong>{text('300 бонусов за регистрацию.', 'Тіркелгені үшін 300 бонус.')}</strong> {text('Тратятся в DAM ALEM: 1 бонус = 1 ₸ скидки.', 'DAM ALEM-де жұмсалады: 1 бонус = 1 ₸ жеңілдік.')}</p>
    </div>
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950"><ShieldCheck /></div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{text('Вход в «Сортировка 24»', '«Сортировка 24» жүйесіне кіру')}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text('Вход и регистрация по номеру телефона — через WhatsApp или Telegram.', 'Телефон нөмірі арқылы кіру және тіркелу — WhatsApp немесе Telegram арқылы.')}</p>
      {step === 'phone' && <div className="mt-4 space-y-2">
        <label htmlFor="legal-subject-name" className="block text-sm dark:text-white">{text('Ваше имя', 'Атыңыз')}</label>
        <input id="legal-subject-name" autoComplete="given-name" maxLength={120} value={subjectName} onChange={e => { setSubjectName(e.target.value); setError(''); }} placeholder={text('Например: Асия', 'Мысалы: Әсия')} className={field} />
      </div>}
      {step === 'phone' && <form className="mt-4 space-y-3" onSubmit={e => { e.preventDefault(); void sendCode(); }}>
        <label htmlFor="quick-phone" className="block text-sm font-medium dark:text-white">{text('Номер телефона', 'Телефон нөмірі')}</label>
        <KzPhoneInput id="quick-phone" aria-label={text("Номер телефона, код страны +7", "Телефон нөмірі, ел коды +7")} value={phone} onChange={setPhone} autoFocus />
        <p className="text-xs text-gray-500">{text("Введите 10 цифр. Номер с 8 или +7 можно вставить целиком.", "10 цифр енгізіңіз. 8 немесе +7 нөмірін толық қоюға болады.")}</p>
        <div className="space-y-3 pt-2">
        <label className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={accepted} onChange={e => { setAccepted(e.target.checked); setError(''); }} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />
          <span>{text('Принимаю ', 'Мен ')}<Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{text('пользовательское соглашение', 'пайдаланушы келісімін')}</Link>{kz && ' қабылдаймын'}</span>
        </label>
        <label className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={dataAccepted} onChange={e => { setDataAccepted(e.target.checked); setError(''); }} className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600" />
          <span>{text('Даю ', 'Мен ')}<Link to="/legal/consent" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{text('согласие на сбор и обработку данных', 'деректерді жинауға және өңдеуге келісім')}</Link>{text(' и ознакомился с ', ' беремін және ')}<Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{text('политикой конфиденциальности', 'құпиялылық саясатымен')}</Link>{kz && ' таныстым'}</span>
        </label>
        </div>
        {error && step === 'phone' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
        {channels.length === 0 && <p className="text-sm text-amber-700">{text('Отправка кода временно недоступна. Попробуйте позже.', 'Код жіберу уақытша қолжетімсіз. Кейінірек көріңіз.')}</p>}
        <div className="grid gap-2">
          {channels.map(ch => <button key={ch} type="button" onClick={() => void sendCode(ch)} disabled={busy}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${ch === 'whatsapp' ? 'bg-[#1f9d55] hover:bg-[#17864a]' : ch === 'telegram' ? 'bg-[#2a8bd3] hover:bg-[#2278b8]' : 'bg-gray-700 hover:bg-gray-800'}`}>
            {ch === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : ch === 'telegram' ? <Send className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            {ch === 'whatsapp' ? text('Войти через WhatsApp', 'WhatsApp арқылы кіру') : ch === 'telegram' ? text('Получить код в Telegram', 'Кодты Telegram-ға алу') : text('Получить код по SMS', 'Кодты SMS арқылы алу')}
          </button>)}
        </div>
      </form>}
      {step === 'code' && <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); void confirm(); }}>
        <p className="text-sm dark:text-white">{sentVia === 'telegram' ? text('Код из Telegram для', 'Telegram коды, нөмір') : text('Код для', 'Код, нөмір')} <strong>{phone}</strong></p>
        {botUrl && sentVia === 'telegram' && <a href={botUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2a8bd3] px-4 py-3 font-semibold text-white hover:bg-[#2278b8]"><Send className="h-4 w-4" />{text('Открыть бота и получить код', 'Ботты ашып, код алу')}</a>}
        {botUrl && sentVia === 'telegram' && <p className="text-xs text-gray-500">{text('В боте нажмите «Старт», затем «📱 Поделиться номером» — код придёт сразу.', 'Ботта «Старт», содан кейін «📱 Нөмірмен бөлісу» басыңыз — код бірден келеді.')}</p>}
        <label htmlFor="quick-code" className="sr-only">{text('Код из 6 цифр', '6 цифрдан тұратын код')}</label>
        <input id="quick-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${field} text-center text-2xl tracking-[0.35em]`} placeholder="••••••" autoFocus />
        <p role="status" className="text-xs text-gray-500">{hint} {expires === 0 ? text('Код истёк. Запросите новый.', 'Код мерзімі аяқталды. Жаңасын сұратыңыз.') : `${text('Действует ещё', 'Жарамдылық мерзімі')} ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, '0')}`}</p>
        <button disabled={busy || code.length !== 6 || expires === 0} className={button}>{busy ? text('Проверяем…', 'Тексерілуде…') : text('Войти', 'Кіру')}</button>
        <button type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode(sentVia || undefined)} className="w-full py-2 text-sm text-blue-600 disabled:text-gray-400">{cooldown > 0 ? `${text('Повторить через', 'Қайталау')} ${cooldown} с` : text('Отправить код ещё раз', 'Кодты қайта жіберу')}</button>
        {channels.filter(ch => ch !== sentVia).map(ch => <button key={ch} type="button" disabled={busy} onClick={() => void sendCode(ch)} className="w-full py-1 text-sm text-gray-600 underline dark:text-gray-300">{ch === 'whatsapp' ? text('Не пришёл? Войти через WhatsApp', 'Келмеді ме? WhatsApp арқылы кіру') : `${text('Не пришёл? Отправить в ', 'Келмеді ме? Жіберу: ')}${ch === 'telegram' ? 'Telegram' : 'SMS'}`}</button>)}
      </form>}
      {step === 'whatsapp' && <div className="mt-5 space-y-3">
        <p className="text-sm dark:text-white">{text('Подтвердите номер', 'Нөмірді растаңыз')} <strong>{phone}</strong> {text('через WhatsApp', 'WhatsApp арқылы')}</p>
        {loginId && expires > 0 && <a href={waUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1f9d55] px-4 py-4 text-lg font-semibold text-white hover:bg-[#17864a]"><MessageCircle className="h-5 w-5" />{text('Открыть WhatsApp и отправить', 'WhatsApp-ты ашып, жіберу')}</a>}
        <p className="text-sm text-gray-600 dark:text-gray-300">{text('Откроется чат «Сортировка 24» (+7 700 428 02 80) с готовым сообщением. Отправьте его с этого же номера — и вход завершится сам. Мы сами вам первыми не пишем.', '«Сортировка 24» (+7 700 428 02 80) чаты дайын хабарламамен ашылады. Оны осы нөмірден жіберіңіз — кіру өзі аяқталады. Біз сізге бірінші жазбаймыз.')}</p>
        {loginId && expires > 0 && <p role="status" className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-4 w-4 animate-spin" />{text('Ждём ваше сообщение…', 'Хабарламаңызды күтеміз…')} {text('Действует ещё', 'Жарамдылық мерзімі')} {Math.floor(expires / 60)}:{String(expires % 60).padStart(2, '0')}</p>}
        {(!loginId || expires === 0) && <button type="button" disabled={busy} onClick={() => void sendCode('whatsapp')} className={button}>{text('Время вышло — начать заново', 'Уақыт бітті — қайта бастау')}</button>}
        {channels.filter(ch => ch !== 'whatsapp').map(ch => <button key={ch} type="button" disabled={busy} onClick={() => void sendCode(ch)} className="w-full py-1 text-sm text-gray-600 underline dark:text-gray-300">{text('Не получается? Войти через ', 'Болмай жатыр ма? Кіру: ')}{ch === 'telegram' ? 'Telegram' : 'SMS'}</button>)}
      </div>}
      {error && step !== 'phone' && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {step !== 'phone' && <button type="button" disabled={busy} onClick={() => { setStep('phone'); setCode(''); setLoginId(''); setError(''); }} className="mt-4 flex items-center gap-1 text-sm text-gray-500"><ArrowLeft size={16} />{text('Изменить номер', 'Нөмірді өзгерту')}</button>}
      {google && step === 'phone' && <button type="button" disabled={!accepted || !dataAccepted || !nameReady || busy} onClick={googleLogin} className="mt-4 w-full text-sm text-gray-500 underline disabled:opacity-50">{text('Уже входили через Google? Войти через Google', 'Бұрын Google арқылы кірдіңіз бе? Google арқылы кіру')}</button>}
      <button type="button" disabled={busy} onClick={onPasswordLogin} className="mt-6 w-full text-xs text-gray-400 underline dark:text-gray-500">{text('Вход для сотрудников', 'Қызметкерлерге арналған кіру')}</button>
    </div><Link to="/" className="mt-5 block text-center text-sm text-gray-500">{text('Продолжить без входа', 'Кірусіз жалғастыру')}</Link>
  </div></Layout>;
}
