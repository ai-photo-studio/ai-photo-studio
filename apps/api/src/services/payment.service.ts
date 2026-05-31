import { prisma } from "../db/prisma";
import type { AppConfig } from "../config/env";
import { AppError } from "../utils/errors";
import { logger } from "../utils/logger";
import { ImageQueueService } from "../queues/image.queue";

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
    const gatewayRef = `MOCK-${order.orderNo}-${Date.now()}`;
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

  constructor(private readonly config: AppConfig) {
    this.provider = new MockPaymentProvider(config);
    this.imageQueue = new ImageQueueService(config);
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
    await this.imageQueue.enqueueDelivery(order.id);

    return { success: true, updated: true, orderNo: verified.orderNo, enqueued: true };
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
