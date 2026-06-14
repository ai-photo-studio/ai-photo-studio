import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

export type ProcessingMetrics = {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  avgDurationMs: number;
  jobsPerHour: number;
  failureRate: number;
};

export class ProcessingMetricsService {
  async getMetrics(hoursBack = 24): Promise<ProcessingMetrics> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [totalJobs, completedJobs, failedJobs, completedDurations] = await Promise.all([
      prisma.processingJob.count({ where: { createdAt: { gte: since } } }),
      prisma.processingJob.count({ where: { createdAt: { gte: since }, status: "COMPLETED" } }),
      prisma.processingJob.count({ where: { createdAt: { gte: since }, status: "FAILED" } }),
      prisma.processingJob.findMany({
        where: { createdAt: { gte: since }, status: "COMPLETED", startedAt: { not: null }, completedAt: { not: null } },
        select: { startedAt: true, completedAt: true }
      })
    ]);

    const durations = completedDurations
      .filter((j) => j.startedAt && j.completedAt)
      .map((j) => j.completedAt!.getTime() - j.startedAt!.getTime());

    const avgDurationMs = durations.length > 0 ? Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) : 0;
    const failureRate = totalJobs > 0 ? Math.round((failedJobs / totalJobs) * 10000) / 100 : 0;
    const jobsPerHour = Math.round((completedJobs / hoursBack) * 100) / 100;

    return {
      totalJobs,
      completedJobs,
      failedJobs,
      avgDurationMs,
      jobsPerHour,
      failureRate
    };
  }

  async getCreativeMetrics(hoursBack = 24): Promise<{
    totalCreativeJobs: number;
    completedCreativeJobs: number;
    failedCreativeJobs: number;
    creativeFailureRate: number;
  }> {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const [total, completed, failed] = await Promise.all([
      prisma.creativeStudioJob.count({ where: { createdAt: { gte: since } } }),
      prisma.creativeStudioJob.count({ where: { createdAt: { gte: since }, generationStatus: "COMPLETED" } }),
      prisma.creativeStudioJob.count({ where: { createdAt: { gte: since }, generationStatus: "FAILED" } })
    ]);

    const failureRate = total > 0 ? Math.round((failed / total) * 10000) / 100 : 0;

    return {
      totalCreativeJobs: total,
      completedCreativeJobs: completed,
      failedCreativeJobs: failed,
      creativeFailureRate: failureRate
    };
  }
}