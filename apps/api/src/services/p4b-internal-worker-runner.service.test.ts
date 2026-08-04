/**
 * R9.2-P4B-MERGE-P4A-AND-WIRE-INTERNAL-WORKER-RUNNER focused tests.
 *
 * Runs with `npx tsx --test src/services/p4b-internal-worker-runner.service.test.ts`.
 *
 * No database is touched here -- both the candidate port and the worker port
 * are faked in-process. `p4b-internal-worker-runner.service.pg-race.test.ts`
 * proves the same invariants against a real disposable PostgreSQL and the
 * real P3A worker. `globalThis.fetch` is a throwing spy for the whole file so
 * any accidental network call fails loudly.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  InternalWorkerRunner,
  type QueuedExecutionCandidatePort,
  type WorkerPort
} from "./p4b-internal-worker-runner.service";
import type { ReplicateExecutionWorkerResult } from "./replicate-execution.worker";

// ---- Zero-external-call guard ------------------------------------------------

let externalCallAttempts = 0;
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

// ---- Fakes --------------------------------------------------------------------

class QueueCandidateFake implements QueuedExecutionCandidatePort {
  private ids: string[];
  calls = 0;
  excludeIdsSeen: string[][] = [];
  constructor(ids: string[]) {
    this.ids = [...ids];
  }
  async findNextQueuedExecutionId(excludeIds: readonly string[] = []): Promise<string | null> {
    this.calls++;
    this.excludeIdsSeen.push([...excludeIds]);
    const excluded = new Set(excludeIds);
    const index = this.ids.findIndex((id) => !excluded.has(id));
    if (index === -1) return null;
    const [picked] = this.ids.splice(index, 1);
    return picked ?? null;
  }
  remaining() {
    return this.ids.length;
  }
}

class ThrowingCandidatePort implements QueuedExecutionCandidatePort {
  calls = 0;
  async findNextQueuedExecutionId(): Promise<string | null> {
    this.calls++;
    throw new Error("simulated DB error");
  }
}

class CountingWorker implements WorkerPort {
  calls: string[] = [];
  concurrent = 0;
  maxConcurrent = 0;
  private readonly outcome: ReplicateExecutionWorkerResult["outcome"];
  private readonly delayMs: number;
  private readonly throwOn: Set<string>;

  constructor(outcome: ReplicateExecutionWorkerResult["outcome"] = "SUCCEEDED", delayMs = 0, throwOn: string[] = []) {
    this.outcome = outcome;
    this.delayMs = delayMs;
    this.throwOn = new Set(throwOn);
  }

  async processReplicateExecution(executionId: string): Promise<ReplicateExecutionWorkerResult> {
    this.concurrent++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.concurrent);
    this.calls.push(executionId);
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    this.concurrent--;
    if (this.throwOn.has(executionId)) throw new Error(`simulated worker throw for ${executionId}`);
    return { outcome: this.outcome, executionId };
  }
}

const noopSleep = async (_ms: number) => {
  void _ms;
};

// A real (but tiny) timer-based sleep. Needed whenever a test relies on an
// independently scheduled `setTimeout` (e.g. a `requestStop()` call) getting
// a chance to run -- `noopSleep` never yields to the macrotask queue, so an
// unbounded loop built on it would starve any real timer forever.
const tinySleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Records the requested sleep durations instead of actually waiting.
function recordingSleep(log: number[]) {
  return async (ms: number) => {
    log.push(ms);
  };
}

// ---- Tests ----------------------------------------------------------------

test("(1) processes each QUEUED candidate exactly once, in order, at concurrency 1", async () => {
  const candidates = new QueueCandidateFake(["exec-a", "exec-b", "exec-c"]);
  const worker = new CountingWorker("SUCCEEDED");
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 10,
    maxBackoffMs: 100,
    sleep: noopSleep,
    maxIterations: 4
  });

  const summary = await runner.run();

  assert.deepEqual(worker.calls, ["exec-a", "exec-b", "exec-c"]);
  assert.equal(worker.maxConcurrent, 1, "never more than one in-flight processReplicateExecution call");
  assert.equal(summary.processed, 3);
  assert.deepEqual(summary.outcomes, { SUCCEEDED: 3 });
});

test("(2) never dispatches a second execution while the first is still in-flight (real overlap check)", async () => {
  const candidates = new QueueCandidateFake(["exec-a", "exec-b"]);
  const worker = new CountingWorker("SUCCEEDED", 20);
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 1,
    maxBackoffMs: 10,
    sleep: noopSleep,
    maxIterations: 3
  });

  await runner.run();
  assert.equal(worker.maxConcurrent, 1);
});

test("(3) an empty queue produces no worker calls and backs off, never crashing", async () => {
  const candidates = new QueueCandidateFake([]);
  const worker = new CountingWorker("SUCCEEDED");
  const sleeps: number[] = [];
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 10,
    maxBackoffMs: 200,
    sleep: recordingSleep(sleeps),
    maxIterations: 5
  });

  const summary = await runner.run();

  assert.equal(worker.calls.length, 0, "no candidate means no worker call");
  assert.equal(summary.processed, 0);
  assert.equal(candidates.calls, 5);
  // Backoff grows and is capped at maxBackoffMs.
  assert.ok(sleeps.every((s) => s <= 200), `every sleep must be capped at maxBackoffMs; got ${JSON.stringify(sleeps)}`);
  assert.ok(sleeps[1] >= sleeps[0], "backoff must not shrink while the queue stays empty");
});

test("(3b) an INELIGIBLE row is excluded from subsequent candidate lookups so it cannot starve newer eligible work", async () => {
  const candidates = new QueueCandidateFake(["exec-stuck", "exec-stuck", "exec-stuck", "exec-good"]);
  const worker = new CountingWorker("INELIGIBLE");
  // Flip to SUCCEEDED only for the row that should legitimately get through.
  const originalProcess = worker.processReplicateExecution.bind(worker);
  worker.processReplicateExecution = async (id: string) => {
    if (id === "exec-good") {
      worker.calls.push(id);
      return { outcome: "SUCCEEDED", executionId: id };
    }
    return originalProcess(id);
  };

  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 1,
    maxBackoffMs: 10,
    sleep: noopSleep,
    maxIterations: 4
  });

  const summary = await runner.run();

  assert.deepEqual(summary.outcomes, { INELIGIBLE: 1, SUCCEEDED: 1 });
  // The exclude list passed on the SECOND lookup must contain the id proved
  // ineligible on the first lookup.
  assert.deepEqual(candidates.excludeIdsSeen[0], [], "the first lookup excludes nothing");
  assert.ok(
    candidates.excludeIdsSeen[1].includes("exec-stuck"),
    `the second lookup must exclude the just-proved-ineligible id; got ${JSON.stringify(candidates.excludeIdsSeen[1])}`
  );
});

test("(4) a FAILED/terminal outcome is recorded and the runner moves on without resubmitting it", async () => {
  const candidates = new QueueCandidateFake(["exec-a"]);
  const worker = new CountingWorker("VALIDATION_FAILED");
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 5,
    maxBackoffMs: 50,
    sleep: noopSleep,
    maxIterations: 3
  });

  const summary = await runner.run();

  assert.deepEqual(worker.calls, ["exec-a"], "the failed row is claimed and processed exactly once");
  assert.deepEqual(summary.outcomes, { VALIDATION_FAILED: 1 });
  // No further iteration re-fetched exec-a: the candidate fake is exhausted and
  // returns null for every subsequent poll, proving nothing re-submitted it.
  assert.equal(candidates.remaining(), 0);
});

test("(5) requestStop() halts the loop promptly and reports stoppedByRequest", async () => {
  const candidates = new QueueCandidateFake(["exec-a", "exec-b", "exec-c", "exec-d"]);
  const worker = new CountingWorker("SUCCEEDED");
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 5,
    maxBackoffMs: 50,
    sleep: tinySleep
    // no maxIterations: only requestStop() can end this run
  });

  worker.calls = [];
  const runPromise = runner.run();
  // Stop after the loop has had a chance to process the first candidate.
  setTimeout(() => runner.requestStop(), 1);
  const summary = await runPromise;

  assert.equal(summary.stoppedByRequest, true);
  assert.ok(summary.processed <= 4, "stop request bounds the total amount of work done");
});

test("(6) an in-flight execution is always allowed to finish before shutdown takes effect", async () => {
  const candidates = new QueueCandidateFake(["exec-a"]);
  const worker = new CountingWorker("SUCCEEDED", 15);
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 5,
    maxBackoffMs: 50,
    sleep: noopSleep
  });

  const runPromise = runner.run();
  setTimeout(() => runner.requestStop(), 1);
  const summary = await runPromise;

  assert.deepEqual(worker.calls, ["exec-a"], "the in-flight call completed rather than being abandoned");
  assert.equal(summary.processed, 1);
});

test("(7) a candidate-lookup error is logged and does not crash the loop", async () => {
  const candidates = new ThrowingCandidatePort();
  const worker = new CountingWorker("SUCCEEDED");
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 5,
    maxBackoffMs: 50,
    sleep: noopSleep,
    maxIterations: 3
  });

  const summary = await runner.run();

  assert.equal(summary.processed, 0);
  assert.equal(worker.calls.length, 0);
  assert.equal(candidates.calls, 3, "the loop kept polling after each error instead of dying");
});

test("(8) a worker throw (programmer error) is logged, the row is not retried in the same run, and the loop continues", async () => {
  const candidates = new QueueCandidateFake(["exec-bad", "exec-good"]);
  const worker = new CountingWorker("SUCCEEDED", 0, ["exec-bad"]);
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 5,
    maxBackoffMs: 50,
    sleep: noopSleep,
    maxIterations: 3
  });

  const summary = await runner.run();

  assert.deepEqual(worker.calls, ["exec-bad", "exec-good"]);
  assert.equal(summary.processed, 1, "only the successful call counts as processed");
  assert.deepEqual(summary.outcomes, { SUCCEEDED: 1 });
});

test("(9) constructor fails closed on non-positive pollIntervalMs and inverted backoff bounds", () => {
  const candidates = new QueueCandidateFake([]);
  const worker = new CountingWorker();

  assert.throws(() => new InternalWorkerRunner({ candidates, worker, pollIntervalMs: 0, maxBackoffMs: 10 }), TypeError);
  assert.throws(() => new InternalWorkerRunner({ candidates, worker, pollIntervalMs: -5, maxBackoffMs: 10 }), TypeError);
  assert.throws(
    () => new InternalWorkerRunner({ candidates, worker, pollIntervalMs: 100, maxBackoffMs: 50 }),
    TypeError,
    "maxBackoffMs below pollIntervalMs must be rejected at construction time"
  );
});

test("(10) maxIterations bounds the loop even with an inexhaustible queue", async () => {
  const worker = new CountingWorker("SUCCEEDED");
  const infiniteCandidates: QueuedExecutionCandidatePort = {
    async findNextQueuedExecutionId() {
      return "exec-forever";
    }
  };
  const runner = new InternalWorkerRunner({
    candidates: infiniteCandidates,
    worker,
    pollIntervalMs: 1,
    maxBackoffMs: 10,
    sleep: noopSleep,
    maxIterations: 7
  });

  const summary = await runner.run();
  assert.equal(summary.iterations, 7);
  assert.equal(summary.processed, 7);
  assert.equal(summary.stoppedByRequest, false);
});

test("(11) onResult observability hook fires once per processed execution with the true outcome", async () => {
  const candidates = new QueueCandidateFake(["exec-a", "exec-b"]);
  const worker = new CountingWorker("SUCCEEDED");
  const seen: ReplicateExecutionWorkerResult[] = [];
  const runner = new InternalWorkerRunner({
    candidates,
    worker,
    pollIntervalMs: 5,
    maxBackoffMs: 50,
    sleep: noopSleep,
    maxIterations: 2,
    onResult: (r) => seen.push(r)
  });

  await runner.run();
  assert.equal(seen.length, 2);
  assert.deepEqual(
    seen.map((r) => r.executionId),
    ["exec-a", "exec-b"]
  );
});

test("(12) no external network call was attempted at any point in this file", () => {
  assert.equal(externalCallAttempts, 0);
});
