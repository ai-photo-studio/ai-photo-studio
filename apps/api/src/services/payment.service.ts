import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { ImageQueueService } from "../queues/image.queue";
import { DeliveryService } from "./delivery.service";

export type CheckoutOrderInput = {
  id: string;
  orderNo: string;
  total: number;
  currency: string;
};

export type CheckoutResult = {
  checkoutUrl: string;
  gatewayRef: string;
};

export type PaymentWebhookResult = {
  success: boolean;
  gatewayRef: string;
  orderNo: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED";
};

export interface PaymentProvider {
  createCheckout(order: CheckoutOrderInput): Promise<CheckoutResult>;
  verifyWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>): Promise<PaymentWebhookResult>;
}

class MockPaymentProvider implements PaymentProvider {
  constructor(private readonly config: AppConfig) {}

  async createCheckout(order: CheckoutOrderInput): Promise<CheckoutResult> {
    const gatewayName = this.config.PAYMENT_GATEWAY_NAME.toLowerCase();
    const refPrefix = gatewayName === "manual" ? "MANUAL" : "MOCK";
    const gatewayRef = `${refPrefix}-${order.orderNo}-${Date.now()}`;
    const base = this.config.PAYMENT_GATEWAY_BASE_URL || "http://localhost:4000";
    const checkoutUrl = `${base.replace(/\/$/, "")}/checkout?orderNo=${encodeURIComponent(order.orderNo)}&ref=${encodeURIComponent(gatewayRef)}`;
    return { checkoutUrl, gatewayRef };
  }

  async verifyWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>): Promise<PaymentWebhookResult> {
    const body = payload as any;
    const signature = String(headers["x-mock-signature"] || "");
    const orderNo = String(body?.orderNo || "");
    const gatewayRef = String(body?.gatewayRef || "");
    const status = String(body?.status || "PENDING").toUpperCase() as "PENDING" | "PAID" | "FAILED" | "REFUNDED";

    if (this.config.NODE_ENV === "production") {
      throw new AppError("Mock payment webhook is disabled in production", 400, "MOCK_WEBHOOK_DISABLED");
    }

    if (!signature || signature !== this.config.PAYMENT_GATEWAY_SECRET) {
      throw new AppError("Invalid payment webhook signature", 401, "INVALID_SIGNATURE");
    }

    return {
      success: status === "PAID",
      gatewayRef,
      orderNo,
      status
    };
  }
}

export class PaymentService {
  private readonly provider: PaymentProvider;
  private readonly imageQueue: ImageQueueService;
  private readonly delivery: DeliveryService;

  constructor(private readonly config: AppConfig) {
    this.provider = new MockPaymentProvider(config);
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
  }) {
    return prisma.payment.create({
      data: {
        orderId: input.orderId,
        provider: this.config.PAYMENT_GATEWAY_NAME,
        providerRef: input.gatewayRef,
        checkoutUrl: input.checkoutUrl,
        amount: input.amount.toFixed(2),
        currency: input.currency,
        status: "PENDING"
      }
    });
  }

  async handleWebhook(payload: unknown, headers: Record<string, string | string[] | undefined>) {
    const verified = await this.provider.verifyWebhook(payload, headers);
    const providerEventId = `${verified.gatewayRef}-${verified.orderNo}-${verified.status}`;

    await prisma.webhookEvent.upsert({
      where: { source_providerEventId: { source: "payment", providerEventId } },
      update: {
        payload: payload as object,
        eventType: verified.status
      },
      create: {
        source: "payment",
        providerEventId,
        eventType: verified.status,
        payload: payload as object,
        processed: false
      }
    });

    if (!verified.success || verified.status !== "PAID") {
      logger.warn("Payment webhook ignored because status is not PAID", { orderNo: verified.orderNo, status: verified.status });
      return { success: true, updated: false };
    }

    const order = await prisma.order.findUnique({ where: { orderNo: verified.orderNo } });
    if (!order) throw new AppError("Order not found for payment webhook", 404, "ORDER_NOT_FOUND");

    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { orderId: order.id, providerRef: verified.gatewayRef },
        data: { status: "PAID", paidAt: new Date(), rawPayload: payload as object }
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", orderStatus: "PROCESSING" }
      }),
      prisma.webhookEvent.update({
        where: { source_providerEventId: { source: "payment", providerEventId } },
        data: { processed: true, processedAt: new Date() }
      })
    ]);

    await this.imageQueue.enqueueOrderProcessing(order.id);
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { customer: true }
    });
    if (fullOrder) {
      await this.delivery.sendPaymentConfirmed(fullOrder.customer.whatsappNumber, fullOrder.orderNo);
      await this.delivery.sendProcessingStarted(fullOrder.customer.whatsappNumber, fullOrder.orderNo);
    }

    return { success: true, updated: true, orderNo: verified.orderNo, enqueued: true };
  }

  async approveManualPayment(orderId: string) {
    if (this.config.PAYMENT_GATEWAY_NAME !== "manual") {
      throw new AppError("Manual payment approval is only available when PAYMENT_GATEWAY_NAME=manual", 400, "MANUAL_PAYMENT_DISABLED");
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        images: true
      }
    });

    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (order.paymentStatus === "PAID") throw new AppError("Order is already paid", 400, "ORDER_ALREADY_PAID");
    if (order.orderStatus === "CANCELLED") throw new AppError("Cancelled orders cannot be approved", 400, "ORDER_CANCELLED");
    if (order.orderStatus === "COMPLETED") throw new AppError("Completed orders cannot be approved", 400, "ORDER_COMPLETED");
    if (order.orderStatus === "FAILED") throw new AppError("Failed orders cannot be approved", 400, "ORDER_FAILED");
    if (order.paymentStatus !== "PENDING" || order.orderStatus !== "PAYMENT_PENDING") {
      throw new AppError("Order is not waiting for manual payment approval", 400, "ORDER_NOT_PENDING");
    }

    const latestPayment = order.payments[0];
    if (!latestPayment) throw new AppError("Payment record not found", 404, "PAYMENT_NOT_FOUND");

    const manualPayload = {
      source: "manual-approval",
      orderId: order.id,
      orderNo: order.orderNo,
      approvedAt: new Date().toISOString()
    };

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: latestPayment.id },
        data: { status: "PAID", paidAt: new Date(), rawPayload: manualPayload as object }
      }),
      prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "PAID", orderStatus: "PROCESSING" }
      })
    ]);

    const refreshedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: { customer: true }
    });

    await this.imageQueue.enqueueOrderProcessing(order.id);

    if (refreshedOrder) {
      await this.delivery.sendPaymentConfirmed(refreshedOrder.customer.whatsappNumber, refreshedOrder.orderNo);
      await this.delivery.sendProcessingStarted(refreshedOrder.customer.whatsappNumber, refreshedOrder.orderNo);
    }

    return {
      success: true,
      updated: true,
      orderNo: order.orderNo,
      enqueued: true,
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
}
