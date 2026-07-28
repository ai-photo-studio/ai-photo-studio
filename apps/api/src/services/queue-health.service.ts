import { Queue } from "bullmq";
import type { AppConfig } from "../config/env";

export type QueueHealthState = {
  healthy: boolean;
  dryRun: boolean;
  queueName: string;
  counts: Record<string, number>;
  error: string | null;
};

export class QueueHealthService {
  constructor(private readonly config: AppConfig) {}

  async inspectImageQueue(): Promise<QueueHealthState> {
    if (this.config.queueDryRun) {
      return {
        healthy: true,
        dryRun: true,
        queueName: "image-processing",
        counts: {},
        error: null
      };
    }

    const queue = new Queue("image-processing", {
      connection: { url: this.config.REDIS_URL } as any
    });

    try {
      const counts = await queue.getJobCounts(
        "waiting",
        "active",
        "completed",
        "failed",
        "delayed",
        "paused",
        "prioritized"
      );

      return {
        healthy: true,
        dryRun: false,
        queueName: "image-processing",
        counts,
        error: null
      };
    } catch (error) {
      return {
        healthy: false,
        dryRun: false,
        queueName: "image-processing",
        counts: {},
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
}
