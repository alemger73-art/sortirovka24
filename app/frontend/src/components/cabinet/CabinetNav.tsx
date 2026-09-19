import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useRef } from 'react';
import {
  UserCircle2, MapPin, Coins, Package, Wrench, Car, AlertCircle, Megaphone, Settings, Bell, Building2,
} from "lucide-react";

export type { CabinetTabId } from '@/config/cabinetTabs';
import type { CabinetTabId } from '@/config/cabinetTabs';

const TAB_ICONS: Record<CabinetTabId, typeof UserCircle2> = {
  profile: UserCircle2,
  work: Wrench,
  addresses: MapPin,
  bonuses: Coins,
  notifications: Bell,
  orders: Package,
  masterRequests: Wrench,
  taxi: Car,
  complaints: AlertCircle,
  announcements: Megaphone,
  realEstate: Building2,
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
  const { t } = useLanguage();
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const list = nav?.querySelector('ul');
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (list && active && list.scrollWidth > list.clientWidth) {
      list.scrollLeft += active.getBoundingClientRect().left - list.getBoundingClientRect().left - 8;
    }
  }, [activeTab]);
  return (
    <nav ref={navRef} aria-label={t("public.CabinetNav.text311")} className="cabinet-nav lg:sticky lg:top-6">
      <div className="rounded-2xl border border-gray-200/80 bg-white p-2 shadow-sm dark:border-[#1f2a3f] dark:bg-[#111827]">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold text-gray-500 lg:hidden">{t('cabinet.section')}</p>
        <ul className="cabinet-nav-mobile flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1 lg:overflow-visible lg:pb-0">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.id];
            const active = activeTab === tab.id;
            return (
              <li key={tab.id} className="shrink-0 lg:mb-1 lg:block">
                <button
                  type="button"
                  aria-current={active ? "page" : undefined}
                  aria-controls="cabinet-panel"
                  onClick={() => onTabChange(tab.id)}
                  className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-all lg:w-full lg:gap-3 lg:py-2.5 lg:text-left ${
                    active
                      ? "bg-gradient-to-r from-amber-400 to-yellow-300 text-[#0B0F19] shadow-sm"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-[#0f172a] dark:text-slate-200 dark:hover:bg-[#1a2336] lg:bg-transparent lg:dark:bg-transparent"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#0B0F19]" : "text-gray-400 dark:text-slate-400"}`} />
                  <span className="lg:min-w-0 lg:flex-1 lg:truncate">{tab.label}</span>
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
