import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Shield, Newspaper, AlertTriangle, Wrench, BookOpen, Image,
  ClipboardList, UserPlus, LogOut, Home as HomeIcon, Lock, Megaphone,
  Briefcase, FolderTree, Building2, Utensils, ShoppingBag, Settings,
  BadgeCheck, BarChart3, Clock, Plug, Bus, TreePine, MapPin,
  ChevronDown, ChevronRight, X, Menu, type LucideIcon,
} from 'lucide-react';

/* ─── Types ─── */
interface TabItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface MenuGroup {
  id: string;
  label: string;
  emoji: string;
  items: TabItem[];
}

/* ─── Grouped menu structure ─── */
const MENU_GROUPS: MenuGroup[] = [
  {
    id: 'content',
    label: 'Контент',
    emoji: '📰',
    items: [
      { id: 'news', label: 'Новости', icon: Newspaper },
      { id: 'banners', label: 'Баннеры', icon: Image },
      { id: 'complaints', label: 'Жалобы', icon: AlertTriangle },
      { id: 'directory', label: 'Справочник', icon: BookOpen },
    ],
  },
  {
    id: 'announcements',
    label: 'Объявления и каталог',
    emoji: '📋',
    items: [
      { id: 'announcements', label: 'Объявления', icon: Megaphone },
      { id: 'real-estate', label: 'Недвижимость', icon: Building2 },
      { id: 'jobs', label: 'Вакансии', icon: Briefcase },
      { id: 'masters', label: 'Мастера', icon: Wrench },
      { id: 'master-requests', label: 'Заявки', icon: ClipboardList },
      { id: 'become-master', label: 'Заявки мастеров', icon: UserPlus },
    ],
  },
  {
    id: 'food',
    label: 'Еда и доставка',
    emoji: '🍕',
    items: [
      { id: 'food', label: 'Еда (меню)', icon: Utensils },
      { id: 'food-orders', label: 'Заказы еды', icon: ShoppingBag },
      { id: 'food-settings', label: 'Настройки еды', icon: Settings },
      { id: 'park-points', label: 'Точки парка', icon: MapPin },
      { id: 'park-orders', label: 'Заказы в парк', icon: TreePine },
    ],
  },
  {
    id: 'district',
    label: 'Район и службы',
    emoji: '🏘',
    items: [
      { id: 'inspectors', label: 'Участковые', icon: BadgeCheck },
      { id: 'transport', label: 'Транспорт', icon: Bus },
    ],
  },
  {
    id: 'system',
    label: 'Система',
    emoji: '⚙️',
    items: [
      { id: 'stats', label: 'Статистика', icon: BarChart3 },
      { id: 'categories', label: 'Категории', icon: FolderTree },
      { id: 'history', label: 'История', icon: Clock },
      { id: 'pos-integration', label: 'POS Интеграция', icon: Plug },
      { id: 'account-settings', label: 'Настройки аккаунта', icon: Lock },
    ],
  },
];

/* ─── Helper: find which group contains a tab ─── */
function findGroupForTab(tabId: string): string | null {
  for (const group of MENU_GROUPS) {
    if (group.items.some(item => item.id === tabId)) return group.id;
  }
  return null;
}

/* ─── Desktop Sidebar ─── */
interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
}

export function DesktopSidebar({ activeTab, onTabChange, onLogout }: SidebarProps) {
  // Initialize expanded groups — always expand the group containing the active tab
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const activeGroup = findGroupForTab(activeTab);
    if (activeGroup) initial.add(activeGroup);
    return initial;
  });

  // When activeTab changes, expand its group
  useEffect(() => {
    const group = findGroupForTab(activeTab);
    if (group && !expandedGroups.has(group)) {
      setExpandedGroups(prev => new Set([...prev, group]));
    }
  }, [activeTab]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <aside className="hidden md:flex md:flex-col w-60 bg-white border-r border-gray-200 fixed h-full z-40">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <Link to="/" className="flex items-center gap-2 text-gray-500 hover:text-blue-600 text-xs mb-3 transition-colors">
          <HomeIcon className="h-3.5 w-3.5" /> На сайт
        </Link>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-white" />
          </div>
          <div>
            <p className="font-bold text-sm text-gray-900">Панель</p>
            <p className="text-[11px] text-gray-400">Управление</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto scrollbar-thin">
        {MENU_GROUPS.map(group => {
          const isExpanded = expandedGroups.has(group.id);
          const hasActiveItem = group.items.some(item => item.id === activeTab);

          return (
            <div key={group.id} className="mb-0.5">
              {/* Group Header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={`w-full flex items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  hasActiveItem
                    ? 'text-blue-600 bg-blue-50/50'
                    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50/50'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-sm">{group.emoji}</span>
                  {group.label}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Group Items */}
              {isExpanded && (
                <div className="px-2 pb-1">
                  {group.items.map(item => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                          isActive
                            ? 'bg-blue-50 text-blue-700 font-medium shadow-sm'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </div>
    </aside>
  );
}

/* ─── Mobile Drawer ─── */
interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout: () => void;
}

export function MobileDrawer({ isOpen, onClose, activeTab, onTabChange, onLogout }: MobileDrawerProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    const activeGroup = findGroupForTab(activeTab);
    if (activeGroup) initial.add(activeGroup);
    return initial;
  });

  useEffect(() => {
    const group = findGroupForTab(activeTab);
    if (group && !expandedGroups.has(group)) {
      setExpandedGroups(prev => new Set([...prev, group]));
    }
  }, [activeTab]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleTabClick = (tabId: string) => {
    onTabChange(tabId);
    onClose();
  };

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`md:hidden fixed top-0 left-0 bottom-0 w-72 bg-white z-50 shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Drawer Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-slate-800 rounded-xl flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm text-gray-900">Панель</p>
              <p className="text-[11px] text-gray-400">Управление</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          {/* Home link */}
          <Link
            to="/"
            onClick={onClose}
            className="flex items-center gap-2.5 px-5 py-2.5 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
          >
            <HomeIcon className="h-4 w-4" /> На сайт
          </Link>

          <div className="h-px bg-gray-100 mx-4 my-1" />

          {MENU_GROUPS.map(group => {
            const isExpanded = expandedGroups.has(group.id);
            const hasActiveItem = group.items.some(item => item.id === activeTab);

            return (
              <div key={group.id} className="mb-0.5">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between px-5 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors ${
                    hasActiveItem
                      ? 'text-blue-600 bg-blue-50/50'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50/50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm">{group.emoji}</span>
                    {group.label}
                  </span>
                  {isExpanded ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-3 pb-1">
                    {group.items.map(item => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleTabClick(item.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all ${
                            isActive
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-100 bg-white">
          <button
            onClick={() => { onLogout(); onClose(); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" /> Выйти
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Mobile Header with Burger ─── */
interface MobileHeaderProps {
  activeTab: string;
  onMenuOpen: () => void;
  onLogout: () => void;
}

export function MobileHeader({ activeTab, onMenuOpen, onLogout }: MobileHeaderProps) {
  // Find current tab label
  let currentLabel = 'Панель';
  for (const group of MENU_GROUPS) {
    const found = group.items.find(item => item.id === activeTab);
    if (found) { currentLabel = found.label; break; }
  }

  return (
    <div className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuOpen}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors active:scale-95"
        >
          <Menu className="w-5 h-5 text-gray-700" />
        </button>
        <div>
          <span className="font-bold text-gray-900 text-sm">{currentLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <Link to="/" className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
          <HomeIcon className="h-4 w-4 text-gray-600" />
        </Link>
        <button
          onClick={onLogout}
          className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center hover:bg-red-100 transition-colors"
        >
          <LogOut className="h-4 w-4 text-red-500" />
        </button>
      </div>
    </div>
  );
}

/* ─── Export all tab IDs for backward compatibility ─── */
export const ALL_TABS = MENU_GROUPS.flatMap(g => g.items);

/* ─── Find tab label by ID ─── */
export function getTabLabel(tabId: string): string {
  for (const group of MENU_GROUPS) {
    const found = group.items.find(item => item.id === tabId);
    if (found) return found.label;
  }
  return 'Панель';
}