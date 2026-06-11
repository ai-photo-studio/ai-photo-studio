import { Queue } from "bullmq";
import type { AppConfig } from "../config/env";
import { logger } from "../utils/logger";
import type { AIProviderName, WorkflowMode, WorkflowType } from "../providers/provider.interface";

export type PhaseCImageProcessingPayload = {
  orderId: string;
  orderItemId?: string;
  senderNumber: string;
  messageId: string;
  mediaId: string;
  originalStorageKey?: string;
  providerName?: AIProviderName;
  workflowType?: WorkflowType;
  workflowMode?: WorkflowMode;
  deadLetterReason?: string;
};

export type EnqueuePhaseCJobResult = {
  dryRun: boolean;
  queueJobId?: string;
};

const createConnection = (config: AppConfig) => ({ url: config.REDIS_URL } as any);

export class PhaseCImageProcessingQueue {
  private readonly queue: Queue<PhaseCImageProcessingPayload> | null;
  private readonly deadLetterQueue: Queue<PhaseCImageProcessingPayload> | null;
  private readonly dryRun: boolean;

  constructor(private readonly config: AppConfig) {
    this.dryRun = config.queueDryRun;

    if (this.dryRun) {
      logger.warn("Phase C image-processing queue running in dry-run mode (Redis disabled)");
      this.queue = null;
      this.deadLetterQueue = null;
      return;
    }

    const connection = createConnection(config);
    this.queue = new Queue<PhaseCImageProcessingPayload>("image-processing", { connection });
    this.deadLetterQueue = new Queue<PhaseCImageProcessingPayload>("image-processing-dead-letter", {
      connection
    });
  }

  async enqueueImageProcessing(payload: PhaseCImageProcessingPayload): Promise<EnqueuePhaseCJobResult> {
    if (!this.queue) {
      logger.info("Phase C queue dry-run enqueue", { queue: "image-processing", ...payload });
      return { dryRun: true };
    }

    const job = await this.queue.add("process-whatsapp-image", payload, {
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: false,
      removeOnFail: false
    });

    return { dryRun: false, queueJobId: job.id ?? undefined };
  }

  async moveToDeadLetter(payload: PhaseCImageProcessingPayload, reason: string): Promise<EnqueuePhaseCJobResult> {
    if (!this.deadLetterQueue) {
      logger.info("Phase C dead-letter dry-run enqueue", { queue: "image-processing-dead-letter", reason, ...payload });
      return { dryRun: true };
    }

    const job = await this.deadLetterQueue.add(
      "dead-letter-whatsapp-image",
      { ...payload, originalStorageKey: payload.originalStorageKey, deadLetterReason: reason },
      { removeOnComplete: true }
    );

    return { dryRun: false, queueJobId: job.id ?? undefined };
  }

  async close() {
    await Promise.all([this.queue?.close(), this.deadLetterQueue?.close()].filter(Boolean) as Promise<void>[]);
  }
}
