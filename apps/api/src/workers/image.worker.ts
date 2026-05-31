import { Worker } from "bullmq";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { ImageQueueService } from "../queues/image.queue";
import { AiProviderService } from "../services/ai-provider.service";
import { DeliveryService } from "../services/delivery.service";
import { OrderService } from "../services/order.service";
import { TemplateService } from "../services/template.service";
import { WatermarkService } from "../services/watermark.service";
import { logger } from "../utils/logger";

type WorkerJobPayload = { orderId?: string; imageId?: string };

export const startImageWorker = (config: AppConfig) => {
  if (config.queueDryRun) {
    logger.warn("Image worker skipped in dry-run queue mode");
    return null;
  }

  const ai = new AiProviderService(config);
  const template = new TemplateService();
  const watermark = new WatermarkService();
  const queue = new ImageQueueService(config);
  const delivery = new DeliveryService(config);
  const orders = new OrderService();

  const finalizeOrderIfReady = async (orderId: string) => {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { images: true, customer: true, aiJobs: true }
    });
    if (!order) return;

    const originals = order.images.filter((img) => img.kind === "ORIGINAL");
    const outputs = order.images.filter((img) => img.kind === "FINAL" || img.kind === "PREVIEW");
    const hasFailedJob = order.aiJobs.some((j) => j.status === "FAILED");

    if (hasFailedJob) {
      await orders.markOrderFailed(order.id, "One or more image jobs failed");
      await delivery.sendOrderFailed(order.customer.whatsappNumber, order.orderNo);
      return;
    }

    if (originals.length > 0 && outputs.length >= originals.length) {
      await orders.markOrderCompleted(order.id);
      await queue.enqueueDelivery(order.id);
      await delivery.sendOrderCompletedFromKeys(
        order.customer.whatsappNumber,
        order.orderNo,
        outputs.map((x) => x.storageKey)
      );
    }
  };

  const worker = new Worker<WorkerJobPayload>(
    "image-processing",
    async (job) => {
      if (job.name === "cleanup") return;
      const imageId = job.data.imageId;
      const orderId = job.data.orderId;

      if (job.name === "delivery" && orderId) {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          include: { customer: true, images: true }
        });
        if (!order || order.orderStatus !== "COMPLETED") return;
        const outputs = order.images.filter((img) => img.kind === "FINAL" || img.kind === "PREVIEW");
        await delivery.sendOrderCompletedFromKeys(
          order.customer.whatsappNumber,
          order.orderNo,
          outputs.map((x) => x.storageKey)
        );
        return;
      }

      if (imageId) {
        const image = await prisma.orderImage.findUnique({
          where: { id: imageId },
          include: { order: { include: { package: true, customer: true } } }
        });
        if (!image) return;
        if (image.order.paymentStatus !== "PAID") {
          logger.warn("Skipping image processing for unpaid order", { orderId: image.orderId, imageId });
          return;
        }

        const aiJob = await prisma.aiJob.create({
          data: {
            orderId: image.orderId,
            orderImageId: image.id,
            provider: config.AI_PROVIDER_NAME,
            operation: "package-pipeline",
            status: "RUNNING",
            attempts: job.attemptsMade + 1,
            inputKey: image.storageKey
          }
        });

        try {
          const result = await ai.processForPackage(image.order.package.code, image.storageKey);
          let outputKey = result.outputKey;
          if (image.order.package.code === "PREMIUM_LAUNCH") {
            outputKey = await template.applyStaticTemplate(outputKey);
          }
          if (image.order.package.code === "FREE_PREVIEW") {
            outputKey = await watermark.applyWatermark(result.previewKey || outputKey);
          }

          await prisma.$transaction([
            prisma.orderImage.create({
              data: {
                orderId: image.orderId,
                kind: result.previewKey ? "PREVIEW" : "FINAL",
                storageKey: outputKey,
                expiresAt: new Date(Date.now() + (result.previewKey ? 7 * 24 * 3600_000 : 72 * 3600_000))
              }
            }),
            prisma.aiJob.update({
              where: { id: aiJob.id },
              data: { status: "COMPLETED", outputKey, completedAt: new Date() }
            })
          ]);
        } catch (error) {
          await prisma.aiJob.update({
            where: { id: aiJob.id },
            data: { status: "FAILED", errorMessage: error instanceof Error ? error.message : "unknown error" }
          });
          await orders.markOrderFailed(image.orderId, "Image pipeline failed");
          await delivery.sendOrderFailed(image.order.customer.whatsappNumber, image.order.orderNo);
          throw error;
        }

        await finalizeOrderIfReady(image.orderId);
        return;
      }

      if (orderId) {
        const order = await prisma.order.findUnique({ where: { id: orderId }, include: { images: true } });
        if (!order || order.paymentStatus !== "PAID") return;
        for (const image of order.images.filter((x) => x.kind === "ORIGINAL")) {
          await queue.enqueueImageProcessing(image.id);
        }
      }
    },
    {
      connection: { url: config.REDIS_URL } as any
    }
  );

  worker.on("failed", (job, err) => {
    logger.error("Image worker job failed", { jobId: job?.id, name: job?.name, error: err.message });
  });

  return worker;
};
