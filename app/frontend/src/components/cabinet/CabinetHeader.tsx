import { Link } from "react-router-dom";
import { Bike, Car, Coins, LogOut, UserCircle2, Wrench, Bell } from "lucide-react";
import type { CourierAccess } from "@/lib/logisticsApi";
import type { DriverApplication } from "@/lib/taxiApi";

interface Profile {
  name?: string;
  phone?: string;
  avatar?: string;
  role?: string;
  bonus_balance?: number;
}

interface Props {
  profile?: Profile | null;
  ordersCount?: number;
  ordersCountLabel?: string;
  unreadNotifications?: number;
  courierAccess?: CourierAccess | null;
  driverApplication?: DriverApplication | null;
  masterApplicationPending?: boolean;
  masterNewRequests?: number;
  logoutLabel: string;
  bonusLabel: string;
  onLogout: () => void;
  onOpenBonuses: () => void;
  onOpenNotifications: () => void;
  links: {
    master?: string;
    driver?: string;
    courier?: string;
    becomeDriver?: string;
    becomeCourier?: string;
    becomeMaster?: string;
    masterPending?: string;
    driverPending?: string;
    courierPending?: string;
  };
  /** When omitted, all role links are shown (legacy behaviour). */
  roleVisibility?: {
    master?: boolean;
    driver?: boolean;
    courier?: boolean;
    becomeDriver?: boolean;
    becomeCourier?: boolean;
    becomeMaster?: boolean;
  };
}

export default function CabinetHeader({
  profile,
  ordersCount = 0,
  ordersCountLabel = "",
  unreadNotifications = 0,
  courierAccess,
  driverApplication,
  masterApplicationPending,
  masterNewRequests = 0,
  logoutLabel,
  bonusLabel,
  onLogout,
  onOpenBonuses,
  onOpenNotifications,
  links,
  roleVisibility,
}: Props) {
  const show = (key: keyof NonNullable<Props['roleVisibility']>) => roleVisibility?.[key] !== false;
  const bonus = Number(profile?.bonus_balance || 0);
  const isApprovedDriver = Boolean(driverApplication?.is_driver);
  const driverPending = driverApplication?.status === "pending";
  const roleLinks = [
    (profile?.role === "master" || profile?.role === "admin" || profile?.role === "superadmin") && links.master && show("master")
      ? { to: "/cabinet/master", label: links.master, icon: Wrench, tone: "text-indigo-600 dark:text-indigo-400" }
      : null,
    isApprovedDriver && links.driver && show("driver")
      ? { to: "/cabinet/driver", label: links.driver, icon: Car, tone: "text-amber-600 dark:text-amber-400" }
      : null,
    courierAccess?.can_access_cabinet && links.courier && show("courier")
      ? { to: "/cabinet/courier", label: links.courier, icon: Bike, tone: "text-orange-600 dark:text-orange-400" }
      : null,
    !isApprovedDriver && !driverPending && (profile?.role === "user" || profile?.role === "courier") && links.becomeDriver && show("becomeDriver")
      ? { to: "/taxi/driver", label: links.becomeDriver, icon: Car, tone: "text-amber-600 dark:text-amber-400" }
      : null,
    !courierAccess?.can_access_cabinet && courierAccess?.status !== "pending" && links.becomeCourier && show("becomeCourier")
      ? { to: "/delivery/courier", label: links.becomeCourier, icon: Bike, tone: "text-orange-600 dark:text-orange-400" }
      : null,
    (profile?.role === "user" || profile?.role === "courier") && links.becomeMaster && show("becomeMaster")
      ? { to: "/masters/become", label: links.becomeMaster, icon: Wrench, tone: "text-indigo-600 dark:text-indigo-400" }
      : null,
  ].filter(Boolean) as { to: string; label: string; icon: typeof Wrench; tone: string }[];

  return (
    <div className="relative overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-sm dark:border-[#1f2a3f] dark:bg-[#111827]">
      <div className="absolute inset-0 bg-gradient-to-br from-amber-400/15 via-transparent to-orange-500/10 dark:from-amber-500/10 dark:to-orange-600/5" />
      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          {profile?.avatar ? (
            <img
              src={profile.avatar}
              alt=""
              className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-2 ring-amber-400/60 shadow-md"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-300 shadow-md">
              <UserCircle2 className="h-9 w-9 text-[#0B0F19]/70" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
              {profile?.name || "—"}
            </h1>
            <p className="truncate text-sm text-gray-500 dark:text-slate-300">{profile?.phone}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenNotifications}
                className="relative inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-700 transition hover:bg-gray-50 dark:border-[#2a3347] dark:bg-[#0f172a] dark:text-slate-200 dark:hover:bg-[#1a2336]"
              >
                <Bell className="h-3.5 w-3.5" />
                {(unreadNotifications || 0) > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={onOpenBonuses}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/60 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
              >
                <Coins className="h-3.5 w-3.5" />
                {bonus.toLocaleString("ru-RU")} {bonusLabel}
              </button>
              {ordersCount > 0 ? (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 dark:bg-[#0f172a] dark:text-slate-300">
                  {ordersCountLabel}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-[#2a3347] dark:bg-[#0f172a] dark:text-white dark:hover:bg-[#1a2336]"
          >
            <LogOut className="h-4 w-4" />
            {logoutLabel}
          </button>
          {courierAccess?.status === "pending" && links.courierPending ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">{links.courierPending}</p>
          ) : null}
          {driverPending && links.driverPending ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">{links.driverPending}</p>
          ) : null}
          {masterApplicationPending && links.masterPending ? (
            <p className="text-xs text-indigo-600 dark:text-indigo-400">{links.masterPending}</p>
          ) : null}
        </div>
      </div>

      {roleLinks.length > 0 ? (
        <div className="relative flex flex-wrap gap-2 border-t border-gray-100 px-5 py-3 dark:border-[#1f2a3f]">
          {roleLinks.map((link) => {
            const Icon = link.icon;
            const isMasterLink = link.to === "/cabinet/master";
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`relative inline-flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-semibold transition hover:bg-gray-100 dark:bg-[#0f172a] dark:hover:bg-[#1a2336] ${link.tone}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
                {isMasterLink && masterNewRequests > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {masterNewRequests > 9 ? "9+" : masterNewRequests}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
