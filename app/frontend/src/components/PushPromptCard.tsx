import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { enablePushNotifications, getPushPermissionState, type PushPermissionState } from '@/lib/pushNotifications';
import { useLanguage } from '@/contexts/LanguageContext';
import InstallAppBanner from '@/components/InstallAppBanner';

const DISMISS_KEY = 's24_push_prompt_dismissed_at';
const ASK_AGAIN_DAYS = 7;

/** Short card that offers notifications at the moment they matter (after sign-in, on an open order). Its text names
 *  news and offers, so agreeing switches those on too. Asks again a week after «×».
 *  Shows nothing when push is already on, blocked, unsupported or recently dismissed. */
export default function PushPromptCard({ reason = 'order', className = '' }: { reason?: 'order' | 'cabinet'; className?: string }) {
  const { lang } = useLanguage();
  const kz = lang === 'kz';
  const [state, setState] = useState<PushPermissionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(() => {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY)) < ASK_AGAIN_DAYS * 86400000; } catch { return false; }
  });
  useEffect(() => {
    let alive = true;
    getPushPermissionState().then(s => { if (alive) setState(s); }).catch(() => { if (alive) setState('unsupported'); });
    return () => { alive = false; };
  }, []);
  if (hidden || !state || !['disabled', 'needs-install'].includes(state)) return null;

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* optional */ } setHidden(true); };
  const title = reason === 'order'
    ? (kz ? 'Тапсырыс күйі туралы хабарландыру' : 'Узнавайте о заказе сразу')
    : (kz ? 'Хабарландыруларды қосыңыз' : 'Включите уведомления');
  const text = reason === 'order'
    ? (kz ? 'Тапсырыс қабылданғанда, курьер шыққанда және жеткізілгенде хабарлаймыз. Аудан жаңалықтары мен акциялары туралы да айтамыз.' : 'Сообщим, когда заказ примут, курьер выедет и заказ будет доставлен. А ещё — о новостях, новых магазинах и акциях района.')
    : (kz ? 'Тапсырыстар, бонустар, аудан жаңалықтары, жаңа дүкендер мен акциялар.' : 'Заказы и бонусы, а ещё новости района, новые магазины и акции. Отключить можно в настройках.');

  if (state === 'needs-install') {
    return <div className={`${className} rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-50`}>
      <div className="flex items-start gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0" /><div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm">{kz ? 'iPhone-да хабарландырулар қолданба басты экранға орнатылғанда ғана келеді.' : 'На iPhone уведомления приходят, только если установить «Сортировка 24» на экран «Домой».'}</p>
      </div><button aria-label={kz ? 'Жабу' : 'Закрыть'} onClick={dismiss} className="p-1"><X size={18} /></button></div>
      <div className="mt-3"><InstallAppBanner manual /></div>
    </div>;
  }

  async function enable() {
    if (busy) return;
    setBusy(true);
    try { setState(await enablePushNotifications({ withNews: true })); } catch { setState('unsupported'); } finally { setBusy(false); }
  }
  return <div className={`${className} flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-50`}>
    <Bell className="mt-0.5 h-5 w-5 shrink-0" />
    <div className="min-w-0 flex-1">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm">{text}</p>
      <button disabled={busy} onClick={() => void enable()} className="mt-3 min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
        {busy ? (kz ? 'Қосылуда…' : 'Включаем…') : (kz ? 'Хабарландыруларды қосу' : 'Включить уведомления')}
      </button>
    </div>
    <button aria-label={kz ? 'Жабу' : 'Закрыть'} onClick={dismiss} className="p-1"><X size={18} /></button>
  </div>;
}
