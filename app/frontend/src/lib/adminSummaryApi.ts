import { apiUrl } from '@/lib/config';

const SESSION_KEY = '_sp924_token';

export interface AdminRecentItem {
  type: string;
  id: number;
  title: string;
  subtitle: string;
  tab: string;
  created_at: string | null;
}

export interface AdminSummary {
  master_requests_new: number;
  become_master_pending: number;
  announcements_pending: number;
  complaints_new: number;
  real_estate_pending: number;
  jobs_pending: number;
  food_orders_new: number;
  park_orders_active: number;
  taxi_applications_pending: number;
  courier_applications_pending: number;
  business_partner_new: number;
  total_pending: number;
  updated_at: string;
  recent: AdminRecentItem[];
}

export type AdminBadgeKey = keyof Pick<
  AdminSummary,
  | 'master_requests_new'
  | 'become_master_pending'
  | 'announcements_pending'
  | 'complaints_new'
  | 'real_estate_pending'
  | 'jobs_pending'
  | 'food_orders_new'
  | 'park_orders_active'
  | 'taxi_applications_pending'
  | 'courier_applications_pending'
  | 'business_partner_new'
>;

/** Maps admin sidebar tab id → summary count field */
export const TAB_BADGE_MAP: Record<string, AdminBadgeKey> = {
  'master-requests': 'master_requests_new',
  'become-master': 'become_master_pending',
  announcements: 'announcements_pending',
  complaints: 'complaints_new',
  'real-estate': 'real_estate_pending',
  jobs: 'jobs_pending',
  'dam-alem': 'food_orders_new',
  'park-orders': 'park_orders_active',
  taxi: 'taxi_applications_pending',
  logistics: 'courier_applications_pending',
  'partners-business': 'business_partner_new',
};

function readToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) || localStorage.getItem('token');
  } catch {
    return null;
  }
}

export async function fetchAdminSummary(): Promise<AdminSummary> {
  const token = readToken();
  if (!token) throw new Error('Не авторизован');

  const resp = await fetch(apiUrl('/api/v1/admin/summary'), {
    headers: {
      Authorization: `Bearer ${token}`,
      'App-Host': globalThis?.window?.location?.origin ?? '',
    },
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || `HTTP ${resp.status}`);
  }

  return resp.json();
}

export function getTabBadgeCount(summary: AdminSummary | null, tabId: string): number {
  if (!summary) return 0;
  if (tabId === 'dashboard') return summary.total_pending;
  const key = TAB_BADGE_MAP[tabId];
  if (!key) return 0;
  return summary[key] ?? 0;
}

export function notifyAdminSummaryRefresh() {
  try {
    window.dispatchEvent(new Event('admin-summary-refresh'));
  } catch {
    // ignore
  }
}

export function getGroupBadgeCount(summary: AdminSummary | null, tabIds: string[]): number {
  return tabIds.reduce((sum, id) => sum + getTabBadgeCount(summary, id), 0);
}
