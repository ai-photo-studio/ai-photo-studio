# Demo Payment Mode Implementation Plan

## Objective

Add a `PAYMENT_GATEWAY_NAME=demo` mode that auto-approves payments so the full Order → Upload → Queue → Replicate → R2 → Download pipeline can be verified end-to-end without requiring admin payment approval.

## Changes Required

### File 1: `apps/api/src/payments/payment.interface.ts`

**Change:** Add `"demo"` to `PaymentProviderName` type.

```typescript
export type PaymentProviderName = "jazzcash" | "easypaisa" | "manual" | "demo";
```

---

### File 2: `apps/api/src/payments/payment.providers.ts`

**Change:** Add `DemoPaymentProvider` class.

```typescript
export class DemoPaymentProvider extends BasePaymentProvider {
  constructor(baseUrl: string) {
    super("demo", baseUrl || "http://localhost:4000", "");
  }

  async createCheckout(input: PaymentCheckoutInput): Promise<PaymentCheckoutResult> {
    const providerRef = normalizeProviderRef("demo", input.orderNo);
    return {
      providerName: "demo",
      providerRef,
      checkoutUrl: `http://localhost:4000/demo?orderNo=${input.orderNo}&ref=${providerRef}`,
      instructions: "Demo payment — auto-approved",
      raw: { providerName: "demo", providerRef, amount: input.amount, currency: input.currency, demo: true }
    };
  }

  async verifyWebhook(): Promise<PaymentWebhookResult> {
    throw new AppError("Demo payments do not use webhooks", 400, "DEMO_PAYMENT_WEBHOOK_UNSUPPORTED");
  }
}
```

---

### File 3: `apps/api/src/payments/payment.factory.ts`

**Change:** Import `DemoPaymentProvider` and handle `"demo"` case.

```typescript
import { DemoPaymentProvider, EasyPaisaPaymentProvider, JazzCashPaymentProvider, ManualPaymentProvider } from "./payment.providers";

const toProviderName = (value: string): PaymentProviderName => {
  const normalized = value.trim().toLowerCase();
  if (["jazzcash", "easypaisa", "manual", "demo"].includes(normalized)) {
    return normalized as PaymentProviderName;
  }
  throw new AppError(...);
};

export const createPaymentProvider = (config: AppConfig): PaymentProvider => {
  const providerName = toProviderName(config.paymentProvider);
  const baseUrl = config.PAYMENT_GATEWAY_BASE_URL || "http://localhost:4000";
  const secret = config.PAYMENT_GATEWAY_SECRET || "";

  switch (providerName) {
    case "jazzcash": return new JazzCashPaymentProvider(baseUrl, secret);
    case "easypaisa": return new EasyPaisaPaymentProvider(baseUrl, secret);
    case "manual": return new ManualPaymentProvider(baseUrl);
    case "demo": return new DemoPaymentProvider(baseUrl);
  }
};
```

---

### File 4: `apps/api/src/services/payment.service.ts`

**Change:** In `createCheckout` method, auto-approve when provider is `demo`.

Locate the method that calls `this.provider.createCheckout(input)` and creates a payment record. After creating the payment record, if `this.provider.name === "demo"`, immediately call `this.approvePaymentById(payment.id, "system")`.

The key section is around the `createCheckout` processing flow (not the `RecordManualPaymentProof` flow). The order controller calls `orderService.createOrder()` which eventually calls `paymentService.createPaymentRecord()` and `paymentService.createCheckout()`.

**Minimum change:** In the `createPaymentRecord` call (or immediately after), when `this.config.paymentProvider === "demo"`, set `status: "APPROVED"` instead of `"PENDING"`.

```typescript
// In createCheckout or wherever payment record is created
const status = this.config.paymentProvider === "demo" ? "APPROVED" : "PENDING";
```

If a "demo" payment is created with `status: "APPROVED"`, then `approvePaymentById` can be called immediately after.

---

### File 5: `apps/api/src/config/env.ts`

**Change:** Update validation to accept `"demo"`.

Line 73: Change `if (!["jazzcash", "easypaisa", "manual"].includes(normalizedPaymentProvider))` to include `"demo"`.

Line 77: Update error message to include `"demo"`.

Line 86: `PAYMENT_GATEWAY_BASE_URL` is optional when `PAYMENT_GATEWAY_NAME=demo` or `=manual`.

Line 104: `PAYMENT_GATEWAY_SECRET` is optional when `PAYMENT_GATEWAY_NAME=demo` or `=manual`.

Line 214: Update the `paymentProvider` union type to include `"demo"`.

Line 304: Update the cast to include `"demo"`.

---

## Configuration

### Northflank Secret Group

After code changes are deployed, set:
```
PAYMENT_GATEWAY_NAME=demo
```

This changes the payment mode from `manual` (requires admin approval) to `demo` (auto-approved).

### Frontend Demo Badge

The health endpoint already includes `payment_mode`:
```json
{"payment_mode":"manual"}
```

When `PAYMENT_GATEWAY_NAME=demo`, this will show `"demo"` — the frontend can use this to display a "Demo Payment" badge.

---

## Test Plan

| Test | Flow | Expected | Current Status |
|------|------|----------|---------------|
| Guest single | previews/background-removal | 503 — BACKGROUND_API_UNAVAILABLE | ✅ Already failing as expected (no external service) |
| Guest multiple | previews/web | HTTP 201 | ✅ Already passing |
| User single | order → checkout → upload → queue → replicate → R2 → download | Payment auto-approved, credits loaded, image queued, Replicate called, R2 written, download URL returned | ❌ Currently blocked at CREDITS_REQUIRED |
| User multiple | Same flow with multiple images | Multiple queue jobs processed | ❌ Currently blocked at CREDITS_REQUIRED |

With `demo` mode:
1. User registers → ✅ HTTP 201
2. User creates order → ✅ HTTP 201 (`PAYMENT_PENDING`)
3. User creates checkout → Auto-approved (`APPROVED`), credits loaded, queue job enqueued
4. Upload → ✅ Credits sufficient → R2 upload → Queue job created
5. Worker → ✅ Processes queue job → Calls Replicate → Uploads result to R2
6. Download → ✅ Download URL available

## Production Impact

| Area | Impact |
|------|--------|
| Existing payment providers | **None** — `jazzcash` and `easypaisa` providers are unaffected |
| Manual payment flow | **None** — `manual` provider still works as before |
| env.ts validation | Updated to accept `"demo"` — backward compatible |
| Payment interface | Updated type — existing providers compile unchanged |
| Database | Existing payment records unaffected |
| Frontend | `payment_mode` field in health endpoint changes from `manual` to `demo` — frontend can display badge |
| Production readiness | Setting `PAYMENT_GATEWAY_NAME=manual` restores the original flow |

## Execution Order

1. Apply code changes (5 files, ~20 lines total)
2. Build & push to GitHub (CI/CD auto-deploys)
3. Update Northflank secret group: `PAYMENT_GATEWAY_NAME=demo`
4. Restart service
5. Verify: `curl /api/health` shows `"payment_mode":"demo"`
6. Run end-to-end test: register → order → checkout → upload → queue → worker → replicate → R2 → download
