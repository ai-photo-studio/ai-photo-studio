// R9.2-P1B: locked FixedOrder -> payment readiness -> one idempotent
// PaymentAttempt lifecycle.
//
// This service never trusts client amount/currency/provider/order status --
// every value it reads comes from the persisted, immutable FixedOrder and
// its items. It never creates a PaymentEvent, entitlement, master, execution
// or variant, and it never calls the provider inside a database transaction
// (the row is created/updated in its own statement; the provider call
// happens outside any transaction, between two separate writes).
import type { FixedOrder, FixedOrderItem, PaymentAttempt } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { assertOwnership, type RequestActor } from "../utils/ownership";
import { computeOrderPaymentReasons, type FixedOrderStatus } from "../domain/payment/paymentReadiness";
import type { PaymentProvider } from "../domain/payment/paymentProvider";
import { BankAlfalahAdapter } from "../domain/payment/bankAlfalahAdapter";

type FixedOrderWithItemsAndAttempt = FixedOrder & { items: FixedOrderItem[]; paymentAttempt: PaymentAttempt | null };

export interface PaymentReadinessView {
  ready: boolean;
  reasons: string[];
  order: {
    orderNo: string;
    market: string;
    currency: string;
    totalAmountMinor: string;
    status: string;
  };
}

export interface PaymentAttemptSafeView {
  id: string;
  fixedOrderId: string;
  orderNo: string;
  provider: string;
  status: string;
  amountMinor: string;
  currency: string;
  providerRef: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Only present immediately after a successful provider initialization call -- never persisted, never replayed on a later read. */
  checkoutUrl?: string;
}

// Only a freshly-created attempt or one whose last provider initialization
// failed may trigger a provider call. Every other status is returned as-is,
// idempotently, with zero external calls.
const RETRYABLE_STATUSES = new Set(["CREATED", "FAILED"]);

export class PaymentAttemptService {
  constructor(private readonly provider: PaymentProvider = new BankAlfalahAdapter()) {}

  async getReadiness(orderNo: string, actor: RequestActor): Promise<PaymentReadinessView> {
    const order = await this.loadOwnedOrder(orderNo, actor);
    const reasons = this.computeReasons(order);
    return {
      ready: reasons.length === 0,
      reasons,
      order: this.orderSummary(order)
    };
  }

  async getAttempt(orderNo: string, actor: RequestActor): Promise<PaymentAttemptSafeView | null> {
    const order = await this.loadOwnedOrder(orderNo, actor);
    if (!order.paymentAttempt) return null;
    return this.toSafeView(order.paymentAttempt, order.orderNo);
  }

  async createAttempt(orderNo: string, actor: RequestActor): Promise<PaymentAttemptSafeView> {
    const order = await this.loadOwnedOrder(orderNo, actor);
    const reasons = this.computeReasons(order);
    if (reasons.length > 0) {
      // Truthful, uniform rejection: zero PaymentAttempt rows are created or
      // touched, and no provider is ever called on this path.
      throw new AppError(reasons.join("; "), 409, "PAYMENT_NOT_READY");
    }

    let attempt = order.paymentAttempt ?? (await this.createAttemptRow(order));

    if (!RETRYABLE_STATUSES.has(attempt.status)) {
      // Already initialized (or in a non-retryable state) -- idempotent
      // no-op reuse of the same row, no provider call.
      return this.toSafeView(attempt, order.orderNo);
    }

    try {
      const session = await this.provider.createCheckoutSession({
        fixedOrderId: order.id,
        orderNo: order.orderNo,
        amountMinor: order.totalAmountMinor.toString(),
        currency: order.currency
      });
      attempt = await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "REDIRECT_READY", providerRef: session.providerRef }
      });
      return { ...this.toSafeView(attempt, order.orderNo), checkoutUrl: session.checkoutUrl };
    } catch (error) {
      const sanitized = this.provider.normalizeProviderError(error);
      logger.warn("Payment provider initialization failed", {
        orderNo: order.orderNo,
        provider: this.provider.name,
        reason: sanitized.message
      });
      attempt = await prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "FAILED", providerRef: sanitized.reference }
      });
      throw new AppError(sanitized.message, 502, "PAYMENT_PROVIDER_ERROR");
    }
  }

  private async createAttemptRow(order: FixedOrderWithItemsAndAttempt): Promise<PaymentAttempt> {
    try {
      return await prisma.paymentAttempt.create({
        data: {
          fixedOrderId: order.id,
          provider: this.provider.name,
          status: "CREATED",
          amountMinor: order.totalAmountMinor,
          currency: order.currency,
          // Server-derived from the FixedOrder id -- never a client-supplied
          // value. A repeated request, or a request that supplies a
          // different client key, resolves to the exact same key here and
          // therefore the exact same lifecycle.
          idempotencyKey: `payment-attempt:${order.id}`
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Lost a race to a concurrent request for the same order -- reuse
        // the winner's row instead of creating a second lifecycle.
        const winner = await prisma.paymentAttempt.findUnique({ where: { fixedOrderId: order.id } });
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async loadOwnedOrder(orderNo: string, actor: RequestActor): Promise<FixedOrderWithItemsAndAttempt> {
    const order = await prisma.fixedOrder.findUnique({
      where: { orderNo },
      include: { items: true, paymentAttempt: true }
    });
    return assertOwnership(order, actor);
  }

  private computeReasons(order: FixedOrderWithItemsAndAttempt): string[] {
    const reasons = computeOrderPaymentReasons({
      type: order.type,
      market: order.market,
      currency: order.currency,
      status: order.status as FixedOrderStatus,
      totalAmountMinor: order.totalAmountMinor,
      items: order.items.map((item) => ({
        pricingSource: item.pricingSource,
        pricingApproved: item.pricingApproved
      })),
      existingAttemptStatus: order.paymentAttempt?.status ?? null,
      priceBookVersion: order.priceBookVersion,
      priceBookApprovalReference: order.priceBookApprovalReference
    });

    const providerReadiness = this.provider.getReadiness({ market: order.market, currency: order.currency });
    if (!providerReadiness.ready) {
      reasons.push(...providerReadiness.reasons.map((reason) => `provider unavailable: ${reason}`));
    }
    return reasons;
  }

  private orderSummary(order: FixedOrderWithItemsAndAttempt) {
    return {
      orderNo: order.orderNo,
      market: order.market,
      currency: order.currency,
      totalAmountMinor: order.totalAmountMinor.toString(),
      status: order.status
    };
  }

  private toSafeView(attempt: PaymentAttempt, orderNo: string): PaymentAttemptSafeView {
    return {
      id: attempt.id,
      fixedOrderId: attempt.fixedOrderId,
      orderNo,
      provider: attempt.provider,
      status: attempt.status,
      amountMinor: attempt.amountMinor.toString(),
      currency: attempt.currency,
      providerRef: attempt.providerRef,
      createdAt: attempt.createdAt,
      updatedAt: attempt.updatedAt
    };
  }
}
