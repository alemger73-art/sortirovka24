import { useEffect, useRef, useState } from 'react';
import { BellRing, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { foodOperations, type OperatorOrder } from '@/lib/foodOperations';
import { playDamOrderAlertSound, primeDamOrderAlertSound } from '@/lib/damOrderAlertSound';
import PreorderNotice from './PreorderNotice';

const SOUND_KEY = 'dam_alem_order_alert_sound';
const TOAST_ID = 'dam-alem-new-orders';

export default function DamAlemNewOrderAlert({onOpen}: {onOpen: () => void}) {
  const {t} = useLanguage();
  const [total, setTotal] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');
  const options = useRef({soundEnabled, t});
  options.current = {soundEnabled, t};

  useEffect(() => {
    let alive = true, pending = false, initialized = false, highestId = 0;
    const poll = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await foodOperations<{items: OperatorOrder[]; total: number}>('/orders?status=new&source=&q=&skip=0&limit=100');
        if (!alive) return;
        const added = data.items.filter(order => order.id > highestId);
        setTotal(data.total);
        highestId = Math.max(highestId, ...data.items.map(order => order.id));
        // Existing backlog belongs in the toolbar; only arrivals create an event.
        if (initialized && added.length) {
          const {t: translate, soundEnabled: sound} = options.current;
          const message = added.length === 1
            ? translate('dam.alert.arrival').replace('{id}', String(added[0].id))
            : translate('dam.alert.arrivals').replace('{count}', String(added.length));
          toast.info(message, {id: TOAST_ID, duration: 4500});
          if (sound) void playDamOrderAlertSound().catch(() => { /* Requires a browser gesture. */ });
          if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            try { new Notification(translate('dam.alert.title'), {body: message, tag: TOAST_ID}); } catch { /* Web push remains independent. */ }
          }
        }
        initialized = true;
        if (!data.total) toast.dismiss(TOAST_ID);
      } catch { /* Main queue reports connectivity errors; polling resumes automatically. */ }
      finally { pending = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => { alive = false; clearInterval(timer); toast.dismiss(TOAST_ID); };
  }, []);

  useEffect(() => {
    const title = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = total ? `(${total}) ${title}` : title;
    return () => { document.title = title; };
  }, [total]);

  useEffect(() => {
    if (!soundEnabled) return;
    const prime = () => { void primeDamOrderAlertSound().catch(() => {}); };
    window.addEventListener('pointerdown', prime, {once: true});
    window.addEventListener('keydown', prime, {once: true});
    return () => { window.removeEventListener('pointerdown', prime); window.removeEventListener('keydown', prime); };
  }, [soundEnabled]);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    if (next) void primeDamOrderAlertSound().catch(() => {});
  }

  return <>
    {total > 0 && <section data-testid="new-orders-toolbar" aria-label={t('dam.alert.queue')} className="sticky top-2 z-40 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-amber-950 shadow-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
      <p role="status" aria-live="polite" className="flex min-w-0 flex-1 basis-36 items-center gap-2 text-sm font-medium">
        <BellRing aria-hidden="true" className="h-4 w-4 shrink-0"/>
        <span>{t('dam.alert.waiting').replace('{count}', String(total))}</span>
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Button variant="ghost" className="h-11 px-2 text-inherit" onClick={onOpen}>{t('dam.alert.queue')}</Button>
        <Button variant="ghost" size="icon" className="h-11 w-11 text-inherit" aria-label={t(soundEnabled ? 'dam.alert.mute' : 'dam.alert.soundOff')} aria-pressed={soundEnabled} title={t(soundEnabled ? 'dam.alert.mute' : 'dam.alert.soundOff')} onClick={toggleSound}>
          {soundEnabled ? <Volume2 className="h-4 w-4"/> : <VolumeX className="h-4 w-4"/>}
        </Button>
      </div>
    </section>}
    <PreorderNotice/>
  </>;
}
