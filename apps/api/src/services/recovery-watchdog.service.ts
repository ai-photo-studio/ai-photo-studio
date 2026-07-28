import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import { WalletService } from "./wallet.service";
import { NotificationService } from "./notification.service";
import { PhaseCImageProcessingQueue } from "../queues/phase-c-image-processing.queue";
import type { AppConfig } from "../config/env";

const GPU_TIMEOUT_SECONDS_BASIC = 120;
const GPU_TIMEOUT_SECONDS_PREMIUM = 240;
const GPU_TIMEOUT_SECONDS_ENTERPRISE = 480;
const STALE_HEARTBEAT_SECONDS = 60;
const LONG_WAITING_SECONDS = parseInt(process.env.QUEUE_TIMEOUT_SECONDS || "60", 10);
const RECOVERY_INTERVAL_MS = 60_000;
const BATCH_SIZE = 50;

const PACKAGE_RUNTIME_LIMITS: Record<string, number> = {
  basic: GPU_TIMEOUT_SECONDS_BASIC,
  premium: GPU_TIMEOUT_SECONDS_PREMIUM,
  enterprise: GPU_TIMEOUT_SECONDS_ENTERPRISE
};

let timer: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

export function startRecoveryWatchdog(config: AppConfig): void {
  if (timer) return;
  logger.info("RECOVERY_WATCHDOG starting with interval", { intervalMs: RECOVERY_INTERVAL_MS });
  timer = setInterval(() => { void runRecoveryCycle(config); }, RECOVERY_INTERVAL_MS);
}

export function stopRecoveryWatchdog(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

async function runRecoveryCycle(config: AppConfig): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    await recoverStaleProcessingJobs(config);
    await recoverLongWaitingJobs(config);
    await recoverAbandonedWorkers(config);
  } catch (error) {
    logger.error("RECOVERY_WATCHDOG cycle failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    isRunning = false;
  }
}

async function recoverStaleProcessingJobs(config: AppConfig): Promise<void> {
  const now = new Date();
  const heartbeatCutoff = new Date(now.getTime() - STALE_HEARTBEAT_SECONDS * 1000);

  const staleRunning = await prisma.processingJob.findMany({
    where: {
      status: "RUNNING",
      OR: [
        { lastHeartbeat: { lt: heartbeatCutoff } },
        { lastHeartbeat: null, startedAt: { lt: heartbeatCutoff } }
      ]
    },
    take: BATCH_SIZE,
    include: { order: { include: { user: true } } }
  });

  if (staleRunning.length === 0) return;

  logger.warn("RECOVERY found stale RUNNING jobs", {
    count: staleRunning.length,
    oldestMinutes: Math.round((now.getTime() - staleRunning[0].startedAt!.getTime()) / 60000)
  });

  const walletService = new WalletService();
  const notifications = new NotificationService();
  const deadLetterQueue = new PhaseCImageProcessingQueue(config);

  for (const job of staleRunning) {
    try {
      const gpuSeconds = job.processingStartedAt
        ? Math.round((now.getTime() - job.processingStartedAt.getTime()) / 1000)
        : 0;

      if (gpuSeconds > 0) {
        await prisma.processingJob.update({
          where: { id: job.id },
          data: { gpuSecondsSpent: { increment: gpuSeconds } }
        });
      }

      const jobBudgetSeconds = resolveBudgetSeconds(null);
      const exceededBudget = gpuSeconds > jobBudgetSeconds;

      if (exceededBudget) {
        await failJobFinal(job, walletService, notifications, deadLetterQueue, config,
          `GPU timeout: ${gpuSeconds}s exceeds ${jobBudgetSeconds}s budget (no heartbeat for ${STALE_HEARTBEAT_SECONDS}s)`,
          "GPU_TIMEOUT",
          job.attempts || 0
        );
      } else {
        await failJobWithRetry(job, walletService, notifications, deadLetterQueue, config,
          `No heartbeat for ${STALE_HEARTBEAT_SECONDS}s (gpuSeconds=${gpuSeconds}, budget=${jobBudgetSeconds})`,
          "HEARTBEAT_TIMEOUT"
        );
      }
    } catch (err) {
      logger.error("RECOVERY failed to recover stale job", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}

async function recoverLongWaitingJobs(config: AppConfig): Promise<void> {
  const cutoff = new Date(Date.now() - LONG_WAITING_SECONDS * 1000);

  const longWaiting = await prisma.processingJob.findMany({
    where: {
      status: { in: ["QUEUED", "RETRYING"] },
      createdAt: { lt: cutoff }
    },
    take: BATCH_SIZE,
    include: { order: { include: { user: true } } }
  });

  if (longWaiting.length === 0) return;

  logger.warn("RECOVERY found long-waiting jobs", {
    count: longWaiting.length,
    oldestMinutes: Math.round((Date.now() - longWaiting[0].createdAt.getTime()) / 60000)
  });

  const walletService = new WalletService();
  const notifications = new NotificationService();
  const deadLetterQueue = new PhaseCImageProcessingQueue(config);

  for (const job of longWaiting) {
    try {
      const waitMinutes = Math.round((Date.now() - job.createdAt.getTime()) / 60000);
      await failJobWithRetry(job, walletService, notifications, deadLetterQueue, config,
        `Queue wait timeout after ${LONG_WAITING_SECONDS}s (waited ${waitMinutes}min)`,
        "QUEUE_TIMEOUT"
      );
    } catch (err) {
      logger.error("RECOVERY failed to handle long-waiting job", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}

async function recoverAbandonedWorkers(config: AppConfig): Promise<void> {
  const heartbeatCutoff = new Date(Date.now() - STALE_HEARTBEAT_SECONDS * 1000);

  const abandoned = await prisma.processingJob.findMany({
    where: {
      status: "RUNNING",
      AND: [
        { processingStartedAt: { not: null } },
        { processingStartedAt: { lt: heartbeatCutoff } },
        { lastHeartbeat: null }
      ]
    },
    take: BATCH_SIZE,
    include: { order: { include: { user: true } } }
  });

  if (abandoned.length === 0) return;

  logger.warn("RECOVERY found abandoned worker jobs", {
    count: abandoned.length,
    oldestMinutes: Math.round((Date.now() - abandoned[0].processingStartedAt!.getTime()) / 60000)
  });

  const walletService = new WalletService();
  const notifications = new NotificationService();
  const deadLetterQueue = new PhaseCImageProcessingQueue(config);

  for (const job of abandoned) {
    try {
      const gpuSeconds = Math.round((Date.now() - job.processingStartedAt!.getTime()) / 1000);
      await failJobWithRetry(job, walletService, notifications, deadLetterQueue, config,
        `Abandoned by worker ${job.processingWorkerId || "unknown"} (gpuSeconds=${gpuSeconds})`,
        "WORKER_ABANDONED"
      );
    } catch (err) {
      logger.error("RECOVERY failed to recover abandoned job", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }
}

function resolveBudgetSeconds(orderPackageCode: string | null | undefined): number {
  const code = orderPackageCode?.toLowerCase() || "basic";
  return PACKAGE_RUNTIME_LIMITS[code] || GPU_TIMEOUT_SECONDS_BASIC;
}

async function failJobWithRetry(
  job: any,
  _wallet: WalletService,
  _notifications: NotificationService,
  _dlq: PhaseCImageProcessingQueue,
  _config: AppConfig,
  message: string,
  failureStage: string
): Promise<void> {
  const maxAttempts = Number(job.maxAttempts) || 5;
  const currentAttempt = (job.attempts || 0) + 1;
  const isFinal = currentAttempt >= maxAttempts;

  if (isFinal) {
    await failJobFinal(job, _wallet, _notifications, _dlq, _config, message, failureStage, currentAttempt);
  } else {
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: "RETRYING",
        attempts: currentAttempt,
        errorMessage: message,
        failureStage,
        lastHeartbeat: new Date()
      }
    });
    logger.warn("RECOVERY retrying job", { jobId: job.id, attempt: currentAttempt, maxAttempts, message });
  }
}

async function failJobFinal(
  job: any,
  walletService: WalletService,
  notifications: NotificationService,
  deadLetterQueue: PhaseCImageProcessingQueue,
  config: AppConfig,
  message: string,
  failureStage: string,
  finalAttempt: number
): Promise<void> {
  await prisma.processingJob.update({
    where: { id: job.id },
    data: {
      status: "FAILED",
      attempts: finalAttempt,
      errorMessage: message,
      failedAt: new Date(),
      deadLetterReason: `RECOVERY_FINAL: ${message}`,
      failureStage
    }
  });

  logger.warn("RECOVERY moved job to FAILED", { jobId: job.id, message });

  if (!job.refundProcessed) {
    await processRefund(job, walletService, notifications, message);
  }

  if (job.queueJobId) {
    const payload = (job.payload as Record<string, unknown>) || {};
    try {
      await deadLetterQueue.moveToDeadLetter(payload as any, message);
    } catch (err) {
      logger.error("RECOVERY failed to move to DLQ", {
        jobId: job.id,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  const order = job.order as { userId?: string; orderNo?: string } | null;
  if (order?.userId) {
    notifications.log("WHATSAPP_FAILED", {
      orderId: job.orderId,
      orderNo: order.orderNo,
      queueJobId: job.queueJobId,
      failureStage,
      error: message
    });
  }
}

async function processRefund(
  job: any,
  walletService: WalletService,
  notifications: NotificationService,
  reason: string
): Promise<void> {
  try {
    const walletRef = await findWalletReservation(job);
    if (walletRef) {
      try {
        await walletService.releaseReservedCredits({
          walletId: walletRef.walletId,
          amount: walletRef.amount,
          referenceType: "processing_job",
          referenceId: walletRef.referenceId || job.id,
          orderId: job.orderId,
          note: `Auto-refund after recovery: ${reason}`,
          metadata: { autoRecovery: true, recoveryReason: reason }
        });
        await prisma.processingJob.update({
          where: { id: job.id },
          data: { refundProcessed: true, refundNote: reason }
        });
        logger.info("RECOVERY auto-refund processed", { jobId: job.id, reason });
      } catch (innerErr) {
        logger.warn("RECOVERY refund skipped (already processed or not applicable)", {
          jobId: job.id,
          error: innerErr instanceof Error ? innerErr.message : String(innerErr)
        });
      }
    } else if (job.order?.userId) {
      logger.info("RECOVERY no wallet reservation found, notifying user", { jobId: job.id });
      notifications.log("EMAIL_PROCESSING_FAILED", {
        orderId: job.orderId,
        queueJobId: job.queueJobId,
        reason
      });
    }
  } catch (err) {
    logger.error("RECOVERY refund processing error", {
      jobId: job.id,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

async function findWalletReservation(job: any): Promise<{ walletId: string; amount: number; referenceId: string } | null> {
  if (!job.order?.userId) return null;
  try {
    const walletService = new WalletService();
    const wallet = await walletService.getOrCreateWallet(job.order.userId);

    const reservation = await prisma.walletTransaction.findFirst({
      where: {
        walletId: wallet.id,
        referenceType: "processing_job",
        referenceId: job.id,
        type: "DEBIT",
        state: "RESERVED"
      },
      orderBy: { createdAt: "desc" }
    });

    if (!reservation) {
      const anyReservation = await prisma.walletTransaction.findFirst({
        where: {
          walletId: wallet.id,
          referenceType: "processing_job",
          type: "DEBIT",
          state: "RESERVED"
        },
        orderBy: { createdAt: "desc" }
      });
      if (!anyReservation) return null;
      return { walletId: wallet.id, amount: anyReservation.amount, referenceId: anyReservation.referenceId || job.id };
    }

    return { walletId: wallet.id, amount: reservation.amount, referenceId: reservation.referenceId || job.id };
  } catch {
    return null;
  }
}
