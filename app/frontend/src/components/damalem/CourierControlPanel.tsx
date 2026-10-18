import { useCallback, useEffect, useRef, useState } from "react";
import { foodOperations } from "@/lib/foodOperations";
import { formatTenge } from "@/lib/logisticsApi";
import { Button } from "@/components/ui/button";
import {useLanguage} from '@/contexts/LanguageContext';
import {useStoreTranslations} from '@/i18n/storeTranslations';
const labels: Record<string, string> = {
  no_answer: "Клиент не отвечает",
  wrong_address: "Неверный адрес",
  refused: "Клиент отказался",
  payment: "Проблема с оплатой",
  transport: "Проблема с транспортом",
  other: "Другое",
};
type Work = {
  handovers: Array<{ id: number; name: string; amount: number }>;
  issues: Array<{
    id: number;
    order_id: number;
    name: string;
    reason: string;
    comment: string;
  }>;
};
export default function CourierControlPanel({
  openOrder,
}: {
  openOrder: (id: number) => void;
}) {
  const {lang}=useLanguage();const st=useStoreTranslations();const say=(ru:string,kz:string)=>lang==='kz'?kz:ru;
  const [replyTo,setReplyTo]=useState<number|null>(null),[reply,setReply]=useState('');
  const [data, setData] = useState<Work>({ handovers: [], issues: [] }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const load = useCallback(async () => {
    try {
      const next = await foodOperations<Work>("/courier-work");
      setData({ handovers: next.handovers || [], issues: next.issues || [] });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  async function act(path: string, body?: unknown) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await foodOperations(path, "POST", body);
      await load();
      setReplyTo(null);setReply('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!data.handovers.length && !data.issues.length && !error) return null;
  return (
    <section
      aria-label="Требует внимания по доставкам"
      className="space-y-3 rounded-xl border border-orange-300 bg-orange-50 p-4 dark:bg-orange-950/20"
    >
      <h3 className="font-bold">{say('Курьеры: требует внимания','Курьерлер: назар аудару қажет')}</h3>
      {error && <p role="alert">{error}</p>}
      {data.handovers.map((h) => (
        <div
          key={h.id}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p>
            {say('Курьер сдаёт наличные','Курьер қолма-қол ақша тапсырады')}: {h.name} ·{" "}
            <strong>{formatTenge(h.amount)}</strong>
          </p>
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
            onClick={() => { if (window.confirm(say(`Получили от ${h.name} ${formatTenge(h.amount)} наличными?`, `${h.name} курьерінен ${formatTenge(h.amount)} қолма-қол алдыңыз ба?`))) void act(`/cash-handovers/${h.id}/confirm`); }}
          >
            {say('Принять в кассу','Кассаға қабылдау')}
          </button>

        </div>
      ))}
      {data.issues.map((i) => (
        <div className="rounded-lg border bg-background p-3" key={i.id}>
          <p className="font-semibold">
            {say('Проблема доставки','Жеткізу мәселесі')} №{i.order_id} · {i.name}
          </p>
          <p className="text-sm">
            {st(labels[i.reason] || i.reason)} · {i.comment}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openOrder(i.order_id)}>
              {say('Открыть заказ','Тапсырысты ашу')}
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {setReplyTo(i.id);setReply('');}}
            >
              {say('Ответить курьеру','Курьерге жауап беру')}
            </Button>
          </div>
          {replyTo===i.id&&<div className="mt-3 space-y-3"><label className="block text-sm font-semibold">{say('Решение для курьера','Курьерге арналған шешім')}<textarea className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-base font-normal" value={reply} onChange={e=>setReply(e.target.value)} maxLength={1000}/></label><p className="text-xs text-muted-foreground">{say('Ответ появится в карточке доставки курьера.','Жауап курьердің жеткізу карточкасында пайда болады.')}</p><div className="flex flex-wrap gap-2"><Button disabled={busy||!reply.trim()} onClick={()=>void act(`/delivery-issues/${i.id}/resolve`,{resolution:reply.trim()})}>{say('Отправить ответ и решить проблему','Жауап жіберу және мәселені шешу')}</Button><Button variant="outline" disabled={busy} onClick={()=>setReplyTo(null)}>{say('Назад','Артқа')}</Button></div></div>}
        </div>
      ))}
    </section>
  );
}
