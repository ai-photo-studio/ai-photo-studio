import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { computeOrderPaymentReasons } from "../domain/payment/paymentReadiness";
import { BankAlfalahMpgsGateway, handleMpgsBrowserReturn } from "./p4c-bank-alfalah-mpgs-gateway.service";
import { AppError } from "../utils/errors";
import { assertOwnership, type RequestActor } from "../utils/ownership";

export interface CustomerCheckoutInput {
  orderNo: string;
}

export interface CustomerCheckoutResult {
  paymentAttemptId: string;
  status: string;
  amountMinor: string;
  currency: "PKR" | "USD";
  sessionId: string | null;
  successIndicator: string | null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof PrismaClientKnownRequestError && error.code === "P2002";
}

export class CustomerCheckoutService {
  private readonly gateway: BankAlfalahMpgsGateway;

  constructor(private readonly config: AppConfig, gateway?: BankAlfalahMpgsGateway) {
    this.gateway = gateway ?? new BankAlfalahMpgsGateway(config.bankAlfalahMpgs);
  }

  async createCheckout(input: CustomerCheckoutInput, actor: RequestActor): Promise<CustomerCheckoutResult> {
    if (!input.orderNo || typeof input.orderNo !== "string") {
      throw new AppError("orderNo is required", 422, "INVALID_REQUEST");
    }

    const order = await prisma.fixedOrder.findUnique({
      where: { orderNo: input.orderNo },
      include: { items: true, paymentAttempt: true }
    });
    const owned = assertOwnership(order, actor);

    // Provider readiness is checked before any PaymentAttempt mutation or network request.
    if (this.config.bankAlfalahProvider !== "mpgs" || !this.config.bankAlfalahMpgs.enabled) {
      throw new AppError("Payment provider is unavailable", 503, "PAYMENT_PROVIDER_UNAVAILABLE");
    }

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
            provider: "bank_alfalah"
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

    const checkout = await this.gateway.initiateHostedCheckout({
      orderId: owned.orderNo,
      amountMinor: attempt.amountMinor,
      currency: attempt.currency,
      returnUrl: this.config.bankAlfalahMpgs.returnUrl
    });

    // R9.2-PAYMENT-VERIFICATION-BRIDGE: confirmed defect fix. This previously
    // also wrote `providerRef: checkout.sessionId` -- but `PaymentAttempt.providerRef`
    // is the field P4A's own mismatch guard (`p4a-payment-verified-execution-queue.service.ts`
    // runOnce: "if (attempt.providerRef && attempt.providerRef !== evidence.providerRef)
    // return PROVIDER_REFERENCE_MISMATCH") treats as the VERIFIED transaction
    // reference, set once by a prior successful verification -- not the
    // Hosted Checkout session id (a structurally different MPGS identifier).
    // Writing the session id here made every real verification attempt fail
    // with PROVIDER_REFERENCE_MISMATCH on its very first call, because
    // `providerRef` was never null when verification evidence (the real
    // transaction reference from Retrieve Order) arrived. Found and proven
    // while building `CustomerCheckoutService.getStatus`'s verification call
    // in this same packet. `providerRef` is left unset here; P4A sets it
    // itself, exactly once, the first time real verified evidence is applied.
    const updated = await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "REDIRECT_READY" }
    });
    return {
      paymentAttemptId: updated.id,
      status: updated.status,
      amountMinor: updated.amountMinor.toString(),
      currency: updated.currency,
      sessionId: checkout.sessionId,
      successIndicator: checkout.successIndicator
    };
  }

  /**
   * R9.2-PAYMENT-VERIFICATION-BRIDGE: this is the ONLY place a `PaymentAttempt`
   * is ever moved to `PAID`. It NEVER trusts a browser return or a query
   * parameter -- those are not even read here or by the caller
   * (`FixedOrderReviewPage` ignores its own URL's query string entirely). The
   * only input this method trusts is a fresh, server-initiated Retrieve Order
   * call, matched field-by-field against the immutable stored attempt by the
   * existing, already race-tested `handleMpgsBrowserReturn` /
   * `matchRetrievedOrderToAttempt` / `applyVerifiedPaymentEvidence` chain --
   * no new verification logic, no new database transaction, no duplicate
   * architecture. On any non-match (pending, failed, cancelled, or a field
   * mismatch) this method writes nothing and returns the attempt's existing
   * stored status unchanged -- it never fabricates PAID and never queues
   * restoration processing itself (only `applyVerifiedPaymentEvidence`, via
   * an exact match, can do that). No webhook path is touched by this method.
   */
  async getStatus(orderNo: string, actor: RequestActor): Promise<CustomerCheckoutResult> {
    const order = await prisma.fixedOrder.findUnique({ where: { orderNo }, include: { paymentAttempt: true } });
    const owned = assertOwnership(order, actor);
    let attempt = owned.paymentAttempt;
    if (!attempt) throw new AppError("Payment attempt not found", 404, "NOT_FOUND");

    // Skip the network call entirely before a gateway session has ever been
    // created (CREATED -- nothing to verify yet), once already PAID, and for
    // any other terminal state (a re-check cannot un-cancel/un-expire an
    // attempt; matches P4A's own PRE_VERIFIED_ATTEMPT_STATES minus CREATED,
    // since CREATED has no gateway order to retrieve at all). Gated on
    // status, not `providerRef` -- see the fix note in `createCheckout`
    // above for why `providerRef` is never a reliable "checkout was
    // initiated" signal.
    const VERIFIABLE_STATES: readonly string[] = ["REDIRECT_READY", "CUSTOMER_RETURNED", "CALLBACK_PENDING", "AUTHORIZED"];
    if (VERIFIABLE_STATES.includes(attempt.status)) {
      const { outcome } = await handleMpgsBrowserReturn(this.gateway, this.config.bankAlfalahMpgs.merchantId, {
        fixedOrderId: owned.id,
        paymentAttemptId: attempt.id,
        gatewayOrderId: owned.orderNo,
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
        provider: attempt.provider
      });
      if (outcome.matched) {
        // applyVerifiedPaymentEvidence already committed PAID + entitlement +
        // execution idempotently inside its own transaction; re-read to
        // reflect the true persisted state rather than assuming its shape.
        attempt = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      }
      // outcome.matched === false: the stored attempt is left exactly as-is.
    }

    return {
      paymentAttemptId: attempt.id,
      status: attempt.status,
      amountMinor: attempt.amountMinor.toString(),
      currency: attempt.currency,
      sessionId: null,
      successIndicator: null
    };
  }
}
