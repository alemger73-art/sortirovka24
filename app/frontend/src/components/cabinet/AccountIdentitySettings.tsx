import KzPhoneInput from '@/components/KzPhoneInput';
import { isCompleteKzPhone } from '@/lib/kzPhone';
import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { accountApi, type OtpChannel } from '@/lib/accountApi';
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
  const [channels, setChannels] = useState<OtpChannel[]>([]);
  const [channel, setChannel] = useState<OtpChannel | null>(null);
  const channelName = (c: OtpChannel | null) => c === 'whatsapp' ? 'WhatsApp' : c === 'telegram' ? 'Telegram' : 'SMS';
  useEffect(() => {
    accountApi.otpChannels().then(r => setChannels(r.channels || [])).catch(() => {});
    accountApi.me().then(p => { setProfile(p); setPhone(p.phone || ''); }).catch(() => setMessage(text('Не удалось загрузить способы входа.', 'Кіру тәсілдерін жүктеу мүмкін болмады.')));
    accountApi.googleStatus().then(r => setGoogle(r.enabled)).catch(() => {});
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setCooldown(v => Math.max(0, v - 1)), 1000); return () => window.clearInterval(timer); }, []);
  async function action(kind: 'google' | 'send' | 'confirm', via: OtpChannel | null = channel) {
    setBusy(true); setMessage('');
    try {
      if (kind === 'google') {
        const r = await accountApi.googleLinkStart();
        sessionStorage.setItem('s24-auth-return', '/cabinet?tab=settings');
        window.location.assign(r.url); return;
      }
      if (kind === 'send') {
        const r = await accountApi.requestPhoneLinkCode(phone, via || undefined); const used = r.channel || channel || via || 'sms'; setChannel(used); if (r.on_screen_code_hint) { setSent(true); setMessage(r.on_screen_code_hint); setCooldown(r.resend_after_seconds); return; } setSent(true); setCode(''); setCooldown(r.resend_after_seconds);
        setMessage(used !== 'sms' ? text(`Код отправлен в ${channelName(used)}. Откройте приложение и введите код здесь.`, `Код ${channelName(used)} арқылы жіберілді. Қосымшаны ашып, кодты осында енгізіңіз.`) : r.sms_pending_moderation
          ? text('SMS принято сервисом и ожидает отправки. Доставка может занять несколько минут. Если код не пришёл, запросите новый после окончания таймера.', 'SMS сервиске қабылданды және жіберілуді күтуде. Жеткізу бірнеше минут алуы мүмкін. Код келмесе, таймер аяқталған соң жаңасын сұраңыз.')
          : text('SMS передано сервису отправки. Проверьте сообщения и папку «Спам».', 'SMS жіберу сервисіне берілді. Хабарламалар мен «Спам» қалтасын тексеріңіз.'));
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
      {profile.google_linked && <p className="text-sm text-gray-600 dark:text-gray-300">{text('Вы вошли через Google. Подтвердите телефон ниже — тогда вход будет и по коду в WhatsApp или Telegram, а бонусы за заказы на ваш номер появятся в кабинете.', 'Google арқылы кірдіңіз. Төменде телефонды растаңыз — сонда WhatsApp немесе Telegram кодымен кіруге болады, ал нөміріңізге тапсырыстар үшін бонустар кабинетте көрінеді.')}</p>}
      <p className="text-sm text-gray-600 dark:text-gray-300">{profile.phone_verified ? `${text('Телефон для входа подтверждён', 'Кіру телефоны расталған')}: ${profile.phone}` : text('Телефон не подтверждён. Подтвердите его кодом — так бонусы за заказы будут приходить на ваш счёт, а входить можно будет по номеру.', 'Телефон расталмаған. Оны кодпен растаңыз — тапсырыстар үшін бонустар шотыңызға түседі, нөмір арқылы кіруге болады.')}</p>
      {!profile.phone_verified && <>
        <details open className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
        <summary className="cursor-pointer text-sm font-medium">{text('Подтвердить телефон', 'Телефонды растау')}</summary>
        <div className="mt-3 space-y-3">
        <KzPhoneInput aria-label={text('Телефон для подтверждения, код страны +7', 'Растауға арналған телефон, ел коды +7')} value={phone} readOnly={Boolean(profile.phone) || sent} disabled={busy} onChange={setPhone} />
        <p className="text-xs text-gray-500">{text('Введите 10 цифр; номер с 8 или +7 можно вставить целиком. Если номер свободен, после подтверждения он будет открывать этот кабинет. Если у номера уже есть отдельный кабинет, его заказы и бонусы автоматически не переносятся.', '10 цифр енгізіңіз; 8 немесе +7 нөмірін толық қоюға болады. Нөмір бос болса, растаудан кейін осы кабинетке кіреді. Нөмірге басқа кабинет тіркелсе, оның тапсырыстары мен бонустары автоматты түрде көшірілмейді.')}</p>
        {sent && <input aria-label={text(`Код из ${channelName(channel)}`, `${channelName(channel)} коды`)} placeholder={text(`Код из ${channelName(channel)}`, `${channelName(channel)} коды`)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border p-2 dark:border-gray-700 dark:bg-gray-950 dark:text-white" />}
        {sent && <button type="button" disabled={busy || code.length !== 6} onClick={() => void action('confirm')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{text('Подтвердить телефон', 'Телефонды растау')}</button>}
        <div className="flex flex-wrap gap-2">{(channels.length ? channels : ['sms' as OtpChannel]).map(c => <button key={c} type="button" disabled={busy || !isCompleteKzPhone(phone) || (cooldown > 0 && c === channel)} onClick={() => void action('send', c)} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${c === 'whatsapp' ? 'bg-[#25D366] text-white' : c === 'telegram' ? 'bg-[#229ED9] text-white' : 'border border-gray-300 text-blue-600 dark:border-gray-600'}`}>{cooldown > 0 && c === channel ? `${text('Повторить через', 'Қайталау')} ${cooldown} с` : text(`Код в ${channelName(c)}`, `${channelName(c)} арқылы код`)}</button>)}</div>
        {sent && !profile.phone && <button type="button" disabled={busy} onClick={() => { setSent(false); setCode(''); }} className="text-sm text-gray-500">{text('Изменить номер', 'Нөмірді өзгерту')}</button>}
        </div></details>
      </>}
      {profile.google_linked ? <p className="text-sm text-green-600">{text('Google подключён', 'Google қосылған')}</p> : google && <button type="button" disabled={busy} onClick={() => void action('google')} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-blue-600 dark:border-gray-700">{text('Подключить Google к этому кабинету', 'Google аккаунтын осы кабинетке қосу')}</button>}
    </>}
    {message && <p role="status" className="text-sm text-gray-600 dark:text-gray-300">{message}</p>}
  </section>;
}
