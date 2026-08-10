/**
 * R9.2-P3A-REPLICATE-ONCE-MASTER-WORKER focused tests.
 *
 * Runs with `npx tsx --test src/services/p3a-replicate-execution-worker.test.ts`.
 *
 * No live network call is possible: `globalThis.fetch` is replaced with a
 * throwing spy for the whole file, so any Replicate/RunPod/payment/fulfilment
 * HTTP call anywhere in the worker's code path fails the test loudly. The
 * provider is mocked at exactly the same seam the existing
 * `RestorationProviderRouter.test.ts` / `RestorationExecutionCoordinator.test.ts`
 * mock it (`ProviderExecutionPort`). No database is touched -- the repository
 * port is faked in-process, and the fake models the atomic conditional-update
 * semantics of the real Postgres claim.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import sharp from "sharp";
import {
  ReplicateExecutionWorker,
  computeExecutionIneligibilityReasons,
  deriveProviderRequestRef,
  validateReplicateMasterOutput,
  MAX_MASTER_OUTPUT_BYTES,
  type CommitMasterParams,
  type MasterPersistencePort,
  type MasterUploadResult,
  type ReplicateExecutionContext,
  type ReplicateExecutionFailureCode,
  type ReplicateExecutionRepositoryPort
} from "./replicate-execution.worker";
import type { ProviderExecutionPort } from "../restoration-providers/pipeline/RestorationExecutionPorts";
import type { PipelineResult } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { RestorationProviderSelection } from "../restoration-providers/pipeline/RestorationProviderRouter";

// ---- Zero-external-call guard ------------------------------------------------

let externalCallAttempts = 0;
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

// ---- Fixtures ---------------------------------------------------------------

const SOURCE_BYTES = Buffer.from("source-image-bytes-placeholder");

let PNG_OUTPUT: Buffer;
let PNG_SHA256: string;

async function buildFixtures() {
  PNG_OUTPUT = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png()
    .toBuffer();
  PNG_SHA256 = createHash("sha256").update(PNG_OUTPUT).digest("hex");
}

const buildPipelineResult = (image: Buffer, overrides?: Partial<PipelineResult["final"]>): PipelineResult => {
  const final = {
    image,
    contentType: "image/png",
    fileName: "restored.png",
    providerName: "replicate-pipeline",
    providerVersion: "2.1.0",
    stages: ["flux_restore", "gfpgan_face_restore"],
    processingTimeMs: 10,
    creditsUsed: 0,
    estimatedCost: 0.014,
    actualCost: 0.014,
    requestId: "rpl_req_abc123",
    ...overrides
  };
  return {
    final,
    intermediateResults: [final],
    totalProcessingTimeMs: 10,
    totalEstimatedCost: 0.014,
    totalActualCost: 0.014,
    tier: "replicate"
  };
};

const buildContext = (overrides?: Partial<ReplicateExecutionContext>): ReplicateExecutionContext => ({
  executionId: "exec-1",
  executionStatus: "QUEUED",
  idempotencyKey: "restoration-execution:master-1",
  restorationMasterId: "master-1",
  masterStatus: "NOT_STARTED",
  masterStorageKey: null,
  restorationEntitlementId: "ent-1",
  entitlementStatus: "GRANTED",
  order: {
    id: "order-1",
    type: "RESTORATION_DIGITAL",
    status: "PAYMENT_VERIFIED",
    market: "PAKISTAN",
    currency: "PKR"
  },
  paymentAttemptStatus: "PAID",
  draft: { id: "draft-1", originalStorageKey: "originals/1-abc-photo.jpg", originalMimeType: "image/jpeg" },
  ...overrides
});

// ---- Fakes ------------------------------------------------------------------

class FakeRepository implements ReplicateExecutionRepositoryPort {
  claimAttempts = 0;
  commits: CommitMasterParams[] = [];
  failures: Array<{ executionId: string; code: ReplicateExecutionFailureCode }> = [];
  commitBehavior: (() => void) | null = null;

  constructor(private ctx: ReplicateExecutionContext | null) {}

  async loadContext(executionId: string): Promise<ReplicateExecutionContext | null> {
    if (!this.ctx || this.ctx.executionId !== executionId) return null;
    return { ...this.ctx };
  }

  /**
   * Models the real Postgres conditional UPDATE ... WHERE id=$1 AND
   * status='QUEUED'. The compare-and-set below is a single synchronous,
   * uninterruptible step in the JS event loop, exactly mirroring the row-level
   * serialization Postgres provides: concurrent callers cannot both observe 1.
   */
  async claimQueued(executionId: string, startedAt: Date): Promise<number> {
    this.claimAttempts++;
    if (!this.ctx || this.ctx.executionId !== executionId) return 0;
    if (this.ctx.executionStatus !== "QUEUED") return 0;
    this.ctx.executionStatus = "PROCESSING";
    void startedAt;
    return 1;
  }

  async commitSuccess(params: CommitMasterParams): Promise<void> {
    if (this.commitBehavior) this.commitBehavior();
    this.commits.push(params);
    if (this.ctx) {
      this.ctx.executionStatus = "SUCCEEDED";
      this.ctx.masterStatus = "VALIDATED";
      this.ctx.masterStorageKey = params.storageKey;
    }
  }

  async markFailed(executionId: string, _masterId: string, code: ReplicateExecutionFailureCode): Promise<void> {
    this.failures.push({ executionId, code });
    if (this.ctx) {
      this.ctx.executionStatus = "FAILED";
      this.ctx.masterStatus = "FAILED";
    }
  }
}

class FakePersistence implements MasterPersistencePort {
  uploads: Array<{ restorationMasterId: string; body: Buffer; contentType: string }> = [];
  deletes: string[] = [];
  downloadBehavior: (() => Buffer) | null = null;
  uploadBehavior: (() => void) | null = null;
  deleteBehavior: (() => void) | null = null;

  async downloadSource(storageKey: string): Promise<Buffer> {
    void storageKey;
    if (this.downloadBehavior) return this.downloadBehavior();
    return SOURCE_BYTES;
  }

  async uploadMaster(params: { restorationMasterId: string; body: Buffer; contentType: string }): Promise<MasterUploadResult> {
    if (this.uploadBehavior) this.uploadBehavior();
    this.uploads.push(params);
    return { key: `finals/1700000000-uuid-restoration-master-${params.restorationMasterId}.png` };
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (this.deleteBehavior) this.deleteBehavior();
    this.deletes.push(storageKey);
  }
}

class RecordingProviderExecutor implements ProviderExecutionPort {
  calls = 0;
  constructor(private readonly behavior: () => Promise<PipelineResult>) {}
  async execute(): Promise<PipelineResult> {
    this.calls++;
    return this.behavior();
  }
}

function buildWorker(parts?: {
  ctx?: ReplicateExecutionContext | null;
  provider?: RecordingProviderExecutor;
  repository?: FakeRepository;
  persistence?: FakePersistence;
  // Deliberately widened: the worker must fail closed even for a selection
  // value that is not part of RestorationProviderSelection (e.g. a bypassed
  // env value such as "runpod"). Cast at the construction site below.
  selection?: string;
}) {
  const repository = parts?.repository ?? new FakeRepository(parts?.ctx === undefined ? buildContext() : parts.ctx);
  const persistence = parts?.persistence ?? new FakePersistence();
  const provider = parts?.provider ?? new RecordingProviderExecutor(async () => buildPipelineResult(PNG_OUTPUT));
  const worker = new ReplicateExecutionWorker({
    repository,
    persistence,
    providerExecutor: provider,
    providerSelection: (parts?.selection ?? "replicate") as RestorationProviderSelection
  });
  return { worker, repository, persistence, provider };
}

// ---- Tests ------------------------------------------------------------------

test("fixtures build", async () => {
  await buildFixtures();
  assert.ok(PNG_OUTPUT.length > 0);
});

// (a) no valid eligible relation -> zero provider calls
test("(a1) a non-existent execution id performs zero provider calls and zero claims", async () => {
  const { worker, repository, provider, persistence } = buildWorker({ ctx: null });
  const result = await worker.processReplicateExecution("exec-missing");
  assert.equal(result.outcome, "NOT_FOUND");
  assert.equal(provider.calls, 0);
  assert.equal(repository.claimAttempts, 0);
  assert.equal(persistence.uploads.length, 0);
});

test("(a2) an unpaid order (no PAID payment attempt) performs zero provider calls and is left untouched", async () => {
  const { worker, repository, provider } = buildWorker({
    ctx: buildContext({ order: { ...buildContext().order, status: "PAYMENT_PENDING" }, paymentAttemptStatus: "CREATED" })
  });
  const result = await worker.processReplicateExecution("exec-1");
  assert.equal(result.outcome, "INELIGIBLE");
  assert.equal(provider.calls, 0);
  assert.equal(repository.claimAttempts, 0, "an ineligible execution is never claimed");
  assert.equal(repository.failures.length, 0, "an ineligible execution is not mutated at all");
});

test("(a3) a REVOKED entitlement, a missing draft, and a mismatched idempotency key each block dispatch", async () => {
  for (const ctx of [
    buildContext({ entitlementStatus: "REVOKED" }),
    buildContext({ draft: null }),
    buildContext({ idempotencyKey: "restoration-execution:some-other-master" }),
    buildContext({ masterStorageKey: "finals/already-there.png" }),
    buildContext({ order: { ...buildContext().order, market: "PAKISTAN", currency: "USD" } })
  ]) {
    const { worker, provider, repository } = buildWorker({ ctx });
    const result = await worker.processReplicateExecution("exec-1");
    assert.equal(result.outcome, "INELIGIBLE");
    assert.equal(provider.calls, 0);
    assert.equal(repository.claimAttempts, 0);
  }
});

// (j) add-on order types can never be executed by this worker
test("(j) DIGITAL_UPGRADE and PRINT_ADD_ON orders can never have Replicate executed against them", async () => {
  for (const type of ["DIGITAL_UPGRADE", "PRINT_ADD_ON"]) {
    const { worker, provider } = buildWorker({ ctx: buildContext({ order: { ...buildContext().order, type } }) });
    const result = await worker.processReplicateExecution("exec-1");
    assert.equal(result.outcome, "INELIGIBLE");
    assert.ok(result.ineligibleReasons?.some((r) => r.includes("first restoration execution")));
    assert.equal(provider.calls, 0);
  }
});

// (b) atomic concurrent claim -> exactly one provider call
test("(b) two concurrent workers on the same execution: exactly one claims and exactly one provider call happens", async () => {
  const repository = new FakeRepository(buildContext());
  const persistence = new FakePersistence();
  const provider = new RecordingProviderExecutor(async () => buildPipelineResult(PNG_OUTPUT));
  const build = () =>
    new ReplicateExecutionWorker({ repository, persistence, providerExecutor: provider, providerSelection: "replicate" });

  const [a, b] = await Promise.all([
    build().processReplicateExecution("exec-1"),
    build().processReplicateExecution("exec-1")
  ]);

  const outcomes = [a.outcome, b.outcome].sort();
  assert.deepEqual(outcomes, ["CLAIM_LOST", "SUCCEEDED"].sort());
  assert.equal(provider.calls, 1, "exactly one Replicate call across both racing workers");
  assert.equal(persistence.uploads.length, 1, "exactly one permanent master uploaded");
  assert.equal(repository.commits.length, 1);
});

// (c) replay on a non-QUEUED execution -> zero second provider calls
test("(c) replaying against PROCESSING/SUCCEEDED/FAILED executions performs zero provider calls", async () => {
  for (const status of ["PROCESSING", "SUCCEEDED", "FAILED"] as const) {
    const { worker, provider, repository, persistence } = buildWorker({ ctx: buildContext({ executionStatus: status }) });
    const result = await worker.processReplicateExecution("exec-1");
    assert.equal(result.outcome, "INELIGIBLE", `status ${status} must not be re-claimed`);
    assert.equal(provider.calls, 0);
    assert.equal(repository.claimAttempts, 0);
    assert.equal(persistence.uploads.length, 0);
  }
});

test("(c2) a VALIDATED master is never re-executed even if the execution row still reads QUEUED", async () => {
  const { worker, provider } = buildWorker({ ctx: buildContext({ masterStatus: "VALIDATED" }) });
  const result = await worker.processReplicateExecution("exec-1");
  assert.equal(result.outcome, "INELIGIBLE");
  assert.equal(provider.calls, 0);
});

// (d) + (i) success path
test("(d,i) a successful mocked Replicate output persists exactly one validated master with correct fields", async () => {
  const { worker, repository, persistence, provider } = buildWorker();
  const result = await worker.processReplicateExecution("exec-1");

  assert.equal(result.outcome, "SUCCEEDED");
  assert.equal(provider.calls, 1, "exactly one provider call, no retry");
  assert.equal(persistence.uploads.length, 1, "exactly one permanent master object");
  assert.equal(repository.commits.length, 1);
  assert.equal(persistence.deletes.length, 0);

  const commit = repository.commits[0];
  assert.equal(commit.restorationMasterId, "master-1");
  assert.equal(commit.sha256, PNG_SHA256, "persisted hash matches the mocked output bytes exactly");
  assert.equal(commit.width, 64);
  assert.equal(commit.height, 48);
  assert.equal(commit.contentType, "image/png");
  assert.equal(commit.providerRequestRef, "rpl_req_abc123");
  assert.equal(commit.storageKey, "finals/1700000000-uuid-restoration-master-master-1.png");
  assert.equal(result.master?.sha256, PNG_SHA256);
  assert.equal(result.master?.providerRequestRef, "rpl_req_abc123");
});

test("(d2) content type comes from magic bytes, not from the provider's declared content type", async () => {
  const provider = new RecordingProviderExecutor(async () => buildPipelineResult(PNG_OUTPUT, { contentType: "image/jpeg" }));
  const { worker, repository } = buildWorker({ provider });
  const result = await worker.processReplicateExecution("exec-1");
  assert.equal(result.outcome, "SUCCEEDED");
  assert.equal(repository.commits[0].contentType, "image/png", "declared image/jpeg must not override the real PNG bytes");
});

// (e) malformed / oversized / non-image output
test("(e) non-image, empty, and oversized provider outputs produce no upload, no completion, and a FAILED execution", async () => {
  const cases: Array<{ name: string; body: Buffer }> = [
    { name: "non-image", body: Buffer.from("MZ\x90\x00 this is an executable, not an image") },
    { name: "empty", body: Buffer.alloc(0) },
    { name: "oversized", body: Buffer.alloc(MAX_MASTER_OUTPUT_BYTES + 1, 0xff) }
  ];
  for (const c of cases) {
    const provider = new RecordingProviderExecutor(async () => buildPipelineResult(c.body));
    const { worker, repository, persistence } = buildWorker({ provider });
    const result = await worker.processReplicateExecution("exec-1");

    assert.equal(result.outcome, "VALIDATION_FAILED", c.name);
    assert.equal(provider.calls, 1, `${c.name}: no retry after a bad output`);
    assert.equal(persistence.uploads.length, 0, `${c.name}: nothing uploaded`);
    assert.equal(repository.commits.length, 0, `${c.name}: nothing completed`);
    assert.deepEqual(repository.failures, [{ executionId: "exec-1", code: "OUTPUT_VALIDATION_FAILED" }]);
  }
});

test("(e2) a truncated PNG that passes the magic-byte check still fails the sharp decode", async () => {
  await buildFixtures();
  const truncated = PNG_OUTPUT.subarray(0, 20);
  await assert.rejects(() => validateReplicateMasterOutput(truncated));
});

// (f) provider failure
test("(f) a provider failure lands in FAILED with no partial master and no second call", async () => {
  const provider = new RecordingProviderExecutor(async () => {
    throw new Error("Replicate prediction failed");
  });
  const { worker, repository, persistence } = buildWorker({ provider });
  const result = await worker.processReplicateExecution("exec-1");

  assert.equal(result.outcome, "PROVIDER_FAILED");
  assert.equal(provider.calls, 1, "no retry, no fallback provider");
  assert.equal(persistence.uploads.length, 0);
  assert.equal(repository.commits.length, 0);
  assert.deepEqual(repository.failures, [{ executionId: "exec-1", code: "PROVIDER_CALL_FAILED" }]);
});

test("(f2) a source-download failure fails closed before the provider is ever called", async () => {
  const persistence = new FakePersistence();
  persistence.downloadBehavior = () => {
    throw new Error("source object unreadable");
  };
  const { worker, repository, provider } = buildWorker({ persistence });
  const result = await worker.processReplicateExecution("exec-1");

  assert.equal(result.outcome, "SOURCE_UNAVAILABLE");
  assert.equal(provider.calls, 0);
  assert.equal(repository.commits.length, 0);
  assert.deepEqual(repository.failures, [{ executionId: "exec-1", code: "SOURCE_UNAVAILABLE" }]);
});

// (g) upload failure
test("(g) an upload failure produces no completed master record", async () => {
  const persistence = new FakePersistence();
  persistence.uploadBehavior = () => {
    throw new Error("R2 upload failed");
  };
  const { worker, repository, provider } = buildWorker({ persistence });
  const result = await worker.processReplicateExecution("exec-1");

  assert.equal(result.outcome, "UPLOAD_FAILED");
  assert.equal(provider.calls, 1);
  assert.equal(repository.commits.length, 0, "DB completion never runs after a failed upload");
  assert.deepEqual(repository.failures, [{ executionId: "exec-1", code: "MASTER_UPLOAD_FAILED" }]);
});

// (h) DB-completion failure after a successful upload
test("(h1) a commit failure after a successful upload attempts bounded compensation and reports failure, not success", async () => {
  const repository = new FakeRepository(buildContext());
  repository.commitBehavior = () => {
    throw new Error("completion transaction failed");
  };
  const { worker, persistence } = buildWorker({ repository });
  const result = await worker.processReplicateExecution("exec-1");

  assert.equal(result.outcome, "COMMIT_FAILED_COMPENSATED");
  assert.notEqual(result.outcome, "SUCCEEDED");
  assert.equal(persistence.uploads.length, 1);
  assert.equal(persistence.deletes.length, 1, "exactly one bounded delete attempt");
  assert.equal(persistence.deletes[0], "finals/1700000000-uuid-restoration-master-master-1.png", "the exact orphaned object is the one compensated");
  assert.deepEqual(repository.failures, [{ executionId: "exec-1", code: "COMMIT_FAILED_ORPHAN_DELETED" }]);
  assert.equal(repository.commits.length, 0);
});

test("(h2) when compensation also fails, the execution lands in an explicit orphan/needs-cleanup failure code", async () => {
  const repository = new FakeRepository(buildContext());
  repository.commitBehavior = () => {
    throw new Error("completion transaction failed");
  };
  const persistence = new FakePersistence();
  persistence.deleteBehavior = () => {
    throw new Error("delete failed too");
  };
  const { worker } = buildWorker({ repository, persistence });
  const result = await worker.processReplicateExecution("exec-1");

  assert.equal(result.outcome, "COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP");
  assert.equal(persistence.deletes.length, 0);
  assert.deepEqual(repository.failures, [{ executionId: "exec-1", code: "COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP" }]);
  assert.equal(repository.commits.length, 0);
});

// Provider isolation
test("a provider selection outside replicate/mock fails closed before any claim or dispatch", async () => {
  for (const selection of ["runpod"] as const) {
    const { worker, provider, repository } = buildWorker({ selection });
    const result = await worker.processReplicateExecution("exec-1");
    assert.equal(result.outcome, "PROVIDER_NOT_AUTHORIZED");
    assert.equal(provider.calls, 0);
    assert.equal(repository.claimAttempts, 0);
  }
});

// R9.5-P4B7: "mock" is the one non-"replicate" selection this worker accepts
// -- see the `providerSelection` doc comment on `ReplicateExecutionWorkerDeps`
// for why this is safe in production (only a non-production, triple-guarded
// runner can ever construct this worker with "mock").
test("a mock provider selection is authorized and reaches claim/dispatch", async () => {
  const { worker, repository, provider } = buildWorker({ selection: "mock" });
  const result = await worker.processReplicateExecution("exec-1");
  assert.notEqual(result.outcome, "PROVIDER_NOT_AUTHORIZED");
  assert.equal(repository.claimAttempts, 1);
  assert.equal(provider.calls, 1);
});

// (k) no public/admin route can dispatch an execution
test("(k) no route or controller file references the worker or ReplicateExecution dispatch", async () => {
  const apiSrc = join(__dirname, "..");
  const scanDirs = [join(apiSrc, "routes"), join(apiSrc, "controllers"), join(apiSrc, "queues")];
  const forbidden = [
    "processReplicateExecution",
    "ReplicateExecutionWorker",
    "replicate-execution.worker",
    "replicateExecution"
  ];
  let scanned = 0;
  for (const dir of scanDirs) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
      const content = readFileSync(join(dir, name), "utf8");
      scanned++;
      for (const token of forbidden) {
        assert.ok(
          !content.includes(token),
          `${name} must not reference "${token}" -- no public/customer/admin route may create or dispatch a ReplicateExecution`
        );
      }
    }
  }
  assert.ok(scanned > 10, `expected to scan the real route/controller/queue files, scanned ${scanned}`);
});

// (l) zero external / out-of-scope calls
test("(l) no external network call was attempted anywhere in this worker's code path", () => {
  assert.equal(externalCallAttempts, 0);
});

test("(l2) the worker source contains no RunPod, payment, Sharp-variant, or fulfilment dependency", () => {
  const source = readFileSync(join(__dirname, "replicate-execution.worker.ts"), "utf8");
  for (const token of [
    "restoration-providers/runpod",
    "RunPodProviderExecutor",
    "runpodExecutorFactory",
    "paymentAttempt.create",
    "paymentAttempt.update",
    "imageVariant",
    "digitalEntitlement",
    "printEntitlement",
    "fulfilmentOrder",
    "shipment.",
    ".resize(",
    "buildVariants"
  ]) {
    assert.ok(!source.includes(token), `worker source must not reference "${token}"`);
  }
});

// Privacy
test("no failure code or outcome value can leak bytes, keys, URLs, or credentials", () => {
  const codes: ReplicateExecutionFailureCode[] = [
    "SOURCE_UNAVAILABLE",
    "PROVIDER_CALL_FAILED",
    "OUTPUT_VALIDATION_FAILED",
    "MASTER_UPLOAD_FAILED",
    "COMMIT_FAILED_ORPHAN_DELETED",
    "COMMIT_FAILED_ORPHAN_NEEDS_CLEANUP"
  ];
  for (const code of codes) {
    assert.match(code, /^[A-Z_]+$/, "failure reasons persisted to the DB are fixed uppercase codes only");
  }
});

test("provider reference derivation never emits a URL or payload", () => {
  assert.equal(deriveProviderRequestRef(buildPipelineResult(Buffer.from("x"))), "rpl_req_abc123");
  assert.equal(
    deriveProviderRequestRef(buildPipelineResult(Buffer.from("x"), { requestId: undefined })),
    "replicate-pipeline"
  );
  const long = deriveProviderRequestRef(buildPipelineResult(Buffer.from("x"), { requestId: "a".repeat(500) }));
  assert.equal(long.length, 128, "provider reference is length-bounded");
});

// Pure eligibility function
test("computeExecutionIneligibilityReasons returns no reasons for a fully valid paid chain", () => {
  assert.deepEqual(computeExecutionIneligibilityReasons(buildContext()), []);
  assert.deepEqual(
    computeExecutionIneligibilityReasons(
      buildContext({
        order: { id: "o", type: "RESTORATION_WITH_PRINT", status: "LOCKED", market: "INTERNATIONAL", currency: "USD" }
      })
    ),
    []
  );
});
