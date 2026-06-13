import { getAccountToken } from '@/lib/accountApi';
import { getAPIBaseURL } from '@/lib/config';

const API_BASE = getAPIBaseURL().replace(/\/$/, '');

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccountToken();
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
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
  price?: number;
  eta_minutes?: number;
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
  estimated_price: number;
  final_price?: number | null;
  status: string;
  payment_method: string;
  comment?: string | null;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  driver?: TaxiDriverInfo;
  rating?: number | null;
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
  };
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
}

export const taxiApi = {
  settings: () => api<TaxiSettings>('/api/v1/taxi/settings'),

  quote: (body: { from_point: { address?: string; lat?: number; lng?: number }; to_point: { address?: string; lat?: number; lng?: number } }) =>
    api<TaxiQuote>('/api/v1/taxi/quote', { method: 'POST', body: JSON.stringify(body) }),

  geocode: (body: { address?: string; lat?: number; lng?: number }) =>
    api<TaxiLocation>('/api/v1/taxi/geocode', { method: 'POST', body: JSON.stringify(body) }),

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

  updateDriverProfile: (body: { car_make?: string; car_model?: string; car_number?: string; car_color?: string; phone?: string }) =>
    api<{ success: boolean }>('/api/v1/taxi/driver/profile', { method: 'PUT', body: JSON.stringify(body) }),

  acceptRide: (id: number) => api<TaxiRide>(`/api/v1/taxi/driver/rides/${id}/accept`, { method: 'POST' }),

  updateRideStatus: (id: number, status: string) =>
    api<TaxiRide>(`/api/v1/taxi/driver/rides/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),

  adminSettings: () => api<Record<string, string>>('/api/v1/taxi/admin/settings'),

  adminUpdateSettings: (settings: Record<string, string>) =>
    api<Record<string, string>>('/api/v1/taxi/admin/settings', { method: 'PUT', body: JSON.stringify({ settings }) }),

  adminRides: (status?: string) =>
    api<TaxiRide[]>(`/api/v1/taxi/admin/rides${status ? `?status=${encodeURIComponent(status)}` : ''}`),

  adminDrivers: () => api<any[]>('/api/v1/taxi/admin/drivers'),

  adminVerifyDriver: (userId: string, verified: boolean) =>
    api<{ success: boolean }>(`/api/v1/taxi/admin/drivers/${userId}/verify`, {
      method: 'PUT',
      body: JSON.stringify({ verified }),
    }),

  adminStats: () => api<TaxiAdminStats>('/api/v1/taxi/admin/stats'),
};

export const TAXI_STATUS_LABELS: Record<string, { label: string; color: string; emoji: string }> = {
  pending: { label: 'Ищем водителя', color: 'bg-yellow-100 text-yellow-900', emoji: '🔍' },
  accepted: { label: 'Водитель едет к вам', color: 'bg-blue-100 text-blue-900', emoji: '🚗' },
  driver_arrived: { label: 'Водитель на месте', color: 'bg-indigo-100 text-indigo-900', emoji: '📍' },
  in_progress: { label: 'В пути', color: 'bg-purple-100 text-purple-900', emoji: '🛣️' },
  completed: { label: 'Завершена', color: 'bg-green-100 text-green-900', emoji: '✅' },
  cancelled: { label: 'Отменена', color: 'bg-red-100 text-red-900', emoji: '❌' },
};

export const DRIVER_STATUS_FLOW: Record<string, { next: string; label: string }> = {
  accepted: { next: 'driver_arrived', label: 'На месте' },
  driver_arrived: { next: 'in_progress', label: 'Начать поездку' },
  in_progress: { next: 'completed', label: 'Завершить' },
};

export function formatTenge(n: number) {
  return `${Math.round(n).toLocaleString('ru-RU')} ₸`;
}
