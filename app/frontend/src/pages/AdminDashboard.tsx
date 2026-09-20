import { useLanguage } from '@/contexts/LanguageContext';
import { useCallback, useState } from 'react';
import {
  AlertTriangle, Bell, Bike, Briefcase, Building2, Car, ClipboardList,
  Loader2, Megaphone, RefreshCw, UserPlus, Utensils, Wrench, Handshake,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAdminSummary } from '@/hooks/useAdminSummary';
import { formatDate } from '@/lib/api';
import type { AdminBadgeKey } from '@/lib/adminSummaryApi';

interface DashboardCard {
  key: AdminBadgeKey;
  tab: string;
  label: string;
  description: string;
  icon: typeof Wrench;
  color: string;
}

function getCARDS(adminT: (key: string) => string) {
  const CARDS: DashboardCard[] = [
  {
    key: 'master_requests_new',
    tab: 'master-requests',
    label: adminT("admin.ui.0379"),
    description: adminT("admin.ui.0380"),
    icon: ClipboardList,
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  },
  {
    key: 'become_master_pending',
    tab: 'become-master',
    label: adminT("admin.ui.0381"),
    description: adminT("admin.ui.0382"),
    icon: UserPlus,
    color: 'bg-orange-50 border-orange-200 text-orange-800',
  },
  {
    key: 'announcements_pending',
    tab: 'announcements',
    label: adminT("admin.ui.0141"),
    description: adminT("admin.ui.0039"),
    icon: Megaphone,
    color: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  {
    key: 'complaints_new',
    tab: 'complaints',
    label: adminT("admin.ui.0383"),
    description: adminT("admin.ui.0384"),
    icon: AlertTriangle,
    color: 'bg-red-50 border-red-200 text-red-800',
  },
  {
    key: 'real_estate_pending',
    tab: 'real-estate',
    label: adminT("admin.ui.0140"),
    description: adminT("admin.ui.0039"),
    icon: Building2,
    color: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  {
    key: 'jobs_pending',
    tab: 'jobs',
    label: adminT("admin.ui.0385"),
    description: adminT("admin.ui.0039"),
    icon: Briefcase,
    color: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  },
  {
    key: 'food_orders_new',
    tab: 'food-orders',
    label: adminT("admin.ui.0386"),
    description: adminT("admin.ui.0387"),
    icon: Utensils,
    color: 'bg-green-50 border-green-200 text-green-800',
  },
  {
    key: 'taxi_applications_pending',
    tab: 'taxi',
    label: adminT("admin.ui.0390"),
    description: adminT("admin.ui.0391"),
    icon: Car,
    color: 'bg-sky-50 border-sky-200 text-sky-800',
  },
  {
    key: 'courier_applications_pending',
    tab: 'logistics',
    label: adminT("admin.ui.0392"),
    description: adminT("admin.ui.0391"),
    icon: Bike,
    color: 'bg-violet-50 border-violet-200 text-violet-800',
  },
  {
    key: 'business_partner_new',
    tab: 'partners-business',
    label: adminT("admin.ui.0393"),
    description: adminT("admin.ui.0394"),
    icon: Handshake,
    color: 'bg-pink-50 border-pink-200 text-pink-800',
  },
];
  return CARDS;
}

function getRECENT_TYPE_LABELS(adminT: (key: string) => string) {
  const RECENT_TYPE_LABELS: Record<string, string> = {
  master_request: adminT("admin.ui.0395"),
  become_master: adminT("admin.ui.0381"),
  announcement: adminT("admin.ui.0396"),
  complaint: adminT("admin.ui.0397"),
  food_order: adminT("admin.ui.0398"),
  business_partner: adminT("admin.ui.0399"),
};
  return RECENT_TYPE_LABELS;
}

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { t: adminT, lang } = useLanguage();
  const adminLocale = lang === 'kz' ? 'kk-KZ' : 'ru-RU';
  const CARDS = getCARDS(adminT);
  const RECENT_TYPE_LABELS = getRECENT_TYPE_LABELS(adminT);

  const { summary, loading, refresh, lastUpdated, error } = useAdminSummary();

  const [showAll, setShowAll] = useState(false);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const total = summary?.total_pending ?? 0;
  const pendingCards = CARDS.filter((c) => (summary?.[c.key] ?? 0) > 0);
  const allClear = !!summary && !error && total === 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{adminT("admin.ui.0400")}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {allClear
              ? adminT("admin.ui.0401")
              : error ? adminT("admin.ui.0402") : !summary ? adminT("admin.ui.0403") : adminT(total === 1 ? 'admin.dashboard.pendingOne' : 'admin.extra.1275').replace('{count}', () => String(total))}
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              {adminT("admin.ui.0406")} {lastUpdated.toLocaleTimeString(adminLocale)}
              {error ? adminT("admin.ui.0407") : ''}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {adminT("admin.ui.0408")} </Button>
      </div>

      {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}{summary && adminT("admin.ui.0409")}</div>}
      {/* Alert banner */}
      {summary && total > 0 && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900 text-sm">
              {total} {adminT("admin.ui.0015")} {total === 1 ? adminT("admin.ui.0410") : total < 5 ? adminT("admin.ui.0411") : adminT("admin.ui.0412")}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              {adminT("admin.ui.0413")} </p>
          </div>
          <Badge className="bg-amber-500 text-white text-base px-3 py-1 shrink-0">{total}</Badge>
        </div>
      )}

      {allClear && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-sm text-green-800 font-medium">{adminT("admin.ui.0414")}</p>
        </div>
      )}

      {/* Pending cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {(showAll ? CARDS : pendingCards).map((card) => {
          const count = summary?.[card.key] ?? 0;
          const Icon = card.icon;
          const isPending = count > 0;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => onNavigate(card.tab)}
              className={`text-left rounded-xl border p-4 transition-all hover:shadow-md active:scale-[0.98] ${
                isPending ? card.color : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isPending ? 'bg-white/60' : 'bg-gray-50'}`}>
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <span className={`text-2xl font-bold tabular-nums ${isPending ? '' : 'text-gray-300'}`}>
                  {count}
                </span>
              </div>
              <p className={`font-semibold text-sm mt-2 ${isPending ? '' : 'text-gray-500'}`}>{card.label}</p>
              <p className="text-xs mt-0.5 opacity-70">{card.description}</p>
            </button>
          );
        })}
      </div>

      {summary && <Button variant="outline" className="h-auto whitespace-normal" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? adminT("admin.ui.0415") : adminT("admin.ui.0416")}</Button>}
      {/* Recent activity feed */}
      {summary && summary.recent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{adminT("admin.ui.0417")}</h3>
          <div className="space-y-2">
            {summary.recent.map((item) => (
              <button
                type="button"
                key={`${item.type}-${item.id}`}
                className="w-full text-left rounded-xl border bg-white hover:shadow-sm transition-shadow"
                onClick={() => onNavigate(item.type === 'food_order' ? 'food-orders' : item.tab)}
              >
                <div className="p-3 flex flex-wrap items-center gap-3">
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {RECENT_TYPE_LABELS[item.type] || item.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                    {item.subtitle && (
                      <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
                    )}
                  </div>
                  {item.created_at && (
                    <span className="text-[10px] text-gray-400 shrink-0">{formatDate(item.created_at, lang)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
