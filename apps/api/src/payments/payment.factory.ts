import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import type { PaymentProvider, PaymentProviderName } from "./payment.interface";
import { EasyPaisaPaymentProvider, JazzCashPaymentProvider, ManualPaymentProvider } from "./payment.providers";

const toProviderName = (value: string): PaymentProviderName => {
  const normalized = value.trim().toLowerCase();
  if (normalized === "jazzcash" || normalized === "easypaisa" || normalized === "manual") {
    return normalized;
  }
  throw new AppError(`Unsupported payment provider: ${value}`, 500, "PAYMENT_PROVIDER_UNSUPPORTED");
};

export const createPaymentProvider = (config: AppConfig): PaymentProvider => {
  const providerName = toProviderName(config.paymentProvider);
  const baseUrl = config.PAYMENT_GATEWAY_BASE_URL || "http://localhost:4000";
  const secret = config.PAYMENT_GATEWAY_SECRET || "";

  switch (providerName) {
    case "jazzcash":
      return new JazzCashPaymentProvider(baseUrl, secret);
    case "easypaisa":
      return new EasyPaisaPaymentProvider(baseUrl, secret);
    case "manual":
      return new ManualPaymentProvider(baseUrl);
  }
};
