import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { CustomerService, normalizeWhatsAppNumber } from "./customer.service";
import { PackageService } from "./package.service";
import { PhaseCImageProcessingQueue } from "../queues/phase-c-image-processing.queue";
import { StorageService } from "./storage.service";
import { WhatsAppService } from "./whatsapp.service";
import { NotificationService } from "./notification.service";
import { OrderService } from "./order.service";
import { resolveProductWorkflowMode } from "./product-workflow.service";
import { resolveVehicleWorkflowMode } from "./vehicle-workflow.service";
import type { AppConfig } from "../config/env";

type IncomingImagePayload = {
  senderNumber: string;
  messageId: string;
  mediaId: string;
};

type PhaseCOrderPipelineResult = {
  order: Awaited<ReturnType<typeof prisma.order.findUnique>> extends infer T ? NonNullable<T> : never;
  orderItem?: Awaited<ReturnType<typeof prisma.orderItem.create>>;
  processingJob?: Awaited<ReturnType<typeof prisma.processingJob.create>>;
  queueResult: { dryRun: boolean; queueJobId?: string };
};

const SUPPORTED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ORIGINAL_RETENTION_HOURS = 72;

const toOrderNo = (): string => {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `APS-${ts}-${rand}`;
};

const normalizeMimeType = (value: string): string => value.trim().toLowerCase();

const buildPlaceholderMeta = (payload: IncomingImagePayload, fileSizeBytes: number, mimeType: string) => ({
  senderNumber: normalizeWhatsAppNumber(payload.senderNumber),
  messageId: payload.messageId,
  mediaId: payload.mediaId,
  mimeType,
  fileSizeBytes
});

const resolveWorkflowType = (packageCode: string): "PRODUCT" | "VEHICLE" => {
  const normalized = packageCode.trim().toUpperCase();
  if (normalized.includes("VEHICLE") || normalized.includes("CAR") || normalized.includes("BIKE")) {
    return "VEHICLE";
  }
  return "PRODUCT";
};

export class PhaseCOrderPipelineService {
  private readonly config: AppConfig;
  private readonly customerService = new CustomerService();
  private readonly packageService = new PackageService();
  private readonly queue: PhaseCImageProcessingQueue;
  private readonly storage: StorageService;
  private readonly whatsapp: WhatsAppService;
  private readonly orders = new OrderService();
  private readonly notifications = new NotificationService();

  constructor(config: AppConfig) {
    this.config = config;
    this.queue = new PhaseCImageProcessingQueue(config);
    this.storage = new StorageService(config);
    this.whatsapp = new WhatsAppService(config);
  }

  async createOrderForIncomingImage(payload: IncomingImagePayload): Promise<PhaseCOrderPipelineResult> {
    const normalizedSender = normalizeWhatsAppNumber(payload.senderNumber);
    const existing = await prisma.order.findUnique({
      where: { whatsappMessageId: payload.messageId },
      include: { customer: true, package: true, items: true, processingJobs: true, images: true, statusHistory: true }
    });

    if (existing) {
      return {
        order: existing,
        orderItem: existing.items[0],
        processingJob: existing.processingJobs[0],
        queueResult: { dryRun: true }
      };
    }

    const pkg = await this.packageService.findDefaultActive();
    if (!pkg) {
      throw new AppError("No active package is available for incoming WhatsApp images", 409, "PACKAGE_NOT_AVAILABLE");
    }

    const customer = await this.customerService.findOrCreateByWhatsAppNumber(normalizedSender);
    const orderNo = toOrderNo();
    const workflowType = resolveWorkflowType(pkg.code) as "PRODUCT" | "VEHICLE";
    const workflowMode:
      | "WHITE_BACKGROUND"
      | "SOLID_COLOR_BACKGROUND"
      | "SHADOW_ENHANCEMENT"
      | "PRODUCT_STUDIO"
      | "SHOWROOM"
      | "PREMIUM_ROAD"
      | "DARK_STUDIO"
      | "PLATE_BLUR" =
      workflowType === "VEHICLE" ? resolveVehicleWorkflowMode(pkg.code) : resolveProductWorkflowMode(pkg.code);

    const order = await prisma.order.create({
      data: {
        orderNo,
        customerId: customer.id,
        packageId: pkg.id,
        whatsappSenderNumber: normalizedSender,
        whatsappMessageId: payload.messageId,
        whatsappMediaId: payload.mediaId,
        orderStatus: "NEW",
        paymentStatus: "PENDING",
        subtotal: Number(pkg.price).toFixed(2),
        total: Number(pkg.price).toFixed(2),
        currency: pkg.currency,
        notes: "Phase D webhook foundation order created from incoming WhatsApp image"
      },
      include: { customer: true, package: true, images: true, processingJobs: true, statusHistory: true }
    });

    await prisma.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: "NEW",
        source: "whatsapp.webhook",
        meta: buildPlaceholderMeta(payload, 0, "pending-download")
      }
    });

    this.notifications.log("WHATSAPP_ORDER_RECEIVED", {
      orderId: order.id,
      orderNo: order.orderNo,
      senderNumber: normalizedSender,
      messageId: payload.messageId,
      mediaId: payload.mediaId
    });

    let media;
    try {
      media = await this.whatsapp.downloadMedia(payload.mediaId);
    } catch (error) {
      await this.orders.updateOrderStatus(order.id, {
        toStatus: "FAILED",
        source: "whatsapp.webhook",
        reason: error instanceof Error ? error.message : String(error),
        meta: { messageId: payload.messageId, mediaId: payload.mediaId }
      });
      this.notifications.log("WHATSAPP_FAILED", {
        orderId: order.id,
        orderNo: order.orderNo,
        stage: "download",
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }

    const mimeType = normalizeMimeType(media.mimeType);
    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      const reason = `Unsupported image type: ${media.mimeType}`;
      await this.orders.updateOrderStatus(order.id, {
        toStatus: "FAILED",
        source: "whatsapp.webhook",
        reason,
        meta: { mimeType: media.mimeType, messageId: payload.messageId }
      });
      this.notifications.log("WHATSAPP_FAILED", {
        orderId: order.id,
        orderNo: order.orderNo,
        stage: "validation",
        error: reason
      });
      throw new AppError(reason, 415, "WHATSAPP_UNSUPPORTED_IMAGE_TYPE");
    }

    if (media.buffer.length > MAX_IMAGE_BYTES) {
      const reason = `Image exceeds size limit of ${MAX_IMAGE_BYTES} bytes`;
      await this.orders.updateOrderStatus(order.id, {
        toStatus: "FAILED",
        source: "whatsapp.webhook",
        reason,
        meta: { fileSizeBytes: media.buffer.length, messageId: payload.messageId }
      });
      this.notifications.log("WHATSAPP_FAILED", {
        orderId: order.id,
        orderNo: order.orderNo,
        stage: "validation",
        error: reason
      });
      throw new AppError(reason, 413, "WHATSAPP_IMAGE_TOO_LARGE");
    }

    const originalUpload = await this.storage.uploadOriginal({
      fileName: media.fileName,
      body: media.buffer,
      contentType: mimeType
    });

    await this.orders.attachOriginalMedia(order.id, {
      storageKey: originalUpload.key,
      url: originalUpload.url,
      expiresAt: originalUpload.expiresAt,
      mimeType,
      fileSizeBytes: media.buffer.length
    });

    const originalImage = await prisma.orderImage.create({
      data: {
        orderId: order.id,
        kind: "ORIGINAL",
        storageKey: originalUpload.key,
        mimeType,
        fileSizeBytes: media.buffer.length,
        expiresAt: new Date(Date.now() + ORIGINAL_RETENTION_HOURS * 3600_000)
      }
    });

    const orderItem = await prisma.orderItem.create({
      data: {
        orderId: order.id,
        itemType: "WHATSAPP_IMAGE",
        title: "Incoming WhatsApp image",
        quantity: 1,
        unitPrice: pkg.price,
        currency: order.currency,
        metadata: {
          senderNumber: normalizedSender,
          messageId: payload.messageId,
          mediaId: payload.mediaId,
          providerName: this.config.aiProvider,
          workflowType,
          workflowMode,
          originalStorageKey: originalUpload.key,
          originalUrl: originalUpload.url,
          originalExpiresAt: originalUpload.expiresAt.toISOString(),
          fileSizeBytes: media.buffer.length,
          mimeType
        },
        sourceMessageId: payload.messageId,
        sourceMediaId: payload.mediaId
      }
    });

    let queueResult: { dryRun: boolean; queueJobId?: string } = { dryRun: true };
    let processingJob: Awaited<ReturnType<typeof prisma.processingJob.create>> | undefined;
    try {
      queueResult = await this.queue.enqueueImageProcessing({
        orderId: order.id,
        orderItemId: orderItem.id,
        senderNumber: normalizedSender,
        messageId: payload.messageId,
        mediaId: payload.mediaId,
        originalStorageKey: originalUpload.key,
        providerName: this.config.aiProvider,
        workflowType,
        workflowMode
      });

      processingJob = await prisma.processingJob.create({
        data: {
          orderId: order.id,
          orderItemId: orderItem.id,
          queueName: "image-processing",
          jobName: "process-whatsapp-image",
          providerName: this.config.aiProvider,
          workflowType,
          workflowMode,
          status: "QUEUED",
          attempts: 0,
          maxAttempts: 5,
          queueJobId: queueResult.queueJobId,
          payload: {
            senderNumber: normalizedSender,
            messageId: payload.messageId,
            mediaId: payload.mediaId,
            originalStorageKey: originalUpload.key,
            providerName: this.config.aiProvider,
            workflowType,
            workflowMode
          }
        }
      });

      await this.orders.updateOrderStatus(order.id, {
        toStatus: "QUEUED",
        source: "whatsapp.webhook",
        meta: {
          queueJobId: queueResult.queueJobId,
          originalImageId: originalImage.id,
          providerName: this.config.aiProvider,
          workflowType,
          workflowMode
        }
      });

    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.orders.updateOrderStatus(order.id, {
        toStatus: "FAILED",
        source: "whatsapp.webhook",
        reason,
        meta: { messageId: payload.messageId, mediaId: payload.mediaId, originalStorageKey: originalUpload.key }
      });
      this.notifications.log("WHATSAPP_FAILED", {
        orderId: order.id,
        orderNo: order.orderNo,
        stage: "queue",
        error: reason
      });
      throw error;
    }

    const refreshedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        customer: true,
        package: true,
        items: true,
        processingJobs: true,
        images: true,
        statusHistory: true
      }
    });

    if (!refreshedOrder) {
      throw new AppError("Order not found after creation", 404, "ORDER_NOT_FOUND");
    }

    return {
      order: refreshedOrder,
      orderItem,
      processingJob,
      queueResult
    };
  }

  async close() {
    await this.queue.close();
  }
}
