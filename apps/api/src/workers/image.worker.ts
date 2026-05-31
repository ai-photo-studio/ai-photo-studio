import { Worker } from "bullmq";
import type { AppConfig } from "../config/env";
import { prisma } from "../db/prisma";
import { ImageQueueService } from "../queues/image.queue";
import { AiProviderService } from "../services/ai-provider.service";
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

  const worker = new Worker<WorkerJobPayload>(
    "image-processing",
    async (job) => {
      if (job.name === "cleanup") return;
      const imageId = job.data.imageId;
      const orderId = job.data.orderId;

      if (imageId) {
        const image = await prisma.orderImage.findUnique({
          where: { id: imageId },
          include: { order: { include: { package: true } } }
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
