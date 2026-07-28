import { Queue } from "bullmq";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

export type JobType = "process-whatsapp-image" | "delivery" | "cleanup";

type JobPayload = {
  orderId?: string;
  imageId?: string;
  originalStorageKey?: string;
  providerName?: string;
  workflowType?: "PRODUCT" | "VEHICLE";
  workflowMode?: string;
  selectedActions?: string[];
  billingReservation?: null;
};

type LegacyJobPayload = {
  orderId?: string;
  imageId?: string;
};

export class ImageQueueService {
  private queue: Queue | null = null;
  private readonly dryRun: boolean;

  constructor(private readonly config: AppConfig) {
    this.dryRun = config.queueDryRun;
    if (!this.dryRun) {
      this.queue = new Queue("image-processing", {
        connection: { url: config.REDIS_URL } as any
      });
    } else {
      logger.warn("Image queue running in dry-run mode (Redis disabled)");
    }
  }

  async enqueueOrderProcessing(orderId: string): Promise<{ dryRun: boolean; queueJobId?: string }> {
    if (this.dryRun) {
      logger.info("Queue dry-run enqueue", { name: "order-processing", orderId });
      return { dryRun: true };
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, images: true, package: true }
    });

    if (!order) {
      logger.warn("Order not found for queue enqueue", { orderId });
      return { dryRun: false };
    }

    const queueJobId = `order-${orderId}-${Date.now()}`;

    const processingJob = await prisma.processingJob.create({
      data: {
        orderId: order.id,
        queueName: "image-processing",
        jobName: "order-processing",
        status: "QUEUED",
        attempts: 0,
        maxAttempts: 5,
        queueJobId,
        payload: { orderId: order.id }
      }
    });

    await this.queue!.add("process-whatsapp-image", {
      orderId: order.id,
      originalStorageKey: null,
      providerName: this.config.aiProvider,
      workflowType: "PRODUCT",
      workflowMode: "PRODUCT_STUDIO",
      selectedActions: [],
      billingReservation: null
    }, {
      jobId: queueJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 }
    });

    return { dryRun: false, queueJobId };
  }

  async enqueueImageProcessing(imageId: string): Promise<{ dryRun: boolean; queueJobId?: string }> {
    if (this.dryRun) {
      logger.info("Queue dry-run enqueue", { name: "image-processing", imageId });
      return { dryRun: true };
    }

    const image = await prisma.orderImage.findUnique({
      where: { id: imageId },
      include: { order: { include: { package: true, customer: true } } }
    });

    if (!image) {
      logger.warn("Image not found for queue enqueue", { imageId });
      return { dryRun: false };
    }

    const order = await prisma.order.findUnique({
      where: { id: image.orderId },
      include: { package: true }
    });

    if (!order || order.paymentStatus !== "PAID") {
      logger.warn("Order not found or not paid for image queue", { imageId, orderId: image.orderId });
      return { dryRun: false };
    }

    const queueJobId = `img-${imageId}-${Date.now()}`;

    const processingJob = await prisma.processingJob.create({
      data: {
        orderId: order.id,
        orderItemId: null,
        queueName: "image-processing",
        jobName: "image-processing",
        providerName: this.config.aiProvider || "mock",
        workflowType: "PRODUCT",
        workflowMode: order.package?.workflowMode || "PRODUCT_STUDIO",
        status: "QUEUED",
        attempts: 0,
        maxAttempts: 5,
        queueJobId,
        payload: {
          imageId,
          originalStorageKey: image.storageKey
        }
      }
    });

    await this.queue!.add("process-whatsapp-image", {
      orderId: order.id,
      imageId: image.id,
      originalStorageKey: image.storageKey,
      providerName: this.config.aiProvider || "mock",
      workflowType: "PRODUCT",
      workflowMode: order.package?.workflowMode || "PRODUCT_STUDIO",
      selectedActions: [],
      billingReservation: null
    }, {
      jobId: queueJobId,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 }
    });

    return { dryRun: false, queueJobId };
  }

  async enqueueWhatsAppImageProcessing(imageId: string): Promise<{ dryRun: boolean; queueJobId?: string }> {
    if (this.dryRun) {
      logger.info("Queue dry-run enqueue", { name: "whatsapp-image-processing", imageId });
      return { dryRun: true };
    }

    const image = await prisma.orderImage.findUnique({
      where: { id: imageId },
      include: { order: { include: { package: true, customer: true } } }
    });

    if (!image) {
      logger.warn("Image not found for queue enqueue", { imageId });
      return { dryRun: false };
    }

    const order = await prisma.order.findUnique({
      where: { id: image.orderId },
      include: { package: true }
    });

    if (!order || order.paymentStatus !== "PAID") {
      logger.warn("Order not found or not paid for WhatsApp image queue", { imageId });
      return { dryRun: false };
    }

    const queueJobId = `wa-${imageId}-${Date.now()}`;

    const processingJob = await prisma.processingJob.create({
      data: {
        orderId: order.id,
        orderItemId: null,
        queueName: "image-processing",
        jobName: "process-whatsapp-image",
        providerName: "rembg",
        workflowType: "PRODUCT",
        workflowMode: "PRODUCT_STUDIO",
        status: "QUEUED",
        attempts: 0,
        maxAttempts: 2,
        queueJobId,
        payload: {
          imageId,
          originalStorageKey: image.storageKey,
          senderNumber: order.whatsappSenderNumber,
          messageId: `wa-${imageId}`,
          mediaId: imageId
        }
      }
    });

    await this.queue!.add("process-whatsapp-image", {
      orderId: order.id,
      imageId: image.id,
      originalStorageKey: image.storageKey,
      providerName: "rembg",
      workflowType: "PRODUCT",
      workflowMode: "PRODUCT_STUDIO",
      selectedActions: [],
      billingReservation: null
    }, {
      jobId: queueJobId,
      attempts: 2,
      backoff: { type: "fixed", delay: 1000 }
    });

    return { dryRun: false, queueJobId };
  }

  enqueueDelivery(orderId: string) {
    return this.enqueue("delivery", { orderId });
  }

  enqueueCleanup() {
    return this.enqueue("cleanup", {});
  }

  private async enqueue(
    name: JobType,
    data: JobPayload | LegacyJobPayload,
    options?: { attempts?: number; backoff?: { type: "fixed" | "exponential"; delay: number } }
  ) {
    if (!this.queue) {
      logger.info("Queue dry-run enqueue", { name, ...data });
      return { dryRun: true };
    }
    await this.queue.add(name, data, options ?? { attempts: 3, backoff: { type: "exponential", delay: 1000 } });
    return { dryRun: false };
  }

  async close() {
    if (this.queue) await this.queue.close();
  }
}