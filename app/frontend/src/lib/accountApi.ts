const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

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
    throw new Error(txt || `HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

export const accountApi = {
  requestSmsCode: (body: { phone: string }) => api<{ success: boolean; ttl_seconds: number; debug_code?: string }>("/api/v1/account/register/request-sms", { method: "POST", body: JSON.stringify(body) }),
  confirmRegistration: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/register/confirm", { method: "POST", body: JSON.stringify(body) }),
  register: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/account/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => api<{ success: boolean }>("/api/v1/account/logout", { method: "POST" }),
  me: () => api<any>("/api/v1/account/me"),
  updateMe: (body: any) => api<any>("/api/v1/account/me", { method: "PUT", body: JSON.stringify(body) }),
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
  driverCabinet: () => api<any>("/api/v1/account/cabinet"),
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
