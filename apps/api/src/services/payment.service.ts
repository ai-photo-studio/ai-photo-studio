import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { ImageQueueService } from "../queues/image.queue";
import { DeliveryService } from "./delivery.service";
import { WalletService } from "./wallet.service";
import { SubscriptionService } from "./subscription.service";
import { createPaymentProvider } from "../payments/payment.factory";
import type { PaymentCheckoutInput, PaymentCheckoutResult, PaymentWebhookStatus } from "../payments/payment.interface";

export type CheckoutOrderInput = PaymentCheckoutInput;

export type ManualPaymentProofInput = {
  orderNo: string;
  screenshotPath: string;
  screenshotStorageKey?: string;
  note?: string;
};

export type CheckoutResult = PaymentCheckoutResult;

export type PaymentWebhookResult = {
  success: boolean;
  providerName: string;
  providerRef: string;
  orderNo: string;
  status: PaymentWebhookStatus;
  updated: boolean;
};

const toProviderStatus = (status: PaymentWebhookStatus): "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "FAILED" | "REFUNDED" => {
  if (status === "PAID" || status === "APPROVED" || status === "REJECTED" || status === "FAILED" || status === "REFUNDED" || status === "PENDING") {
    return status;
  }
  return "PENDING";
};

export class PaymentService {
  private readonly provider: ReturnType<typeof createPaymentProvider>;
  private readonly imageQueue: ImageQueueService;
  private readonly delivery: DeliveryService;
  private readonly walletService = new WalletService();
  private readonly subscriptionService = new SubscriptionService();

  constructor(private readonly config: AppConfig) {
    this.provider = createPaymentProvider(config);
    this.imageQueue = new ImageQueueService(config);
    this.delivery = new DeliveryService(config);
  }

  async createCheckout(order: CheckoutOrderInput) {
    return this.provider.createCheckout(order);
  }

  async createPaymentRecord(input: {
    orderId: string;
    amount: number;
    currency: string;
    gatewayRef: string;
    checkoutUrl: string;
    providerName?: string;
    status?: "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "FAILED" | "REFUNDED";
    screenshotPath?: string;
    screenshotStorageKey?: string;
    rawPayload?: Record<string, unknown>;
  }) {
    return prisma.payment.create({
      data: {
        orderId: input.orderId,
        provider: input.providerName || this.config.paymentProvider,
        providerRef: input.gatewayRef,
        checkoutUrl: input.checkoutUrl,
        amount: input.amount.toFixed(2),
        currency: input.currency,
        status: input.status || "PENDING",
        screenshotPath: input.screenshotPath,
        screenshotStorageKey: input.screenshotStorageKey,
        rawPayload: input.rawPayload as object | undefined
      }
    });
  }

  async recordManualPaymentProof(input: ManualPaymentProofInput) {
    const order = await prisma.order.findUnique({
      where: { orderNo: input.orderNo },
      include: {
        package: true,
        customer: true,
        user: true
      }
    });

    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    const gatewayRef = `MANUAL-${order.orderNo}-${Date.now().toString(36).toUpperCase()}`;
    const checkoutUrl = `${this.config.PAYMENT_GATEWAY_BASE_URL || "http://localhost:4000"}/manual-payment?orderNo=${encodeURIComponent(order.orderNo)}&ref=${encodeURIComponent(gatewayRef)}`;

    const existingPending = await prisma.payment.findFirst({
      where: {
        orderId: order.id,
        provider: "manual",
        status: "PENDING"
      },
      orderBy: { createdAt: "desc" }
    });

    const payment = existingPending
      ? await prisma.payment.update({
          where: { id: existingPending.id },
          data: {
            providerRef: gatewayRef,
            checkoutUrl,
            screenshotPath: input.screenshotPath,
            screenshotStorageKey: input.screenshotStorageKey,
            rawPayload: {
              ...((existingPending.rawPayload as Record<string, unknown> | null | undefined) || {}),
              note: input.note || "",
              source: "manual-proof",
              orderNo: order.orderNo
            }
          }
        })
      : await prisma.payment.create({
          data: {
            orderId: order.id,
            provider: "manual",
            providerRef: gatewayRef,
            checkoutUrl,
            amount: order.total,
            currency: order.currency,
            status: "PENDING",
            screenshotPath: input.screenshotPath,
            screenshotStorageKey: input.screenshotStorageKey,
            rawPayload: {
              note: input.note || "",
              source: "manual-proof",
              orderNo: order.orderNo
            }
          }
        });

    await prisma.auditLog.create({
      data: {
        actorType: "customer",
        actorId: order.userId || order.customerId,
        action: "manual_payment_proof_submitted",
        entityType: "payment",
        entityId: payment.id,
        meta: {
          orderNo: order.orderNo,
          screenshotPath: input.screenshotPath,
          screenshotStorageKey: input.screenshotStorageKey
        }
      }
    });

    return payment;
  }

  async handleWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>): Promise<PaymentWebhookResult> {
    const verified = await this.provider.verifyWebhook(payload, headers);
    const order = await prisma.order.findUnique({
      where: { orderNo: verified.orderNo },
      include: {
        customer: true,
        user: true,
        package: true,
        images: true,
        payments: { orderBy: { createdAt: "desc" } }
      }
    });

    if (!order) {
      throw new AppError("Order not found for payment webhook", 404, "ORDER_NOT_FOUND");
    }

    const payment =
      (await prisma.payment.findFirst({
        where: {
          orderId: order.id,
          providerRef: verified.providerRef
        },
        orderBy: { createdAt: "desc" }
      })) ||
      (await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: verified.providerName,
          providerRef: verified.providerRef,
          checkoutUrl: "",
          amount: verified.amount ? verified.amount.toFixed(2) : order.total,
          currency: verified.currency || order.currency,
          status: "PENDING",
          rawPayload: verified.rawPayload as object | undefined
        }
      }));

    if (verified.status !== "PAID" && verified.status !== "APPROVED") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: toProviderStatus(verified.status),
          rawPayload: verified.rawPayload as object | undefined
        }
      });

      await prisma.auditLog.create({
        data: {
          actorType: "system",
          action: "payment_webhook_ignored",
          entityType: "payment",
          entityId: payment.id,
          meta: {
            orderNo: verified.orderNo,
            providerName: verified.providerName,
            status: verified.status
          }
        }
      });

      logger.warn("Payment webhook ignored because status is not settled", {
        orderNo: verified.orderNo,
        status: verified.status
      });

      return {
        success: true,
        providerName: verified.providerName,
        providerRef: verified.providerRef,
        orderNo: verified.orderNo,
        status: verified.status,
        updated: false
      };
    }

    await this.finalizeApprovedPayment({
      paymentId: payment.id,
      order,
      paymentStatus: verified.status,
      providerRef: verified.providerRef,
      rawPayload: verified.rawPayload,
      actorType: "system",
      actorId: verified.providerName
    });

    return {
      success: true,
      providerName: verified.providerName,
      providerRef: verified.providerRef,
      orderNo: verified.orderNo,
      status: verified.status,
      updated: true
    };
  }

  async approveManualPayment(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        user: true,
        package: true,
        payments: { orderBy: { createdAt: "desc" } },
        images: true
      }
    });

    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    const latestPayment = order.payments.find((payment) => payment.provider === "manual" && payment.status === "PENDING") || order.payments[0];
    if (!latestPayment) throw new AppError("Payment record not found", 404, "PAYMENT_NOT_FOUND");
    if (latestPayment.status === "APPROVED" || latestPayment.status === "PAID") {
      return {
        success: true,
        updated: false,
        orderNo: order.orderNo,
        paymentId: latestPayment.id
      };
    }

    await this.approvePaymentById(latestPayment.id, "admin");

    return {
      success: true,
      updated: true,
      orderNo: order.orderNo,
      paymentId: latestPayment.id
    };
  }

  async rejectManualPayment(orderId: string, reason = "Manual payment rejected") {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: { orderBy: { createdAt: "desc" } }
      }
    });

    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    const latestPayment = order.payments.find((payment) => payment.provider === "manual" && payment.status === "PENDING") || order.payments[0];
    if (!latestPayment) throw new AppError("Payment record not found", 404, "PAYMENT_NOT_FOUND");

    await this.rejectPaymentById(latestPayment.id, reason, "admin");

    return {
      success: true,
      updated: true,
      orderNo: order.orderNo,
      paymentId: latestPayment.id
    };
  }

  async getOrderPaymentStatus(orderNo: string) {
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });

    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return {
      orderNo: order.orderNo,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      latestPayment: order.payments[0] || null
    };
  }

  private async finalizeApprovedPayment(input: {
    paymentId: string;
    order: any;
    paymentStatus: "APPROVED" | "PAID";
    providerRef: string;
    rawPayload?: unknown;
    actorType: "admin" | "system";
    actorId?: string;
  }) {
    const payment = await prisma.payment.findUnique({
      where: { id: input.paymentId }
    });

    if (!payment) throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");
    if (payment.status === "APPROVED" || payment.status === "PAID") {
      return payment;
    }

    const now = new Date();
    const order = input.order;
    const userId = order.userId || null;
    const packageCredits = Number(order.package.creditsIncluded || 0);
    const monthlyLimit = Number(order.package.monthlyCreditLimit || packageCredits || 0);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: input.paymentStatus,
        providerRef: input.providerRef,
        paidAt: now,
        reviewedAt: now,
        reviewedBy: input.actorId || input.actorType,
        rawPayload: input.rawPayload as object | undefined
      }
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "PAID",
        orderStatus: "PROCESSING"
      }
    });

    let walletSummary:
      | {
          walletId: string;
          transactionId: string;
          amount: number;
        }
      | undefined;
    let subscriptionSummary:
      | {
          subscriptionId: string;
        }
      | undefined;

    let walletIdForSubscription: string | null = null;

    if (userId && packageCredits > 0) {
      const wallet = await this.walletService.getOrCreateWallet(userId);
      walletIdForSubscription = wallet.id;
      const walletResult = await this.walletService.creditWallet({
        walletId: wallet.id,
        amount: packageCredits,
        creditSource: "PURCHASED",
        referenceType: "payment",
        referenceId: payment.id,
        paymentId: payment.id,
        orderId: order.id,
        note: `Credits granted for package ${order.package.code}`,
        metadata: {
          orderNo: order.orderNo,
          packageCode: order.package.code,
          providerRef: input.providerRef
        }
      });
      walletSummary = {
        walletId: walletResult.wallet.id,
        transactionId: walletResult.transaction.id,
        amount: packageCredits
      };

      await prisma.auditLog.create({
        data: {
          actorType: input.actorType,
          actorId: input.actorId || userId,
          action: "wallet_credit_applied",
          entityType: "wallet",
          entityId: walletResult.wallet.id,
          meta: {
            paymentId: payment.id,
            orderNo: order.orderNo,
            amount: packageCredits
          }
        }
      });

      walletIdForSubscription = walletResult.wallet.id;
    } else {
      logger.info("Skipping wallet credit because order has no web user", {
        orderNo: order.orderNo,
        orderId: order.id
      });
    }

    if (userId && monthlyLimit > 0) {
      const walletId = walletIdForSubscription || (await this.walletService.getOrCreateWallet(userId)).id;
      const subscription = await this.subscriptionService.createOrRefreshSubscription({
        userId,
        walletId,
        packageId: order.packageId,
        planCode: order.package.code,
        monthlyCreditLimit: monthlyLimit,
        referenceType: "payment",
        referenceId: payment.id
      });

      subscriptionSummary = { subscriptionId: subscription.id };
    }

    await this.imageQueue.enqueueOrderProcessing(order.id);

    const refreshedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { customer: true }
    });

    if (refreshedOrder) {
      await this.delivery.sendPaymentConfirmed(refreshedOrder.customer.whatsappNumber, refreshedOrder.orderNo);
      await this.delivery.sendProcessingStarted(refreshedOrder.customer.whatsappNumber, refreshedOrder.orderNo);
    }

    await prisma.auditLog.create({
      data: {
        actorType: input.actorType,
        actorId: input.actorId || null,
        action: "payment_approved",
        entityType: "payment",
        entityId: payment.id,
        meta: {
          orderNo: order.orderNo,
          providerRef: input.providerRef,
          walletTransactionId: walletSummary?.transactionId || null,
          subscriptionId: subscriptionSummary?.subscriptionId || null
        }
      }
    });

    return {
      paymentId: payment.id,
      orderNo: order.orderNo,
      walletTransactionId: walletSummary?.transactionId,
      subscriptionId: subscriptionSummary?.subscriptionId
    };
  }

  async approvePaymentById(paymentId: string, actorType: "admin" | "system" = "admin", actorId?: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: {
          include: {
            customer: true,
            user: true,
            package: true,
            images: true,
            payments: { orderBy: { createdAt: "desc" } }
          }
        }
      }
    });

    if (!payment) throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");
    if (!payment.order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    if (payment.status === "APPROVED" || payment.status === "PAID") {
      return {
        success: true,
        updated: false,
        paymentId,
        orderNo: payment.order.orderNo
      };
    }

    await this.finalizeApprovedPayment({
      paymentId: payment.id,
      order: payment.order,
      paymentStatus: payment.provider === "manual" ? "APPROVED" : "PAID",
      providerRef: payment.providerRef || payment.id,
      rawPayload: payment.rawPayload,
      actorType,
      actorId
    });

    return {
      success: true,
      updated: true,
      paymentId,
      orderNo: payment.order.orderNo
    };
  }

  async rejectPaymentById(paymentId: string, reason = "Payment rejected", actorType: "admin" | "system" = "admin", actorId?: string) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: true
      }
    });

    if (!payment) throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewNotes: reason,
        reviewedBy: actorId || actorType,
        rawPayload: {
          ...((payment.rawPayload as Record<string, unknown> | null | undefined) || {}),
          rejectedAt: new Date().toISOString(),
          reason
        }
      }
    });

    await prisma.order.update({
      where: { id: payment.orderId },
      data: {
        paymentStatus: "REJECTED",
        orderStatus: "PAYMENT_PENDING"
      }
    });

    await prisma.auditLog.create({
      data: {
        actorType,
        actorId: actorId || null,
        action: "payment_rejected",
        entityType: "payment",
        entityId: payment.id,
        meta: {
          orderNo: payment.order?.orderNo,
          reason
        }
      }
    });

    return {
      success: true,
      updated: true,
      paymentId,
      orderNo: payment.order?.orderNo || ""
    };
  }
}
