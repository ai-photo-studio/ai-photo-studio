// R9.2-P4B-MERGE-P4A-AND-WIRE-INTERNAL-WORKER-RUNNER
//
// Internal, non-routed process boundary that makes eligible QUEUED
// `ReplicateExecution` rows -- the rows the P4A transaction
// (`applyVerifiedPaymentEvidence` in `p4a-payment-verified-execution-queue.service.ts`)
// creates -- reachable by driving the EXISTING, UNCHANGED P3A worker
// (`ReplicateExecutionWorker` in `replicate-execution.worker.ts`) in a bounded
// poll loop.
//
// This file does not reimplement any part of the P3A one-call contract. It
// only adds:
//   1. a read-only "peek" for the oldest QUEUED execution id
//      (`PrismaQueuedExecutionCandidateRepository`) -- it NEVER claims, mutates,
//      or filters by anything other than `status = 'QUEUED'`. All eligibility
//      and the actual atomic claim remain entirely inside the P3A worker
//      (`computeExecutionIneligibilityReasons` + `claimQueued`'s conditional
//      `UPDATE ... WHERE status = 'QUEUED'`);
//   2. a bounded, single-concurrency poll/backoff loop
//      (`InternalWorkerRunner`) that repeatedly calls
//      `worker.processReplicateExecution(candidateId)` and sleeps between
//      iterations, with cooperative graceful shutdown.
//
// Deliberate non-goals of this packet (do not add them here):
//   * It never constructs, imports, or is imported by any Express router or
//     controller (see `apps/api/src/routes/*`, `apps/api/src/controllers/*`).
//     There is no public or admin HTTP surface to this file. See
//     `p4b-internal-worker-runner.service.test.ts` (pg2) for a static proof.
//   * It never calls `applyVerifiedPaymentEvidence` or anything that could
//     mark a payment verified. It only ever reads `ReplicateExecution.status`
//     and calls the read-only P3A worker entry point on a row that already
//     exists.
//   * It never creates a `ReplicateExecution`, `RestorationMaster`,
//     `RestorationEntitlement`, `PaymentAttempt`, or `FixedOrder` row.
//   * It never resubmits a FAILED or SUCCEEDED execution: the P3A worker's own
//     `computeExecutionIneligibilityReasons` rejects any row whose status is
//     not `QUEUED` (and whose master is not `NOT_STARTED`/`PROCESSING`), so a
//     terminal row is simply skipped on the next poll with zero further
//     provider or storage calls.
//   * It never runs more than one execution at a time. `InternalWorkerRunner.run`
//     is a single sequential `while` loop -- there is no `Promise.all`, no
//     worker pool, and no concurrency knob. Two independently started runner
//     processes are safe only because the underlying Postgres claim
//     (`UPDATE ... WHERE id = $1 AND status = 'QUEUED'`) is atomic, exactly as
//     proven for two concurrent P3A workers in
//     `p3a-replicate-execution-worker.pg-race.test.ts`.
import { prisma } from "../db/prisma";
import { logger } from "../utils/logger";
import type { ReplicateExecutionWorkerResult } from "./replicate-execution.worker";

// ---------------------------------------------------------------------------
// Candidate lookup (read-only; never claims)
// ---------------------------------------------------------------------------

export interface QueuedExecutionCandidatePort {
  /**
   * Returns the id of the oldest row whose `ReplicateExecution.status` is
   * `QUEUED` and whose id is not in `excludeIds`, or `null` if none exist.
   * This is a plain `SELECT`; it never mutates a row and it is never itself
   * the source of truth for eligibility or ownership -- both are enforced
   * downstream by the P3A worker.
   *
   * `excludeIds` exists so the runner can skip past a row it already proved
   * INELIGIBLE in this process without waiting for backoff to cycle through
   * it every single poll -- see `InternalWorkerRunner`'s use of it below. A
   * genuinely eligible row created by the P4A transaction never needs this:
   * it is always fully eligible at creation time, so exclusion only ever
   * protects against a stuck/anomalous row starving newer legitimate work.
   */
  findNextQueuedExecutionId(excludeIds: readonly string[]): Promise<string | null>;
}

export class PrismaQueuedExecutionCandidateRepository implements QueuedExecutionCandidatePort {
  async findNextQueuedExecutionId(excludeIds: readonly string[] = []): Promise<string | null> {
    const row = await prisma.replicateExecution.findFirst({
      where: {
        status: "QUEUED",
        ...(excludeIds.length > 0 ? { id: { notIn: [...excludeIds] } } : {})
      },
      orderBy: { createdAt: "asc" },
      select: { id: true }
    });
    return row?.id ?? null;
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface WorkerPort {
  processReplicateExecution(executionId: string): Promise<ReplicateExecutionWorkerResult>;
}

export interface InternalWorkerRunnerDeps {
  candidates: QueuedExecutionCandidatePort;
  worker: WorkerPort;
  /** Delay between iterations when work was found or the previous iteration errored cleanly. */
  pollIntervalMs: number;
  /** Ceiling for the exponential empty-poll backoff. Must be >= pollIntervalMs. */
  maxBackoffMs: number;
  /** Injectable for tests; defaults to a real `setTimeout`-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Observability hook; never used to influence control flow. */
  onResult?: (result: ReplicateExecutionWorkerResult) => void;
  /** Bounds the loop for tests. `undefined` (production) runs until `requestStop()`. */
  maxIterations?: number;
}

export interface InternalWorkerRunnerSummary {
  iterations: number;
  processed: number;
  /** Count of each `ReplicateExecutionWorkerResult.outcome` seen, e.g. `{ SUCCEEDED: 1 }`. */
  outcomes: Record<string, number>;
  stoppedByRequest: boolean;
}

const SLEEP_CHUNK_MS = 50;
/** Caps the per-process "skip these ids" memory; oldest tracked id is evicted first. */
const MAX_TRACKED_INELIGIBLE_IDS = 500;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A single-concurrency, bounded poll/backoff loop over one `WorkerPort`. It
 * never dispatches two executions at once -- each iteration awaits the full
 * `processReplicateExecution` call (claim -> provider -> upload -> commit)
 * before looking for the next candidate. Graceful shutdown is cooperative:
 * `requestStop()` flips a flag that is checked both between iterations and
 * inside the sleep, so a pending sleep is interrupted quickly and no new
 * execution is ever started after a stop request, but an in-flight
 * `processReplicateExecution` call is always allowed to finish (it is never
 * killed mid-claim, which would risk leaving a row stuck `PROCESSING`).
 */
export class InternalWorkerRunner {
  private stopping = false;
  private readonly recentlyIneligible: string[] = [];

  constructor(private readonly deps: InternalWorkerRunnerDeps) {
    if (!Number.isFinite(deps.pollIntervalMs) || deps.pollIntervalMs <= 0) {
      throw new TypeError("pollIntervalMs must be a positive finite number");
    }
    if (!Number.isFinite(deps.maxBackoffMs) || deps.maxBackoffMs < deps.pollIntervalMs) {
      throw new TypeError("maxBackoffMs must be a finite number >= pollIntervalMs");
    }
  }

  /** Requests a graceful stop. Safe to call multiple times or before `run()` starts. */
  requestStop(): void {
    this.stopping = true;
  }

  async run(): Promise<InternalWorkerRunnerSummary> {
    let iterations = 0;
    let processed = 0;
    let consecutiveEmpty = 0;
    const outcomes: Record<string, number> = {};

    while (!this.stopping) {
      if (this.deps.maxIterations !== undefined && iterations >= this.deps.maxIterations) break;
      iterations++;

      let candidateId: string | null = null;
      try {
        candidateId = await this.deps.candidates.findNextQueuedExecutionId(this.ineligibleIds());
      } catch (err) {
        logger.error("P4B runner: candidate lookup failed", { error: err instanceof Error ? err.message : "unknown" });
        await this.sleepInterruptible(this.backoffFor(++consecutiveEmpty));
        continue;
      }

      if (!candidateId) {
        consecutiveEmpty++;
        await this.sleepInterruptible(this.backoffFor(consecutiveEmpty));
        continue;
      }

      consecutiveEmpty = 0;

      let result: ReplicateExecutionWorkerResult;
      try {
        result = await this.deps.worker.processReplicateExecution(candidateId);
      } catch (err) {
        // A programmer-error throw from the worker (never a business-failure
        // path -- those are all returned outcomes) is logged and the loop
        // continues; it never crashes the process and never retries the same
        // row in the same tick.
        logger.error("P4B runner: worker threw on a claimed candidate", {
          executionId: candidateId,
          error: err instanceof Error ? err.message : "unknown"
        });
        await this.sleepInterruptible(this.deps.pollIntervalMs);
        continue;
      }

      processed++;
      outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
      this.deps.onResult?.(result);

      // A row this process just proved INELIGIBLE never transitions on its
      // own (the P3A worker made no claim, no mutation), so remembering its
      // id for the rest of THIS run lets the next poll skip straight past it
      // to any genuinely eligible newer row instead of getting stuck
      // re-fetching the same oldest-first row forever. Bounded so a
      // long-running process can never grow this without limit.
      if (result.outcome === "INELIGIBLE") {
        this.recentlyIneligible.push(candidateId);
        if (this.recentlyIneligible.length > MAX_TRACKED_INELIGIBLE_IDS) {
          this.recentlyIneligible.shift();
        }
      }

      if (this.stopping) break;
      await this.sleepInterruptible(this.deps.pollIntervalMs);
    }

    return { iterations, processed, outcomes, stoppedByRequest: this.stopping };
  }

  private ineligibleIds(): string[] {
    return this.recentlyIneligible;
  }

  private backoffFor(consecutiveEmpty: number): number {
    const exponent = Math.min(consecutiveEmpty, 10);
    const scaled = this.deps.pollIntervalMs * 2 ** exponent;
    return Math.min(scaled, this.deps.maxBackoffMs);
  }

  /** Sleeps `ms` in small chunks so a `requestStop()` during the wait takes effect within `SLEEP_CHUNK_MS`. */
  private async sleepInterruptible(ms: number): Promise<void> {
    const sleep = this.deps.sleep ?? defaultSleep;
    let remaining = ms;
    while (remaining > 0 && !this.stopping) {
      const chunk = Math.min(SLEEP_CHUNK_MS, remaining);
      await sleep(chunk);
      remaining -= chunk;
    }
  }
}
