const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  const json = await response.json();
  return json.data as T;
}

export const adminApi = {
  dashboard: () => request<any>("/api/admin/dashboard"),
  orders: (query = "") => request<any>(`/api/admin/orders${query ? `?${query}` : ""}`),
  orderDetail: (id: string) => request<any>(`/api/admin/orders/${id}`),
  failedJobs: () => request<any>("/api/admin/failed-jobs"),
  retryOrder: (id: string) => request<any>(`/api/admin/orders/${id}/retry`, { method: "POST" }),
  sendAgain: (id: string) => request<any>(`/api/admin/orders/${id}/send-again`, { method: "POST" }),
  retryJob: (id: string) => request<any>(`/api/admin/jobs/${id}/retry`, { method: "POST" })
};
