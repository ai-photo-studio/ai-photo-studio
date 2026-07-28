import { prisma } from "../db/prisma";

export type QueueMetrics = {
  queueDepth: number;
  activeWorkers: number;
  queuedJobs: number;
  retryingJobs: number;
  deadLetterJobs: number;
};

export class QueueMetricsService {
  async getMetrics(): Promise<QueueMetrics> {
    const [queuedJobs, retryingJobs, deadLetterJobs, runningJobs] = await Promise.all([
      prisma.processingJob.count({ where: { status: "QUEUED" } }),
      prisma.processingJob.count({ where: { status: "RETRYING" } }),
      prisma.processingJob.count({ where: { status: "DEAD_LETTER" } }),
      prisma.processingJob.count({ where: { status: "RUNNING" } })
    ]);

    return {
      queueDepth: queuedJobs + retryingJobs,
      activeWorkers: runningJobs,
      queuedJobs,
      retryingJobs,
      deadLetterJobs
    };
  }

  async getQueueHealth(): Promise<{
    healthy: boolean;
    queueDepth: number;
    oldestJobMinutes: number | null;
  }> {
    const oldestJob = await prisma.processingJob.findFirst({
      where: { status: { in: ["QUEUED", "RETRYING"] } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true }
    });

    const metrics = await this.getMetrics();
    const oldestJobMinutes = oldestJob ? Math.round((Date.now() - oldestJob.createdAt.getTime()) / 60000) : null;

    return {
      healthy: metrics.queueDepth < 100,
      queueDepth: metrics.queueDepth,
      oldestJobMinutes
    };
  }
}