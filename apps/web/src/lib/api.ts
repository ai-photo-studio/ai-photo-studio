const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const DEFAULT_PRODUCTION_API_URL = "https://ai-photo-studio-api-108335160641.us-central1.run.app";
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

  return (payload?.data ?? payload) as T;
};

export const apiRequest = async <T>(path: string, init: RequestInit = {}, token?: string): Promise<T> => {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  return parseResponse<T>(response);
};
