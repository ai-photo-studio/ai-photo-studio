import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

const QUEUE_TIMEOUT_SECONDS = parseInt(process.env.QUEUE_TIMEOUT_SECONDS || "60", 10);
const WATCHDOG_INTERVAL_MS = 10_000;
const BATCH_SIZE = 50;

let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startQueueWatchdog(): void {
  if (watchdogTimer) return;
  logger.info("QUEUE_WATCHDOG starting with interval 10s, queue timeout", { QUEUE_TIMEOUT_SECONDS });
  watchdogTimer = setInterval(runWatchdogCycle, WATCHDOG_INTERVAL_MS);
}

export function stopQueueWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

async function runWatchdogCycle(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const cutoff = new Date(Date.now() - QUEUE_TIMEOUT_SECONDS * 1000);
    const staleJobs = await prisma.processingJob.findMany({
      where: {
        status: { in: ["QUEUED", "RETRYING"] },
        createdAt: { lt: cutoff },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" },
    });

    if (staleJobs.length === 0) return;

    logger.warn("QUEUE_WATCHDOG found stale jobs", {
      count: staleJobs.length,
      oldestAgeMinutes: Math.round((Date.now() - staleJobs[0].createdAt.getTime()) / 60000),
    });

    for (const job of staleJobs) {
      const queueWaitMinutes = Math.round((Date.now() - job.createdAt.getTime()) / 60000);
      await prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          errorMessage: `Queue timeout after ${QUEUE_TIMEOUT_SECONDS}s (waited ${queueWaitMinutes}min)`,
          failedAt: new Date(),
          deadLetterReason: `QUEUE_WATCHDOG_TIMEOUT: stale ${queueWaitMinutes}min`,
          failureStage: "queue",
        },
      });
      logger.warn("QUEUE_WATCHDOG cancelled stale job", {
        jobId: job.id,
        orderId: job.orderId,
        queueWaitMinutes,
        reason: `exceeded ${QUEUE_TIMEOUT_SECONDS}s timeout`,
      });
    }

    if (staleJobs.length >= BATCH_SIZE) {
      logger.warn("QUEUE_WATCHDOG batch full, more stale jobs may exist");
    }
  } catch (error) {
    logger.error("QUEUE_WATCHDOG cycle failed", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    isRunning = false;
  }
}
