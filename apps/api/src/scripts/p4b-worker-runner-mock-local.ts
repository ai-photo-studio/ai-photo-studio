/**
 * R9.5-P4B7-MOCK-WORKER-LOCAL-ENTRYPOINT -- process entry point.
 *
 * TEST/LOCAL-ONLY sibling of `p4b-worker-runner-main.ts`. It exists solely so
 * a disposable local E2E harness (`scripts/test-commerce-local.ts`) can drive
 * QUEUED `ReplicateExecution` rows to completion against the mock provider,
 * without ever starting the real Replicate-only production runner in a mock
 * configuration.
 *
 * This file is a STANDALONE, SEPARATELY DEPLOYED process, exactly like
 * `p4b-worker-runner-main.ts`: it is NOT imported by `apps/api/src/index.ts`
 * and exposes no Express router of its own -- there is no code path from any
 * customer or admin HTTP request into this file.
 *
 * Hard-refuses to start unless ALL of the following hold:
 *   1. `NODE_ENV` is not `"production"`.
 *   2. `COMMERCE_E2E_TEST_MODE === "true"` (explicit opt-in, matching the
 *      existing `commerce-e2e-payment.ts` test-payment seam's own guard).
 *   3. `RESTORATION_PROVIDER === "mock"` -- this is the INVERSE of the
 *      production runner's guard (`=== "replicate"`), so the two entrypoints
 *      are mutually exclusive by construction: neither can ever start with
 *      the other's provider selection, and this file can never start with
 *      RunPod (there is no RunPod `RESTORATION_PROVIDER` value at all --
 *      `RESTORATION_PROVIDER` is a strict `"replicate" | "mock"` enum, see
 *      `apps/api/src/config/env.ts`).
 *
 * Reuses, unchanged: `InternalWorkerRunner`, `PrismaQueuedExecutionCandidateRepository`,
 * `ReplicateExecutionWorker`, `PrismaReplicateExecutionRepository`,
 * `R2MasterPersistence`, `PipelineOrchestratorProviderExecutor`,
 * `PipelineOrchestrator` -- the identical adapters the production runner
 * uses. The ONLY difference from `p4b-worker-runner-main.ts` is the startup
 * guard direction and this file's own non-production identity. It never
 * touches `applyVerifiedPaymentEvidence` or any payment table, and it never
 * calls Replicate, RunPod, R2, or Bank Alfalah -- `PipelineOrchestrator`
 * itself only reaches a network provider when `RESTORATION_PROVIDER ===
 * "replicate"`, which this entrypoint refuses to start under.
 */
import { loadConfig } from "../config/env";
import { logger } from "../utils/logger";
import { StorageService } from "../services/storage.service";
import { PipelineOrchestrator } from "../restoration-providers/pipeline/PipelineOrchestrator";
import { PipelineOrchestratorProviderExecutor } from "../restoration-providers/pipeline/DefaultRestorationExecutionPorts";
import {
  PrismaReplicateExecutionRepository,
  R2MasterPersistence,
  ReplicateExecutionWorker
} from "../services/replicate-execution.worker";
import { InternalWorkerRunner, PrismaQueuedExecutionCandidateRepository } from "../services/p4b-internal-worker-runner.service";

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_MAX_BACKOFF_MS = 5_000;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number when set (got: ${JSON.stringify(raw)})`);
  }
  return parsed;
}

export async function startP4BMockWorkerRunnerProcess(): Promise<InternalWorkerRunner> {
  // ---- 1. Fail closed: never in production, no matter what else is set.
  if (process.env.NODE_ENV === "production") {
    throw new Error("P4B mock worker runner refuses to start: NODE_ENV=production");
  }

  // ---- 2. Fail closed: explicit, non-inferrable opt-in only.
  if (process.env.COMMERCE_E2E_TEST_MODE !== "true") {
    throw new Error("P4B mock worker runner refuses to start: set COMMERCE_E2E_TEST_MODE=true explicitly");
  }

  // ---- 3. Fail closed on configuration, same gate the HTTP process uses.
  const config = loadConfig();

  // ---- 4. Fail closed on provider misconfiguration -- the INVERSE of the
  // production runner's guard. This can never start against "replicate",
  // and there is no RunPod provider value to start against at all.
  if (config.restorationProvider !== "mock") {
    throw new Error(
      `P4B mock worker runner refuses to start: RESTORATION_PROVIDER must be "mock" (got ${JSON.stringify(config.restorationProvider)})`
    );
  }

  const pollIntervalMs = readPositiveIntEnv("P4B_MOCK_WORKER_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
  const maxBackoffMs = readPositiveIntEnv("P4B_MOCK_WORKER_MAX_BACKOFF_MS", DEFAULT_MAX_BACKOFF_MS);
  if (maxBackoffMs < pollIntervalMs) {
    throw new Error("P4B_MOCK_WORKER_MAX_BACKOFF_MS must be >= P4B_MOCK_WORKER_POLL_INTERVAL_MS");
  }

  // ---- 5. Same real adapters the production runner uses; provider selection
  // is threaded through, so PipelineOrchestrator itself resolves to the mock
  // provider and never touches the network.
  const storage = new StorageService(config);
  const provider = new PipelineOrchestratorProviderExecutor(new PipelineOrchestrator(config));
  const worker = new ReplicateExecutionWorker({
    repository: new PrismaReplicateExecutionRepository(),
    persistence: new R2MasterPersistence(storage),
    providerExecutor: provider,
    providerSelection: config.restorationProvider
  });

  const runner = new InternalWorkerRunner({
    candidates: new PrismaQueuedExecutionCandidateRepository(),
    worker,
    pollIntervalMs,
    maxBackoffMs,
    onResult: (result) => {
      logger.info("P4B mock worker runner: execution processed", {
        executionId: result.executionId,
        outcome: result.outcome
      });
    }
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn("P4B mock worker runner: shutdown signal received, finishing in-flight work only", { signal });
    runner.requestStop();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("P4B mock worker runner: starting", {
    pollIntervalMs,
    maxBackoffMs,
    restorationProvider: config.restorationProvider,
    concurrency: 1,
    testMode: true
  });

  runner
    .run()
    .then((summary) => {
      logger.info("P4B mock worker runner: stopped", summary as unknown as Record<string, unknown>);
      process.exitCode = 0;
    })
    .catch((err) => {
      logger.error("P4B mock worker runner: fatal error, exiting", { error: err instanceof Error ? err.message : "unknown" });
      process.exitCode = 1;
    });

  return runner;
}

/* istanbul ignore next -- process entry-point wiring only, exercised via startP4BMockWorkerRunnerProcess in tests */
if (require.main === module) {
  startP4BMockWorkerRunnerProcess().catch((err) => {
    console.error(`P4B mock worker runner failed to start: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
