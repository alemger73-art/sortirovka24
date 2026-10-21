import { getPublicLocale } from '@/i18n/publicLocale';
import { Link } from "react-router-dom";
import {
  Bell, Bike, Car, Coins, Package, UtensilsCrossed, Wrench, CheckCheck, Loader2, Megaphone, Wallet, ChevronRight,
} from "lucide-react";
import type { UserNotificationItem } from "@/lib/accountApi";

const CATEGORY_ICONS: Record<string, typeof Bell> = {
  food: UtensilsCrossed,
  logistics: Bike,
  taxi: Car,
  store: Package,
  bonus: Coins,
  master: Wrench,
  announcements: Megaphone,
  salary: Wallet,
};

const CATEGORY_COLORS: Record<string, string> = {
  food: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200",
  logistics: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  taxi: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200",
  store: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
  bonus: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  master: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200",
  announcements: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
  salary: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
};

function timeOnly(raw?: string | null) {
  if (!raw || Number.isNaN(new Date(raw).getTime())) return "";
  try { return new Date(raw).toLocaleTimeString(getPublicLocale(), { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

/** «Сегодня», «Вчера» or a date — notifications are grouped by day like in a messenger. */
function dayLabel(raw?: string | null) {
  if (!raw || Number.isNaN(new Date(raw).getTime())) return "";
  const kz = getPublicLocale().startsWith("kk");
  const d = new Date(raw); const today = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(today) - start(d)) / 86400000);
  if (diff === 0) return kz ? "Бүгін" : "Сегодня";
  if (diff === 1) return kz ? "Кеше" : "Вчера";
  try { return d.toLocaleDateString(getPublicLocale(), { day: "numeric", month: "long", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) }); } catch { return formatWhen(raw); }
}

function safePath(path?: string | null) {
  return Boolean(path && path.startsWith('/') && !path.startsWith('//') && !/[\\\s]/.test(path));
}

function formatWhen(raw?: string | null) {
  if (!raw || Number.isNaN(new Date(raw).getTime())) return "";
  try {
    return new Date(raw).toLocaleString(getPublicLocale(), {
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
  failed?: boolean;
  busy?: boolean;
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
  failed,
  busy,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  emptyLabel,
  markAllLabel,
  title,
}: Props) {
  const groups: { label: string; items: UserNotificationItem[] }[] = [];
  for (const n of items) {
    const label = dayLabel(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(n);
    else groups.push({ label, items: [n] });
  }
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
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
            disabled={busy} onClick={onMarkAllRead}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60 dark:bg-[#1a2336] dark:text-slate-200"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            {markAllLabel}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : failed && items.length === 0 ? null : items.length === 0 ? (
        <div className="rounded-2xl bg-gray-50 px-6 py-12 text-center dark:bg-[#0f172a]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm dark:bg-[#111827]"><Bell className="h-7 w-7 text-gray-300 dark:text-slate-600" /></span>
          <p className="mt-3 text-sm text-gray-500 dark:text-slate-400">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g, gi) => (
            <section key={`${g.label}-${gi}`} aria-label={g.label || undefined}>
              {g.label ? <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">{g.label}</p> : null}
              <ul className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-[#26324a] dark:bg-[#111827]">
                {g.items.map((n, i) => {
                  const Icon = CATEGORY_ICONS[n.category] || Bell;
                  const tone = CATEGORY_COLORS[n.category] || "bg-gray-100 text-gray-700 dark:bg-[#0f172a] dark:text-slate-200";
                  const link = safePath(n.path);
                  const inner = (
                    <div className={`relative flex gap-3 px-4 py-3.5 text-left transition hover:bg-gray-50 dark:hover:bg-[#1a2336] ${n.is_read ? "" : "bg-amber-50/70 dark:bg-amber-500/5"}`}>
                      {!n.is_read ? <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-amber-400" /> : null}
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`min-w-0 text-[15px] leading-snug text-gray-900 dark:text-white ${n.is_read ? "font-medium" : "font-bold"}`}>{n.title}</p>
                          <span className="shrink-0 text-xs text-gray-400 dark:text-slate-500">{timeOnly(n.created_at)}</span>
                        </div>
                        {n.body ? <p className="mt-0.5 line-clamp-3 text-sm leading-snug text-gray-600 dark:text-slate-300">{n.body}</p> : null}
                        {!n.is_read ? <span className="sr-only">Новое</span> : null}
                      </div>
                      {link ? <ChevronRight aria-hidden className="mt-2.5 h-4 w-4 shrink-0 text-gray-300 dark:text-slate-600" /> : null}
                    </div>
                  );
                  return (
                    <li key={n.id} className={i ? "border-t border-gray-100 dark:border-[#26324a]" : ""}>
                      {link ? (
                        <Link to={n.path!} onClick={() => { if (!n.is_read) onMarkRead(n.id); }} className="block">{inner}</Link>
                      ) : (
                        <button type="button" className="block w-full" onClick={() => { if (!n.is_read) onMarkRead(n.id); }}>{inner}</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
