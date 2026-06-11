import { AppError } from "../utils/errors";
import type {
  PaymentCheckoutInput,
  PaymentCheckoutResult,
  PaymentProvider,
  PaymentProviderName,
  PaymentWebhookResult
} from "./payment.interface";

const normalizeProviderRef = (providerName: PaymentProviderName, orderNo: string) => {
  const suffix = Date.now().toString(36).toUpperCase();
  return `${providerName.toUpperCase()}-${orderNo}-${suffix}`;
};

const buildCheckoutUrl = (providerName: PaymentProviderName, input: PaymentCheckoutInput, providerRef: string, baseUrl: string) => {
  const url = new URL("/checkout", baseUrl || "http://localhost:4000");
  url.searchParams.set("provider", providerName);
  url.searchParams.set("orderNo", input.orderNo);
  url.searchParams.set("ref", providerRef);
  url.searchParams.set("amount", input.amount.toFixed(2));
  url.searchParams.set("currency", input.currency);
  if (input.returnUrl) url.searchParams.set("returnUrl", input.returnUrl);
  return url.toString();
};

const parseWebhookStatus = (value: unknown): PaymentWebhookResult["status"] => {
  const normalized = String(value || "PENDING").trim().toUpperCase();
  if (normalized === "APPROVED" || normalized === "PAID" || normalized === "REJECTED" || normalized === "FAILED" || normalized === "REFUNDED") {
    return normalized;
  }
  return "PENDING";
};

abstract class BasePaymentProvider implements PaymentProvider {
  protected constructor(
    public readonly name: PaymentProviderName,
    private readonly baseUrl: string,
    private readonly secret: string
  ) {}

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    const providerRef = normalizeProviderRef(this.name, input.orderNo);
    const checkoutUrl = buildCheckoutUrl(this.name, input, providerRef, this.baseUrl);
    return {
      providerName: this.name,
      providerRef,
      checkoutUrl,
      raw: {
        providerName: this.name,
        providerRef,
        amount: input.amount,
        currency: input.currency
      }
    };
  }

  async verifyWebhook(
    payload: unknown,
    headers: Record<string, string | string[] | undefined>
  ): Promise<PaymentWebhookResult> {
    const body = (payload || {}) as Record<string, unknown>;
    const signature = String(headers["x-payment-signature"] || headers["x-mock-signature"] || "");
    if (this.secret && signature !== this.secret) {
      throw new AppError("Invalid payment webhook signature", 401, "INVALID_SIGNATURE");
    }

    const providerRef = String(body.providerRef || body.ref || "");
    const orderNo = String(body.orderNo || "");
    if (!providerRef || !orderNo) {
      throw new AppError("Payment webhook payload is missing providerRef or orderNo", 400, "INVALID_PAYMENT_WEBHOOK");
    }

    return {
      providerName: this.name,
      providerRef,
      orderNo,
      status: parseWebhookStatus(body.status),
      amount: typeof body.amount === "number" ? body.amount : undefined,
      currency: typeof body.currency === "string" ? body.currency : undefined,
      rawPayload: payload
    };
  }
}

export class JazzCashPaymentProvider extends BasePaymentProvider {
  constructor(baseUrl: string, secret: string) {
    super("jazzcash", baseUrl, secret);
  }
}

export class EasyPaisaPaymentProvider extends BasePaymentProvider {
  constructor(baseUrl: string, secret: string) {
    super("easypaisa", baseUrl, secret);
  }
}

export class ManualPaymentProvider extends BasePaymentProvider {
  constructor(baseUrl: string) {
    super("manual", baseUrl, "");
  }

  async verifyWebhook(): Promise<PaymentWebhookResult> {
    throw new AppError("Manual payments do not use webhooks", 400, "MANUAL_PAYMENT_WEBHOOK_UNSUPPORTED");
  }
}
