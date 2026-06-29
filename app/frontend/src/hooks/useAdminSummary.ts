import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';
import {
  fetchAdminSummary,
  TAB_BADGE_MAP,
  type AdminSummary,
  type AdminBadgeKey,
} from '@/lib/adminSummaryApi';
import { connectAdminSummaryWs } from '@/lib/adminSummaryWs';

/** Fallback HTTP poll when WebSocket is disconnected */
const FALLBACK_POLL_MS = 60_000;

const ALERT_LABELS: Record<AdminBadgeKey, string> = {
  master_requests_new: 'Новые заявки на мастера',
  become_master_pending: 'Заявки «Стать мастером»',
  announcements_pending: 'Объявления на модерации',
  complaints_new: 'Новые жалобы',
  real_estate_pending: 'Недвижимость на модерации',
  jobs_pending: 'Вакансии на модерации',
  food_orders_new: 'Новые заказы еды',
  park_orders_active: 'Активные заказы в парк',
  taxi_applications_pending: 'Заявки водителей такси',
  courier_applications_pending: 'Заявки курьеров',
  business_partner_new: 'Заявки партнёров',
};

interface AdminSummaryContextValue {
  summary: AdminSummary | null;
  loading: boolean;
  live: boolean;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

const AdminSummaryContext = createContext<AdminSummaryContextValue | null>(null);

export function AdminSummaryProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevCountsRef = useRef<Partial<Record<AdminBadgeKey, number>> | null>(null);
  const initialLoadRef = useRef(true);

  const applySummary = useCallback((data: AdminSummary) => {
    setSummary(data);
    setLastUpdated(new Date());

    if (!initialLoadRef.current && prevCountsRef.current) {
      for (const key of Object.keys(ALERT_LABELS) as AdminBadgeKey[]) {
        const label = ALERT_LABELS[key];
        const prev = prevCountsRef.current[key] ?? 0;
        const next = data[key] ?? 0;
        if (next > prev) {
          const tab = Object.entries(TAB_BADGE_MAP).find(([, k]) => k === key)?.[0];
          toast.info(`${label}: +${next - prev}`, {
            description: 'Появились новые необработанные элементы',
            action: tab
              ? {
                  label: 'Открыть',
                  onClick: () => {
                    globalThis?.window?.location?.assign(`/admin?tab=${tab}`);
                  },
                }
              : undefined,
            duration: 8000,
          });
        }
      }
    }

    const nextCounts: Partial<Record<AdminBadgeKey, number>> = {};
    for (const key of Object.keys(ALERT_LABELS) as AdminBadgeKey[]) {
      nextCounts[key] = data[key] ?? 0;
    }
    prevCountsRef.current = nextCounts;
    initialLoadRef.current = false;
    setLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAdminSummary();
      applySummary(data);
    } catch {
      // Silent on transient failures
    } finally {
      setLoading(false);
    }
  }, [applySummary]);

  useEffect(() => {
    const disconnect = connectAdminSummaryWs({
      onSummary: applySummary,
      onConnect: () => setLive(true),
      onDisconnect: () => setLive(false),
    });
    return disconnect;
  }, [applySummary]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (!live) refresh();
    }, FALLBACK_POLL_MS);
    return () => clearInterval(id);
  }, [refresh, live]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const onRefreshEvent = () => refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('admin-summary-refresh', onRefreshEvent);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('admin-summary-refresh', onRefreshEvent);
    };
  }, [refresh]);

  useEffect(() => {
    if (summary && summary.total_pending > 0) {
      document.title = `(${summary.total_pending}) Админ · SORTIROVKA24`;
    } else {
      document.title = 'Админ · SORTIROVKA24';
    }
    return () => {
      document.title = 'SORTIROVKA24';
    };
  }, [summary?.total_pending]);

  return createElement(
    AdminSummaryContext.Provider,
    { value: { summary, loading, live, refresh, lastUpdated } },
    children,
  );
}

export function useAdminSummary() {
  const ctx = useContext(AdminSummaryContext);
  if (!ctx) {
    throw new Error('useAdminSummary must be used within AdminSummaryProvider');
  }
  return ctx;
}

/** Safe hook for components outside provider (returns nulls) */
export function useAdminSummaryOptional() {
  return useContext(AdminSummaryContext);
}
