import { apiRequest, type AuthSession } from "../lib/api";
import type {
  CustomerOrderResponse,
  CustomerPaymentsResponse,
  CustomerSubscriptionResponse,
  CustomerWalletResponse,
  RestorationOrderSummary,
  RestorationItemRecord,
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

  createRestorationOrder: (token: string, title?: string) =>
    apiRequest<{ id: string; orderNo: string; status: string; title: string | null; createdAt: string }>(
      "/api/restorations",
      { method: "POST", body: JSON.stringify({ title: title || "Photo Restoration" }) },
      token
    ),

  getRestorationOrder: (token: string, id: string) =>
    apiRequest<{ id: string; orderNo: string; title: string | null; status: string; totalItems: number; completedItems: number; failedItems: number; createdAt: string; updatedAt: string; items: RestorationItemRecord[] }>(
      `/api/restorations/${id}`, {}, token
    ),

  listRestorationOrders: (token: string) =>
    apiRequest<RestorationOrderSummary[]>("/api/restorations", {}, token),

  addRestorationItem: (token: string, orderId: string, fileName: string, contentType: string, bodyBase64: string) =>
    apiRequest<RestoreUploadResult>(
      `/api/restorations/${orderId}/items`,
      {
        method: "POST",
        body: JSON.stringify({ fileName, contentType, bodyBase64 })
      },
      token
    ),

  processRestorationItem: (token: string, orderId: string, itemId: string) =>
    apiRequest<{ message: string }>(
      `/api/restorations/${orderId}/items/${itemId}/process`,
      { method: "POST", body: "{}" },
      token
    ),

  getRestorationPreview: (token: string, orderId: string, itemId: string) =>
    apiRequest<{ previewKey: string; previewUrl: string }>(
      `/api/restorations/${orderId}/items/${itemId}/preview`,
      { method: "POST", body: "{}" },
      token
    ),

  approveRestorationItem: (token: string, orderId: string, itemId: string, approved: boolean) =>
    apiRequest<{ approved: boolean }>(
      `/api/restorations/${orderId}/items/${itemId}/approve`,
      { method: "POST", body: JSON.stringify({ approved }) },
      token
    ),

  getRestorationDownload: (token: string, orderId: string, itemId: string) =>
    apiRequest<{ downloadUrl: string }>(
      `/api/restorations/${orderId}/items/${itemId}/download`,
      { method: "POST", body: "{}" },
      token
    ),

  runQualityAnalysis: (token: string, orderId: string, itemId: string) =>
    apiRequest<{ quality: Record<string, number>; damage: Record<string, unknown> }>(
      `/api/restorations/${orderId}/items/${itemId}/quality-analysis`,
      { method: "POST", body: "{}" },
      token
    )
};
