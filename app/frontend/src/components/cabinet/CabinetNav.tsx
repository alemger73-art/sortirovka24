import {
  UserCircle2, MapPin, Coins, Package, Wrench, Car, AlertCircle, Megaphone, Settings, Bell,
} from "lucide-react";

export type CabinetTabId =
  | "profile"
  | "addresses"
  | "bonuses"
  | "notifications"
  | "orders"
  | "masterRequests"
  | "taxi"
  | "complaints"
  | "announcements"
  | "settings";

const TAB_ICONS: Record<CabinetTabId, typeof UserCircle2> = {
  profile: UserCircle2,
  addresses: MapPin,
  bonuses: Coins,
  notifications: Bell,
  orders: Package,
  masterRequests: Wrench,
  taxi: Car,
  complaints: AlertCircle,
  announcements: Megaphone,
  settings: Settings,
};

interface TabItem {
  id: CabinetTabId;
  label: string;
  badge?: number;
}

interface Props {
  tabs: TabItem[];
  activeTab: CabinetTabId;
  onTabChange: (id: CabinetTabId) => void;
}

export default function CabinetNav({ tabs, activeTab, onTabChange }: Props) {
  return (
    <nav className="lg:sticky lg:top-6">
      <div className="rounded-2xl border border-gray-200/80 bg-white p-2 shadow-sm dark:border-[#1f2a3f] dark:bg-[#111827]">
        <ul className="space-y-1">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.id];
            const active = activeTab === tab.id;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                    active
                      ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-[#0B0F19] shadow-sm"
                      : "text-gray-700 hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-[#1a2336]"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#0B0F19]" : "text-gray-400 dark:text-slate-400"}`} />
                  <span className="truncate flex-1">{tab.label}</span>
                  {(tab.badge || 0) > 0 ? (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
