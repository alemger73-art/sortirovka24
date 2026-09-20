import { useLanguage } from '@/contexts/LanguageContext';
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
  master_requests_new: "admin.dam.final.201",
  become_master_pending: "admin.dam.final.202",
  announcements_pending: "admin.dam.final.203",
  complaints_new: "admin.dam.final.204",
  real_estate_pending: "admin.dam.final.205",
  jobs_pending: "admin.dam.final.206",
  food_orders_new: "admin.dam.final.207",
  taxi_applications_pending: "admin.dam.final.209",
  courier_applications_pending: "admin.dam.final.210",
  business_partner_new: "admin.dam.final.211",
};

interface AdminSummaryContextValue {
  summary: AdminSummary | null;
  loading: boolean;
  live: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

const AdminSummaryContext = createContext<AdminSummaryContextValue | null>(null);

export function AdminSummaryProvider({ children }: { children: ReactNode }) {
  const { t: adminT, lang } = useLanguage();
  const translationRef = useRef(adminT);
  translationRef.current = adminT;
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(false);
  const revisionRef = useRef(0);
  const [live, setLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevCountsRef = useRef<Partial<Record<AdminBadgeKey, number>> | null>(null);
  const initialLoadRef = useRef(true);

  const applySummary = useCallback((data: AdminSummary) => {
    revisionRef.current += 1;
    setError(null);
    setSummary(data);
    setLastUpdated(new Date());

    if (!initialLoadRef.current && prevCountsRef.current) {
      for (const key of Object.keys(ALERT_LABELS) as AdminBadgeKey[]) {
        const label = translationRef.current(ALERT_LABELS[key]);
        const prev = prevCountsRef.current[key] ?? 0;
        const next = data[key] ?? 0;
        if (next > prev) {
          const tab = Object.entries(TAB_BADGE_MAP).find(([, k]) => k === key)?.[0];
          toast.info(`${label}: +${next - prev}`, {
            description: translationRef.current('admin.dam.final.212'),
            action: tab
              ? {
                  label: translationRef.current('admin.dam.final.213'),
                  onClick: () => {
                    globalThis?.window?.location?.assign(`/admin?tab=${tab}${tab === 'dam-alem' ? '&section=orders' : ''}`);
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
    if (requestRef.current) return;
    requestRef.current = true;
    setLoading(true);
    const revision = revisionRef.current;
    try {
      const data = await fetchAdminSummary();
      if (revision === revisionRef.current) applySummary(data);
    } catch {
      if (revision === revisionRef.current) setError('admin.dam.final.214');
    } finally {
      requestRef.current = false;
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
      document.title = adminT('admin.dam.final.215').replace('{0}', () => summary.total_pending.toLocaleString(lang === 'kz' ? 'kk-KZ' : 'ru-RU'));
    } else {
      document.title = adminT('admin.dam.final.216');
    }
    return () => {
      document.title = 'SORTIROVKA24';
    };
  }, [summary?.total_pending, adminT, lang]);

  return createElement(
    AdminSummaryContext.Provider,
    { value: { summary, loading, live, error: error ? adminT(error) : null, refresh, lastUpdated } },
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
