import { useCallback, useEffect, useRef, useState } from "react";
import { foodBusiness } from "@/lib/foodOperations";
import {
  formatTenge,
  type CourierMoney,
  type LogisticsTask,
} from "@/lib/logisticsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Details = {
  money: CourierMoney;
  legacy_balance: number;
  legacy_note: string;
  shifts: Array<{ id: number; opened_at: string; closed_at: string | null }>;
  deliveries: LogisticsTask[];
  handovers: Array<{
    id: number;
    amount: number;
    status: string;
    confirmed_by: string | null;
  }>;
};
export default function CourierDetails({ id }: { id: string }) {
  const [data, setData] = useState<Details | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(""),
    [comment, setComment] = useState("");
  const [correction, setCorrection] = useState(""),
    [reason, setReason] = useState("");
  const correctionKey = useRef(crypto.randomUUID());
  const key = useRef(crypto.randomUUID()),
    lock = useRef(false);
  const load = useCallback(async () => {
    try {
      setData(await foodBusiness<Details>(`/couriers/${id}/details`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  async function pay() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await foodBusiness(`/couriers/${id}/payouts`, "POST", {
        request_key: key.current,
        amount,
        comment,
      });
      key.current = crypto.randomUUID();
      setAmount("");
      setComment("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function adjust() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await foodBusiness(`/couriers/${id}/cash-adjustments`, "POST", {
        request_key: correctionKey.current,
        amount: correction,
        reason,
      });
      correctionKey.current = crypto.randomUUID();
      setCorrection("");
      setReason("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="mt-4 min-w-0 space-y-4 break-words rounded-xl border bg-muted/20 p-3 sm:p-4">
      <h5 className="font-semibold">Работа и деньги курьера</h5>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {data && (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ["Доставок за смену", data.money.deliveries],
              ["Заработано за смену", formatTenge(data.money.earned)],
              ["Наличные у курьера", formatTenge(data.money.cash_balance)],
              ["К выплате", formatTenge(data.money.payout_due)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm">
            {data.shifts[0] && !data.shifts[0].closed_at
              ? `На смене с ${new Date(data.shifts[0].opened_at).toLocaleString("ru-RU")}`
              : "Не на смене"}{" "}
            · Активных доставок:{" "}
            {
              data.deliveries.filter(
                (t) => !["delivered", "cancelled"].includes(t.status),
              ).length
            }
          </p>
          <details>
            <summary className="cursor-pointer py-3 font-medium">
              Отметить выплату курьеру
            </summary>
            <p className="mb-3 text-sm text-muted-foreground">
              Фиксация фактической выплаты вознаграждения. Это не передача
              клиентских наличных.
            </p>
            <label className="block text-sm">
              Сумма
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="mt-2 block text-sm">
              Комментарий
              <Input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <Button
              className="mt-3 h-auto min-h-10 max-w-full whitespace-normal"
              disabled={
                busy ||
                !comment.trim() ||
                !(Number(amount) > 0) ||
                Number(amount) > data.money.payout_due
              }
              onClick={() => {
                if (
                  window.confirm(
                    `Подтвердить фактическую выплату ${formatTenge(Number(amount))}?`,
                  )
                )
                  void pay();
              }}
            >
              Отметить выплаченным
            </Button>
          </details>
          <details>
            <summary className="cursor-pointer py-3 font-medium">
              История смен
            </summary>
            {data.shifts.map((s) => (
              <p className="border-t py-2 text-sm" key={s.id}>
                {new Date(s.opened_at).toLocaleString("ru-RU")} →{" "}
                {s.closed_at
                  ? new Date(s.closed_at).toLocaleString("ru-RU")
                  : "На смене"}
              </p>
            ))}
          </details>
          <details>
            <summary className="cursor-pointer py-3 font-medium">
              История доставок
            </summary>
            {data.deliveries.map((t) => (
              <p className="border-t py-2 text-sm" key={t.id}>
                №{t.source_id} · {t.status} · {t.dropoff_address}
              </p>
            ))}
          </details>
          <details>
            <summary className="cursor-pointer py-3 font-medium">
              Денежные события и передачи
            </summary>
            {data.money.events.map((e) => (
              <p className="border-t py-2 text-sm" key={e.id}>
                {e.label} · {formatTenge(e.amount)} ·{" "}
                {new Date(e.created_at).toLocaleString("ru-RU")} · {e.actor}
              </p>
            ))}
            {data.handovers.map((h) => (
              <p key={h.id}>
                Передача №{h.id} · {formatTenge(h.amount)} ·{" "}
                {h.status === "confirmed"
                  ? "Подтверждена"
                  : "Ожидает подтверждения"}
              </p>
            ))}
          </details>
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">
              Корректировка наличных владельцем
            </summary>
            <p className="my-3 text-sm text-muted-foreground">
              Только для сверки расхождений. Укажите сумму со знаком + или − и
              причину. История сохраняется; передача денег оператору оформляется
              отдельно.
            </p>
            <label className="block text-sm">
              Сумма корректировки
              <Input
                disabled={busy}
                inputMode="decimal"
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
              />
            </label>
            <label className="mt-2 block text-sm">
              Причина корректировки
              <Input
                disabled={busy}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button
              className="mt-3 h-auto min-h-10 max-w-full whitespace-normal"
              variant="outline"
              disabled={
                busy ||
                !reason.trim() ||
                !Number(correction) ||
                !Number.isFinite(Number(correction)) ||
                Boolean(data.money.pending_handover)
              }
              onClick={() => {
                if (
                  window.confirm(
                    `Изменить остаток наличных на ${formatTenge(Number(correction))}? Причина: ${reason}`,
                  )
                )
                  void adjust();
              }}
            >
              Записать корректировку
            </Button>
          </details>
          <p className="text-xs text-muted-foreground">{data.legacy_note}</p>
        </>
      )}
    </section>
  );
}
