import { logger } from "../utils/logger";

const RUNPOD_API_BASE = "https://api.runpod.ai/v2";

export type RunPodResult = Record<string, unknown>;

export async function runRunPodRequest(
  apiKey: string,
  endpointId: string,
  input: Record<string, unknown>,
  timeoutMs = 120_000
): Promise<RunPodResult> {
  const url = `${RUNPOD_API_BASE}/${endpointId}/runsync`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
      throw new Error(`RunPod ${endpointId} failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const result = (await response.json()) as { id: string; status: string; output?: RunPodResult };

    if (result.status === "COMPLETED") {
      logger.info("RunPod job completed", { endpointId, elapsedMs: Date.now() - startTime });
      return result.output || {};
    }

    if (result.status === "FAILED" || result.status === "TIMED_OUT" || result.status === "CANCELLED") {
      throw new Error(`RunPod ${endpointId} ${result.status}: ${JSON.stringify(result)}`);
    }

    // Poll for completion if still in queue/progress
    if (result.status === "IN_QUEUE" || result.status === "IN_PROGRESS") {
      return await pollRunPod(apiKey, endpointId, result.id, timeoutMs, startTime);
    }

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
    await new Promise((resolve) => setTimeout(resolve, 2000));
    try {
      const response = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!response.ok) continue;
      const result = (await response.json()) as { status: string; output?: RunPodResult };
      if (result.status === "COMPLETED") {
        logger.info("RunPod job polled to completion", { endpointId, jobId, elapsedMs: Date.now() - startTime });
        return result.output || {};
      }
      if (result.status === "FAILED" || result.status === "TIMED_OUT" || result.status === "CANCELLED") {
        throw new Error(`RunPod ${endpointId} ${result.status}: ${JSON.stringify(result)}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("RunPod")) throw e;
    }
  }
  throw new Error(`RunPod ${endpointId} timed out after ${timeoutMs}ms`);
}
