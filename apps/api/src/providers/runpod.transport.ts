import { logger } from "../utils/logger";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

const QUEUE_TIMEOUT_MS = (parseInt(process.env.QUEUE_TIMEOUT_SECONDS || "60", 10) + 5) * 1000;
const PROCESSING_TIMEOUT_MS = (parseInt(process.env.PROCESSING_TIMEOUT_SECONDS || "90", 10) + 10) * 1000;
const ABSOLUTE_TIMEOUT_MS = (parseInt(process.env.ABSOLUTE_TIMEOUT_SECONDS || "150", 10) + 10) * 1000;

const POLL_INTERVAL_MS = 2000;

export type RunPodResult = Record<string, unknown>;

let consecutiveFailures = 0;
let lastFailureTime = 0;
const WATCHDOG_FAILURE_THRESHOLD = 3;
const WATCHDOG_RESET_WINDOW_MS = 120_000;

export function getConsecutiveFailures(): number {
  return consecutiveFailures;
}

export function resetConsecutiveFailures(): void {
  consecutiveFailures = 0;
}

export async function runRunPodRequest(
  apiKey: string,
  endpointId: string,
  input: Record<string, unknown>,
  timeoutMs?: number
): Promise<RunPodResult> {
  const effectiveTimeout = timeoutMs ?? ABSOLUTE_TIMEOUT_MS;
  const url = `${RUNPOD_API_BASE}/${endpointId}/runsync`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(effectiveTimeout, 60_000));

  try {
    const startTime = Date.now();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error("RunPod request failed", { endpointId, status: response.status, body: body.slice(0, 300) });
      _recordFailure();
      throw new Error(`RunPod ${endpointId} failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const result = (await response.json()) as { id: string; status: string; output?: RunPodResult };

    if (result.status === "COMPLETED") {
      const elapsedMs = Date.now() - startTime;
      logger.info("RunPod job completed", { endpointId, elapsedMs });
      _recordSuccess();
      return result.output || {};
    }

    if (result.status === "FAILED" || result.status === "TIMED_OUT" || result.status === "CANCELLED") {
      _recordFailure();
      throw new Error(`RunPod ${endpointId} ${result.status}: ${JSON.stringify(result)}`);
    }

    if (result.status === "IN_QUEUE" || result.status === "IN_PROGRESS") {
      return await pollRunPod(apiKey, endpointId, result.id, effectiveTimeout, startTime);
    }

    _recordFailure();
    throw new Error(`RunPod ${endpointId} unexpected status: ${result.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function pollRunPod(
  apiKey: string,
  endpointId: string,
  jobId: string,
  timeoutMs: number,
  startTime: number
): Promise<RunPodResult> {
  const statusUrl = `${RUNPOD_API_BASE}/${endpointId}/status/${jobId}`;
  while (Date.now() - startTime < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    try {
      const response = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) continue;
      const result = (await response.json()) as { status: string; output?: RunPodResult };
      if (result.status === "COMPLETED") {
        const elapsedMs = Date.now() - startTime;
        logger.info("RunPod job polled to completion", { endpointId, jobId, elapsedMs });
        _recordSuccess();
        return result.output || {};
      }
      if (result.status === "FAILED" || result.status === "TIMED_OUT" || result.status === "CANCELLED") {
        logger.warn("RunPod job ended with failure status during poll", { endpointId, jobId, status: result.status });
        _recordFailure();
        throw new Error(`RunPod ${endpointId} ${result.status}: ${JSON.stringify(result)}`);
      }
      const elapsed = Date.now() - startTime;
      if (result.status === "IN_QUEUE" && elapsed > QUEUE_TIMEOUT_MS) {
        logger.warn("RunPod job exceeded queue timeout", { endpointId, jobId, elapsedMs: elapsed });
        _recordFailure();
        throw new Error(`RunPod ${endpointId} queue timeout after ${elapsed}ms`);
      }
      if (result.status === "IN_PROGRESS" && elapsed > PROCESSING_TIMEOUT_MS + QUEUE_TIMEOUT_MS) {
        logger.warn("RunPod job exceeded processing timeout", { endpointId, jobId, elapsedMs: elapsed });
        _recordFailure();
        throw new Error(`RunPod ${endpointId} processing timeout after ${elapsed}ms`);
      }
    } catch (e) {
      if (e instanceof Error && (e.message.startsWith("RunPod") || e.message.includes("timeout"))) throw e;
    }
  }
  _recordFailure();
  throw new Error(`RunPod ${endpointId} absolute timeout after ${timeoutMs}ms`);
}

function _recordSuccess(): void {
  consecutiveFailures = 0;
}

function _recordFailure(): void {
  const now = Date.now();
  if (now - lastFailureTime > WATCHDOG_RESET_WINDOW_MS) {
    consecutiveFailures = 1;
  } else {
    consecutiveFailures++;
  }
  lastFailureTime = now;
  logger.warn("RunPod consecutive failure counter", { consecutiveFailures });
}
