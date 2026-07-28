import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

const HEARTBEAT_INTERVAL_MS = 15_000;

let timer: ReturnType<typeof setInterval> | null = null;

export function startJobHeartbeat(): void {
  if (timer) return;
  logger.info("JOB_HEARTBEAT starting with interval", { intervalMs: HEARTBEAT_INTERVAL_MS });
  timer = setInterval(runHeartbeatCycle, HEARTBEAT_INTERVAL_MS);
}

export function stopJobHeartbeat(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

async function runHeartbeatCycle(): Promise<void> {
  try {
    const activeJobs = await prisma.processingJob.findMany({
      where: { status: { in: ["RUNNING", "RETRYING"] } },
      select: { id: true, queueJobId: true }
    });

    if (activeJobs.length === 0) return;

    const now = new Date();
    const updates = activeJobs.map(job =>
      prisma.processingJob.update({
        where: { id: job.id },
        data: { lastHeartbeat: now }
      })
    );

    await prisma.$transaction(updates);
  } catch (error) {
    logger.error("JOB_HEARTBEAT cycle failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function recordProcessingStart(jobId: string, workerId: string): Promise<void> {
  const now = new Date();
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      processingStartedAt: now,
      processingWorkerId: workerId,
      lastHeartbeat: now,
      startedAt: now
    }
  });
}
