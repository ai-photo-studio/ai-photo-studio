import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { CustomerService } from "./customer.service";
import { normalizeWhatsAppNumber } from "./customer.service";
import { PackageService } from "./package.service";

type CreateOrderInput = {
  whatsappNumber: string;
  packageSlug: string;
  serviceType: string;
  userId?: string;
};

type AddOrderImageInput = {
  storageKey: string;
  mimeType?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  kind?: "ORIGINAL" | "PREVIEW" | "FINAL";
};

type OrderStatusTransition = {
  toStatus: string;
  source: string;
  reason?: string;
  meta?: Record<string, unknown>;
};

const toOrderNo = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `APS-${ts}-${rand}`;
};

export class OrderService {
  private readonly customerService = new CustomerService();
  private readonly packageService = new PackageService();

  async createOrder(input: CreateOrderInput) {
    const pkg = await this.packageService.findActiveBySlug(input.packageSlug);
    if (!pkg) throw new AppError("Selected package is not available", 400, "PACKAGE_NOT_FOUND");

    const customer = await this.customerService.findOrCreateByWhatsAppNumber(input.whatsappNumber);
    const amount = Number(pkg.price);

    const order = await prisma.order.create({
      data: {
        orderNo: toOrderNo(),
        customerId: customer.id,
        userId: input.userId || null,
        packageId: pkg.id,
        subtotal: amount.toFixed(2),
        total: amount.toFixed(2),
        currency: pkg.currency,
        paymentStatus: "PENDING",
        orderStatus: "PAYMENT_PENDING",
        notes: `serviceType:${input.serviceType}`
      }
    });

    return {
      id: order.id,
      orderNo: order.orderNo,
      amount: Number(order.total),
      currency: order.currency,
      package: {
        code: pkg.code,
        name: pkg.name,
        price: Number(pkg.price)
      },
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus
    };
  }

  async getOrderByOrderNo(orderNo: string) {
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        package: true,
        customer: true,
        images: true,
        payments: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
  }

  async linkOrderToUser(orderId: string, userId: string) {
    return prisma.order.update({
      where: { id: orderId },
      data: { userId }
    });
  }

  async addImages(orderNo: string, images: AddOrderImageInput[]) {
    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (images.length === 0) throw new AppError("At least one image is required", 400, "IMAGES_REQUIRED");

    await prisma.orderImage.createMany({
      data: images.map((img) => ({
        orderId: order.id,
        storageKey: img.storageKey,
        mimeType: img.mimeType,
        width: img.width,
        height: img.height,
        fileSizeBytes: img.fileSizeBytes,
        kind: img.kind || "ORIGINAL",
        expiresAt: new Date(
          Date.now() +
            (img.kind === "FINAL" ? 30 * 24 : img.kind === "PREVIEW" ? 7 * 24 : 72) * 3600_000
        )
      }))
    });

    const imageCount = await prisma.orderImage.count({ where: { orderId: order.id, kind: "ORIGINAL" } });
    const refreshed = await prisma.order.findUnique({ where: { id: order.id } });
    return {
      orderNo,
      imageCount,
      amount: refreshed ? Number(refreshed.total) : Number(order.total),
      paymentStatus: refreshed?.paymentStatus ?? order.paymentStatus,
      orderStatus: refreshed?.orderStatus ?? order.orderStatus
    };
  }

  async addImage(orderId: string, image: AddOrderImageInput) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    return prisma.orderImage.create({
      data: {
        orderId,
        storageKey: image.storageKey,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        fileSizeBytes: image.fileSizeBytes,
        kind: image.kind || "ORIGINAL",
        expiresAt: new Date(
          Date.now() +
            (image.kind === "FINAL" ? 30 * 24 : image.kind === "PREVIEW" ? 7 * 24 : 72) * 3600_000
        )
      }
    });
  }

  async findLatestPaidOrderByWhatsAppNumber(whatsappNumber: string) {
    const normalized = normalizeWhatsAppNumber(whatsappNumber);
    return prisma.order.findFirst({
      where: {
        customer: { is: { whatsappNumber: normalized } },
        paymentStatus: "PAID",
        orderStatus: { in: ["PAID", "PROCESSING"] }
      },
      include: { customer: true, package: true, images: true, aiJobs: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async listOrders() {
    return prisma.order.findMany({
      include: { customer: true, package: true },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async getOrderById(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { customer: true, package: true, images: true, payments: true, statusHistory: true, processingJobs: true }
    });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
  }

  async updateOrderStatus(orderId: string, transition: OrderStatusTransition) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        orderStatus: transition.toStatus as any,
        notes: transition.reason ? transition.reason.slice(0, 1000) : order.notes
      }
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        fromStatus: order.orderStatus as any,
        toStatus: transition.toStatus as any,
        source: transition.source,
        reason: transition.reason,
        meta: transition.meta as Prisma.InputJsonValue | undefined
      }
    });

    return updated;
  }

  async attachOriginalMedia(
    orderId: string,
    input: {
      storageKey: string;
      url: string;
      expiresAt: Date;
      mimeType?: string;
      fileSizeBytes?: number;
    }
  ) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        originalStorageKey: input.storageKey,
        originalUrl: input.url,
        originalExpiresAt: input.expiresAt
      }
    });
  }

  async attachProcessedMedia(
    orderId: string,
    input: {
      storageKey: string;
      url: string;
      expiresAt: Date;
      mimeType?: string;
      fileSizeBytes?: number;
    }
  ) {
    return prisma.order.update({
      where: { id: orderId },
      data: {
        processedStorageKey: input.storageKey,
        processedUrl: input.url,
        processedExpiresAt: input.expiresAt
      }
    });
  }

  async markOrderCompleted(orderId: string) {
    await this.updateOrderStatus(orderId, { toStatus: "COMPLETED", source: "order.service" });
  }

  async markOrderFailed(orderId: string, reason: string) {
    await this.updateOrderStatus(orderId, { toStatus: "FAILED", source: "order.service", reason });
  }
}
