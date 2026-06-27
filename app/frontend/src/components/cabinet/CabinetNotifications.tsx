import { Link } from "react-router-dom";
import {
  Bell, Bike, Car, Coins, Package, UtensilsCrossed, Wrench, CheckCheck, Loader2,
} from "lucide-react";
import type { UserNotificationItem } from "@/lib/accountApi";

const CATEGORY_ICONS: Record<string, typeof Bell> = {
  food: UtensilsCrossed,
  logistics: Bike,
  taxi: Car,
  store: Package,
  bonus: Coins,
  master: Wrench,
};

const CATEGORY_COLORS: Record<string, string> = {
  food: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200",
  logistics: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  taxi: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200",
  store: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  bonus: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  master: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
};

function formatWhen(raw?: string | null) {
  if (!raw) return "";
  try {
    return new Date(raw).toLocaleString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return raw;
  }
}

interface Props {
  items: UserNotificationItem[];
  loading: boolean;
  unreadCount: number;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  emptyLabel: string;
  markAllLabel: string;
  title: string;
}

export default function CabinetNotifications({
  items,
  loading,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  emptyLabel,
  markAllLabel,
  title,
}: Props) {
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          {unreadCount > 0 ? (
            <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
              {unreadCount}
            </span>
          ) : null}
        </div>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-[#2a3347] dark:text-slate-200 dark:hover:bg-[#1a2336]"
          >
            <CheckCheck className="h-4 w-4" />
            {markAllLabel}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center dark:border-[#26324a] dark:bg-[#0f172a]">
          <Bell className="mx-auto h-10 w-10 text-gray-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = CATEGORY_ICONS[n.category] || Bell;
            const tone = CATEGORY_COLORS[n.category] || "bg-gray-100 text-gray-700 dark:bg-[#0f172a] dark:text-slate-200";
            const inner = (
              <div
                className={`flex gap-3 rounded-2xl border p-4 transition ${
                  n.is_read
                    ? "border-gray-200/80 bg-white dark:border-[#26324a] dark:bg-[#111827]"
                    : "border-amber-200 bg-amber-50/60 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/5"
                }`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-gray-900 dark:text-white">{n.title}</p>
                    {!n.is_read ? (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                    ) : null}
                  </div>
                  {n.body ? (
                    <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">{n.body}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">{formatWhen(n.created_at)}</p>
                </div>
              </div>
            );

            if (n.path) {
              return (
                <Link
                  key={n.id}
                  to={n.path}
                  onClick={() => {
                    if (!n.is_read) onMarkRead(n.id);
                  }}
                  className="block"
                >
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={n.id}
                type="button"
                className="block w-full text-left"
                onClick={() => {
                  if (!n.is_read) onMarkRead(n.id);
                }}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
