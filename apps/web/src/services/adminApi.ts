import { API_BASE_URL, type PaginatedResponse } from "../lib/api";
import type {
  AdminDashboardResponse,
  AdminPaymentRecord,
  AdminStatsResponse,
  AdminSubscriptionRecord,
  AdminWalletRecord
} from "../lib/portal-types";
import type { PackageSummary } from "../lib/api";

const ADMIN_TOKEN_KEY = "ai-photo-studio-admin-token";

const getToken = (): string => {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(ADMIN_TOKEN_KEY) || "";
};

const setToken = (token: string) => {
  if (typeof window === "undefined") return;
  if (!token) {
    window.localStorage.removeItem(ADMIN_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) {
    headers.set("x-admin-token", token);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed (${response.status})`);
  }

  return payload.data as T;
}

export const adminApi = {
  getToken,
  setToken,
  dashboard: () => request<AdminDashboardResponse>("/api/admin/dashboard"),
  stats: () => request<AdminStatsResponse>("/api/admin/stats"),
  orders: (query = "") => request<PaginatedResponse<any>>(`/api/admin/orders${query ? `?${query}` : ""}`),
  orderDetail: (id: string) => request<any>(`/api/admin/orders/${id}`),
  failedJobs: () => request<any[]>("/api/admin/failed-jobs"),
  payments: (query = "") => request<PaginatedResponse<AdminPaymentRecord>>(`/api/admin/payments${query ? `?${query}` : ""}`),
  wallets: (query = "") => request<PaginatedResponse<AdminWalletRecord>>(`/api/admin/wallets${query ? `?${query}` : ""}`),
  subscriptions: (query = "") => request<PaginatedResponse<AdminSubscriptionRecord>>(`/api/admin/subscriptions${query ? `?${query}` : ""}`),
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
