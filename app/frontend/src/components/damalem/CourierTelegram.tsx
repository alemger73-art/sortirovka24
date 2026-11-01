/** Courier cabinet: link Telegram so assigned deliveries arrive there with «Забрал / Еду / Доставлено» buttons. */
import { useCallback, useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { logisticsApi } from '@/lib/logisticsApi';

type State = Awaited<ReturnType<typeof logisticsApi.courierTelegram>>;

export default function CourierTelegram() {
  const { lang } = useLanguage();
  const say = (ru: string, kz: string) => (lang === 'kz' ? kz : ru);
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    logisticsApi.courierTelegram().then((s) => { setState(s); setError(false); }).catch(() => setError(true));
  }, []);
  useEffect(() => {
    load();
    // Coming back from Telegram after pressing «Start» should show «подключён» without a manual refresh.
    const back = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, [load]);
  async function unlink() {
    setBusy(true);
    try { await logisticsApi.unlinkCourierTelegram(); load(); } catch { setError(true); } finally { setBusy(false); }
  }
  if (state && !state.available) return null;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Telegram" data-testid="courier-telegram">
      <h3 className="flex items-center gap-2 font-semibold"><Send className="h-5 w-5" />{say('Доставки в Телеграме', 'Жеткізулер Телеграмда')}</h3>
      {error && <p role="alert" className="text-sm text-destructive">{say('Не удалось проверить Телеграм. Проверьте интернет.', 'Телеграмды тексеру мүмкін болмады. Интернетті тексеріңіз.')}</p>}
      {!state && !error && <p role="status" className="text-sm text-muted-foreground">{say('Проверяем…', 'Тексерілуде…')}</p>}
      {state?.linked && <>
        <p role="status" className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{say('Подключён. Новые доставки приходят в Телеграм.', 'Қосылған. Жаңа жеткізулер Телеграмға келеді.')}</p>
        <p className="text-sm text-muted-foreground">{say(`Бот @${state.bot}: адрес, что везти, телефон клиента и сумма. Кнопки «Забрал», «Еду к клиенту», «Доставлено» работают как здесь.`, `@${state.bot} боты: мекенжай, не апару керек, клиент телефоны және сома. «Алдым», «Клиентке барамын», «Жеткізілді» түймелері осындағыдай жұмыс істейді.`)}</p>
        <Button variant="outline" className="h-12 w-full" disabled={busy} onClick={() => void unlink()}>{say('Отключить Телеграм', 'Телеграмды ажырату')}</Button>
      </>}
      {state && !state.linked && state.url && <>
        <p className="text-sm text-muted-foreground">{say('Новые доставки будут приходить в Телеграм с кнопками «Забрал», «Еду к клиенту», «Доставлено». Нажмите кнопку, в Телеграме нажмите «Старт» — и готово.', 'Жаңа жеткізулер Телеграмға «Алдым», «Клиентке барамын», «Жеткізілді» түймелерімен келеді. Түймені басып, Телеграмда «Бастау» басыңыз.')}</p>
        <a className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#229ED9] font-semibold text-white" href={state.url} target="_blank" rel="noopener noreferrer" data-testid="courier-telegram-link">
          <Send className="h-5 w-5" />{say('Подключить Телеграм', 'Телеграмды қосу')}</a>
      </>}
    </section>
  );
}
