import { Link, useNavigate } from "react-router-dom";
import {
  ChevronRight, MapPin, RotateCcw, Store, Truck, UtensilsCrossed, Wine,
} from "lucide-react";
import FoodOrderStatusBar from "@/components/damalem/FoodOrderStatusBar";
import { parseOrderItems, type CabinetOrderRow } from "@/lib/orderRoutes";
import { DAM_ALEM_BRAND } from "@/lib/damAlem";

const STORE_ORDER_LABELS: Record<string, string> = {
  volna: "store.volna",
  gastronom: "store.gastronom",
  pharmacy: "store.pharmacy",
  prorab: "store.prorab",
  park: "store.park",
};

const STORE_ACCENT: Record<string, string> = {
  food: "border-l-orange-500 bg-orange-50/50 dark:bg-orange-500/5",
  volna: "border-l-violet-500 bg-violet-50/50 dark:bg-violet-500/5",
  gastronom: "border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/5",
  pharmacy: "border-l-sky-500 bg-sky-50/50 dark:bg-sky-500/5",
  prorab: "border-l-amber-500 bg-amber-50/50 dark:bg-amber-500/5",
  park: "border-l-lime-500 bg-lime-50/50 dark:bg-lime-500/5",
};

const FOOD_STATUS: Record<string, { key: string; badge: string }> = {
  new: { key: "cabinet.orderStatus.new", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200" },
  in_progress: { key: "cabinet.orderStatus.cooking", badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200" },
  done: { key: "cabinet.orderStatus.delivered", badge: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  cancelled: { key: "cabinet.orderStatus.cancelled", badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200" },
};

const STORE_STATUS: Record<string, { key: string; badge: string }> = {
  new: { key: "cabinet.orderStatus.new", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200" },
  in_progress: { key: "cabinet.orderStatus.processing", badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200" },
  processing: { key: "cabinet.orderStatus.processing", badge: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200" },
  done: { key: "cabinet.orderStatus.done", badge: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  completed: { key: "cabinet.orderStatus.done", badge: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  delivered: { key: "cabinet.orderStatus.delivered", badge: "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200" },
  cancelled: { key: "cabinet.orderStatus.cancelled", badge: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-200" },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "payment.cash",
  kaspi_qr: "payment.kaspiQr",
  halyk_qr: "payment.halykQr",
};

const REPEAT_ORDER_KEY = "damalem_repeat_order";

function formatOrderDate(raw?: string | null) {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(raw);
  }
}

function repeatFoodOrder(
  o: Pick<CabinetOrderRow, "order_items" | "delivery_address" | "delivery_method">,
  navigate: ReturnType<typeof useNavigate>,
) {
  try {
    sessionStorage.setItem(
      REPEAT_ORDER_KEY,
      JSON.stringify({
        order_items: o.order_items,
        delivery_address: o.delivery_address,
        delivery_method: o.delivery_method,
      }),
    );
    navigate("/food");
  } catch {
    /* ignore */
  }
}

function orderTitle(o: CabinetOrderRow, t: (key: string) => string) {
  const isFood = o.type === "food";
  const isStore = o.type in STORE_ORDER_LABELS;
  if (isFood) {
    return (o.restaurant_name || DAM_ALEM_BRAND) + (o.order_number ? ` · №${o.order_number}` : "");
  }
  if (isStore) {
    return (o.store_label || t(STORE_ORDER_LABELS[o.type])) + (o.order_number ? ` · №${o.order_number}` : "");
  }
  return o.type || "order";
}

function orderSubtitle(o: CabinetOrderRow) {
  const items = parseOrderItems(o.order_items);
  if (items.length > 0) {
    const qty = items.reduce((s, it) => s + Number(it.quantity || 1), 0);
    return `${qty} ${qty === 1 ? "позиция" : qty < 5 ? "позиции" : "позиций"}`;
  }
  return o.details || "";
}

interface Props {
  order: CabinetOrderRow;
  detailPath: string | null;
  t: (key: string) => string;
}

export default function CabinetOrderCard({ order: o, detailPath, t }: Props) {
  const navigate = useNavigate();
  const isFood = o.type === "food";
  const isStore = o.type in STORE_ORDER_LABELS;
  const accent = STORE_ACCENT[o.type] || STORE_ACCENT.food;
  const st = isFood
    ? FOOD_STATUS[o.status || ""] || FOOD_STATUS.new
    : isStore
      ? STORE_STATUS[o.status || ""] || STORE_STATUS.new
      : null;
  const payLabel = o.payment_method && PAYMENT_LABELS[o.payment_method]
    ? t(PAYMENT_LABELS[o.payment_method])
    : o.payment_method;

  const Icon = isFood ? UtensilsCrossed : o.type === "volna" ? Wine : Store;
  const iconTone = isFood
    ? "text-orange-600 bg-orange-100 dark:text-orange-300 dark:bg-orange-500/20"
    : o.type === "volna"
      ? "text-violet-600 bg-violet-100 dark:text-violet-300 dark:bg-violet-500/20"
      : "text-emerald-600 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-500/20";

  const body = (
    <div
      className={`group rounded-2xl border border-gray-200/80 border-l-4 p-4 transition-all dark:border-[#26324a] ${accent} ${
        detailPath ? "hover:border-amber-300 hover:shadow-md dark:hover:border-amber-600/40" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold text-gray-900 dark:text-white">{orderTitle(o, t)}</p>
              <p className="mt-0.5 line-clamp-2 text-sm text-gray-500 dark:text-slate-400">{orderSubtitle(o)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-extrabold tabular-nums text-amber-600 dark:text-yellow-300">
                {Number(o.amount || 0).toLocaleString("ru-RU")} ₸
              </p>
              {st ? (
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.badge}`}>
                  {t(st.key)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 dark:text-slate-400">
            {o.created_at ? <span>{formatOrderDate(o.created_at)}</span> : null}
            {isFood && o.delivery_method === "delivery" ? (
              <span className="inline-flex items-center gap-1">
                <Truck className="h-3 w-3" /> {t("cabinet.deliveryMethod.delivery")}
              </span>
            ) : isFood && o.delivery_method === "pickup" ? (
              <span className="inline-flex items-center gap-1">
                <Store className="h-3 w-3" /> {t("cabinet.deliveryMethod.pickup")}
              </span>
            ) : null}
            {payLabel ? <span>· {payLabel}</span> : null}
            {isFood && o.delivery_address ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                · <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{o.delivery_address}</span>
              </span>
            ) : null}
            {isStore && o.customer_address ? (
              <span className="inline-flex min-w-0 items-center gap-1 truncate">
                · <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{o.customer_address}</span>
              </span>
            ) : null}
          </div>

          {isFood && o.status !== "cancelled" && o.status !== "done" ? (
            <FoodOrderStatusBar status={o.status || "new"} />
          ) : null}

          {isFood && o.order_number ? (
            <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              {o.delivery_method === "delivery" && !["done", "cancelled", "delivered"].includes(String(o.status)) ? (
                <Link
                  to={`/delivery/food/${o.order_number}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-700"
                >
                  <MapPin className="h-3 w-3" /> Отследить
                </Link>
              ) : null}
              {o.order_items ? (
                <button
                  type="button"
                  onClick={() => repeatFoodOrder(o, navigate)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-[11px] font-semibold text-orange-700 hover:bg-orange-100 dark:border-orange-500/40 dark:bg-orange-500/10 dark:text-orange-200 dark:hover:bg-orange-500/20"
                >
                  <RotateCcw className="h-3 w-3" /> Заказать снова
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {detailPath ? (
          <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-gray-300 transition group-hover:text-amber-500 dark:text-slate-600" />
        ) : null}
      </div>
    </div>
  );

  if (detailPath) {
    return (
      <Link to={detailPath} className="block">
        {body}
      </Link>
    );
  }
  return body;
}
