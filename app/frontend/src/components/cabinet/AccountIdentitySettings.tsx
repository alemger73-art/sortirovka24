import KzPhoneInput from '@/components/KzPhoneInput';
import { isCompleteKzPhone } from '@/lib/kzPhone';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { accountApi } from '@/lib/accountApi';
import { humanizeApiError } from '@/lib/apiErrors';

export default function AccountIdentitySettings() {
  const { lang } = useLanguage();
  const text = (ru: string, kz: string) => lang === 'kz' ? kz : ru;
  const [profile, setProfile] = useState<{ phone?: string; phone_verified?: boolean; google_linked?: boolean } | null>(null);
  const [google, setGoogle] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState('');
  useEffect(() => {
    accountApi.me().then(p => { setProfile(p); setPhone(p.phone || ''); }).catch(() => setMessage(text('Не удалось загрузить способы входа.', 'Кіру тәсілдерін жүктеу мүмкін болмады.')));
    accountApi.googleStatus().then(r => setGoogle(r.enabled)).catch(() => {});
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setCooldown(v => Math.max(0, v - 1)), 1000); return () => window.clearInterval(timer); }, []);
  async function action(kind: 'google' | 'send' | 'confirm') {
    setBusy(true); setMessage('');
    try {
      if (kind === 'google') {
        const r = await accountApi.googleLinkStart();
        sessionStorage.setItem('s24-auth-return', '/cabinet?tab=settings');
        window.location.assign(r.url); return;
      }
      if (kind === 'send') {
        const r = await accountApi.requestPhoneLinkCode(phone); setSent(true); setCode(''); setCooldown(r.resend_after_seconds);
        setMessage(text('Код отправлен. Проверьте также папку «Спам».', 'Код жіберілді. «Спам» қалтасын да тексеріңіз.'));
      } else {
        await accountApi.confirmPhoneLinkCode(phone, code); setProfile(await accountApi.me()); setSent(false);
        setMessage(text('Телефон подтверждён. Заказы и бонусы остаются в этом кабинете.', 'Телефон расталды. Тапсырыстар мен бонустар осы кабинетте қалады.'));
      }
    } catch (e) { setMessage(humanizeApiError(e)); }
    finally { setBusy(false); }
  }
  return <section className="mb-6 space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
    <h3 className="font-semibold text-gray-900 dark:text-white">{text('Способы входа', 'Кіру тәсілдері')}</h3>
    {profile && <>
      <p className="text-sm text-gray-600 dark:text-gray-300">{profile.phone_verified ? `${text('Телефон подтверждён', 'Телефон расталған')}: ${profile.phone}` : text('Добавьте и подтвердите телефон, когда понадобится связь по заказу.', 'Тапсырыс бойынша байланыс қажет болғанда телефонды қосып, растаңыз.')}</p>
      {!profile.phone_verified && <>
        <KzPhoneInput aria-label={text('Телефон для подтверждения, код страны +7', 'Растауға арналған телефон, ел коды +7')} value={phone} readOnly={Boolean(profile.phone) || sent} disabled={busy} onChange={setPhone} />
        <p className="text-xs text-gray-500">{text('Введите 10 цифр; номер с 8 или +7 можно вставить целиком. После подтверждения Google и телефон будут открывать этот кабинет.', '10 цифр енгізіңіз; 8 немесе +7 нөмірін толық қоюға болады. Растаудан кейін Google және телефон осы кабинетке кіреді.')}</p>
        {sent && <input aria-label={text('SMS-код', 'SMS коды')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />}
        {sent && <button type="button" disabled={busy || code.length !== 6} onClick={() => void action('confirm')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{text('Подтвердить телефон', 'Телефонды растау')}</button>}
        <button type="button" disabled={busy || !isCompleteKzPhone(phone) || cooldown > 0} onClick={() => void action('send')} className="block text-sm text-blue-600 disabled:text-gray-400">{cooldown > 0 ? `${text('Повторить через', 'Қайталау')} ${cooldown} с` : text('Получить SMS-код', 'SMS кодын алу')}</button>
        {sent && !profile.phone && <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); }} className="text-sm text-gray-500">{text('Изменить номер', 'Нөмірді өзгерту')}</button>}
      </>}
      {profile.google_linked ? <p className="text-sm text-green-600">{text('Google подключён', 'Google қосылған')}</p> : google && <button type="button" disabled={busy} onClick={() => void action('google')} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-blue-600 dark:border-gray-700">{text('Подключить Google к этому кабинету', 'Google аккаунтын осы кабинетке қосу')}</button>}
    </>}
    {message && <p role="status" className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
  </section>;
}
