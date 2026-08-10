// R9.5-P4B7-TEST-CHECKOUT-SEAM
//
// TEST/LOCAL-ONLY sibling of `customer-checkout.service.ts`'s `createCheckout`.
// It exists solely so a disposable local E2E harness can drive the real
// `FixedOrderReviewPage` browser flow through checkout without a live Bank
// Alfalah MPGS call -- MPGS is permanently commercially frozen
// (`MPGS_STATUS = "MPGS_COMMERCIAL_HOLD"`, see `rules.md`) and must never be
// enabled or called from any code path, test or production.
//
// Reuses, unchanged, the SAME real business logic `createCheckout` uses:
// `assertOwnership`, `computeOrderPaymentReasons` (order type/status/
// pricing-approval/PriceBook-snapshot eligibility), and the identical
// `PaymentAttempt` create-or-reuse-by-idempotency-key transaction shape. The
// ONLY difference is that this seam never constructs a `BankAlfalahMpgsGateway`
// and never reads/touches `config.bankAlfalahMpgs.enabled` -- it cannot ever
// place a network call, live or sandbox.
//
// `completeTestPayment` is the ONLY caller of `commerce-e2e-payment.ts`'s
// `verifyTestPayment` from an HTTP-reachable path. This is the "future,
// separately authorized trusted gateway adapter" that file's own trust-
// boundary comment anticipates: this seam is triple-guarded (never in
// production, never without explicit `COMMERCE_E2E_TEST_MODE=true`, and the
// route that reaches it is only ever mounted under the same guard --
// see `restoration.routes.ts`), and it never accepts amount/currency from
// the client -- both are always read back from the already-persisted,
// immutable `PaymentAttempt` row.
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "../db/prisma";
import { computeOrderPaymentReasons } from "../domain/payment/paymentReadiness";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";
import type { PaymentEvidenceResult } from "./p4a-payment-verified-execution-queue.service";

export const TEST_PAYMENT_PROVIDER = "commerce-e2e-test";

export interface TestCheckoutResult {
  paymentAttemptId: string;
  fixedOrderId: string;
  orderNo: string;
  amountMinor: string;
  currency: "PKR" | "USD";
  status: string;
  testMode: true;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === "P2002";
}

function assertTestModeAllowed(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("CustomerCheckoutTestService is unavailable in production");
  }
  if (process.env.COMMERCE_E2E_TEST_MODE !== "true") {
    throw new Error("CustomerCheckoutTestService requires COMMERCE_E2E_TEST_MODE=true explicitly");
  }
}

export class CustomerCheckoutTestService {
  constructor() {
    assertTestModeAllowed();
  }

  async createTestCheckout(orderNo: string, actor: RequestActor): Promise<TestCheckoutResult> {
    assertTestModeAllowed();
    if (!orderNo || typeof orderNo !== "string") {
      throw new AppError("orderNo is required", 422, "INVALID_REQUEST");
    }

    const order = await prisma.fixedOrder.findUnique({
      where: { orderNo },
      include: { items: true, paymentAttempt: true }
    });
    const owned = assertOwnership(order, actor);

    const reasons = computeOrderPaymentReasons({
      type: owned.type,
      market: owned.market,
      currency: owned.currency,
      status: owned.status,
      totalAmountMinor: owned.totalAmountMinor,
      items: owned.items.map((item) => ({ pricingSource: item.pricingSource, pricingApproved: item.pricingApproved })),
      existingAttemptStatus: owned.paymentAttempt?.status ?? null,
      priceBookVersion: owned.priceBookVersion,
      priceBookApprovalReference: owned.priceBookApprovalReference
    });
    if (reasons.length > 0) {
      throw new AppError("Order is not eligible for payment", 422, "PAYMENT_NOT_ELIGIBLE");
    }

    const idempotencyKey = `payment-attempt:${owned.id}`;
    let attempt = owned.paymentAttempt;
    if (!attempt) {
      try {
        attempt = await prisma.paymentAttempt.create({
          data: {
            fixedOrderId: owned.id,
            amountMinor: owned.totalAmountMinor,
            currency: owned.currency,
            idempotencyKey,
            provider: TEST_PAYMENT_PROVIDER
          }
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) throw error;
        attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { fixedOrderId: owned.id } });
      }
    }

    if (attempt.amountMinor !== owned.totalAmountMinor || attempt.currency !== owned.currency) {
      throw new AppError("Payment attempt does not match the immutable order", 409, "PAYMENT_ATTEMPT_MISMATCH");
    }

    return {
      paymentAttemptId: attempt.id,
      fixedOrderId: owned.id,
      orderNo: owned.orderNo,
      amountMinor: attempt.amountMinor.toString(),
      currency: attempt.currency,
      status: attempt.status,
      testMode: true
    };
  }

  async completeTestPayment(orderNo: string, actor: RequestActor): Promise<PaymentEvidenceResult> {
    assertTestModeAllowed();
    const order = await prisma.fixedOrder.findUnique({ where: { orderNo }, include: { paymentAttempt: true } });
    const owned = assertOwnership(order, actor);
    const attempt = owned.paymentAttempt;
    if (!attempt) {
      throw new AppError("Payment attempt not found", 404, "NOT_FOUND");
    }
    if (attempt.provider !== TEST_PAYMENT_PROVIDER) {
      throw new AppError("Payment attempt was not created via the test checkout seam", 409, "NOT_A_TEST_ATTEMPT");
    }
    // Dynamic import: `commerce-e2e-payment.ts` throws at module-evaluation
    // time if the same test-mode guards are not met, so it must never be a
    // static/top-level import of this file (which IS imported unconditionally
    // by the route layer's require graph).
    const { verifyTestPayment } = await import("../scripts/commerce-e2e-payment");
    return verifyTestPayment(attempt.id, owned.id, attempt.amountMinor.toString(), attempt.currency);
  }
}
