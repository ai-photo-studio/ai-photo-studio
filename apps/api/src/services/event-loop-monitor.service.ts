import { logger } from "../utils/logger";

const EVENT_LOOP_CHECK_INTERVAL_MS = 5000;
const EVENT_LOOP_WARN_THRESHOLD_MS = 100;
const EVENT_LOOP_CRITICAL_THRESHOLD_MS = 500;

let maxLag = 0;
let totalChecks = 0;
let warnCount = 0;
let criticalCount = 0;
let timer: ReturnType<typeof setInterval> | null = null;

export function startEventLoopMonitor(): void {
  if (timer) return;
  logger.info("EVENT_LOOP_MONITOR starting with interval", { intervalMs: EVENT_LOOP_CHECK_INTERVAL_MS });

  timer = setInterval(() => {
    const checkStart = Date.now();
    // Use setImmediate to measure event loop lag: if there's blocking work,
    // the callback will be delayed
    setImmediate(() => {
      const lag = Date.now() - checkStart;
      totalChecks++;

      if (lag > maxLag) {
        maxLag = lag;
      }

      if (lag > EVENT_LOOP_CRITICAL_THRESHOLD_MS) {
        criticalCount++;
        logger.error("EVENT_LOOP critical lag detected", {
          lagMs: lag,
          maxLagMs: maxLag,
          totalChecks,
          warnCount,
          criticalCount,
          threshold: EVENT_LOOP_CRITICAL_THRESHOLD_MS
        });
      } else if (lag > EVENT_LOOP_WARN_THRESHOLD_MS) {
        warnCount++;
        logger.warn("EVENT_LOOP lag detected", {
          lagMs: lag,
          maxLagMs: maxLag,
          totalChecks,
          warnCount,
          criticalCount,
          threshold: EVENT_LOOP_WARN_THRESHOLD_MS
        });
      }
    });
  }, EVENT_LOOP_CHECK_INTERVAL_MS);
}

export function stopEventLoopMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getEventLoopMetrics() {
  return {
    maxLagMs: maxLag,
    totalChecks,
    warnCount,
    criticalCount,
    intervalMs: EVENT_LOOP_CHECK_INTERVAL_MS
  };
}
