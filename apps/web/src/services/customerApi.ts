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

  createFixedOrder: (token: string | undefined, input: { draftId: string; tier: string; product?: "DIGITAL" | "PRINT_DIGITAL"; printSize?: string; quantity?: number; printLines?: Array<{ printSize: string; quantity: number }>; deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; countryCode: string } }, guestToken?: string) =>
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
      redirectUrl?: string | null;
      redirectFields?: Record<string, string>;
    }>(
      `/api/fixed-orders/${encodeURIComponent(orderNo)}/checkout`,
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
    }>(`/api/fixed-orders/${encodeURIComponent(orderNo)}/payment-status`, {}, token, guestToken),
  getPrintCatalog: () => apiRequest<Array<{ catalogVersion: string; size: string; unitAmountMinor: number; currency: "PKR" | "USD"; minimumQuantity: number; deliveryAmountMinor: number | null; blocker?: string }>>("/api/print-catalog"),
  getSinglePrintCatalog: () => apiRequest<Array<{ catalogVersion: string; size: string; unitAmountMinor: number; currency: "PKR" | "USD"; minimumQuantity: number; deliveryAmountMinor: number | null; blocker?: string }>>("/api/single-print-catalog"),

  // R9.5-P4B7B: server-authoritative test-mode check. A 404 (production, or
  // any environment without the seam mounted) is treated as "disabled" by
  // the caller -- never treated as an error to surface to the customer.
  getE2ETestModeStatus: () => apiRequest<{ enabled: boolean }>("/api/e2e/test-mode"),

  createTestCheckout: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<{ paymentAttemptId: string; fixedOrderId: string; orderNo: string; amountMinor: string; currency: "PKR" | "USD"; status: string; testMode: true }>(
      `/api/fixed-orders/${encodeURIComponent(orderNo)}/test-checkout`,
      { method: "POST", body: JSON.stringify({}) },
      token,
      guestToken
    ),

  completeTestPayment: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<{ outcome: string; applied?: Record<string, string> }>(
      `/api/fixed-orders/${encodeURIComponent(orderNo)}/test-checkout/complete`,
      { method: "POST", body: JSON.stringify({}) },
      token,
      guestToken
    ),

  getFixedOrderRestorationStatus: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<{
      orderNo: string;
      entitlementStatus: string | null;
      masterStatus: string | null;
      executionStatus: string | null;
      failureReason: string | null;
      downloadAvailable: boolean;
      downloadUrl: string | null;
    }>(`/api/fixed-orders/${encodeURIComponent(orderNo)}/restoration-status`, {}, token, guestToken),

  preparePrintFulfilment: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<{ printEntitlementId: string; fulfilmentOrderId: string; status: string; blocker: "PRINT_PARTNER_ASSIGNMENT_REQUIRED" | "IN_HOUSE_PRINT_PENDING" }>(
      `/api/fixed-orders/${encodeURIComponent(orderNo)}/print-fulfilment`,
      { method: "POST", body: JSON.stringify({}) },
      token,
      guestToken
    ),

  // R9.5-P5Q: multi-image cart endpoints.
  createRestorationCartOrder: (
    token: string | undefined,
    input: { items: Array<{ draftId: string; tier: string; product: "DIGITAL" | "PRINT_DIGITAL"; printSize?: string; quantity?: number; printLines?: Array<{ printSize: string; quantity: number }>; guestOwnershipToken?: string }>; deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; countryCode: string } },
    guestToken?: string
  ) =>
    apiRequest<FixedOrderCartSummary>("/api/fixed-orders/restoration-cart", { method: "POST", body: JSON.stringify(input) }, token, guestToken),

  getMemoryPackages: () => apiRequest<MemoryPackageSummary[]>("/api/memory-packages"),
  createMemoryPackageOrder: (
    token: string | undefined,
    input: { packageCode: string; items: Array<{ draftId: string; guestOwnershipToken?: string }> },
    guestToken?: string
  ) => apiRequest<FixedOrderCartSummary>("/api/fixed-orders/memory-package", { method: "POST", body: JSON.stringify(input) }, token, guestToken),

  getRestorationCart: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<FixedOrderCartSummary>(`/api/fixed-orders/${encodeURIComponent(orderNo)}/cart`, {}, token, guestToken),

  getAllItemsRestorationStatus: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<Array<{
      fixedOrderItemId: string;
      tier: string | null;
      isPrint: boolean;
      entitlementStatus: string | null;
      masterStatus: string | null;
      executionStatus: string | null;
      failureReason: string | null;
      downloadAvailable: boolean;
      downloadUrl: string | null;
      printStatus: "IN_HOUSE_PRINT_PENDING" | null;
    }>>(`/api/fixed-orders/${encodeURIComponent(orderNo)}/restoration-status/all`, {}, token, guestToken),

  prepareAllPrintFulfilment: (token: string | undefined, orderNo: string, guestToken?: string) =>
    apiRequest<Array<{ printEntitlementId: string; fulfilmentOrderId: string; status: string; blocker: "PRINT_PARTNER_ASSIGNMENT_REQUIRED" | "IN_HOUSE_PRINT_PENDING"; fixedOrderItemId: string }>>(
      `/api/fixed-orders/${encodeURIComponent(orderNo)}/print-fulfilment/all`,
      { method: "POST", body: JSON.stringify({}) },
      token,
      guestToken
    )
};

export type FixedOrderCartItemSummary = {
  fixedOrderItemId: string;
  draftId: string;
  tier: string;
  product: "DIGITAL" | "PRINT_DIGITAL";
  digitalAmountMinor: string;
  print?: { size: string; quantity: number; unitAmountMinor: string; subtotalMinor: string; catalogVersion: string; requiredTier?: string; qualitySurchargeMinor?: number };
  prints?: Array<{ size: string; quantity: number; unitAmountMinor: string; subtotalMinor: string; catalogVersion: string; requiredTier?: string; qualitySurchargeMinor: string }>;
  lineTotalMinor: string;
};

export type FixedOrderCartSummary = {
  id: string;
  orderNo: string;
  status: string;
  market: "PAKISTAN" | "INTERNATIONAL";
  currency: "PKR" | "USD";
  items: FixedOrderCartItemSummary[];
  restorationTotalMinor: string;
  printTotalMinor: string;
  deliveryAmountMinor: string;
  totalAmountMinor: string;
  priceBookVersion: string | null;
  createdAt: string;
  paymentStatus?: string;
  package?: { code: string; name: string; priceMinor: string; imagesIncluded: number };
};

export type MemoryPackageSummary = {
  code: string;
  name: string;
  priceMinor: number;
  currency: "PKR" | "USD";
  minImages: number;
  maxImages: number;
  includes: string[];
  checkoutReady: boolean;
  blocker?: string;
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
  tier: "ORIGINAL" | "HD_2X" | "HD_4X" | "HD_6X" | "HD_8X" | "HD_10X" | "HD_12X";
  label: string;
  amountMinor: number;
  currency: "PKR" | "USD";
  description: string;
  source: "local_fixture" | "approved_pricebook";
  priceBookVersion?: string;
  approvalReference?: string;
  effectiveAt?: string;
};

export type FixedOrderSummary = {
  id: string;
  orderNo: string;
  sourceDraftId: string | null;
  status: string;
  market: "PAKISTAN" | "INTERNATIONAL";
  currency: "PKR" | "USD";
  tier: "ORIGINAL" | "HD_2X" | "HD_4X" | "HD_6X" | "HD_8X" | "HD_10X" | "HD_12X";
  product: "DIGITAL" | "PRINT_DIGITAL";
  totalAmountMinor: string;
  pricingSource: string;
  pricingApproved: boolean;
  priceBookVersion: string | null;
  priceBookApprovalReference: string | null;
  priceBookEffectiveAt: string | null;
  createdAt: string;
  paymentStatus?: string;
  print?: { size: string; quantity: number; unitAmountMinor: string; subtotalMinor: string; deliveryAmountMinor: string; catalogVersion: string; requiredTier?: string; qualitySurchargeMinor?: number };
  deliveryAddress?: { recipientName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; region?: string; postalCode?: string; countryCode: string };
};
