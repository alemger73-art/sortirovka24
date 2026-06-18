import { getAccountToken } from '@/lib/accountApi';
import { getAPIBaseURL } from '@/lib/config';
import { humanizeApiError } from '@/lib/apiErrors';

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, '');
}

/** Admin panel uses _sp924_token; passengers/drivers use account_token */
export function getTaxiAdminToken(): string {
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
  return api<T>(path, init, getTaxiAdminToken());
}

export interface TaxiSettings {
  enabled: boolean;
  service_area: string;
  base_fare: number;
  per_km: number;
  min_fare: number;
  center_lat: number;
  center_lng: number;
  max_radius_km: number;
}

export interface TaxiLocation {
  lat: number;
  lng: number;
  address: string;
  detected_city?: string;
}

export interface TaxiAddressSuggestion {
  address: string;
  full_address?: string;
  lat: number;
  lng: number;
  local?: boolean;
}

export interface TaxiPriceBreakdown {
  base_fare: number;
  distance_km: number;
  distance_part: number;
  duration_min: number;
  time_part: number;
  subtotal: number;
  surge_multiplier: number;
  surge_part: number;
  total: number;
}

export interface TaxiQuote {
  available: boolean;
  message?: string;
  from_address?: string;
  to_address?: string;
  from_lat?: number;
  from_lng?: number;
  to_lat?: number;
  to_lng?: number;
  distance_km?: number;
  duration_minutes?: number;
  price?: number;
  eta_minutes?: number;
  surge_multiplier?: number;
  price_breakdown?: TaxiPriceBreakdown;
  route_type?: string;
  currency?: string;
}

export interface TaxiDriverInfo {
  name: string;
  phone?: string;
  car_make?: string;
  car_model?: string;
  car_number?: string;
  car_color?: string;
  rating?: number;
  rides_count?: number;
  photo_url?: string;
}

export interface TaxiRideTracking {
  driver_lat?: number | null;
  driver_lng?: number | null;
  eta_minutes?: number | null;
  eta_label?: string | null;
  phase?: string;
}

export interface TaxiRide {
  id: number;
  user_id: string;
  driver_id?: string | null;
  passenger_name?: string;
  passenger_phone?: string;
  from_address: string;
  to_address: string;
  from_lat?: number;
  from_lng?: number;
  to_lat?: number;
  to_lng?: number;
  distance_km?: number;
  duration_minutes?: number;
  surge_multiplier?: number;
  estimated_price: number;
  final_price?: number | null;
  status: string;
  offered_driver_id?: string | null;
  offer_expires_at?: string | null;
  offer_seconds_left?: number;
  payment_method: string;
  comment?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  driver?: TaxiDriverInfo;
  tracking?: TaxiRideTracking;
  rating?: number | null;
  rating_comment?: string | null;
  created_at?: string;
}

export interface DriverCabinet {
  profile: {
    online: boolean;
    verified: boolean;
    car_make?: string;
    car_model?: string;
    car_number?: string;
    car_color?: string;
    phone?: string;
    rating?: number;
    rides_count?: number;
    current_lat?: number;
    current_lng?: number;
    photo_url?: string;
    license_photo_url?: string;
    tech_passport_photo_url?: string;
    car_photo_url?: string;
    documents_status?: string;
    documents_note?: string;
  };
  offered_order: TaxiRide | null;
  available_orders: TaxiRide[];
  active_ride: TaxiRide | null;
  order_history: TaxiRide[];
  earnings: number;
}

export interface TaxiAdminStats {
  total_rides: number;
  completed_rides: number;
  pending_rides: number;
  active_rides: number;
  revenue: number;
  online_drivers: number;
  pending_applications?: number;
}

export interface DriverApplication {
  user_id: string;
  full_name?: string;
  phone?: string;
  car_make?: string;
  car_model?: string;
  car_number?: string;
  car_color?: string;
  comment?: string;
  photo_url?: string;
  license_photo_url?: string;
  tech_passport_photo_url?: string;
  car_photo_url?: string;
  status: string;
  admin_note?: string;
  is_driver?: boolean;
  account_name?: string;
  account_phone?: string;
  created_at?: string;
}

export const taxiApi = {
  settings: () => api<TaxiSettings>('/api/v1/taxi/settings'),

  quote: (body: { from_point: { address?: string; lat?: number; lng?: number }; to_point: { address?: string; lat?: number; lng?: number } }) =>
    api<TaxiQuote>('/api/v1/taxi/quote', { method: 'POST', body: JSON.stringify(body) }),

  geocode: (body: { address?: string; lat?: number; lng?: number }) =>
    api<TaxiLocation>('/api/v1/taxi/geocode', { method: 'POST', body: JSON.stringify(body) }),

  suggest: (query: string, limit = 6) =>
    api<{ suggestions: TaxiAddressSuggestion[] }>('/api/v1/taxi/suggest', {
      method: 'POST',
      body: JSON.stringify({ query, limit }),
    }),

  createRide: (body: {
    from_address: string;
    to_address: string;
    from_lat: number;
    from_lng: number;
    to_lat: number;
    to_lng: number;
    passenger_name: string;
    passenger_phone: string;
    estimated_price: number;
    distance_km: number;
    payment_method?: string;
    comment?: string;
  }) => api<TaxiRide>('/api/v1/taxi/rides', { method: 'POST', body: JSON.stringify(body) }),

  getRide: (id: number) => api<TaxiRide>(`/api/v1/taxi/rides/${id}`),

  getActiveRide: () => api<TaxiRide | null>('/api/v1/taxi/rides/active'),

  myRides: () => api<TaxiRide[]>('/api/v1/taxi/rides/my'),

  cancelRide: (id: number, reason?: string) =>
    api<TaxiRide>(`/api/v1/taxi/rides/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: reason || '' }) }),

  rateRide: (id: number, rating: number, comment?: string) =>
    api<TaxiRide>(`/api/v1/taxi/rides/${id}/rate`, { method: 'POST', body: JSON.stringify({ rating, comment: comment || '' }) }),

  driverCabinet: () => api<DriverCabinet>('/api/v1/taxi/driver/cabinet'),

  setOnline: (online: boolean) =>
    api<{ online: boolean }>('/api/v1/taxi/driver/online', { method: 'PUT', body: JSON.stringify({ online }) }),

  updateLocation: (lat: number, lng: number) =>
    api<{ success: boolean }>('/api/v1/taxi/driver/location', { method: 'PUT', body: JSON.stringify({ lat, lng }) }),

  updateDriverProfile: (body: {
    car_make?: string;
    car_model?: string;
    car_number?: string;
    car_color?: string;
    phone?: string;
    photo_url?: string;
    license_photo_url?: string;
    tech_passport_photo_url?: string;
    car_photo_url?: string;
  }) => api<{ success: boolean }>('/api/v1/taxi/driver/profile', { method: 'PUT', body: JSON.stringify(body) }),

  acceptRide: (id: number) => api<TaxiRide>(`/api/v1/taxi/driver/rides/${id}/accept`, { method: 'POST' }),

  declineRide: (id: number) =>
    api<{ success: boolean }>(`/api/v1/taxi/driver/rides/${id}/decline`, { method: 'POST' }),

  updateRideStatus: (id: number, status: string) =>
    api<TaxiRide>(`/api/v1/taxi/driver/rides/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  getDriverApplication: () => api<DriverApplication>('/api/v1/taxi/driver/application'),

  submitDriverApplication: (body: {
    full_name: string;
    phone: string;
    car_make: string;
    car_model: string;
    car_number: string;
    car_color?: string;
    comment?: string;
    photo_url?: string;
    license_photo_url?: string;
    tech_passport_photo_url?: string;
    car_photo_url?: string;
  }) => api<DriverApplication>('/api/v1/taxi/driver/application', { method: 'POST', body: JSON.stringify(body) }),

  adminSettings: () => adminApi<Record<string, string>>('/api/v1/taxi/admin/settings'),

  adminUpdateSettings: (settings: Record<string, string>) =>
    adminApi<Record<string, string>>('/api/v1/taxi/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),

  adminRides: (status?: string) =>
    adminApi<TaxiRide[]>(`/api/v1/taxi/admin/rides${status ? `?status=${encodeURIComponent(status)}` : ''}`),

  adminDrivers: () => adminApi<any[]>('/api/v1/taxi/admin/drivers'),

  adminApplications: (status = 'pending') =>
    adminApi<DriverApplication[]>(`/api/v1/taxi/admin/applications?status=${encodeURIComponent(status)}`),

  adminApproveApplication: (userId: string, admin_note?: string) =>
    adminApi<{ success: boolean }>(`/api/v1/taxi/admin/applications/${userId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: admin_note || '' }),
    }),

  adminRejectApplication: (userId: string, admin_note?: string) =>
    adminApi<{ success: boolean }>(`/api/v1/taxi/admin/applications/${userId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: admin_note || '' }),
    }),

  adminVerifyDriver: (userId: string, verified: boolean) =>
    adminApi<{ success: boolean }>(`/api/v1/taxi/admin/drivers/${userId}/verify`, {
      method: 'PUT',
      body: JSON.stringify({ verified }),
    }),

  adminStats: () => adminApi<TaxiAdminStats>('/api/v1/taxi/admin/stats'),
};

export const TAXI_STATUS_LABELS: Record<string, { label: string; labelKey: string; color: string; emoji: string }> = {
  pending: { label: 'Ищем водителя', labelKey: 'taxi.status.pending', color: 'bg-yellow-100 text-yellow-900', emoji: '🔍' },
  accepted: { label: 'Водитель едет к вам', labelKey: 'taxi.status.accepted', color: 'bg-blue-100 text-blue-900', emoji: '🚗' },
  driver_arrived: { label: 'Водитель на месте', labelKey: 'taxi.status.driver_arrived', color: 'bg-indigo-100 text-indigo-900', emoji: '📍' },
  in_progress: { label: 'В пути', labelKey: 'taxi.status.in_progress', color: 'bg-purple-100 text-purple-900', emoji: '🛣️' },
  completed: { label: 'Завершена', labelKey: 'taxi.status.completed', color: 'bg-green-100 text-green-900', emoji: '✅' },
  cancelled: { label: 'Отменена', labelKey: 'taxi.status.cancelled', color: 'bg-red-100 text-red-900', emoji: '❌' },
};

export const DRIVER_STATUS_FLOW: Record<string, { next: string; label: string; labelKey: string }> = {
  accepted: { next: 'driver_arrived', label: 'На месте', labelKey: 'taxi.flow.onPlace' },
  driver_arrived: { next: 'in_progress', label: 'Начать поездку', labelKey: 'taxi.flow.start' },
  in_progress: { next: 'completed', label: 'Завершить', labelKey: 'taxi.flow.finish' },
};

export function formatTenge(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}
