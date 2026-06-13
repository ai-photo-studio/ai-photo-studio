import { API_BASE_URL, type PaginatedResponse } from "../lib/api";
import type { AdminDashboardResponse, AdminPaymentRecord, AdminStatsResponse, AdminSubscriptionRecord, AdminWalletRecord } from "../lib/portal-types";
import type { PackageSummary } from "../lib/api";

const ADMIN_TOKEN_KEY = "ai-photo-studio-admin-access-token";
const ADMIN_REFRESH_KEY = "ai-photo-studio-admin-refresh-token";
const ADMIN_PROFILE_KEY = "ai-photo-studio-admin-profile";

export type AdminProfile = {
  id: string;
  email: string;
  name: string | null;
  role: "SUPER_ADMIN" | "OPERATIONS" | "FINANCE" | "SUPPORT" | "READ_ONLY";
  isActive: boolean;
};

const storage = {
  get(key: string) {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(key) || "";
  },
  set(key: string, value: string) {
    if (typeof window === "undefined") return;
    if (!value) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, value);
  }
};

const parseJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `Request failed (${response.status})`);
  return (payload?.data ?? payload) as T;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");
  const token = storage.get(ADMIN_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  return parseJson<T>(response);
}

export const adminApi = {
  getToken: () => storage.get(ADMIN_TOKEN_KEY),
  getRefreshToken: () => storage.get(ADMIN_REFRESH_KEY),
  getProfile: (): AdminProfile | null => {
    const raw = storage.get(ADMIN_PROFILE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AdminProfile;
    } catch {
      storage.set(ADMIN_PROFILE_KEY, "");
      return null;
    }
  },
  setSession: (session: { accessToken: string; refreshToken: string; user: AdminProfile }) => {
    storage.set(ADMIN_TOKEN_KEY, session.accessToken);
    storage.set(ADMIN_REFRESH_KEY, session.refreshToken);
    storage.set(ADMIN_PROFILE_KEY, JSON.stringify(session.user));
  },
  clearSession: () => {
    storage.set(ADMIN_TOKEN_KEY, "");
    storage.set(ADMIN_REFRESH_KEY, "");
    storage.set(ADMIN_PROFILE_KEY, "");
  },
  login: (email: string, password: string) =>
    request<{ accessToken: string; refreshToken: string; user: AdminProfile; expiresIn: string }>("/api/admin/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }),
  refresh: () =>
    request<{ accessToken: string; refreshToken: string; user: AdminProfile; expiresIn: string }>("/api/admin/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: storage.get(ADMIN_REFRESH_KEY) })
    }),
  me: () => request<AdminProfile>("/api/admin/auth/me"),
  logout: () =>
    request<{ loggedOut: boolean }>("/api/admin/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: storage.get(ADMIN_REFRESH_KEY) })
    }),
  dashboard: () => request<AdminDashboardResponse>("/api/admin/dashboard"),
  stats: () => request<AdminStatsResponse>("/api/admin/stats"),
  orders: (query = "") => request<PaginatedResponse<any>>(`/api/admin/orders${query ? `?${query}` : ""}`),
  orderDetail: (id: string) => request<any>(`/api/admin/orders/${id}`),
  failedJobs: () => request<any[]>("/api/admin/failed-jobs"),
  jobs: (query = "") => request<PaginatedResponse<any>>(`/api/admin/jobs${query ? `?${query}` : ""}`),
  payments: (query = "") => request<PaginatedResponse<AdminPaymentRecord>>(`/api/admin/payments${query ? `?${query}` : ""}`),
  wallets: (query = "") => request<PaginatedResponse<AdminWalletRecord>>(`/api/admin/wallets${query ? `?${query}` : ""}`),
  subscriptions: (query = "") => request<PaginatedResponse<AdminSubscriptionRecord>>(`/api/admin/subscriptions${query ? `?${query}` : ""}`),
  customers: (query = "") => request<PaginatedResponse<{ id: string; email: string; name: string | null; phone: string | null; orders: number; walletBalance: number; createdAt: string }>>(`/api/admin/customers${query ? `?${query}` : ""}`),
  packages: (query = "") => request<PaginatedResponse<PackageSummary>>(`/api/admin/packages${query ? `?${query}` : ""}`),
  retryOrder: (id: string) => request<any>(`/api/admin/orders/${id}/retry`, { method: "POST" }),
  sendAgain: (id: string) => request<any>(`/api/admin/orders/${id}/send-again`, { method: "POST" }),
  retryJob: (id: string) => request<any>(`/api/admin/jobs/${id}/retry`, { method: "POST" }),
  approvePayment: (id: string) => request<any>(`/api/admin/payments/${id}/approve`, { method: "POST" }),
  rejectPayment: (id: string, reason?: string) =>
    request<any>(`/api/admin/payments/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || "Rejected from admin UI" })
    }),
  approveManualPayment: (orderId: string) => request<any>(`/api/admin/orders/${orderId}/approve-manual-payment`, { method: "POST" }),
  rejectManualPayment: (orderId: string, reason?: string) =>
    request<any>(`/api/admin/orders/${orderId}/reject-manual-payment`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || "Rejected from admin UI" })
    }),
  upsertPackage: (payload: Record<string, unknown>) =>
    request<any>("/api/admin/packages", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
