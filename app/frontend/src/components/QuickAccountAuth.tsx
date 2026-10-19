import { LEGAL_VERSION } from '@/content/legal';
import KzPhoneInput from '@/components/KzPhoneInput';
import { isCompleteKzPhone } from '@/lib/kzPhone';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Send, ShieldCheck, Smartphone } from 'lucide-react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { accountApi, setAccountToken, type OtpChannel } from '@/lib/accountApi';
import { safeInternalPath } from '@/lib/pwa';
import { humanizeApiError } from '@/lib/apiErrors';
import { cacheAccountProfile } from '@/lib/localAuth';
import { linkPushTokenToAccount, syncWebPushSubscriptionToAccount } from '@/lib/pushNotifications';

export default function QuickAccountAuth({ onPasswordLogin }: { onPasswordLogin: () => void }) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const text = (ru: string, kk: string) => kz ? kk : ru;
  const location = useLocation();
  const navigate = useNavigate();
  const [google, setGoogle] = useState(false);
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [channels, setChannels] = useState<OtpChannel[]>([]);
  const [sentVia, setSentVia] = useState<OtpChannel | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const nameReady = subjectName.trim().split(/\s+/).length >= 2;
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [dataAccepted, setDataAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expires, setExpires] = useState(0);
  const field = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white';
  const button = 'w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
  useEffect(() => { accountApi.googleStatus().then(r => setGoogle(r.enabled)).catch(() => setGoogle(false)); }, []);
  useEffect(() => { accountApi.otpChannels().then(r => setChannels(r.channels)).catch(() => setChannels([])); }, []);
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
    if (busy || (cooldown > 0 && channel === sentVia) || !accepted || !dataAccepted || !nameReady) return;
    const digits = phone.replace(/\D/g, '');
    if (!/^(?:[78]\d{10}|\d{10})$/.test(digits)) { setError(text('Введите номер +7 и 10 цифр.', '+7 және 10 цифрдан тұратын нөмірді енгізіңіз.')); return; }
    setBusy(true); setError('');
    try {
      const r = await accountApi.requestSignInCode(phone, subjectName.trim(), lang, channel);
      const via = (r.channel || channel || null) as OtpChannel | null;
      setSentVia(via);
      setCode(''); setStep('code'); setCooldown(r.resend_after_seconds); setExpires(r.ttl_seconds);
      setHint(r.on_screen_code_hint || (r.sms_pending_moderation
        ? text('Сообщение ожидает отправки. Это может занять несколько минут.', 'Хабарлама жіберілуді күтуде. Бұл бірнеше минут алуы мүмкін.')
        : via === 'whatsapp' ? text('Код отправлен в WhatsApp. Откройте чат и скопируйте код.', 'Код WhatsApp-қа жіберілді. Чатты ашып, кодты көшіріңіз.')
        : via === 'telegram' ? text('Код отправлен в Telegram, в чат «Verification Codes».', 'Код Telegram-ға, «Verification Codes» чатына жіберілді.')
        : text('Код отправлен по SMS.', 'Код SMS арқылы жіберілді.')));
    } catch (e) { setError(humanizeApiError(e)); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (busy || !/^\d{6}$/.test(code) || expires === 0) return;
    setBusy(true); setError('');
    try {
      const r = await accountApi.confirmSignInCode({ phone, code, language: lang, agreement_accepted: accepted, privacy_accepted: dataAccepted, legal_version: LEGAL_VERSION, legal_subject_name: subjectName.trim() });
      setAccountToken(r.token);
      void linkPushTokenToAccount(); void syncWebPushSubscriptionToAccount();
      try { const me = await accountApi.me(); cacheAccountProfile({ id: me.id, name: me.name, phone: me.phone, email: me.email, avatar: me.avatar }); } catch { /* Cabinet can retry its profile fetch. */ }
      const target = new URLSearchParams(location.search).get('redirect');
      navigate(target ? safeInternalPath(target, '/cabinet') : r.role === 'seller' ? '/cabinet/partner' : r.role === 'master' ? '/cabinet/master' : '/cabinet', { replace: true });
    } catch (e) { setError(humanizeApiError(e)); }
    finally { setBusy(false); }
  }

  return <Layout><div className="mx-auto max-w-md px-4 py-10">
    <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{text('При первой регистрации — 300 бонусов Сортировка24. Потратить можно только в DAM ALEM, 1 бонус = 1 ₸ скидки. ', 'Алғашқы тіркелуде — Сортировка24-тің 300 бонусы. Тек DAM ALEM-де жұмсауға болады, 1 бонус = 1 ₸ жеңілдік. ')}{channels.length > 0 && text(`Код для входа придёт ${channels.map(c => c === 'whatsapp' ? 'в WhatsApp' : c === 'telegram' ? 'в Telegram' : 'по SMS').join(' или ')}.`, `Кіру коды ${channels.map(c => c === 'whatsapp' ? 'WhatsApp' : c === 'telegram' ? 'Telegram' : 'SMS').join(' немесе ')} арқылы келеді.`)}</p>
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950"><ShieldCheck /></div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{text('Войти в Sortirovka24', 'Sortirovka24 жүйесіне кіру')}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text('Первый раз? Создадим кабинет при входе. Пароль не нужен.', 'Алғаш рет пе? Кіру кезінде жеке кабинет ашылады. Құпиясөз қажет емес.')}</p>
      {step !== 'code' && <div className="mt-4 space-y-2">
        <label htmlFor="legal-subject-name" className="block text-sm dark:text-white">{text('Фамилия, имя, отчество (при наличии)', 'Тегі, аты, әкесінің аты (болса)')}</label>
        <input id="legal-subject-name" autoComplete="name" maxLength={120} value={subjectName} onChange={e => setSubjectName(e.target.value)} className={field} />
      </div>}
      {step !== 'code' && <label className="my-5 flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
        <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>{text('Принимаю ', 'Мен ')}<Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{text('пользовательское соглашение', 'пайдаланушы келісімін')}</Link>{kz && ' қабылдаймын'}</span>
      </label>}
      {step !== 'code' && <label className="mb-5 flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
        <input type="checkbox" checked={dataAccepted} onChange={e => setDataAccepted(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>{text('Даю ', 'Мен ')}<Link to="/legal/consent" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{text('согласие на сбор и обработку данных', 'деректерді жинауға және өңдеуге келісім')}</Link>{text(' и ознакомился с ', ' беремін және ')}<Link to="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">{text('политикой конфиденциальности', 'құпиялылық саясатымен')}</Link>{kz && ' таныстым'}</span>
      </label>}
      {step === 'phone' && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void sendCode(); }}>
        <label htmlFor="quick-phone" className="block text-sm font-medium dark:text-white">{text('Номер телефона', 'Телефон нөмірі')}</label>
        <KzPhoneInput id="quick-phone" aria-label={text("Номер телефона, код страны +7", "Телефон нөмірі, ел коды +7")} value={phone} onChange={setPhone} autoFocus />
        <p className="text-xs text-gray-500">{text("Введите 10 цифр. Номер с 8 или +7 можно вставить целиком.", "10 цифр енгізіңіз. 8 немесе +7 нөмірін толық қоюға болады.")}</p>
        {channels.length === 0 && <p className="text-sm text-amber-700">{text('Отправка кода временно недоступна. Попробуйте позже.', 'Код жіберу уақытша қолжетімсіз. Кейінірек көріңіз.')}</p>}
        <div className="grid gap-2">
          {channels.map(ch => <button key={ch} type="button" onClick={() => void sendCode(ch)} disabled={busy || !accepted || !dataAccepted || !nameReady || !isCompleteKzPhone(phone)}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${ch === 'whatsapp' ? 'bg-[#1f9d55] hover:bg-[#17864a]' : ch === 'telegram' ? 'bg-[#2a8bd3] hover:bg-[#2278b8]' : 'bg-gray-700 hover:bg-gray-800'}`}>
            {ch === 'whatsapp' ? <MessageCircle className="h-4 w-4" /> : ch === 'telegram' ? <Send className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            {ch === 'whatsapp' ? text('Получить код в WhatsApp', 'Кодты WhatsApp-қа алу') : ch === 'telegram' ? text('Получить код в Telegram', 'Кодты Telegram-ға алу') : text('Получить код по SMS', 'Кодты SMS арқылы алу')}
          </button>)}
        </div>
      </form>}
      {step === 'code' && <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); void confirm(); }}>
        <p className="text-sm dark:text-white">{sentVia === 'whatsapp' ? text('Код из WhatsApp для', 'WhatsApp коды, нөмір') : sentVia === 'telegram' ? text('Код из Telegram для', 'Telegram коды, нөмір') : text('Код для', 'Код, нөмір')} <strong>{phone}</strong></p>
        <label htmlFor="quick-code" className="sr-only">{text('Код из 6 цифр', '6 цифрдан тұратын код')}</label>
        <input id="quick-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${field} text-center text-2xl tracking-[0.35em]`} placeholder="••••••" autoFocus />
        <p role="status" className="text-xs text-gray-500">{hint} {expires === 0 ? text('Код истёк. Запросите новый.', 'Код мерзімі аяқталды. Жаңасын сұратыңыз.') : `${text('Действует ещё', 'Жарамдылық мерзімі')} ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, '0')}`}</p>
        <button disabled={busy || code.length !== 6 || expires === 0} className={button}>{busy ? text('Проверяем…', 'Тексерілуде…') : text('Войти', 'Кіру')}</button>
        <button type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode(sentVia || undefined)} className="w-full py-2 text-sm text-blue-600 disabled:text-gray-400">{cooldown > 0 ? `${text('Повторить через', 'Қайталау')} ${cooldown} с` : text('Отправить код ещё раз', 'Кодты қайта жіберу')}</button>
        {channels.filter(ch => ch !== sentVia).map(ch => <button key={ch} type="button" disabled={busy} onClick={() => void sendCode(ch)} className="w-full py-1 text-sm text-gray-600 underline dark:text-gray-300">{text('Не пришёл? Отправить в ', 'Келмеді ме? Жіберу: ')}{ch === 'whatsapp' ? 'WhatsApp' : ch === 'telegram' ? 'Telegram' : 'SMS'}</button>)}
      </form>}
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {step === 'code' && <button type="button" disabled={busy} onClick={() => { setStep('phone'); setCode(''); setError(''); }} className="mt-4 flex items-center gap-1 text-sm text-gray-500"><ArrowLeft size={16} />{text('Изменить номер', 'Нөмірді өзгерту')}</button>}
      {google && step === 'phone' && <button type="button" disabled={!accepted || !dataAccepted || !nameReady || busy} onClick={googleLogin} className="mt-4 w-full text-sm text-gray-500 underline disabled:opacity-50">{text('Уже входили через Google? Войти через Google', 'Бұрын Google арқылы кірдіңіз бе? Google арқылы кіру')}</button>}
      <button type="button" disabled={busy} onClick={onPasswordLogin} className="mt-5 w-full text-sm text-blue-600">{text('Уже есть пароль? Войти по паролю', 'Құпиясөз бар ма? Құпиясөз арқылы кіру')}</button>
    </div><Link to="/" className="mt-5 block text-center text-sm text-gray-500">{text('Продолжить без входа', 'Кірусіз жалғастыру')}</Link>
  </div></Layout>;
}
