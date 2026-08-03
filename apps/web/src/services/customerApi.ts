import { apiRequest, type AuthSession } from "../lib/api";
import type {
  CustomerOrderResponse,
  CustomerPaymentsResponse,
  CustomerSubscriptionResponse,
  CustomerWalletResponse,
  RestorationOrderSummary,
  RestorationItemRecord,
  RestoreUploadResult,
  RestorationDraftRecord,
  DraftOffersResponse,
  FixedOrderRecord,
  PaymentReadinessResponse,
  PaymentAttemptRecord,
  CustomerFixedOrderListResponse
} from "../lib/portal-types";

type PaymentRequestInput = {
  orderNo: string;
};

type CreateOrderInput = {
  whatsappNumber: string;
  packageSlug: string;
  serviceType: string;
};

type WebUploadInput = {
  fileName: string;
  contentType: string;
  bodyBase64: string;
  workflowType: "PRODUCT" | "VEHICLE";
  workflowMode: string;
  selectedActions?: string[];
};

type BackgroundRemovalPreviewInput = {
  fileName: string;
  contentType: string;
  selectedActions?: string[];
  bodyBase64: string;
};

type CreateOrderResponse = {
  id: string;
  orderNo: string;
  amount: number;
  currency: string;
  package: {
    code: string;
    name: string;
    price: number;
  };
  paymentStatus: string;
  orderStatus: string;
};

type ManualProofInput = {
  orderNo: string;
  screenshotPath: string;
  screenshotStorageKey?: string;
  note?: string;
};

type PaymentStatusResponse = {
  orderNo: string;
  orderStatus: string;
  paymentStatus: string;
  latestPayment: {
    id: string;
    provider: string;
    status: string;
    checkoutUrl: string | null;
    providerRef: string | null;
    screenshotPath: string | null;
    reviewNotes: string | null;
    createdAt: string;
  } | null;
};

export const customerApi = {
  wallet: (token: string) => apiRequest<CustomerWalletResponse>("/api/me/wallet", {}, token),
  payments: (token: string, page = 1, limit = 10) =>
    apiRequest<CustomerPaymentsResponse>(`/api/me/payments?page=${page}&limit=${limit}`, {}, token),
  subscription: (token: string, page = 1, limit = 10) =>
    apiRequest<CustomerSubscriptionResponse>(`/api/me/subscription?page=${page}&limit=${limit}`, {}, token),
  createOrder: (token: string, input: CreateOrderInput) =>
    apiRequest<CreateOrderResponse>(
      "/api/orders",
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      token
    ),
  order: (orderNo: string, token?: string) => apiRequest<CustomerOrderResponse>(`/api/orders/${orderNo}`, {}, token),
  removeBackgroundPreview: (token: string | undefined, input: BackgroundRemovalPreviewInput) =>
    apiRequest<{ fileName: string; contentType: string; bodyBase64: string; disabledPreviewLimit?: boolean }>(
      "/api/previews/background-removal",
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      token
    ),
  uploadOrderImage: (token: string, orderNo: string, input: WebUploadInput) =>
    apiRequest<{
      orderNo: string;
      orderStatus: string;
      paymentStatus: string;
      originalImageId: string;
      orderItemId: string;
      processingJobId: string;
      queueResult: { dryRun: boolean; queueJobId?: string };
      image: { storageKey: string; url: string; expiresAt: string };
    }>(
      `/api/orders/${orderNo}/web-upload`,
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      token
    ),
  createPaymentRequest: (input: PaymentRequestInput) =>
    apiRequest<{ checkoutUrl: string; providerRef: string; providerName: string; instructions?: string; raw?: Record<string, unknown> }>(
      "/api/payments/create-checkout",
      {
        method: "POST",
        body: JSON.stringify(input)
      }
    ),
  submitManualProof: (token: string | null, input: ManualProofInput) =>
    apiRequest<{ id: string; status: string; provider: string; providerRef: string | null; checkoutUrl: string | null }>(
      "/api/payments/manual-proof",
      {
        method: "POST",
        body: JSON.stringify(input)
      },
      token || undefined
    ),
  trackPaymentStatus: (orderNo: string) => apiRequest<PaymentStatusResponse>(`/api/payments/${orderNo}/status`),
  refreshSession: (refreshToken: string) =>
    apiRequest<Omit<AuthSession, "user">>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken })
    }),

  createRestorationOrder: (token: string | undefined, title?: string, guestToken?: string) =>
    apiRequest<{ id: string; orderNo: string; status: string; title: string | null; createdAt: string; guestOwnershipToken?: string }>(
      "/api/restorations",
      { method: "POST", body: JSON.stringify({ title: title || "Photo Restoration" }) },
      token,
      guestToken
    ),

  getRestorationOrder: (token: string | undefined, id: string, signal?: AbortSignal, guestToken?: string) =>
    apiRequest<{ id: string; orderNo: string; title: string | null; status: string; entitlement: string; totalItems: number; completedItems: number; failedItems: number; createdAt: string; updatedAt: string; items: RestorationItemRecord[] }>(
      `/api/restorations/${id}`, { signal }, token, guestToken
    ),

  listRestorationOrders: (token: string) =>
    apiRequest<RestorationOrderSummary[]>("/api/restorations", {}, token),

  addRestorationItem: (token: string | undefined, orderId: string, fileName: string, contentType: string, bodyBase64: string, guestToken?: string) =>
    apiRequest<RestoreUploadResult>(
      `/api/restorations/${orderId}/items`,
      {
        method: "POST",
        body: JSON.stringify({ fileName, contentType, bodyBase64 })
      },
      token,
      guestToken
    ),

  processRestorationItem: (token: string | undefined, orderId: string, itemId: string, guestToken?: string) =>
    apiRequest<{ message: string }>(
      `/api/restorations/${orderId}/items/${itemId}/process`,
      { method: "POST", body: "{}" },
      token,
      guestToken
    ),

  getRestorationPreview: (token: string | undefined, orderId: string, itemId: string, guestToken?: string) =>
    apiRequest<{ previewKey: string; previewUrl: string }>(
      `/api/restorations/${orderId}/items/${itemId}/preview`,
      { method: "POST", body: "{}" },
      token,
      guestToken
    ),

  approveRestorationItem: (token: string, orderId: string, itemId: string, approved: boolean) =>
    apiRequest<{ approved: boolean }>(
      `/api/restorations/${orderId}/items/${itemId}/approve`,
      { method: "POST", body: JSON.stringify({ approved }) },
      token
    ),

  getRestorationDownload: (token: string | undefined, orderId: string, itemId: string, tier = "master", guestToken?: string) =>
    fetch(`${import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "https://api.thannow.com" : "http://localhost:4000")}/api/restorations/${orderId}/items/${itemId}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(guestToken ? { "x-guest-ownership-token": guestToken } : {})
      },
      body: JSON.stringify({ tier })
    }).then(async (response) => {
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || `Download failed (${response.status})`);
      }
      const contentType = response.headers.get("Content-Type")?.split(";")[0].toLowerCase() || "";
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new Error(`Download returned unsupported content type: ${contentType || "missing"}`);
      const blob = await response.blob();
      const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
      const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const isPng = bytes.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value, index) => bytes[index] === value);
      const isWebp = new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
      if (!blob.size || !isJpeg && !isPng && !isWebp) throw new Error("Download returned invalid image bytes");
      return { blob, fileName: response.headers.get("Content-Disposition") || `restoration-${tier}.${contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg"}` };
    }),

  runQualityAnalysis: (token: string, orderId: string, itemId: string) =>
    apiRequest<{ quality: Record<string, number>; damage: Record<string, unknown> }>(
      `/api/restorations/${orderId}/items/${itemId}/quality-analysis`,
      { method: "POST", body: "{}" },
      token
    )
};

// R9.2-P1A: free upload, original preview, digital tier selection, and
// immutable RESTORATION_DIGITAL fixed-order creation. No payment step here.
type CreateDraftInput = {
  country: string;
  marketConfirmed: boolean;
  fileName: string;
  contentType: string;
  bodyBase64: string;
};

export const restorationDraftApi = {
  createDraft: (input: CreateDraftInput, token?: string) =>
    apiRequest<RestorationDraftRecord>(
      "/api/restoration-drafts",
      { method: "POST", body: JSON.stringify(input) },
      token
    ),

  getDraft: (id: string, token?: string, guestToken?: string) =>
    apiRequest<RestorationDraftRecord>(`/api/restoration-drafts/${id}`, {}, token, guestToken),

  getOffers: (id: string, token?: string, guestToken?: string) =>
    apiRequest<DraftOffersResponse>(`/api/restoration-drafts/${id}/offers`, {}, token, guestToken)
};

export const fixedOrderApi = {
  createRestorationDigitalOrder: (draftId: string, tier: string, token?: string, guestToken?: string) =>
    apiRequest<FixedOrderRecord>(
      "/api/fixed-orders/restoration-digital",
      { method: "POST", body: JSON.stringify({ draftId, tier }) },
      token,
      guestToken
    ),

  getOrder: (orderNo: string, token?: string, guestToken?: string) =>
    apiRequest<FixedOrderRecord>(`/api/fixed-orders/${orderNo}`, {}, token, guestToken)
};

// R9.2-P2R-CUSTOMER-ORDERS: authenticated, read-only customer FixedOrder
// history list -- distinct from `fixedOrderApi.getOrder` (single-order
// detail, guest-capable, unchanged). This call always requires a token; the
// server derives ownership solely from that token, never from any
// client-supplied id.
export const customerFixedOrdersApi = {
  list: (
    token: string,
    params: { page?: number; pageSize?: number; status?: string; market?: string; currency?: string } = {}
  ) => {
    const query = new URLSearchParams();
    if (params.page) query.set("page", String(params.page));
    if (params.pageSize) query.set("pageSize", String(params.pageSize));
    if (params.status) query.set("status", params.status);
    if (params.market) query.set("market", params.market);
    if (params.currency) query.set("currency", params.currency);
    const qs = query.toString();
    return apiRequest<CustomerFixedOrderListResponse>(`/api/fixed-orders${qs ? `?${qs}` : ""}`, {}, token);
  }
};

// R9.2-P1B: payment readiness and PaymentAttempt lifecycle. Every call takes
// only the locked order number -- the client never sends an amount,
// currency, or provider; those always come from the server-held order.
export const paymentAttemptApi = {
  getReadiness: (orderNo: string, token?: string, guestToken?: string) =>
    apiRequest<PaymentReadinessResponse>(`/api/fixed-orders/${orderNo}/payment-readiness`, {}, token, guestToken),

  createAttempt: (orderNo: string, token?: string, guestToken?: string) =>
    apiRequest<PaymentAttemptRecord>(
      `/api/fixed-orders/${orderNo}/payment-attempts`,
      { method: "POST" },
      token,
      guestToken
    ),

  getAttempt: (orderNo: string, token?: string, guestToken?: string) =>
    apiRequest<PaymentAttemptRecord | null>(`/api/fixed-orders/${orderNo}/payment-attempt`, {}, token, guestToken)
};
