import { Link } from "react-router-dom";
import { Bike, Car, Wrench, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import type { CourierAccess } from "@/lib/logisticsApi";
import type { DriverApplication } from "@/lib/taxiApi";

type BecomeMasterRow = {
  id?: number;
  category?: string;
  status?: string;
  created_at?: string;
};

type Props = {
  profileRole?: string;
  becomeMasterRequests?: BecomeMasterRow[];
  courierAccess?: CourierAccess | null;
  driverApplication?: DriverApplication | null;
  labels: {
    title: string;
    master: string;
    courier: string;
    driver: string;
    statusNone: string;
    statusPending: string;
    statusApproved: string;
    statusRejected: string;
    actionApply: string;
    actionCabinet: string;
    masterRequestsHint: string;
  };
};

function statusTone(status: string) {
  if (status === "pending") return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50";
  if (status === "approved") return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900/50";
  if (status === "rejected") return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50";
  return "text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-[#0f172a] border-gray-200 dark:border-[#26324a]";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "pending") return <Clock className="h-4 w-4 shrink-0" />;
  if (status === "approved") return <CheckCircle2 className="h-4 w-4 shrink-0" />;
  if (status === "rejected") return <AlertCircle className="h-4 w-4 shrink-0" />;
  return null;
}

export default function CabinetRoleApplications({
  profileRole,
  becomeMasterRequests = [],
  courierAccess,
  driverApplication,
  labels,
}: Props) {
  const latestMaster = becomeMasterRequests[0];
  const masterStatus =
    profileRole === "master" || profileRole === "admin" || profileRole === "superadmin" || profileRole === "moderator"
      ? "approved"
      : latestMaster?.status || "none";

  const courierStatus = courierAccess?.can_access_cabinet
    ? "approved"
    : courierAccess?.status && courierAccess.status !== "none"
      ? courierAccess.status
      : "none";

  const driverStatus = driverApplication?.is_driver
    ? "approved"
    : driverApplication?.status && driverApplication.status !== "none"
      ? driverApplication.status
      : "none";

  const rows = [
    {
      key: "master",
      label: labels.master,
      icon: Wrench,
      status: masterStatus,
      detail: latestMaster?.category,
      applyTo: "/masters/become",
      cabinetTo: "/cabinet/master",
      canCabinet: masterStatus === "approved",
    },
    {
      key: "courier",
      label: labels.courier,
      icon: Bike,
      status: courierStatus,
      detail: courierAccess?.application?.vehicle_type,
      applyTo: "/delivery/courier",
      cabinetTo: "/cabinet/courier",
      canCabinet: Boolean(courierAccess?.can_access_cabinet),
    },
    {
      key: "driver",
      label: labels.driver,
      icon: Car,
      status: driverStatus,
      detail: driverApplication?.car_number,
      applyTo: "/taxi/driver",
      cabinetTo: "/cabinet/driver",
      canCabinet: Boolean(driverApplication?.is_driver),
    },
  ];

  const statusLabel = (status: string) => {
    if (status === "pending") return labels.statusPending;
    if (status === "approved") return labels.statusApproved;
    if (status === "rejected") return labels.statusRejected;
    return labels.statusNone;
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#1f2a3f] dark:bg-[#111827]">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white">{labels.title}</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">{labels.masterRequestsHint}</p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.key}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${statusTone(row.status)}`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{row.label}</p>
                  <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm">
                    <StatusIcon status={row.status} />
                    {statusLabel(row.status)}
                    {row.detail ? <span className="text-xs opacity-80">· {row.detail}</span> : null}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {row.canCabinet ? (
                  <Link
                    to={row.cabinetTo}
                    className="rounded-lg bg-white/80 px-3 py-2 text-xs font-bold text-gray-900 transition hover:bg-white dark:bg-[#0f172a] dark:text-white dark:hover:bg-[#1a2336]"
                  >
                    {labels.actionCabinet}
                  </Link>
                ) : row.status === "none" || row.status === "rejected" ? (
                  <Link
                    to={row.applyTo}
                    className="rounded-lg bg-white/80 px-3 py-2 text-xs font-bold text-gray-900 transition hover:bg-white dark:bg-[#0f172a] dark:text-white dark:hover:bg-[#1a2336]"
                  >
                    {labels.actionApply}
                  </Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
