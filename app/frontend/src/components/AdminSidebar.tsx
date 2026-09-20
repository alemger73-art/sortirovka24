import adminTranslations from '@/i18n/adminTranslations';
import AppearanceControls from '@/components/AppearanceControls';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Newspaper, AlertTriangle, Wrench, BookOpen, Image, ClipboardList, UserPlus, LogOut, Home as HomeIcon, Lock, Megaphone, Briefcase, FolderTree, Building2, Utensils, BadgeCheck, BarChart3, Clock, Bus, ChevronDown, Menu, Store, Car, Heart, HardHat, Bell, Bike, Cross, Scissors, Power, Wine, LayoutDashboard, Handshake, Search, type LucideIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { DAM_ALEM_BRAND } from '@/lib/damAlem';
import { getGroupBadgeCount, getTabBadgeCount, type AdminSummary } from '@/lib/adminSummaryApi';
/* ─── Types ─── */
interface TabItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface MenuGroup {
  id: string;
  label: string;
  items: TabItem[];
}

/* ─── Grouped menu structure ─── */
function getMenuGroups(adminT: (key: string) => string): MenuGroup[] {
const MENU_GROUPS: MenuGroup[] = [
  {
    id: 'overview',
    label: adminT("admin.ui.1247"),
    items: [
      { id: 'dashboard', label: adminT("admin.ui.1248"), icon: LayoutDashboard },
    ],
  },
  {
    id: 'content',
    label: adminT("admin.ui.1249"),
    items: [
      { id: 'news', label: adminT("admin.ui.1250"), icon: Newspaper },
      { id: 'banners', label: adminT("admin.ui.0244"), icon: Image },
      { id: 'complaints', label: adminT("admin.ui.0383"), icon: AlertTriangle },
      { id: 'history', label: adminT("admin.ui.1251"), icon: Clock },
    ],
  },
  {
    id: 'announcements',
    label: adminT("admin.ui.1252"),
    items: [
      { id: 'announcements', label: adminT("admin.ui.0141"), icon: Megaphone },
      { id: 'real-estate', label: adminT("admin.ui.0140"), icon: Building2 },
      { id: 'jobs', label: adminT("admin.ui.0385"), icon: Briefcase },
      { id: 'masters', label: adminT("admin.ui.1038"), icon: Wrench },
      { id: 'salons', label: adminT("admin.ui.1253"), icon: Scissors },
      { id: 'master-requests', label: adminT("admin.ui.1254"), icon: ClipboardList },
      { id: 'become-master', label: adminT("admin.ui.1255"), icon: UserPlus },
    ],
  },
  {
    id: 'food',
    label: adminT("admin.ui.1256"),
    items: [
      { id: 'dam-alem', label: DAM_ALEM_BRAND, icon: Utensils },
    ],
  },
  {
    id: 'district',
    label: adminT("admin.ui.1258"),
    items: [
      { id: 'directory', label: adminT("admin.ui.1259"), icon: BookOpen },
      { id: 'inspectors', label: adminT("admin.ui.1260"), icon: BadgeCheck },
      { id: 'taxi', label: adminT("admin.ui.1037"), icon: Car },
      { id: 'logistics', label: adminT("admin.ui.0392"), icon: Bike },
      { id: 'transport', label: adminT("admin.ui.1261"), icon: Bus },
    ],
  },
  {
    id: 'partners',
    label: adminT("admin.ui.1262"),
    items: [
      { id: 'partners-business', label: adminT("admin.ui.0393"), icon: Handshake },
      { id: 'partners-gastronom', label: adminT("admin.ui.1036"), icon: Store },
      { id: 'partners-volna', label: adminT("admin.extra.1317"), icon: Wine },
      { id: 'partners-prorab', label: adminT("admin.extra.1318"), icon: HardHat },
      { id: 'partners-pharmacy', label: adminT("admin.ui.1263"), icon: Cross },
    ],
  },
  {
    id: 'system',
    label: adminT("admin.ui.1264"),
    items: [
      { id: 'modules', label: adminT("admin.ui.0953"), icon: Power },
      { id: 'stats', label: adminT("admin.ui.1265"), icon: BarChart3 },
      { id: 'categories', label: adminT("admin.ui.1266"), icon: FolderTree },
      { id: 'support', label: adminT("admin.ui.1140"), icon: Heart },
      { id: 'push', label: adminT("admin.ui.1045"), icon: Bell },
      { id: 'account-settings', label: adminT("admin.ui.1267"), icon: Lock },
    ],
  },
];

return MENU_GROUPS;
}

export const ALL_TABS = getMenuGroups(key => adminTranslations[key]?.ru || key).flatMap(g => g.items);
const ALIASES: Record<string, { tab: string; section?: string }> = {
  'partners-alem-food': { tab: 'dam-alem' }, food: { tab: 'dam-alem' },
  'food-orders': { tab: 'dam-alem', section: 'orders' },
  'food-settings': { tab: 'dam-alem', section: 'settings' },
  'pos-integration': { tab: 'dam-alem', section: 'pos' },
};
export function resolveAdminTab(tab: string) {
  return ALIASES[tab] || { tab: ALL_TABS.some(t => t.id === tab) ? tab : 'dashboard' };
}
export function getTabLabel(tab: string, adminT: (key: string) => string) {
  return getMenuGroups(adminT).flatMap(g => g.items).find(t => t.id === resolveAdminTab(tab).tab)?.label || adminT("admin.ui.1248");
}
interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
  summary?: AdminSummary | null;
}
function BadgePill({ count }: { count: number }) {
  return count > 0 ? <span className="ml-auto shrink-0 rounded-full bg-red-50 text-red-700 px-2 py-0.5 text-xs tabular-nums">{count > 99 ? '99+' : count}</span> : null;
}
function AdminNavigation({ activeTab, onTabChange, summary }: SidebarProps) {
  const { t: adminT } = useLanguage();
  const MENU_GROUPS = getMenuGroups(adminT);

  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string[]>([]);
  const id = useId();
  useEffect(() => {
    const group = MENU_GROUPS.find(g => g.items.some(t => t.id === activeTab));
    if (group) setExpanded(prev => prev.includes(group.id) ? prev : [...prev, group.id]);
  }, [activeTab]);
  const normalize = (s: string) => s.toLocaleLowerCase('ru').replace(/ё/g, 'е').trim();
  const needle = normalize(query);
  const groups = MENU_GROUPS.map(g => ({ ...g, items: g.items.filter(t => !needle || normalize(t.label + ' ' + g.label + (t.id === 'dam-alem' ? adminT("admin.ui.1268") : '')).includes(needle)) })).filter(g => g.items.length);
  return <>
    <div className="px-3 py-3 shrink-0">
      <label className="relative block"><Search aria-hidden="true" className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
        <input type="search" aria-label={adminT("admin.ui.1269")} placeholder={adminT("admin.ui.1269")} value={query} onChange={e => setQuery(e.target.value)} className="w-full min-w-0 rounded-lg border bg-slate-50 py-3 pl-9 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </label>
    </div>
    <nav aria-label={adminT("admin.ui.1270")} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 space-y-2">
      {!groups.length && <p role="status" className="px-3 py-4 text-sm text-gray-500">{adminT("admin.ui.1271")}</p>}
      {groups.map(g => {
        const open = !!needle || g.id === 'overview' || expanded.includes(g.id);
        return <div key={g.id}>
          {g.id !== 'overview' && <button type="button" aria-expanded={open} aria-controls={`${id}-${g.id}`} onClick={() => setExpanded(prev => prev.includes(g.id) ? prev.filter(x => x !== g.id) : [...prev, g.id])} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-xs font-semibold text-gray-500 hover:bg-slate-50">
            <span className="flex-1">{g.label}</span><BadgePill count={getGroupBadgeCount(summary || null, g.items.map(t => t.id))} /><ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} />
          </button>}
          {open && <div id={`${id}-${g.id}`} className="space-y-1">{g.items.map(t => <button type="button" key={t.id} aria-current={activeTab === t.id ? 'page' : undefined} onClick={() => { onTabChange(t.id); setQuery(''); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-3 text-left text-sm transition-colors ${activeTab === t.id ? 'bg-blue-50 text-blue-800 font-semibold' : 'text-gray-700 hover:bg-slate-100'}`}>
            <t.icon aria-hidden="true" className="h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{t.label}</span><BadgePill count={getTabBadgeCount(summary || null, t.id)} />
          </button>)}</div>}
        </div>;
      })}
    </nav>
  </>;
}
function Footer({ onLogout }: { onLogout: () => void }) {
  const { t: adminT } = useLanguage();

  return <div className="shrink-0 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-1">
    <div className="flex flex-wrap items-center gap-2 px-3 py-2"><AppearanceControls /></div>
    <Link to="/" className="flex items-center gap-2 rounded-lg px-3 py-3 text-sm text-gray-600 hover:bg-slate-50"><HomeIcon className="h-4 w-4" />{adminT("admin.ui.1272")}</Link>
    <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-3 text-sm text-red-700 hover:bg-red-50"><LogOut className="h-4 w-4" />{adminT("admin.ui.1273")}</button>
  </div>;
}
export function DesktopSidebar(props: SidebarProps) {
  return <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r bg-white">
    <div className="flex items-center gap-2 border-b px-5 py-5 font-semibold text-sm"><Shield className="h-5 w-5 text-blue-700" />Сортировка 24</div>
    <AdminNavigation {...props} /><Footer onLogout={props.onLogout} />
  </aside>;
}
export function MobileDrawer({ isOpen, onClose, ...props }: SidebarProps & { isOpen: boolean; onClose: () => void }) {
  const { t: adminT } = useLanguage();

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const close = () => { if (media.matches && isOpen) onClose(); };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, [isOpen, onClose]);
  return <Sheet open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
    <SheetContent side="left" className="flex w-[min(20rem,90vw)] flex-col gap-0 p-0 bg-white" onCloseAutoFocus={e => { e.preventDefault(); document.getElementById('admin-menu-button')?.focus(); }}>
      <SheetTitle className="px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pr-12 text-base">Сортировка 24</SheetTitle>
      <SheetDescription className="px-5 pt-1 pb-2 text-xs">{adminT("admin.ui.1275")}</SheetDescription>
      <AdminNavigation {...props} onTabChange={tab => { props.onTabChange(tab); onClose(); }} />
      <Footer onLogout={() => { props.onLogout(); onClose(); }} />
    </SheetContent>
  </Sheet>;
}
export function MobileHeader({ activeTab, onMenuOpen }: { activeTab: string; onMenuOpen: () => void; onLogout: () => void; pendingTotal?: number }) {
  const { t: adminT } = useLanguage();

  return <header className="md:hidden sticky top-0 z-30 border-b bg-white px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] flex items-center gap-3">
    <button id="admin-menu-button" type="button" onClick={onMenuOpen} aria-label={adminT("admin.ui.0260")} aria-haspopup="dialog" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100"><Menu className="h-5 w-5" /></button>
    <h1 className="min-w-0 break-words text-sm font-semibold">{getTabLabel(activeTab, adminT)}</h1>
  </header>;
}
