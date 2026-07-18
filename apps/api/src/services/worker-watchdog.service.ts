import { logger } from "../utils/logger";
import { getConsecutiveFailures, resetConsecutiveFailures } from "../providers/runpod.transport";

const WATCHDOG_FAILURE_THRESHOLD = 3;
const WATCHDOG_INTERVAL_MS = 30_000;
const WATCHDOG_RESET_ON_SUCCESS_MS = 120_000;

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastSuccessTime = Date.now();
let restartCount = 0;

export function getRestartCount(): number {
  return restartCount;
}

export function recordWorkerSuccess(): void {
  lastSuccessTime = Date.now();
  resetConsecutiveFailures();
}

export function startWorkerWatchdog(onRestart: () => void): void {
  if (heartbeatTimer) return;
  logger.info("WORKER_WATCHDOG starting with interval 30s, threshold", { WATCHDOG_FAILURE_THRESHOLD });
  heartbeatTimer = setInterval(() => {
    const failures = getConsecutiveFailures();
    const timeSinceSuccess = Date.now() - lastSuccessTime;

    if (failures >= WATCHDOG_FAILURE_THRESHOLD) {
      logger.error("WORKER_WATCHDOG triggering restart", {
        consecutiveFailures: failures,
        timeSinceLastSuccessMs: timeSinceSuccess,
        restartCount,
      });
      restartCount++;
      resetConsecutiveFailures();
      onRestart();
    }

    if (timeSinceSuccess > WATCHDOG_RESET_ON_SUCCESS_MS && failures > 0) {
      logger.warn("WORKER_WATCHDOG resetting failure counter due to time without new failures", {
        failures,
        timeSinceSuccessMs: timeSinceSuccess,
      });
      resetConsecutiveFailures();
    }
  }, WATCHDOG_INTERVAL_MS);
}

export function stopWorkerWatchdog(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
