const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const DEFAULT_PRODUCTION_API_URL = "https://api.thannow.com";
const resolvedApiUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? DEFAULT_PRODUCTION_API_URL : "http://localhost:4000");

export const API_BASE_URL = trimTrailingSlash(resolvedApiUrl);

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  customerId: string | null;
};

export type AuthSession = {
  user: AuthUser;
  token: string;
  refreshToken: string;
  expiresIn?: string;
};

export type PackageSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  active: boolean;
  maxImages: number | null;
  includesJson: unknown;
  featured?: boolean;
  sortOrder?: number;
  creditsIncluded?: number;
  monthlyCreditLimit?: number;
  workflowType?: string;
  workflowMode?: string;
  sampleAssets?: Array<{
    id: string;
    title: string;
    type: string;
    storageKey: string;
    publicUrl: string | null;
    active: boolean;
  }>;
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
};

const parseResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(payload?.message || `Request failed (${response.status})`, response.status, payload?.code);
  }

  // `?? payload` previously collapsed an explicit, legitimate `data: null`
  // (e.g. "no PaymentAttempt exists yet") back to the whole envelope object,
  // since `??` treats `null` as nullish too. Checking for the `data` key
  // directly preserves a real null result instead of losing it.
  return (payload && typeof payload === "object" && "data" in payload ? payload.data : payload) as T;
};

export const apiRequest = async <T>(path: string, init: RequestInit = {}, token?: string, guestToken?: string): Promise<T> => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (guestToken) {
    headers.set("x-guest-ownership-token", guestToken);
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (response.status === 401 && token) {
    const stored = window.localStorage.getItem("ai-photo-studio-web-auth");
    if (stored) {
      try {
        const session = JSON.parse(stored) as { refreshToken?: string };
        if (session.refreshToken && !path.includes("/auth/refresh")) {
          const refreshed = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: session.refreshToken })
          });
          if (refreshed.ok) {
            const next = await refreshed.json();
            const nextSession = { ...session, ...next.data };
            window.localStorage.setItem("ai-photo-studio-web-auth", JSON.stringify(nextSession));
            headers.set("Authorization", `Bearer ${nextSession.token}`);
            response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
          }
        }
      } catch {
        // Preserve the original 401 when refresh cannot recover the session.
      }
    }
  }

  return parseResponse<T>(response);
};
