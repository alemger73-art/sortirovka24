import { useCallback, useEffect, useRef, useState } from "react";
import { foodOperations } from "@/lib/foodOperations";
import { formatTenge } from "@/lib/logisticsApi";
import { Button } from "@/components/ui/button";
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
      <h3 className="font-bold">Курьеры: требует внимания</h3>
      {error && <p role="alert">{error}</p>}
      {data.handovers.map((h) => (
        <div
          key={h.id}
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <p>
            Принять деньги от {h.name} ·{" "}
            <strong>{formatTenge(h.amount)}</strong>
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  `Вы получили ${formatTenge(h.amount)} от ${h.name}?`,
                )
              )
                void act(`/cash-handovers/${h.id}/confirm`);
            }}
          >
            Подтвердить получение
          </Button>
        </div>
      ))}
      {data.issues.map((i) => (
        <div className="rounded-lg border bg-background p-3" key={i.id}>
          <p className="font-semibold">
            Проблема доставки №{i.order_id} · {i.name}
          </p>
          <p className="text-sm">
            {labels[i.reason] || i.reason} · {i.comment}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openOrder(i.order_id)}>
              Открыть заказ
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => {
                const resolution = window.prompt("Как решена проблема?");
                if (resolution?.trim())
                  void act(`/delivery-issues/${i.id}/resolve`, { resolution });
              }}
            >
              Отметить решённой
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
