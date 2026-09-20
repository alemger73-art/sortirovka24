import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, ShoppingBag, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { foodOperations, type OperatorOrder } from '@/lib/foodOperations';
import { playDamOrderAlertSound, primeDamOrderAlertSound } from '@/lib/damOrderAlertSound';

const POLL_MS = 5_000;
const REMINDER_MS = 30_000;
const SOUND_KEY = 'dam_alem_order_alert_sound';
const TOAST_ID = 'dam-alem-new-orders';

type NewOrdersResponse = {items: OperatorOrder[]; total: number};

export default function DamAlemNewOrderAlert({onOpen}: {onOpen: () => void}) {
  const {t} = useLanguage();
  const [orders, setOrders] = useState<OperatorOrder[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem(SOUND_KEY) !== 'off');
  const previousIds = useRef<Set<number> | null>(null);
  const lastReminder = useRef(0);

  const notify = useCallback(async (fresh: OperatorOrder[], isReminder: boolean) => {
    const count = fresh.length;
    if (!count) return;
    if (soundEnabled) {
      try { await playDamOrderAlertSound(); } catch { /* Browser will allow sound after operator interaction. */ }
    }
    toast.warning(t(count === 1 ? 'dam.alert.one' : 'dam.alert.many').replace('{count}', String(count)), {
      id: TOAST_ID,
      duration: Infinity,
      action: {label: t('dam.alert.open'), onClick: onOpen},
    });
    if (!isReminder && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(t('dam.alert.title'), {
        body: t(count === 1 ? 'dam.alert.one' : 'dam.alert.many').replace('{count}', String(count)),
        tag: TOAST_ID,
        requireInteraction: true,
      });
    }
  }, [onOpen, soundEnabled, t]);

  const poll = useCallback(async () => {
    try {
      const data = await foodOperations<NewOrdersResponse>('/orders?status=new&source=&q=&skip=0');
      const fresh = data.items || [];
      setOrders(fresh);
      const ids = new Set(fresh.map(order => order.id));
      const hasAddedOrder = previousIds.current === null
        ? fresh.length > 0
        : fresh.some(order => !previousIds.current?.has(order.id));
      const now = Date.now();
      const reminderDue = fresh.length > 0 && now - lastReminder.current >= REMINDER_MS;
      if (hasAddedOrder || reminderDue) {
        lastReminder.current = now;
        await notify(fresh, !hasAddedOrder);
      }
      previousIds.current = ids;
      if (!fresh.length) toast.dismiss(TOAST_ID);
    } catch {
      // The main panel reports connectivity errors; alerts resume on the next poll.
    }
  }, [notify]);

  useEffect(() => {
    void poll();
    const timer = window.setInterval(() => { void poll(); }, POLL_MS);
    return () => { window.clearInterval(timer); toast.dismiss(TOAST_ID); };
  }, [poll]);

  useEffect(() => {
    const originalTitle = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = orders.length ? `(${orders.length}) ${originalTitle}` : originalTitle;
    return () => { document.title = originalTitle; };
  }, [orders.length]);

  useEffect(() => {
    if (!soundEnabled) return;
    const prime = () => { void primeDamOrderAlertSound(); };
    window.addEventListener('pointerdown', prime, {once: true});
    window.addEventListener('keydown', prime, {once: true});
    return () => {
      window.removeEventListener('pointerdown', prime);
      window.removeEventListener('keydown', prime);
    };
  }, [soundEnabled]);

  async function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    if (next) {
      try {
        await primeDamOrderAlertSound();
        await playDamOrderAlertSound();
      } catch { /* The visual reminder remains available. */ }
    }
  }

  if (!orders.length) return null;
  return (
    <section role="alert" aria-live="assertive" className="sticky top-2 z-40 overflow-hidden rounded-2xl border-2 border-red-500 bg-red-600 p-4 text-white shadow-xl shadow-red-950/20 motion-safe:animate-pulse">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3 text-left">
          <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
            <BellRing className="h-6 w-6" />
            <span className="absolute -right-1 -top-1 min-w-6 rounded-full bg-white px-1.5 py-0.5 text-center text-xs font-black text-red-600">{orders.length}</span>
          </span>
          <span>
            <strong className="block text-lg">{t('dam.alert.title')}</strong>
            <span className="text-sm text-white/90">{t(orders.length === 1 ? 'dam.alert.one' : 'dam.alert.many').replace('{count}', String(orders.length))}</span>
          </span>
        </button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onOpen}><ShoppingBag className="mr-2 h-4 w-4" />{t('dam.alert.open')}</Button>
          <Button type="button" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => void toggleSound()}>
            {soundEnabled ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
            {t(soundEnabled ? 'dam.alert.soundOn' : 'dam.alert.soundOff')}
          </Button>
        </div>
      </div>
    </section>
  );
}
