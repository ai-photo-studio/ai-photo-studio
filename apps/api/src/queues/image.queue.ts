import { Queue } from "bullmq";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";

export type JobType = "order-processing" | "image-processing" | "whatsapp-image-processing" | "delivery" | "cleanup";

type JobPayload = {
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

  private async enqueue(
    name: JobType,
    data: JobPayload,
    options?: { attempts?: number; backoff?: { type: "fixed" | "exponential"; delay: number } }
  ) {
    if (!this.queue) {
      logger.info("Queue dry-run enqueue", { name, ...data });
      return { dryRun: true };
    }
    await this.queue.add(name, data, options ?? { attempts: 3, backoff: { type: "exponential", delay: 1000 } });
    return { dryRun: false };
  }

  enqueueOrderProcessing(orderId: string) {
    return this.enqueue("order-processing", { orderId });
  }

  enqueueImageProcessing(imageId: string) {
    return this.enqueue("image-processing", { imageId });
  }

  enqueueWhatsAppImageProcessing(imageId: string) {
    return this.enqueue("whatsapp-image-processing", { imageId }, { attempts: 2, backoff: { type: "fixed", delay: 1000 } });
  }

  enqueueDelivery(orderId: string) {
    return this.enqueue("delivery", { orderId });
  }

  enqueueCleanup() {
    return this.enqueue("cleanup", {});
  }

  async close() {
    if (this.queue) await this.queue.close();
  }
}
