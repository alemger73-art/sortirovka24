import { ReactNode } from "react";

interface CabinetCardProps {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children?: ReactNode;
}

export default function CabinetCard({ title, subtitle, right, children }: CabinetCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-[#1f2a3f] dark:bg-[#111827] dark:shadow-[0_10px_25px_rgba(0,0,0,0.25)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
          {subtitle ? <p className="text-sm text-gray-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
