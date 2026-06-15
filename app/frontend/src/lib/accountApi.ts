import { getAPIBaseURL } from "@/lib/config";
import { humanizeApiError } from "@/lib/apiErrors";
import {
  clearPersistedAccountToken,
  persistAccountToken,
  readAccountToken,
} from "@/lib/sessionStore";

function apiBase(): string {
  return getAPIBaseURL().replace(/\/$/, "");
}

export type AccountRole = "user" | "master" | "driver" | "partner" | "admin" | "superadmin";

export function getAccountToken(): string {
  return readAccountToken();
}

export function setAccountToken(token: string) {
  persistAccountToken(token);
}

export function clearAccountToken() {
  clearPersistedAccountToken();
}

function readAdminToken(): string {
  try {
    return localStorage.getItem("token") || localStorage.getItem("_sp924_token") || "";
  } catch {
    return "";
  }
}

function authHeaders(): Record<string, string> {
  const token = getAccountToken() || readAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${apiBase()}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...(init?.headers || {}),
      },
    });
  } catch (err) {
    throw new Error(humanizeApiError(err));
  }
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    let message = txt || `HTTP ${resp.status}`;
    try {
      const parsed = JSON.parse(txt);
      if (typeof parsed.detail === "string") message = parsed.detail;
      else if (Array.isArray(parsed.detail)) message = parsed.detail.map((d: any) => d.msg || d).join(", ");
    } catch {
      // keep raw text
    }
    throw new Error(message);
  }
  return (await resp.json()) as T;
}

export const accountApi = {
  googleStatus: () => api<{ enabled: boolean }>("/api/v1/account/google/status"),
  googleStartUrl: (language: string = "ru") =>
    `${apiBase()}/api/v1/account/google/start?language=${encodeURIComponent(language)}`,
  requestSmsCode: (body: { phone: string }) => api<{ success: boolean; ttl_seconds: number; debug_code?: string; sms_pending_moderation?: boolean; on_screen_code_hint?: string }>("/api/v1/account/register/request-sms", { method: "POST", body: JSON.stringify(body) }),
  confirmRegistration: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/register/confirm", { method: "POST", body: JSON.stringify(body) }),
  register: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => api<{ success: boolean }>("/api/v1/account/logout", { method: "POST" }),
  me: () => api<any>("/api/v1/account/me"),
  updateMe: (body: any) => api<any>("/api/v1/account/me", { method: "PUT", body: JSON.stringify(body) }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    api<{ success: boolean }>("/api/v1/account/me/change-password", { method: "POST", body: JSON.stringify(body) }),
  setPassword: (body: { new_password: string }) =>
    api<{ success: boolean }>("/api/v1/account/me/set-password", { method: "POST", body: JSON.stringify(body) }),
  avatarUploadUrl: () =>
    api<{
      upload_url: string;
      image_url?: string;
      thumbnail_url?: string;
      object_key?: string;
      thumbnail_object_key?: string;
    }>('/api/v1/account/me/avatar-upload-url', { method: 'POST' }),
  cabinet: () => api<any>("/api/v1/account/cabinet"),
  masterCabinet: () => api<any>("/api/v1/account/master/cabinet"),
  updateMasterProfile: (body: Record<string, unknown>) =>
    api<{ success: boolean }>("/api/v1/account/master/profile", { method: "PUT", body: JSON.stringify(body) }),
  getMasterReviews: (masterId: number, skip = 0, limit = 20) =>
    api<{ items: any[]; total: number; avg_rating: number; skip: number; limit: number }>(
      `/api/v1/account/masters/${masterId}/reviews?skip=${skip}&limit=${limit}`,
    ),
  getMyMasterReview: (masterId: number) =>
    api<{ reviewed: boolean; review?: { id: number; rating: number; comment?: string; created_at?: string } }>(
      `/api/v1/account/masters/${masterId}/reviews/mine`,
    ),
  createMasterReview: (masterId: number, body: { rating: number; comment?: string }) =>
    api<{ success: boolean; id: number }>(`/api/v1/account/masters/${masterId}/reviews`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateMasterRequestStatus: (requestId: number, status: "in_progress" | "done") =>
    api<{ success: boolean; status: string }>(`/api/v1/account/master/requests/${requestId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  approveBecomeMasterRequest: (requestId: number) =>
    api<{ success: boolean; master_id: number; role_assigned: boolean }>(
      `/api/v1/account/admin/masters/approve-become-request/${requestId}`,
      { method: "POST" },
    ),
  partnerCabinet: () => api<any>("/api/v1/account/partner/cabinet"),
  adminDashboard: () => api<any>("/api/v1/account/admin/dashboard"),
  adminUsers: () => api<any[]>("/api/v1/account/admin/users"),
  adminRegistrations: () => api<any[]>("/api/v1/account/admin/registrations"),
  adminBonuses: () => api<any[]>("/api/v1/account/admin/bonuses"),
  adminOrders: () => api<any[]>("/api/v1/account/admin/orders"),
  adminComplaints: () => api<any[]>("/api/v1/account/admin/complaints"),
  adminAnnouncements: () => api<any[]>("/api/v1/account/admin/announcements"),
  adminLogs: () => api<any[]>("/api/v1/account/admin/logs"),
  adminSettings: () => api<any>("/api/v1/account/admin/settings"),
  // Compatibility aliases
  driverCabinet: () => api<any>("/api/v1/taxi/driver/cabinet"),
  adminModeration: async () => ({
    ads: await api<any[]>("/api/v1/account/admin/announcements"),
    complaints: await api<any[]>("/api/v1/account/admin/complaints"),
    news: [],
  }),
  adminPayments: () => Promise.resolve([] as any[]),
  adminFeatureToggles: () => Promise.resolve([] as any[]),
  adminUpdateUser: (userId: string, body: any) => api<{ success: boolean }>(`/api/v1/account/admin/users/${userId}`, { method: "PUT", body: JSON.stringify(body) }),
  adminDeleteUser: (userId: string) => api<{ success: boolean }>(`/api/v1/account/admin/users/${userId}`, { method: "DELETE" }),
};
