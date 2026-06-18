import { getAccountToken } from '@/lib/accountApi';
import { getAPIBaseURL } from '@/lib/config';
import { humanizeApiError } from '@/lib/apiErrors';

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

function getAdminToken(): string {
  try {
    return (
      localStorage.getItem('_sp924_token') ||
      localStorage.getItem('token') ||
      getAccountToken() ||
      ''
    );
  } catch {
    return getAccountToken() || '';
  }
}

async function api<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const authToken = token ?? getAccountToken();
  let resp: Response;
  try {
    resp = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(humanizeApiError(err));
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    let message = txt || `HTTP ${resp.status}`;
    try {
      const parsed = JSON.parse(txt);
      if (typeof parsed.detail === 'string') message = parsed.detail;
    } catch {
      /* keep raw */
    }
    throw new Error(message);
  }
  if (resp.status === 204) return undefined as T;
  const text = await resp.text();
  if (!text) return null as T;
  return JSON.parse(text) as T;
}

async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  return api<T>(path, init, getAdminToken());
}

export interface LogisticsCourierInfo {
  name: string;
  phone?: string;
  rating?: number;
  vehicle_type?: string;
  photo_url?: string;
}

export interface LogisticsTracking {
  courier_lat?: number | null;
  courier_lng?: number | null;
  eta_minutes?: number | null;
  eta_label?: string;
  phase?: string;
}

export interface LogisticsTask {
  id: number;
  vertical: string;
  source_type: string;
  source_id: number;
  status: string;
  pickup_address: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_address: string;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  customer_name?: string;
  customer_phone?: string;
  merchant_name?: string;
  prep_minutes?: number;
  ready_at?: string;
  courier_id?: string | null;
  offered_courier_id?: string | null;
  offer_expires_at?: string | null;
  offer_seconds_left?: number;
  total_amount?: number | null;
  delivery_fee?: number | null;
  comment?: string | null;
  created_at?: string;
  courier?: LogisticsCourierInfo;
  tracking?: LogisticsTracking;
}

export interface CourierApplication {
  user_id?: string;
  full_name?: string;
  phone?: string;
  vehicle_type?: string;
  vehicle_plate?: string;
  comment?: string;
  photo_url?: string;
  id_photo_url?: string;
  vehicle_photo_url?: string;
  status: string;
  admin_note?: string;
  reviewed_at?: string;
  created_at?: string;
  is_courier?: boolean;
  can_access_cabinet?: boolean;
}

export interface CourierAccess {
  status: string;
  is_courier: boolean;
  can_access_cabinet: boolean;
  application?: CourierApplication | null;
}

export interface CourierProfile {
  online: boolean;
  verified: boolean;
  vehicle_type: string;
  rating: number;
  deliveries_count: number;
  phone?: string;
  name?: string;
  photo_url?: string;
}

export interface CourierCabinet {
  profile: CourierProfile;
  offered_task: LogisticsTask | null;
  available_tasks: LogisticsTask[];
  active_task: LogisticsTask | null;
  task_history: LogisticsTask[];
  earnings: number;
  status_flow: Record<string, [string, string]>;
}

export const LOGISTICS_STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  pending: { label: 'Готовится', color: 'bg-amber-100 text-amber-800', emoji: '👨‍🍳' },
  ready: { label: 'Ищем курьера', color: 'bg-blue-100 text-blue-800', emoji: '🔍' },
  assigned: { label: 'Курьер назначен', color: 'bg-purple-100 text-purple-800', emoji: '📦' },
  picked_up: { label: 'Забрано', color: 'bg-indigo-100 text-indigo-800', emoji: '🏃' },
  on_the_way: { label: 'В пути', color: 'bg-green-100 text-green-800', emoji: '🛵' },
  delivered: { label: 'Доставлено', color: 'bg-gray-100 text-gray-800', emoji: '✅' },
  cancelled: { label: 'Отменено', color: 'bg-red-100 text-red-800', emoji: '❌' },
};

export const COURIER_STATUS_FLOW: Record<string, { next: string; label: string }> = {
  assigned: { next: 'picked_up', label: 'Забрал заказ' },
  picked_up: { next: 'on_the_way', label: 'Еду к клиенту' },
  on_the_way: { next: 'delivered', label: 'Доставлено' },
};

export function formatTenge(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return `${Math.round(v).toLocaleString('ru-RU')} ₸`;
}

export const logisticsApi = {
  getCourierAccess: () => api<CourierAccess>('/api/v1/logistics/courier/access'),

  getCourierApplication: () => api<CourierApplication>('/api/v1/logistics/courier/application'),

  submitCourierApplication: (body: {
    full_name: string;
    phone: string;
    vehicle_type: string;
    vehicle_plate?: string;
    comment?: string;
    photo_url: string;
    id_photo_url: string;
    vehicle_photo_url?: string;
  }) => api<CourierApplication>('/api/v1/logistics/courier/application', { method: 'POST', body: JSON.stringify(body) }),

  courierCabinet: () => api<CourierCabinet>('/api/v1/logistics/courier/cabinet'),

  setOnline: (online: boolean) =>
    api<{ online: boolean }>('/api/v1/logistics/courier/online', { method: 'PUT', body: JSON.stringify({ online }) }),

  updateLocation: (lat: number, lng: number) =>
    api<{ success: boolean }>('/api/v1/logistics/courier/location', { method: 'PUT', body: JSON.stringify({ lat, lng }) }),

  updateProfile: (body: { vehicle_type?: string; phone?: string; photo_url?: string }) =>
    api<{ success: boolean }>('/api/v1/logistics/courier/profile', { method: 'PUT', body: JSON.stringify(body) }),

  acceptTask: (id: number) => api<LogisticsTask>(`/api/v1/logistics/tasks/${id}/accept`, { method: 'POST' }),

  declineTask: (id: number) => api<LogisticsTask>(`/api/v1/logistics/tasks/${id}/decline`, { method: 'POST' }),

  updateTaskStatus: (id: number, status: string) =>
    api<LogisticsTask>(`/api/v1/logistics/tasks/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  getTask: (id: number) => api<LogisticsTask>(`/api/v1/logistics/tasks/${id}`),

  trackFoodOrder: (orderId: number) => api<LogisticsTask>(`/api/v1/logistics/track/food/${orderId}`),

  adminApplications: (status = 'pending') =>
    adminApi<CourierApplication[]>(`/api/v1/logistics/admin/applications?status=${status}`),

  adminApproveApplication: (userId: string, adminNote = '') =>
    adminApi<{ success: boolean }>(`/api/v1/logistics/admin/applications/${userId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: adminNote }),
    }),

  adminRejectApplication: (userId: string, adminNote = '') =>
    adminApi<CourierApplication>(`/api/v1/logistics/admin/applications/${userId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: adminNote }),
    }),

  adminTasks: (limit = 50) => adminApi<LogisticsTask[]>(`/api/v1/logistics/admin/tasks?limit=${limit}`),

  adminCouriers: () => adminApi<Array<CourierProfile & { user_id: string }>>('/api/v1/logistics/admin/couriers'),

  adminMarkReady: (taskId: number) =>
    adminApi<LogisticsTask>(`/api/v1/logistics/admin/tasks/${taskId}/ready`, { method: 'POST' }),
};
