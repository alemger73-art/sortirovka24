import { apiUrl } from '@/lib/config';

const SESSION_KEY = '_sp924_token';

export interface BusinessPartnerRequest {
  id: number;
  name: string;
  phone: string;
  whatsapp?: string | null;
  activity: string;
  description?: string | null;
  status?: string | null;
  created_at?: string | null;
  category?: string | null;
  duplicate_of?: number | null;
  next_contact?: string | null;
  last_note?: string | null;
  last_activity_at?: string | null;
}

export interface PartnerTimelineItem {
  id: number;
  kind: string;
  title: string;
  text?: string | null;
  actor?: string | null;
  via?: string | null;
  at?: string | null;
}

function readToken(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY) || localStorage.getItem('token');
  } catch {
    return null;
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken();
  const resp = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'App-Host': globalThis?.window?.location?.origin ?? '',
      ...(init?.headers || {}),
    },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(detail || `HTTP ${resp.status}`);
  }
  return resp.json();
}

export const businessPartnerApi = {
  list: (status?: string) =>
    api<{ items: BusinessPartnerRequest[]; total: number }>(
      `/api/v1/business/admin/requests${status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : ''}`,
    ),

  updateStatus: (id: number, status: string) =>
    api<BusinessPartnerRequest>(`/api/v1/business/admin/requests/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  timeline: (id: number) => api<PartnerTimelineItem[]>(`/api/v1/business/admin/requests/${id}/timeline`),

  addNote: (id: number, text: string) =>
    api<PartnerTimelineItem>(`/api/v1/business/admin/requests/${id}/notes`, { method: 'POST', body: JSON.stringify({ text }) }),

  setNextContact: (id: number, at: string | null) =>
    api<PartnerTimelineItem>(`/api/v1/business/admin/requests/${id}/next-contact`, { method: 'POST', body: JSON.stringify({ at }) }),
};
