/** Push on this phone: on / one button to switch on / what to do when the phone blocks it.
 *  Shown on top of the cabinet's «Уведомления» and in its settings. */
import { useEffect, useState } from 'react';
import { BellRing, Check } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { humanizeApiError } from '@/lib/apiErrors';
import InstallAppBanner from '@/components/InstallAppBanner';
import { disablePushNotifications, enablePushNotifications, getPushPermissionState, type PushPermissionState } from '@/lib/pushNotifications';

export default function PushDeviceStatus({ withNews = false, className = '' }: { withNews?: boolean; className?: string }) {
  const { lang } = useLanguage();
  const text = (ru: string, kz: string) => (lang === 'kz' ? kz : ru);
  const [state, setState] = useState<PushPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const refresh = () => { void getPushPermissionState().then(s => { if (live) setState(s); }).catch(() => { if (live) setState('unsupported'); }); };
    refresh();
    window.addEventListener('focus', refresh);  // back from the phone settings
    return () => { live = false; window.removeEventListener('focus', refresh); };
  }, []);
  async function change(on: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    try { setState(on ? await enablePushNotifications({ withNews }) : await disablePushNotifications()); }
    catch (e) { setError(humanizeApiError(e)); setState(await getPushPermissionState().catch((): PushPermissionState => 'unsupported')); }
    finally { setBusy(false); }
  }
  if (!state) return null;
  const box = `${className} rounded-2xl border p-4`;
  if (state === 'enabled') {
    return <div data-push-status="enabled" className={`${box} flex flex-wrap items-center gap-3 border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100`}>
      <Check className="h-5 w-5 shrink-0" /><span className="flex-1 text-sm font-semibold">{text('Уведомления на этом телефоне включены', 'Осы телефонда хабарландырулар қосулы')}</span>
      <button type="button" disabled={busy} onClick={() => void change(false)} className="text-xs font-semibold underline">{text('Отключить', 'Өшіру')}</button>
    </div>;
  }
  return <div data-push-status={state} className={`${box} border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-50`}>
    <p className="flex items-center gap-2 font-semibold"><BellRing className="h-5 w-5 shrink-0" />{text('Уведомления на телефон', 'Телефонға хабарландырулар')}</p>
    {error && <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
    {state === 'disabled' && <>
      <p className="mt-1 text-sm">{text('Заказы, бонусы и важное — сразу на телефон. Нажмите и выберите «Разрешить».', 'Тапсырыстар, бонустар және маңызды хабарлар бірден телефонға. Басып, «Рұқсат беру» таңдаңыз.')}</p>
      <button type="button" disabled={busy} onClick={() => void change(true)} className="mt-3 min-h-11 w-full rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60 sm:w-auto">
        {busy ? text('Включаем…', 'Қосылуда…') : text('Включить уведомления', 'Хабарландыруларды қосу')}
      </button>
    </>}
    {state === 'denied' && <p className="mt-1 text-sm">{text(
      'Телефон запретил уведомления для сайта. Откройте Настройки телефона → Приложения → «Сортировка 24» (или Chrome) → Уведомления → Разрешить, затем вернитесь сюда.',
      'Телефон сайтқа хабарландыруға тыйым салған. Телефон баптаулары → Қолданбалар → «Сортировка 24» (немесе Chrome) → Хабарландырулар → Рұқсат беру, содан кейін осында оралыңыз.')}</p>}
    {state === 'needs-install' && <>
      <p className="mt-1 text-sm">{text('На iPhone уведомления приходят только в установленное приложение. Установите его, откройте с экрана «Домой» и включите здесь.', 'iPhone-да хабарландырулар тек орнатылған қолданбаға келеді.')}</p>
      <div className="mt-3"><InstallAppBanner manual /></div>
    </>}
    {state === 'unsupported' && <p className="mt-1 text-sm">{text('Этот браузер не умеет уведомления. Откройте сайт в Chrome (Android) или Safari (iPhone).', 'Бұл браузер хабарландыруды қолдамайды. Chrome (Android) немесе Safari (iPhone) ашыңыз.')}</p>}
  </div>;
}
