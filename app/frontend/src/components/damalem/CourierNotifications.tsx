import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { logisticsApi } from '@/lib/logisticsApi';
import { courierWebPushState, type CourierPushState } from '@/lib/courierWebPush';
import { isPwaStandalone, pwaPlatform } from '@/lib/pwa';

const copy = {
  ru: {
    title: 'Уведомления о доставках', checking: 'Проверяем подключение…',
    enabled: 'Разрешение получено на этом устройстве', disabled: 'Уведомления ещё не включены',
    denied: 'Уведомления заблокированы', 'needs-install': 'Откройте установленное приложение', unsupported: 'Push недоступен в этом браузере',
    enable: 'Включить уведомления', reconnect: 'Проверить подключение', success: 'Уведомления подключены к вашему кабинету курьера.',
    hint: 'Нажмите кнопку и разрешите уведомления в системном окне. Запрос от браузера — нормальная часть установки PWA; выходить из приложения не нужно.',
    ios: 'На iPhone: Safari → «Поделиться» → «На экран Домой». Откройте DAM ALEM Курьер с этой иконки и включите уведомления здесь (iOS 16.4 или новее).',
    android: 'На Android откройте этот кабинет в Chrome и установите приложение через меню. Запускайте его с иконки DAM ALEM Курьер.',
    blocked: 'Откройте настройки телефона → Уведомления → DAM ALEM Курьер или браузер, через который установили приложение. Разрешите уведомления. Если сайт заблокирован, также разрешите уведомления для sortirovka24.kz в настройках этого браузера. Затем вернитесь сюда.',
    server: 'Сервис уведомлений временно недоступен. Попробуйте позже.', dismissed: 'Разрешение не получено. Нажмите кнопку ещё раз и выберите «Разрешить».',
    ready: 'Приложение ещё загружается. Обновите его и повторите.', failed: 'Не удалось подключить уведомления. Проверьте интернет и повторите.',
  },
  kz: {
    title: 'Жеткізу хабарландырулары', checking: 'Қосылым тексерілуде…',
    enabled: 'Бұл құрылғыда рұқсат берілген', disabled: 'Хабарландырулар әлі қосылмаған',
    denied: 'Хабарландырулар бұғатталған', 'needs-install': 'Орнатылған қолданбаны ашыңыз', unsupported: 'Бұл браузерде Push қолжетімсіз',
    enable: 'Хабарландыруларды қосу', reconnect: 'Қосылымды тексеру', success: 'Хабарландырулар курьер кабинетіңізге қосылды.',
    hint: 'Түймені басып, жүйелік терезеде хабарландыруларға рұқсат беріңіз. Браузер сұрауы — PWA орнатудың қалыпты бөлігі; қолданбадан шығудың қажеті жоқ.',
    ios: 'iPhone: Safari → «Бөлісу» → «Басты экранға қосу». DAM ALEM Курьер белгішесін ашып, хабарландыруларды осы жерден қосыңыз (iOS 16.4 немесе жаңарақ).',
    android: 'Android құрылғысында кабинетті Chrome арқылы ашып, мәзірден қолданбаны орнатыңыз. DAM ALEM Курьер белгішесі арқылы іске қосыңыз.',
    blocked: 'Телефон баптаулары → Хабарландырулар → DAM ALEM Курьер немесе қолданбаны орнатқан браузер. Хабарландыруларға рұқсат беріңіз. Сайт бұғатталған болса, сол браузерде sortirovka24.kz хабарландыруларына да рұқсат беріңіз. Содан кейін осы жерге оралыңыз.',
    server: 'Хабарландыру қызметі уақытша қолжетімсіз. Кейінірек қайталаңыз.', dismissed: 'Рұқсат берілмеді. Түймені қайта басып, «Рұқсат беру» таңдаңыз.',
    ready: 'Қолданба әлі жүктелуде. Жаңартып, қайталаңыз.', failed: 'Хабарландыруларды қосу мүмкін болмады. Интернетті тексеріп, қайталаңыз.',
  },
};

export default function CourierNotifications() {
  const { lang } = useLanguage();
  const text = copy[lang === 'kz' ? 'kz' : 'ru'];
  const [state, setState] = useState<CourierPushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<keyof typeof copy.ru | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const next = Capacitor.isNativePlatform()
          ? await (await import('@/lib/pushNotifications')).getPushPermissionState()
          : await courierWebPushState();
        if (active) setState(next);
      } catch { if (active) setState('disabled'); }
    };
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    window.addEventListener('focus', visible); document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible); };
  }, []);
  async function enable() {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      await logisticsApi.enableCourierPush();
      setState('enabled'); setMessage('success');
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      if (reason === 'courier-push:denied') { setState('denied'); setMessage(null); }
      else if (reason === 'courier-push:needs-install') { setState('needs-install'); setMessage(null); }
      else if (reason === 'courier-push:unsupported') { setState('unsupported'); setMessage(null); }
      else setMessage(reason === 'courier-push:server' ? 'server' : reason === 'courier-push:dismissed' ? 'dismissed' : reason === 'courier-push:not-ready' ? 'ready' : 'failed');
    } finally { setBusy(false); }
  }
  const platform = pwaPlatform();
  return <section className="space-y-3 rounded-xl border bg-card p-4" aria-label={text.title}>
    <h3 className="flex items-center gap-2 font-semibold"><Bell className="h-5 w-5" />{text.title}</h3>
    <p role="status" className="text-sm">{state ? text[state] : text.checking}</p>
    {state === 'denied' ? <p className="text-sm text-muted-foreground">{text.blocked}</p>
      : state === 'needs-install' ? <p className="text-sm text-muted-foreground">{text.ios}</p>
      : <p className="text-sm text-muted-foreground">{state === 'unsupported' ? platform.ios ? text.ios : text.android : text.hint}</p>}
    {!Capacitor.isNativePlatform() && !isPwaStandalone() && platform.platform === 'android' && state !== 'unsupported' && <p className="text-sm text-muted-foreground">{text.android}</p>}
    {(state === 'enabled' || state === 'disabled') && <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={() => void enable()}>{busy ? text.checking : state === 'enabled' ? text.reconnect : text.enable}</Button>}
    {message && <p role="status" className="text-sm">{text[message]}</p>}
  </section>;
}
