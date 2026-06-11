import { Worker } from "bullmq";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { NotificationService } from "../services/notification.service";
import { OrderService } from "../services/order.service";
import { PhaseCImageProcessingQueue, type PhaseCImageProcessingPayload } from "../queues/phase-c-image-processing.queue";
import { StorageService } from "../services/storage.service";
import { logger } from "../utils/logger";

const PROCESSING_RETENTION_DAYS = 30;

const toProcessedFileName = (fileName: string, jobId?: string) => {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `processed-${jobId || "job"}-${safe}`;
};

export const startImageProcessingWorker = (config: AppConfig) => {
  if (config.queueDryRun) {
    logger.warn("Phase D image worker skipped in dry-run queue mode");
    return null;
  }

  const storage = new StorageService(config);
  const orders = new OrderService();
  const notifications = new NotificationService();
  const deadLetterQueue = new PhaseCImageProcessingQueue(config);

  const worker = new Worker<PhaseCImageProcessingPayload>(
    "image-processing",
    async (job) => {
      const payload = job.data;
      const processingJob = await prisma.processingJob.findUnique({
        where: { queueJobId: String(job.id) },
        include: { order: true, orderItem: true }
      });

      if (!processingJob) {
        throw new Error(`Processing job record not found for queue job ${job.id}`);
      }

      const order = await prisma.order.findUnique({
        where: { id: processingJob.orderId },
        include: { customer: true, package: true, images: true, processingJobs: true, statusHistory: true }
      });

      if (!order) {
        throw new Error(`Order ${processingJob.orderId} not found`);
      }

      await prisma.processingJob.update({
        where: { id: processingJob.id },
        data: {
          status: "RUNNING",
          attempts: job.attemptsMade + 1,
          startedAt: processingJob.startedAt ?? new Date(),
          errorMessage: null,
          deadLetterReason: null
        }
      });

      await orders.updateOrderStatus(order.id, {
        toStatus: "PROCESSING",
        source: "worker.image-processing",
        meta: {
          queueJobId: job.id,
          attempt: job.attemptsMade + 1,
          originalStorageKey: payload.originalStorageKey
        }
      });

      notifications.log("WHATSAPP_PROCESSING", {
        orderId: order.id,
        orderNo: order.orderNo,
        queueJobId: job.id,
        attempt: job.attemptsMade + 1
      });

      if (!payload.originalStorageKey) {
        throw new Error("Original storage key is missing from processing payload");
      }

      const original = await storage.downloadFile(payload.originalStorageKey);
      const originalImage = order.images.find((image) => image.storageKey === payload.originalStorageKey) ?? order.images[0];
      const originalFileName = originalImage?.storageKey.split("/").pop() || `${order.orderNo}.jpg`;
      const processedBuffer = Buffer.from(original.body);
      const processedUpload = await storage.uploadProcessed({
        fileName: toProcessedFileName(originalFileName, String(job.id)),
        body: processedBuffer,
        contentType: original.contentType || originalImage?.mimeType || "image/jpeg"
      });
      const processedDownloadUrl = await storage.generateDownloadUrl(processedUpload.key);
      const processedExpiresAt = new Date(Date.now() + PROCESSING_RETENTION_DAYS * 24 * 3600_000);

      await prisma.$transaction([
        prisma.orderImage.create({
          data: {
            orderId: order.id,
            kind: "FINAL",
            storageKey: processedUpload.key,
            mimeType: original.contentType || originalImage?.mimeType || "image/jpeg",
            fileSizeBytes: processedBuffer.length,
            expiresAt: processedExpiresAt
          }
        }),
        prisma.order.update({
          where: { id: order.id },
          data: {
            processedStorageKey: processedUpload.key,
            processedUrl: processedDownloadUrl,
            processedExpiresAt
          }
        }),
        prisma.processingJob.update({
          where: { id: processingJob.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            errorMessage: null,
            deadLetterReason: null
          }
        })
      ]);

      await orders.updateOrderStatus(order.id, {
        toStatus: "COMPLETED",
        source: "worker.image-processing",
        meta: {
          queueJobId: job.id,
          processedStorageKey: processedUpload.key,
          processedUrl: processedDownloadUrl,
          processedExpiresAt: processedExpiresAt.toISOString()
        }
      });

      notifications.log("WHATSAPP_COMPLETED", {
        orderId: order.id,
        orderNo: order.orderNo,
        processedStorageKey: processedUpload.key,
        processedUrl: processedDownloadUrl
      });

      return {
        orderId: order.id,
        processedStorageKey: processedUpload.key,
        processedUrl: processedDownloadUrl
      };
    },
    {
      connection: { url: config.REDIS_URL } as any
    }
  );

  worker.on("failed", async (job, error) => {
    if (!job) return;

    const payload = job.data;
    const processingJob = await prisma.processingJob.findUnique({
      where: { queueJobId: String(job.id) },
      include: { order: true }
    });

    if (!processingJob) {
      logger.error("Phase D worker failed without processing record", {
        jobId: job.id,
        error: error.message
      });
      return;
    }

    const maxAttempts = Number(job.opts.attempts ?? processingJob.maxAttempts ?? 5);
    const currentAttempt = job.attemptsMade + 1;
    const isFinalAttempt = currentAttempt >= maxAttempts;

    await prisma.processingJob.update({
      where: { id: processingJob.id },
      data: {
        attempts: currentAttempt,
        status: isFinalAttempt ? "FAILED" : "RETRYING",
        errorMessage: error.message,
        failedAt: isFinalAttempt ? new Date() : processingJob.failedAt,
        deadLetterReason: isFinalAttempt ? error.message : null
      }
    });

    if (isFinalAttempt) {
      await deadLetterQueue.moveToDeadLetter(payload, error.message);
      await orders.updateOrderStatus(processingJob.orderId, {
        toStatus: "FAILED",
        source: "worker.image-processing",
        reason: error.message,
        meta: {
          queueJobId: job.id,
          attempts: currentAttempt
        }
      });

      notifications.log("WHATSAPP_FAILED", {
        orderId: processingJob.orderId,
        orderNo: processingJob.order.orderNo,
        queueJobId: job.id,
        error: error.message
      });
      return;
    }

    logger.warn("Phase D worker job will retry", {
      jobId: job.id,
      attempt: currentAttempt,
      maxAttempts,
      error: error.message
    });
  });

  return worker;
};
