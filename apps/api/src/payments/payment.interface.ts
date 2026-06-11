export type PaymentProviderName = "jazzcash" | "easypaisa" | "manual";

export type PaymentCheckoutInput = {
  orderId: string;
  orderNo: string;
  amount: number;
  currency: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentCheckoutResult = {
  providerName: PaymentProviderName;
  providerRef: string;
  checkoutUrl: string;
  instructions?: string;
  raw?: Record<string, unknown>;
};

export type PaymentWebhookStatus = "PAID" | "APPROVED" | "REJECTED" | "FAILED" | "PENDING" | "REFUNDED";

export type PaymentWebhookResult = {
  providerName: PaymentProviderName;
  providerRef: string;
  orderNo: string;
  status: PaymentWebhookStatus;
  amount?: number;
  currency?: string;
  rawPayload?: unknown;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult>;
  verifyWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>): Promise<PaymentWebhookResult>;
}
