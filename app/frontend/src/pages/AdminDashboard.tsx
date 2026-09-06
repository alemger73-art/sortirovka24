import { useCallback } from 'react';
import {
  AlertTriangle, Bell, Bike, Briefcase, Building2, Car, ClipboardList,
  Loader2, Megaphone, RefreshCw, TreePine, UserPlus, Utensils, Wrench, Handshake,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

const CARDS: DashboardCard[] = [
  {
    key: 'master_requests_new',
    tab: 'master-requests',
    label: 'Заявки на мастера',
    description: 'Новые, не взятые в работу',
    icon: ClipboardList,
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  },
  {
    key: 'become_master_pending',
    tab: 'become-master',
    label: 'Стать мастером',
    description: 'Ожидают одобрения',
    icon: UserPlus,
    color: 'bg-orange-50 border-orange-200 text-orange-800',
  },
  {
    key: 'announcements_pending',
    tab: 'announcements',
    label: 'Объявления',
    description: 'На модерации',
    icon: Megaphone,
    color: 'bg-amber-50 border-amber-200 text-amber-800',
  },
  {
    key: 'complaints_new',
    tab: 'complaints',
    label: 'Жалобы',
    description: 'Новые, не обработаны',
    icon: AlertTriangle,
    color: 'bg-red-50 border-red-200 text-red-800',
  },
  {
    key: 'real_estate_pending',
    tab: 'real-estate',
    label: 'Недвижимость',
    description: 'На модерации',
    icon: Building2,
    color: 'bg-blue-50 border-blue-200 text-blue-800',
  },
  {
    key: 'jobs_pending',
    tab: 'jobs',
    label: 'Вакансии',
    description: 'На модерации',
    icon: Briefcase,
    color: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  },
  {
    key: 'food_orders_new',
    tab: 'dam-alem',
    label: 'Заказы DAM ALEM 2.0',
    description: 'Новые заказы',
    icon: Utensils,
    color: 'bg-green-50 border-green-200 text-green-800',
  },
  {
    key: 'park_orders_active',
    tab: 'park-orders',
    label: 'Заказы в парк',
    description: 'Активные доставки',
    icon: TreePine,
    color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  },
  {
    key: 'taxi_applications_pending',
    tab: 'taxi',
    label: 'Водители такси',
    description: 'Заявки на подключение',
    icon: Car,
    color: 'bg-sky-50 border-sky-200 text-sky-800',
  },
  {
    key: 'courier_applications_pending',
    tab: 'logistics',
    label: 'Курьеры',
    description: 'Заявки на подключение',
    icon: Bike,
    color: 'bg-violet-50 border-violet-200 text-violet-800',
  },
  {
    key: 'business_partner_new',
    tab: 'partners-business',
    label: 'Заявки партнёров',
    description: 'Новые заявки на сотрудничество',
    icon: Handshake,
    color: 'bg-pink-50 border-pink-200 text-pink-800',
  },
];

const RECENT_TYPE_LABELS: Record<string, string> = {
  master_request: 'Заявка на мастера',
  become_master: 'Стать мастером',
  announcement: 'Объявление',
  complaint: 'Жалоба',
  food_order: 'Заказ еды',
  business_partner: 'Заявка партнёра',
};

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
}

export default function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const { summary, loading, refresh, lastUpdated, live } = useAdminSummary();

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
  const allClear = total === 0;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Операционный центр</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {allClear
              ? 'Все заявки обработаны — отличная работа!'
              : `${total} ${total === 1 ? 'задача требует' : 'задач требуют'} внимания`}
          </p>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-1">
              Обновлено: {lastUpdated.toLocaleTimeString('ru-RU')}
              {live ? ' · live WebSocket' : ' · резервный режим (HTTP)'}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </Button>
      </div>

      {/* Alert banner */}
      {!allClear && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-amber-900 text-sm">
              {total} необработанных {total === 1 ? 'элемент' : total < 5 ? 'элемента' : 'элементов'}
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              При появлении новых заявок вы получите уведомление. Telegram-бот также отправляет алерты.
            </p>
          </div>
          <Badge className="bg-amber-500 text-white text-base px-3 py-1 shrink-0">{total}</Badge>
        </div>
      )}

      {allClear && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5 text-green-600" />
          </div>
          <p className="text-sm text-green-800 font-medium">Нет необработанных заявок и модерации</p>
        </div>
      )}

      {/* Pending cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CARDS.map((card) => {
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

      {/* Recent activity feed */}
      {summary && summary.recent.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Последние необработанные</h3>
          <div className="space-y-2">
            {summary.recent.map((item) => (
              <Card
                key={`${item.type}-${item.id}`}
                className="cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => onNavigate(item.tab)}
              >
                <CardContent className="p-3 flex items-center gap-3">
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
                    <span className="text-[10px] text-gray-400 shrink-0">{formatDate(item.created_at)}</span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Quick stats when all clear but show zero cards summary */}
      {pendingCards.length === 0 && summary && (
        <p className="text-center text-sm text-gray-400 py-4">
          Мониторинг активен — новые заявки появятся здесь автоматически
        </p>
      )}
    </div>
  );
}
