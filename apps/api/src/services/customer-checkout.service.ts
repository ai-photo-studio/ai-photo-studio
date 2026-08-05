import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { computeOrderPaymentReasons } from "../domain/payment/paymentReadiness";
import { BankAlfalahMpgsGateway } from "./p4c-bank-alfalah-mpgs-gateway.service";
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
    if (!this.config.bankAlfalahMpgs.enabled) {
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
      returnUrl: "https://thannow.com/checkout/return"
    });

    const updated = await prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "REDIRECT_READY", providerRef: checkout.sessionId }
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

  async getStatus(orderNo: string, actor: RequestActor): Promise<CustomerCheckoutResult> {
    const order = await prisma.fixedOrder.findUnique({ where: { orderNo }, include: { paymentAttempt: true } });
    const owned = assertOwnership(order, actor);
    const attempt = owned.paymentAttempt;
    if (!attempt) throw new AppError("Payment attempt not found", 404, "NOT_FOUND");
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
