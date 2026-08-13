/**
 * R9.2-P4B-MERGE-P4A-AND-WIRE-INTERNAL-WORKER-RUNNER -- process entry point.
 *
 * This is a STANDALONE, SEPARATELY DEPLOYED process. It is deliberately NOT
 * imported by `apps/api/src/index.ts` (the HTTP API process) and exposes no
 * Express router of its own -- there is no code path from any customer or
 * admin HTTP request into this file. It is intended to run as its own
 * Northflank service/deployment (e.g. `npm run worker:p4b --workspace apps/api`,
 * or `node dist/scripts/p4b-worker-runner-main.js` after `npm run build`),
 * separate from the `api` web service, exactly like the existing
 * `RESTORATION_PROVIDER`/`STORAGE_PROVIDER`-gated pattern documented in
 * `docs/release/R9_2_VERIFIED_PRODUCT_MANIFEST.md`.
 *
 * Responsibilities, and nothing else:
 *   1. Load and validate configuration with the SAME `loadConfig()` the HTTP
 *      process uses. Any invalid/missing required variable throws there and
 *      this process exits non-zero before anything else runs (fail closed).
 *   2. Refuse to start if `RESTORATION_PROVIDER` is not exactly `"replicate"`
 *      -- this runner drives the Replicate-only P3A worker and must never be
 *      started against a RunPod/local/mock provider selection in a shape that
 *      could look like production activation of anything else.
 *   3. Construct the REAL, UNCHANGED P3A worker
 *      (`ReplicateExecutionWorker` + `PrismaReplicateExecutionRepository` +
 *      `R2MasterPersistence` + the Replicate-only
 *      `PipelineOrchestratorProviderExecutor`) -- the identical adapters
 *      `replicate-execution.worker.ts` already exports for production use.
 *   4. Drive `InternalWorkerRunner` (`p4b-internal-worker-runner.service.ts`)
 *      at concurrency 1 with a bounded poll interval and exponential,
 *      capped backoff on empty polls.
 *   5. Wire `SIGTERM`/`SIGINT` to a cooperative graceful shutdown: the current
 *      in-flight execution (if any) is always allowed to finish; no new
 *      execution is claimed after a shutdown signal.
 *
 * This file performs no Bank Alfalah, RunPod, or Local activation of any
 * kind, and it never touches `applyVerifiedPaymentEvidence` or any payment
 * table.
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

/** Bounded, sane defaults. Overridable for operational tuning only -- never required for correctness. */
const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_MAX_BACKOFF_MS = 60_000;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number when set (got: ${JSON.stringify(raw)})`);
  }
  return parsed;
}

export async function startP4BWorkerRunnerProcess(): Promise<InternalWorkerRunner> {
  // ---- 1. Fail closed on missing/invalid configuration. `loadConfig` throws
  // synchronously on any missing required env var (DATABASE_URL, JWT secrets,
  // etc.) -- this is the same gate the HTTP process uses, so this runner can
  // never start in an environment that would not also support the API.
  const config = loadConfig();

  // ---- 2. Fail closed on provider misconfiguration. Belt-and-suspenders with
  // the worker's own `providerSelection !== "replicate"` guard: refuse before
  // constructing any network-capable adapter at all.
  if (!config.prelaunchMockMode && config.restorationProvider !== "replicate") {
    throw new Error(
      `P4B worker runner refuses to start: RESTORATION_PROVIDER must be "replicate" (got ${JSON.stringify(config.restorationProvider)})`
    );
  }

  const pollIntervalMs = readPositiveIntEnv("P4B_WORKER_POLL_INTERVAL_MS", DEFAULT_POLL_INTERVAL_MS);
  const maxBackoffMs = readPositiveIntEnv("P4B_WORKER_MAX_BACKOFF_MS", DEFAULT_MAX_BACKOFF_MS);
  if (maxBackoffMs < pollIntervalMs) {
    throw new Error("P4B_WORKER_MAX_BACKOFF_MS must be >= P4B_WORKER_POLL_INTERVAL_MS");
  }

  // ---- 3. Real, unchanged P3A adapters.
  const storage = new StorageService(config);
  const provider = new PipelineOrchestratorProviderExecutor(new PipelineOrchestrator(config));
  const worker = new ReplicateExecutionWorker({
    repository: new PrismaReplicateExecutionRepository(),
    persistence: new R2MasterPersistence(storage),
    providerExecutor: provider,
    providerSelection: config.restorationProvider
  });

  // ---- 4. Concurrency-1 bounded runner.
  const runner = new InternalWorkerRunner({
    candidates: new PrismaQueuedExecutionCandidateRepository(),
    worker,
    pollIntervalMs,
    maxBackoffMs,
    onResult: (result) => {
      logger.info("P4B worker runner: execution processed", {
        executionId: result.executionId,
        outcome: result.outcome
      });
    }
  });

  // ---- 5. Graceful shutdown. The in-flight `processReplicateExecution` call
  // (if any) always finishes; only the NEXT claim is prevented.
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn("P4B worker runner: shutdown signal received, finishing in-flight work only", { signal });
    runner.requestStop();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.info("P4B worker runner: starting", {
    pollIntervalMs,
    maxBackoffMs,
    restorationProvider: config.restorationProvider,
    concurrency: 1,
    prelaunchMockMode: config.prelaunchMockMode
  });

  runner
    .run()
    .then((summary) => {
      logger.info("P4B worker runner: stopped", summary as unknown as Record<string, unknown>);
      process.exitCode = 0;
    })
    .catch((err) => {
      logger.error("P4B worker runner: fatal error, exiting", { error: err instanceof Error ? err.message : "unknown" });
      process.exitCode = 1;
    });

  return runner;
}

/* istanbul ignore next -- process entry-point wiring only, exercised via startP4BWorkerRunnerProcess in tests */
if (require.main === module) {
  startP4BWorkerRunnerProcess().catch((err) => {
    // Fail-closed startup errors (bad config, wrong provider) land here before
    // any loop starts.
    console.error(`P4B worker runner failed to start: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
