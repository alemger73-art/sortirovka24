import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  History,
  MapPin,
  Phone,
  RefreshCw,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PrintReceiptButton from '@/components/PrintReceiptButton';
import {
  logisticsApi,
  formatTenge,
  COURIER_STATUS_FLOW,
  type CourierCabinet,
  type LogisticsTask,
} from "@/lib/logisticsApi";
import { parseOrderItems, orderLineQuantity } from "@/lib/orderRoutes";
import { requestCurrentPosition } from "@/lib/geolocation";
import { playTaxiNewOrderSound, unlockTaxiSound } from "@/lib/taxiDriverSound";

const tabs = [
  { id: "deliveries", title: "Доставки", icon: Truck },
  { id: "money", title: "Деньги", icon: Wallet },
  { id: "history", title: "История", icon: History },
  { id: "profile", title: "Профиль", icon: UserRound },
] as const;
type Tab = (typeof tabs)[number]["id"];
const DAM_FLOW = {...COURIER_STATUS_FLOW, assigned:{next:'picked_up',label:'Принял заказ'}, picked_up:{next:'on_the_way',label:'Выехал'}, on_the_way:{next:'arrived',label:'На месте'}, arrived:{next:'delivered',label:'Доставлено'}};
const reasons = {
  no_answer: "Клиент не отвечает",
  wrong_address: "Неверный адрес",
  refused: "Клиент отказался",
  payment: "Проблема с оплатой",
  transport: "Проблема с транспортом",
  other: "Другое",
};

export default function DamCourierWorkplace({
  onLogout,
}: {
  onLogout?: () => void;
}) {
  const [data, setData] = useState<CourierCabinet | null>(null);
  const [tab, setTab] = useState<Tab>("deliveries");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false),
    alive = useRef(true),
    generation = useRef(0);
  const seen = useRef(new Set<number>());
  const [pin, setPin] = useState(""),
    [phone, setPhone] = useState(""),
    [vehicle, setVehicle] = useState("bike");
  const dirty = useRef(false);
  const [gps, setGps] = useState("GPS выключен");
  const [lastGps, setLastGps] = useState<number | null>(null);
  const lastGpsRef = useRef(0);
  const [confirm, setConfirm] = useState<LogisticsTask | null>(null);
  const [issue, setIssue] = useState<LogisticsTask | null>(null);
  const [reason, setReason] = useState("no_answer"),
    [comment, setComment] = useState("");
  const [closePreview, setClosePreview] = useState(false);
  const tasks =
    data?.active_tasks ?? (data?.active_task ? [data.active_task] : []);
  const load = useCallback(async () => {
    const version = ++generation.current;
    try {
      const next = await logisticsApi.courierCabinet();
      if (!alive.current || version !== generation.current) return;
      setData(next);
      setError("");
      const activeIds = new Set((next.active_tasks ?? (next.active_task ? [next.active_task] : [])).map(t => t.id));
      setConfirm(current => current && !activeIds.has(current.id) ? null : current);
      setIssue(current => current && !activeIds.has(current.id) ? null : current);
      if (!dirty.current) {
        setPhone(next.profile.phone || "");
        setVehicle(next.profile.vehicle_type || "bike");
      }
      for (const task of next.active_tasks ??
        (next.active_task ? [next.active_task] : [])) {
        if (!seen.current.has(task.id)) {
          seen.current.add(task.id);
          playTaxiNewOrderSound();
          navigator.vibrate?.([180, 80, 180]);
          toast("Новая доставка №" + task.source_id, {
            description: `${formatTenge(task.amount_due)} · ${task.dropoff_address}`,
            action: {
              label: "Открыть",
              onClick: () => {
                setTab("deliveries");
                document
                  .getElementById(`delivery-${task.id}`)
                  ?.scrollIntoView({ behavior: "smooth" });
              },
            },
          });
        }
      }
    } catch (e) {
      if (alive.current && version === generation.current)
        setError(
          (e as Error).message || "Нет соединения. Повторите обновление.",
        );
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    const refresh = () => void load();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [load]);
  useEffect(() => {
    if (!data?.shift) {
      setGps("GPS выключен");
      return;
    }
    let stopped = false,
      pending = false;
    const tick = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const p = await requestCurrentPosition({
          enableHighAccuracy: true,
          maximumAge: 30000,
          timeout: 12000,
        });
        if (stopped) return;
        await logisticsApi.updateLocation(p.lat, p.lng);
        if (!stopped) {
          lastGpsRef.current = Date.now();
          setLastGps(lastGpsRef.current);
          setGps("GPS активен");
        }
      } catch (e) {
        if (!stopped)
          setGps(
            (e as { code?: string }).code === 'denied'
              ? "Нет разрешения GPS"
              : "Координаты давно не обновлялись",
          );
      } finally {
        pending = false;
      }
    };
    void tick();
    const onFocus = () => {
      if (lastGpsRef.current && Date.now()-lastGpsRef.current > 90000) setGps("Координаты давно не обновлялись");
      void tick();
    };
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => void tick(), 20000);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [data?.shift?.id]);
  async function run(action: () => Promise<unknown>, success: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setConfirm(null);
      setIssue(null);
    } catch (e) {
      toast.error(
        (e as Error).message ||
          "Не удалось сохранить. Проверяем результат на сервере.",
      );
    } finally {
      await load();
      lock.current = false;
      setBusy(false);
    }
  }
  function advance(task: LogisticsTask) {
    if (
      task.status === "arrived" &&
      task.payment_method === "cash" &&
      Number(task.amount_due) > 0
    ) {
      setConfirm(task);
      return;
    }
    const next = DAM_FLOW[task.status]?.next;
    if (next)
      void run(
        () => logisticsApi.updateTaskStatus(task.id, next),
        "Статус сохранён",
      );
  }
  const money = data?.money;
  return (
    <main
      className="min-h-dvh bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100"
      onPointerDown={() => void unlockTaxiSound()}
    >
      <div className="mx-auto max-w-3xl px-3 pt-4 pb-28 sm:px-6">
        <header className="mb-4 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-widest text-orange-600 dark:text-orange-400">
              DÄM ALEM
            </p>
            <h1 className="truncate text-xl font-bold">
              {data?.profile.name ||
                data?.shift?.staff_name ||
                "Кабинет курьера"}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {data?.shift
                ? `Смена с ${new Date(data.shift.opened_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
                : data ? "Смена не открыта" : "Проверяем смену…"}
            </p>
          </div>
          <Button
            variant="outline"
            className="h-12 w-12 shrink-0"
            onClick={() => void load()}
            aria-label="Обновить"
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
        </header>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-400 p-3 text-sm"
          >
            {error}
            <Button
              variant="outline"
              className="mt-2 h-12 w-full"
              onClick={() => void load()}
            >
              Повторить загрузку
            </Button>
          </div>
        )}
        {!data && !error && <p role="status">Загружаем доставки…</p>}
        {data && tab === "deliveries" && (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">
                Мои доставки — {tasks.length}
              </h2>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {gps}
              </span>
            </div>
            {!data.shift && (
              <Button
                className="mb-3 h-12 w-full"
                onClick={() => setTab("profile")}
              >
                Открыть смену
              </Button>
            )}
            {tasks.length === 0 && (
              <div className="rounded-2xl border bg-white p-6 dark:bg-slate-900">
                <h3 className="font-semibold">Назначенных доставок пока нет</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Новые доставки появятся здесь автоматически.
                </p>
              </div>
            )}
            <div className="space-y-4">
              {tasks.map((task) => (
                <article
                  id={`delivery-${task.id}`}
                  key={task.id}
                  className="rounded-2xl border bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex justify-between gap-2">
                    <h3 className="font-bold">Заказ №{task.source_id}</h3>
                    <span className="text-sm text-orange-700 dark:text-orange-300">
                      {({assigned:'Передан курьеру',picked_up:'Принят курьером',on_the_way:'В пути',arrived:'На месте'} as Record<string,string>)[task.status] || task.status}
                    </span>
                  </div>
                  <p className="mt-2 break-words text-lg font-semibold leading-snug">
                    {task.dropoff_address}
                  </p>
                  <p className="mt-2 text-sm">
                    {task.customer_name || "Клиент"}
                    {task.customer_phone && ` · ${task.customer_phone}`}
                  </p>
                  <div className="my-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                    <p className="text-sm">
                      {task.payment_method === "cash"
                        ? "Наличные"
                        : task.payment_method?.toLowerCase().includes("halyk")
                          ? "Halyk"
                          : "Kaspi"}
                    </p>
                    <p className="font-bold">
                      {Number(task.amount_due) > 0
                        ? `Получить у клиента: ${formatTenge(task.amount_due)}`
                        : "Оплата подтверждена"}
                    </p>
                    {task.payment_method === 'cash' && <p className="font-semibold">Клиент даст: {task.cash_given_amount == null ? 'уточните' : formatTenge(task.cash_given_amount)}<br/>Сдача: {task.change_amount == null ? 'уточните' : formatTenge(task.change_amount)}</p>}
                    {task.payment_method !== "cash" &&
                      Number(task.amount_due) > 0 && (
                        <p className="mt-1 text-xs">
                          Банковская оплата ещё не подтверждена оператором
                        </p>
                      )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {task.customer_phone ? (
                      <a
                        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border font-semibold"
                        href={`tel:${task.customer_phone}`}
                      >
                        <Phone className="h-4 w-4" />
                        Позвонить
                      </a>
                    ) : (
                      <span className="flex min-h-12 items-center justify-center text-sm">
                        Телефон не указан
                      </span>
                    )}
                    <a
                      className="flex min-h-12 items-center justify-center gap-2 rounded-xl border font-semibold"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(task.dropoff_lat != null && task.dropoff_lng != null ? `${task.dropoff_lat},${task.dropoff_lng}` : task.dropoff_address)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="h-4 w-4" />
                      Маршрут
                    </a>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-12"
                      disabled={busy || !data.shift}
                      onClick={() => {
                        setIssue(task);
                        setReason("no_answer");
                        setComment("");
                      }}
                    >
                      Проблема
                    </Button>
                    <Button
                      className="h-12 bg-orange-600 text-white hover:bg-orange-700"
                      disabled={busy || !data.shift}
                      onClick={() => advance(task)}
                    >
                      {DAM_FLOW[task.status]?.label || "Доставлено"}
                    </Button>
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="flex min-h-12 cursor-pointer items-center font-medium">
                      Состав заказа и детали
                    </summary>
                    {parseOrderItems(task.order_items).map((line, i) => (
                      <p key={i}>
                        {String(line.name || "Позиция")} ×{" "}
                        {orderLineQuantity(line)}
                      </p>
                    ))}
                    {task.comment && (
                      <p className="mt-2 whitespace-pre-wrap">{task.comment}</p>
                    )}
                    <p className="mt-2">
                      Сумма заказа: {formatTenge(task.total_amount)}
                    </p>
                    {task.courier_payout != null && (
                      <p>
                        Вознаграждение курьера:{" "}
                        {formatTenge(task.courier_payout)}
                      </p>
                    )}
                    <div className="mt-3"><PrintReceiptButton loadOrder={() => logisticsApi.courierReceipt(task.id)} /></div>
                  </details>
                </article>
              ))}
            </div>
          </section>
        )}
        {data && tab === "money" && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Деньги</h2>
            <p className="text-sm">
              {data.shift ? "За текущую смену" : "Последняя смена"}
            </p>
            {money ? (
              <>
                <dl className="space-y-3 rounded-2xl border bg-white p-4 dark:bg-slate-900">
                  {[
                    ["Наличные получено", money.collected],
                    ["Передано", money.handed_over],
                    ["У вас", money.cash_balance],
                    ["Заработано за смену", money.earned],
                    ["К выплате за все смены", money.payout_due],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="flex justify-between gap-2"
                    >
                      <dt>{label}</dt>
                      <dd className="font-semibold">
                        {formatTenge(Number(value))}
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button
                  className="h-12 w-full"
                  disabled={
                    busy ||
                    Number(money.cash_balance) <= 0 ||
                    Boolean(money.pending_handover)
                  }
                  onClick={() =>
                    void run(
                      () => logisticsApi.requestHandover(),
                      "Передача ожидает подтверждения оператора",
                    )
                  }
                >
                  {money.pending_handover
                    ? "Ожидаем подтверждение оператора"
                    : "Передать наличные"}
                </Button>
                <p className="text-sm text-slate-500">
                  Деньги клиентов и ваше вознаграждение учитываются отдельно.
                </p>
                <details>
                  <summary className="min-h-12 py-3 font-semibold">
                    История денег
                  </summary>
                  {money.events.map((e) => (
                    <p key={e.id} className="border-b py-3 text-sm">
                      {e.label} · {formatTenge(e.amount)}
                      <br />
                      {new Date(e.created_at).toLocaleString("ru-RU")} ·{" "}
                      {e.actor}
                    </p>
                  ))}
                </details>
              </>
            ) : (
              <p>Начислено за смену: {formatTenge(data.earnings)}</p>
            )}
          </section>
        )}
        {data && tab === "history" && (
          <section>
            <h2 className="mb-4 text-xl font-bold">История доставок</h2>
            {!data.task_history.some(t => ['delivered', 'cancelled'].includes(t.status)) && <p className="rounded-xl border bg-card p-4 text-muted-foreground">Доставок пока нет. Здесь появятся завершённые и отменённые доставки.</p>}
            {data.task_history
              .filter((t) => ["delivered", "cancelled"].includes(t.status))
              .map((t) => (
                <article key={t.id} className="mb-3 rounded-xl border p-4">
                  <p className="font-semibold">
                    №{t.source_id} ·{" "}
                    {t.status === "delivered" ? "Доставлено" : "Отменено"}
                  </p>
                  <p className="mt-1 text-sm">{t.dropoff_address}</p>
                  <p className="mt-1 text-sm">
                    Вознаграждение:{" "}
                    {formatTenge(
                      t.status === "delivered" ? t.courier_payout : 0,
                    )}
                  </p>
                </article>
              ))}
          </section>
        )}
        {data && tab === "profile" && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold">Профиль и смена</h2>
            <p>{gps}{lastGps && ` · Обновлено ${new Date(lastGps).toLocaleTimeString('ru-RU')}`}</p>
            {gps === 'Нет разрешения GPS' && <p className="text-sm text-muted-foreground">Разрешите доступ к геолокации для этого сайта в настройках браузера или телефона, затем обновите страницу.</p>}
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={() =>
                void run(
                  () => logisticsApi.enableCourierPush(),
                  "Уведомления включены",
                )
              }
            >
              <Bell className="mr-2 h-4 w-4" />
              Включить уведомления
            </Button>
            <label className="block">
              Телефон
              <Input
                className="mt-1 h-12"
                value={phone}
                onChange={(e) => {
                  dirty.current = true;
                  setPhone(e.target.value);
                }}
              />
            </label>
            <label className="block">
              Транспорт
              <select
                aria-label="Транспорт"
                className="mt-1 h-12 w-full rounded-lg border bg-background px-3"
                value={vehicle}
                onChange={(e) => {
                  dirty.current = true;
                  setVehicle(e.target.value);
                }}
              >
                <option value="bike">Велосипед</option>
                <option value="car">Авто</option>
                <option value="foot">Пешком</option>
              </select>
            </label>
            <Button
              variant="outline"
              className="h-12 w-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await logisticsApi.updateProfile({
                    phone,
                    vehicle_type: vehicle,
                  });
                  dirty.current = false;
                }, "Профиль сохранён")
              }
            >
              Сохранить профиль
            </Button>
            <label className="block">
              PIN для смены
              <Input
                className="mt-1 h-12"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </label>
            <Button
              className="h-12 w-full"
              disabled={busy || pin.length !== 4}
              onClick={() =>
                data.shift
                  ? setClosePreview(true)
                  : void run(async () => {
                      await logisticsApi.openShift(pin);
                      await logisticsApi.setOnline(true);
                      setPin("");
                      setTab("deliveries");
                    }, "Смена открыта")
              }
            >
              {data.shift ? "Закрыть смену" : "Открыть смену"}
            </Button>
            <Button
              variant="outline"
              className="h-12 w-full"
              onClick={onLogout}
            >
              Выйти из кабинета
            </Button>
            <p className="text-sm text-slate-500">Выход не закрывает смену.</p>
          </section>
        )}
      </div>
      <nav
        aria-label="Кабинет курьера"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-950"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-xs ${tab === t.id ? "font-bold text-orange-600 dark:text-orange-400" : "text-slate-500"}`}
              onClick={() => {
                setTab(t.id);
                window.scrollTo(0, 0);
              }}
            >
              <t.icon className="h-5 w-5" />
              {t.title}
              {t.id === 'deliveries' && tasks.length > 0 ? ` (${tasks.length})` : ''}
            </button>
          ))}
        </div>
      </nav>
      {(confirm || issue || closePreview) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={
              issue
                ? "Проблема доставки"
                : confirm
                  ? "Завершить доставку"
                  : "Закрытие смены"
            }
            className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-auto rounded-2xl bg-white p-5 dark:bg-slate-900"
          >
            {confirm && (
              <>
                <h2 className="text-lg font-bold">
                  Заказ №{confirm.source_id}
                </h2>
                <p>Получено от клиента: {formatTenge(confirm.amount_due)}</p>
                <Button
                  className="h-auto min-h-12 w-full whitespace-normal"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        logisticsApi.updateTaskStatus(
                          confirm.id,
                          "delivered",
                          true,
                        ),
                      "Доставка и получение наличных сохранены",
                    )
                  }
                >
                  Подтвердить получение и доставку
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        logisticsApi.updateTaskStatus(
                          confirm.id,
                          "delivered",
                          false,
                        ),
                      "Доставлено. Оплата остаётся неподтверждённой",
                    )
                  }
                >
                  Не получил оплату
                </Button>
              </>
            )}
            {issue && (
              <>
                <h2 className="text-lg font-bold">
                  Проблема доставки №{issue.source_id}
                </h2>
                <select
                  aria-label="Причина проблемы"
                  className="h-12 w-full rounded-lg border bg-background px-2"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {Object.entries(reasons).map(([id, label]) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <label className="block">
                  Комментарий
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-lg border bg-background p-3"
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <Button
                  className="h-12 w-full"
                  disabled={busy || (reason === "other" && !comment.trim())}
                  onClick={() =>
                    void run(
                      () => logisticsApi.reportIssue(issue.id, reason, comment),
                      "Проблема передана оператору",
                    )
                  }
                >
                  Сообщить оператору
                </Button>
              </>
            )}
            {closePreview && (
              <>
                <h2 className="text-lg font-bold">
                  {tasks.length ? "Смену нельзя закрыть" : "Итоги смены"}
                </h2>
                {tasks.length ? (
                  <>
                    <p>Сначала завершите или передайте доставки оператору.</p>
                    {tasks.map((t) => (
                      <p key={t.id}>№{t.source_id} — в пути</p>
                    ))}
                    <Button
                      className="h-12 w-full"
                      onClick={() => {
                        setClosePreview(false);
                        setTab("deliveries");
                      }}
                    >
                      К доставкам
                    </Button>
                  </>
                ) : (
                  <>
                    <p>Доставок: {money?.deliveries ?? 0}</p>
                    <p>
                      Заработано: {formatTenge(money?.earned ?? data?.earnings)}
                    </p>
                    <p>
                      Получено: {formatTenge(money?.collected)} · Передано:{" "}
                      {formatTenge(money?.handed_over)}
                    </p>
                    <p>Наличные у вас: {formatTenge(money?.cash_balance)}</p>
                    {Number(money?.cash_balance) > 0 ? (
                      <Button
                        className="h-12 w-full"
                        onClick={() => {
                          setTab("money");
                          setClosePreview(false);
                        }}
                      >
                        Передать наличные
                      </Button>
                    ) : (
                      <Button
                        className="h-12 w-full"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await logisticsApi.closeShift(pin);
                            setClosePreview(false);
                            setPin("");
                          }, "Смена закрыта")
                        }
                      >
                        Подтвердить закрытие смены
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
            <Button
              variant="outline"
              className="h-12 w-full"
              disabled={busy}
              onClick={() => {
                setConfirm(null);
                setIssue(null);
                setClosePreview(false);
              }}
            >
              Назад
            </Button>
          </section>
        </div>
      )}
    </main>
  );
}
