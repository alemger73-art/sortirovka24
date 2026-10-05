import KzPhoneInput from '@/components/KzPhoneInput';
import { isCompleteKzPhone } from '@/lib/kzPhone';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Smartphone } from 'lucide-react';
import Layout from '@/components/Layout';
import { useLanguage } from '@/contexts/LanguageContext';
import { accountApi, setAccountToken } from '@/lib/accountApi';
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
  const [step, setStep] = useState<'choose' | 'phone' | 'code'>('choose');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [expires, setExpires] = useState(0);
  const field = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-white';
  const button = 'w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';
  useEffect(() => { accountApi.googleStatus().then(r => setGoogle(r.enabled)).catch(() => setGoogle(false)); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => { setCooldown(v => Math.max(0, v - 1)); setExpires(v => Math.max(0, v - 1)); }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  function googleLogin() {
    if (!accepted || busy) return;
    const target = new URLSearchParams(location.search).get('redirect');
    if (target) sessionStorage.setItem('s24-auth-return', safeInternalPath(target, '/cabinet'));
    else sessionStorage.removeItem('s24-auth-return');
    setBusy(true);
    window.location.assign(accountApi.googleStartUrl(lang, accepted));
  }

  async function sendCode() {
    if (busy || cooldown > 0 || !accepted) return;
    const digits = phone.replace(/\D/g, '');
    if (!/^(?:[78]\d{10}|\d{10})$/.test(digits)) { setError(text('Введите номер +7 и 10 цифр.', '+7 және 10 цифрдан тұратын нөмірді енгізіңіз.')); return; }
    setBusy(true); setError('');
    try {
      const r = await accountApi.requestSignInCode(phone);
      setCode(''); setStep('code'); setCooldown(r.resend_after_seconds); setExpires(r.ttl_seconds);
      setHint(r.on_screen_code_hint || (r.sms_pending_moderation
        ? text('Сообщение ожидает отправки. Это может занять несколько минут.', 'Хабарлама жіберілуді күтуде. Бұл бірнеше минут алуы мүмкін.')
        : text('Код отправлен. Если SMS не видно, проверьте папку «Спам».', 'Код жіберілді. SMS көрінбесе, «Спам» қалтасын тексеріңіз.')));
    } catch (e) { setError(humanizeApiError(e)); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (busy || !/^\d{6}$/.test(code) || expires === 0) return;
    setBusy(true); setError('');
    try {
      const r = await accountApi.confirmSignInCode({ phone, code, language: lang, agreement_accepted: accepted, privacy_accepted: accepted });
      setAccountToken(r.token);
      void linkPushTokenToAccount(); void syncWebPushSubscriptionToAccount();
      try { const me = await accountApi.me(); cacheAccountProfile({ id: me.id, name: me.name, phone: me.phone, email: me.email, avatar: me.avatar }); } catch { /* Cabinet can retry its profile fetch. */ }
      const target = new URLSearchParams(location.search).get('redirect');
      navigate(target ? safeInternalPath(target, '/cabinet') : r.role === 'seller' ? '/cabinet/partner' : r.role === 'master' ? '/cabinet/master' : '/cabinet', { replace: true });
    } catch (e) { setError(humanizeApiError(e)); }
    finally { setBusy(false); }
  }

  return <Layout><div className="mx-auto max-w-md px-4 py-10">
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950"><ShieldCheck /></div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{text('Войти в Sortirovka24', 'Sortirovka24 жүйесіне кіру')}</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text('Первый раз? Создадим кабинет при входе. Пароль не нужен.', 'Алғаш рет пе? Кіру кезінде жеке кабинет ашылады. Құпиясөз қажет емес.')}</p>
      {step !== 'code' && <label className="my-5 flex items-start gap-3 text-sm text-gray-600 dark:text-gray-300">
        <input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} className="mt-1 h-4 w-4" />
        <span>{text('Принимаю ', 'Мен ')}<Link to="/legal/terms" target="_blank" className="text-blue-600 underline">{text('пользовательское соглашение', 'пайдаланушы келісімін')}</Link>{text(' и ', ' және ')}<Link to="/legal/privacy" target="_blank" className="text-blue-600 underline">{text('политику конфиденциальности', 'құпиялылық саясатын')}</Link>{kz && ' қабылдаймын'}</span>
      </label>}
      {step === 'choose' && <div className="space-y-3">
        {google && <button type="button" disabled={!accepted || busy} onClick={googleLogin} className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 px-4 py-3 font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-white dark:hover:bg-gray-800"><span aria-hidden="true" className="font-bold text-blue-600">G</span>{text('Продолжить с Google', 'Google арқылы жалғастыру')}</button>}
        <button type="button" onClick={() => { setStep('phone'); setError(''); }} className={button}><Smartphone className="mr-2 inline h-4 w-4" />{text('Продолжить по телефону', 'Телефон арқылы жалғастыру')}</button>
        {google && <p className="text-center text-xs text-gray-500">{text('Google — без SMS. Телефон добавите, когда понадобится.', 'Google — SMS-сіз. Телефонды қажет болғанда қосасыз.')}</p>}
      </div>}
      {step === 'phone' && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void sendCode(); }}>
        <label htmlFor="quick-phone" className="block text-sm font-medium dark:text-white">{text('Номер телефона', 'Телефон нөмірі')}</label>
        <KzPhoneInput id="quick-phone" aria-label={text("Номер телефона, код страны +7", "Телефон нөмірі, ел коды +7")} value={phone} onChange={setPhone} autoFocus />
        <p className="text-xs text-gray-500">{text("Введите 10 цифр. Номер с 8 или +7 можно вставить целиком.", "10 цифр енгізіңіз. 8 немесе +7 нөмірін толық қоюға болады.")}</p>
        <button disabled={busy || !accepted || !isCompleteKzPhone(phone) || cooldown > 0} className={button}>{cooldown > 0 ? `${text('Повторить через', 'Қайталау')} ${cooldown} ${text('с', 'с')}` : text('Получить SMS-код', 'SMS кодын алу')}</button>
      </form>}
      {step === 'code' && <form className="mt-5 space-y-3" onSubmit={e => { e.preventDefault(); void confirm(); }}>
        <p className="text-sm dark:text-white">{text('Код из SMS на', 'SMS коды жіберілген нөмір')} <strong>{phone}</strong></p>
        <label htmlFor="quick-code" className="sr-only">{text('Код из 6 цифр', '6 цифрдан тұратын код')}</label>
        <input id="quick-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={`${field} text-center text-2xl tracking-[0.35em]`} placeholder="••••••" autoFocus />
        <p role="status" className="text-xs text-gray-500">{hint} {expires === 0 ? text('Код истёк. Запросите новый.', 'Код мерзімі аяқталды. Жаңасын сұратыңыз.') : `${text('Действует ещё', 'Жарамдылық мерзімі')} ${Math.floor(expires / 60)}:${String(expires % 60).padStart(2, '0')}`}</p>
        <button disabled={busy || code.length !== 6 || expires === 0} className={button}>{busy ? text('Проверяем…', 'Тексерілуде…') : text('Войти', 'Кіру')}</button>
        <button type="button" disabled={busy || cooldown > 0} onClick={() => void sendCode()} className="w-full py-2 text-sm text-blue-600 disabled:text-gray-400">{cooldown > 0 ? `${text('Повторить через', 'Қайталау')} ${cooldown} с` : text('Отправить код ещё раз', 'Кодты қайта жіберу')}</button>
      </form>}
      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
      {step !== 'choose' && <button type="button" disabled={busy} onClick={() => { setStep(step === 'code' ? 'phone' : 'choose'); setCode(''); setError(''); }} className="mt-4 flex items-center gap-1 text-sm text-gray-500"><ArrowLeft size={16} />{step === 'code' ? text('Изменить номер', 'Нөмірді өзгерту') : text('Другой способ входа', 'Басқа кіру тәсілі')}</button>}
      <button type="button" disabled={busy} onClick={onPasswordLogin} className="mt-5 w-full text-sm text-blue-600">{text('Уже есть пароль? Войти по паролю', 'Құпиясөз бар ма? Құпиясөз арқылы кіру')}</button>
    </div><Link to="/" className="mt-5 block text-center text-sm text-gray-500">{text('Продолжить без входа', 'Кірусіз жалғастыру')}</Link>
  </div></Layout>;
}
