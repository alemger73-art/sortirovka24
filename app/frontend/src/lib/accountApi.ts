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
  register: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/accounts/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: any) => api<{ token: string; user_id: string; role: AccountRole }>("/api/v1/accounts/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => api<any>("/api/v1/accounts/me/profile"),
  updateMe: (body: any) => api<any>("/api/v1/accounts/me/profile", { method: "PUT", body: JSON.stringify(body) }),
  cabinet: () => api<any>("/api/v1/accounts/me/cabinet"),
  masterCabinet: () => api<any>("/api/v1/accounts/master/cabinet"),
  driverCabinet: () => api<any>("/api/v1/accounts/driver/cabinet"),
  partnerCabinet: () => api<any>("/api/v1/accounts/partner/cabinet"),
  adminUsers: () => api<any[]>("/api/v1/accounts/admin/users"),
  adminModeration: () => api<any>("/api/v1/accounts/admin/moderation"),
  adminPayments: () => api<any[]>("/api/v1/accounts/admin/payments"),
  adminBonuses: () => api<any[]>("/api/v1/accounts/admin/bonuses"),
  adminFeatureToggles: () => api<any[]>("/api/v1/accounts/admin/feature-toggles"),
  adminLogs: () => api<any[]>("/api/v1/accounts/admin/logs"),
};
