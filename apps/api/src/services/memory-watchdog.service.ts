import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";

const MEMORY_CHECK_INTERVAL_MS = 60_000;
const RAM_HIGH_WATERMARK = 0.8;
const RESTART_COOLDOWN_MS = 120_000;

let timer: ReturnType<typeof setInterval> | null = null;
let lastRestartTime = 0;

interface MemorySample {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  cpuPercent?: number;
  timestamp: number;
}

let samples: MemorySample[] = [];

export function startMemoryWatchdog(onRestart: () => void): void {
  if (timer) return;
  logger.info("MEMORY_WATCHDOG starting with interval", { intervalMs: MEMORY_CHECK_INTERVAL_MS });
  timer = setInterval(() => {
    void runMemoryCheck(onRestart);
  }, MEMORY_CHECK_INTERVAL_MS);
}

export function stopMemoryWatchdog(): void {
  if (timer) { clearInterval(timer); timer = null; }
}

export function getMemorySamples(): MemorySample[] {
  return [...samples];
}

async function runMemoryCheck(onRestart: () => void): Promise<void> {
  try {
    const memUsage = process.memoryUsage();
    const sample: MemorySample = {
      rss: memUsage.rss,
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      timestamp: Date.now()
    };

    samples.push(sample);
    if (samples.length > 60) samples = samples.slice(-60);

    const usedPercent = memUsage.heapUsed / memUsage.heapTotal;

    if (usedPercent > RAM_HIGH_WATERMARK && Date.now() - lastRestartTime > RESTART_COOLDOWN_MS) {
      logger.error("MEMORY_WATCHDOG triggering restart — heap usage exceeds threshold", {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + "MB",
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + "MB",
        rss: Math.round(memUsage.rss / 1024 / 1024) + "MB",
        threshold: RAM_HIGH_WATERMARK,
        usedPercent: Math.round(usedPercent * 100) + "%"
      });
      lastRestartTime = Date.now();
      onRestart();
    }
  } catch (error) {
    logger.error("MEMORY_WATCHDOG check failed", {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

export function getMemoryWatchdogStatus(): {
  healthy: boolean;
  currentMb: { rss: number; heapUsed: number; heapTotal: number };
  usedPercent: number;
  sampleCount: number;
} {
  const mem = process.memoryUsage();
  const usedPercent = mem.heapUsed / mem.heapTotal;
  return {
    healthy: usedPercent < RAM_HIGH_WATERMARK,
    currentMb: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
    },
    usedPercent: Math.round(usedPercent * 100),
    sampleCount: samples.length
  };
}

export function getGpuMemoryStatus(): { healthy: boolean; gpuMemoryMb: number; cudaAvailable: boolean } {
  const gpuMb = readGpuMemoryFromEnv();
  return {
    healthy: gpuMb < 30720,
    gpuMemoryMb: gpuMb,
    cudaAvailable: gpuMb > 0
  };
}

function readGpuMemoryFromEnv(): number {
  const gpuMem = process.env.GPU_MEMORY_MB;
  if (gpuMem) {
    const parsed = parseInt(gpuMem, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 0;
}
