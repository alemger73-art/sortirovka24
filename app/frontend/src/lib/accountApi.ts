import { getAPIBaseURL } from "@/lib/config";

const API_BASE = getAPIBaseURL().replace(/\/$/, "");

export type AccountRole = "user" | "master" | "driver" | "partner" | "admin" | "superadmin";

export function getAccountToken(): string {
  return localStorage.getItem("account_token") || "";
}

export function setAccountToken(token: string) {
  localStorage.setItem("account_token", token);
}

export function clearAccountToken() {
  localStorage.removeItem("account_token");
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccountToken();
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
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
    `${API_BASE}/api/v1/account/google/start?language=${encodeURIComponent(language)}`,
  requestSmsCode: (body: { phone: string }) => api<{ success: boolean; ttl_seconds: number; debug_code?: string; sms_pending_moderation?: boolean; on_screen_code_hint?: string }>("/api/v1/account/register/request-sms", { method: "POST", body: JSON.stringify(body) }),
  confirmRegistration: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/register/confirm", { method: "POST", body: JSON.stringify(body) }),
  register: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => api<{ success: boolean }>("/api/v1/account/logout", { method: "POST" }),
  me: () => api<any>("/api/v1/account/me"),
  updateMe: (body: any) => api<any>("/api/v1/account/me", { method: "PUT", body: JSON.stringify(body) }),
  changePassword: (body: { current_password: string; new_password: string }) =>
    api<{ success: boolean }>("/api/v1/account/me/change-password", { method: "POST", body: JSON.stringify(body) }),
  avatarUploadUrl: () => api<{ upload_url: string; image_url?: string }>("/api/v1/account/me/avatar-upload-url", { method: "POST" }),
  cabinet: () => api<any>("/api/v1/account/cabinet"),
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
  masterCabinet: () => api<any>("/api/v1/account/cabinet"),
  driverCabinet: () => api<any>("/api/v1/taxi/driver/cabinet"),
  partnerCabinet: () => api<any>("/api/v1/account/cabinet"),
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
