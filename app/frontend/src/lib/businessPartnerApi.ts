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
};
