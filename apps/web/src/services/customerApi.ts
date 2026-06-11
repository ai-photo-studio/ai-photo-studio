import { apiRequest, type AuthSession } from "../lib/api";
import type {
  CustomerPaymentsResponse,
  CustomerSubscriptionResponse,
  CustomerWalletResponse
} from "../lib/portal-types";

type PaymentRequestInput = {
  orderNo: string;
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
    })
};
