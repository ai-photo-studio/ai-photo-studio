import { apiRequest, type AuthSession } from "../lib/api";
import type {
  CustomerOrderResponse,
  CustomerPaymentsResponse,
  CustomerSubscriptionResponse,
  LegacyRestorationOrderResponse,
  CustomerWalletResponse,
  RestorationOrderSummary,
  RestorationCustomerStatusResponse,
  RestorationCustomerDownloadResponse,
  RestoreUploadResult
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

  getLegacyRestorationOrder: (token: string | undefined, id: string, signal?: AbortSignal, guestToken?: string) =>
    apiRequest<LegacyRestorationOrderResponse>(
      `/api/restorations/${id}`, { signal }, token, guestToken
    ),

  getRestorationOrder: (token: string | undefined, id: string, signal?: AbortSignal, guestToken?: string) =>
    apiRequest<RestorationCustomerStatusResponse>(
      `/api/customer/restorations/${id}`, { signal }, token, guestToken
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

  getLegacyRestorationDownload: async (token: string | undefined, orderId: string, itemId: string, tier = "master", guestToken?: string) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "https://api.thannow.com" : "http://localhost:4000")}/api/restorations/${orderId}/items/${itemId}/download?tier=${encodeURIComponent(tier)}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(guestToken ? { "x-guest-ownership-token": guestToken } : {})
      }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || `Download failed (${response.status})`);
    }
    return response.blob();
  },

  getRestorationDownload: async (token: string | undefined, orderId: string, itemId: string, _tier = "master", guestToken?: string) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? "https://api.thannow.com" : "http://localhost:4000")}/api/customer/restorations/${orderId}/download/${itemId}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(guestToken ? { "x-guest-ownership-token": guestToken } : {})
      }
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || `Download failed (${response.status})`);
    }
    return response.json() as Promise<RestorationCustomerDownloadResponse>;
  },

  runQualityAnalysis: (token: string, orderId: string, itemId: string) =>
    apiRequest<{ quality: Record<string, number>; damage: Record<string, unknown> }>(
      `/api/restorations/${orderId}/items/${itemId}/quality-analysis`,
      { method: "POST", body: "{}" },
      token
    ),

  // R9.2-P6C-CUSTOMER-MVP-FLOW: market selection -> upload -> RestorationDraft
  // -> signed preview -> server offers -> FixedOrder -> review. Every call
  // below is explicit-button-triggered from the calling page; none run on
  // mount/refresh by themselves.
  createRestorationDraft: (
    token: string | undefined,
    input: { fileName: string; contentType: string; bodyBase64: string; country: string; confirmed: true }
  ) =>
    apiRequest<RestorationDraftSummary & { guestOwnershipToken?: string }>(
      "/api/restoration-drafts",
      { method: "POST", body: JSON.stringify(input) },
      token
    ),

  getRestorationDraft: (token: string | undefined, draftId: string, guestToken?: string) =>
    apiRequest<RestorationDraftSummary & { previewUrl: string }>(
      `/api/restoration-drafts/${draftId}`,
      {},
      token,
      guestToken
    ),

  getRestorationDraftOffers: (token: string | undefined, draftId: string, guestToken?: string) =>
    apiRequest<DigitalOfferSummary[] | { available: false; reason: string }>(
      `/api/restoration-drafts/${draftId}/offers`,
      {},
      token,
      guestToken
    ),

  createFixedOrder: (token: string | undefined, input: { draftId: string; tier: string }, guestToken?: string) =>
    apiRequest<FixedOrderSummary>(
      "/api/fixed-orders/restoration-digital",
      { method: "POST", body: JSON.stringify(input) },
      token,
      guestToken
    ),

  getFixedOrder: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<FixedOrderSummary>(`/api/fixed-orders/${orderNo}`, {}, token, guestToken),

  createCustomerCheckout: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<{
      paymentAttemptId: string;
      status: string;
      amountMinor: string;
      currency: "PKR" | "USD";
      sessionId: string | null;
      successIndicator: string | null;
    }>(
      `/api/orders/${encodeURIComponent(orderNo)}/checkout`,
      { method: "POST", body: JSON.stringify({ orderNo }) },
      token,
      guestToken
    ),

  getCustomerPaymentStatus: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<{
      paymentAttemptId: string;
      status: string;
      amountMinor: string;
      currency: "PKR" | "USD";
      sessionId: string | null;
      successIndicator: string | null;
    }>(`/api/orders/${encodeURIComponent(orderNo)}/payment-status`, {}, token, guestToken)
};

export type RestorationDraftSummary = {
  id: string;
  status: string;
  market: "PAKISTAN" | "INTERNATIONAL" | null;
  currency: "PKR" | "USD" | null;
  country: string | null;
  originalMimeType: string | null;
  originalWidth: number | null;
  originalHeight: number | null;
  createdAt: string;
};

export type DigitalOfferSummary = {
  tier: "ORIGINAL" | "HD_2X" | "HD_4X";
  label: string;
  amountMinor: number;
  currency: "PKR" | "USD";
  description: string;
  source: "local_fixture" | "approved_pricebook";
};

export type FixedOrderSummary = {
  id: string;
  orderNo: string;
  status: string;
  market: "PAKISTAN" | "INTERNATIONAL";
  currency: "PKR" | "USD";
  tier: "ORIGINAL" | "HD_2X" | "HD_4X";
  totalAmountMinor: string;
  pricingSource: string;
  pricingApproved: boolean;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: string | null;
  createdAt: string;
};
