/**
 * R9.2-P4B-VERIFY-REAL-POSTGRES-RACE
 *
 * The DB-backed half of the P4B proof. `p4b-internal-worker-runner.service.test.ts`
 * proves `InternalWorkerRunner`'s loop/backoff/shutdown invariants against fake
 * ports; this file proves the SAME loop against a REAL, disposable, local
 * PostgreSQL 17, the REAL `PrismaQueuedExecutionCandidateRepository`, and the
 * REAL, UNCHANGED P3A `ReplicateExecutionWorker` + `PrismaReplicateExecutionRepository`.
 *
 * Only the DATABASE is real. The provider and storage ports are deterministic
 * in-process mocks and `globalThis.fetch` is a throwing spy, so no
 * Replicate/R2/payment/RunPod/Bank Alfalah network call is possible.
 *
 * Like `p3a-replicate-execution-worker.pg-race.test.ts` and
 * `p4a-payment-verified-execution-queue.service.pg-race.test.ts`, this refuses
 * to run against anything but an explicitly supplied local-loopback throwaway
 * database:
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/p4b-internal-worker-runner.service.pg-race.test.ts
 *
 * Every row it creates is prefixed `p4b-race-` and is deleted in the final
 * teardown test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import type { PipelineResult } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { ProviderExecutionPort } from "../restoration-providers/pipeline/RestorationExecutionPorts";
import type { MasterPersistencePort, MasterUploadResult } from "./replicate-execution.worker";

// ---------------------------------------------------------------------------
// Fail-closed disposable-URL guard (identical policy to the P3A/P4A pg-race files)
// ---------------------------------------------------------------------------

const RAW_URL = process.env.DISPOSABLE_DATABASE_URL;

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!RAW_URL) {
  fail("DISPOSABLE_DATABASE_URL is required. Refusing to fall back to DATABASE_URL or any default.");
}

const parsedUrl = (() => {
  try {
    return new URL(RAW_URL);
  } catch {
    return fail("DISPOSABLE_DATABASE_URL is not a valid URL.");
  }
})();

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
if (!ALLOWED_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
  fail(`refusing non-loopback host "${parsedUrl.hostname}". Only localhost/127.0.0.1/::1 are permitted.`);
}
const BLOCKED_PATTERNS = [
  /neon\.tech/i,
  /supabase/i,
  /amazonaws/i,
  /northflank/i,
  /render\.com/i,
  /railway\.app/i,
  /googleapis/i,
  /database\.windows\.net/i,
  /planetscale/i,
  /cockroachlabs/i
];
if (BLOCKED_PATTERNS.some((p) => p.test(RAW_URL))) {
  fail("refusing a URL matching a known managed/production database provider pattern.");
}

process.env.DATABASE_URL = RAW_URL;

// ---- Zero-external-call guard ------------------------------------------------

let externalCallAttempts = 0;
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

// ---------------------------------------------------------------------------
// Deterministic mocked provider / storage ports (only the DB is real)
// ---------------------------------------------------------------------------

const SOURCE_BYTES = Buffer.from("p4b-race-source-image-bytes");
let PNG_OUTPUT: Buffer;
let PNG_SHA256: string;

const buildPipelineResult = (image: Buffer): PipelineResult => {
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
    requestId: "rpl_req_p4brace_001"
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

class CountingProviderExecutor implements ProviderExecutionPort {
  calls = 0;
  constructor(private readonly delayMs = 25) {}
  async execute(): Promise<PipelineResult> {
    this.calls++;
    // Widens the race window, exactly as in the P3A pg-race proof.
    await new Promise((r) => setTimeout(r, this.delayMs));
    return buildPipelineResult(PNG_OUTPUT);
  }
}

class CountingPersistence implements MasterPersistencePort {
  downloads = 0;
  uploads: Array<{ restorationMasterId: string; contentType: string; key: string }> = [];
  deletes: string[] = [];

  async downloadSource(storageKey: string): Promise<Buffer> {
    void storageKey;
    this.downloads++;
    return SOURCE_BYTES;
  }

  async uploadMaster(params: { restorationMasterId: string; body: Buffer; contentType: string }): Promise<MasterUploadResult> {
    const key = `finals/p4b-race-${params.restorationMasterId}-${this.uploads.length}.png`;
    this.uploads.push({ restorationMasterId: params.restorationMasterId, contentType: params.contentType, key });
    return { key };
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.deletes.push(storageKey);
  }
}

const noopSleep = async (_ms: number) => {
  void _ms;
};

// ---------------------------------------------------------------------------
// Real Prisma clients / seeding
// ---------------------------------------------------------------------------

const clientA = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const clientB = new PrismaClient({ datasources: { db: { url: RAW_URL } } });

const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

type SeededChain = {
  draftId: string;
  orderId: string;
  entitlementId: string;
  masterId: string;
  executionId: string;
};

async function seedChain(
  label: string,
  opts: { paymentStatus?: string; orderStatus?: string; executionStatus?: string } = {}
): Promise<SeededChain> {
  const tag = `p4b-race-${label}-${randomUUID()}`;

  const draft = await clientA.restorationDraft.create({
    data: {
      originalStorageKey: `originals/${tag}-source.jpg`,
      originalMimeType: "image/jpeg",
      market: "PAKISTAN",
      currency: "PKR",
      status: "ORDER_SELECTION"
    }
  });
  createdDraftIds.push(draft.id);

  const order = await clientA.fixedOrder.create({
    data: {
      orderNo: `${tag}-order`,
      type: "RESTORATION_DIGITAL",
      market: "PAKISTAN",
      currency: "PKR",
      sourceDraftId: draft.id,
      totalAmountMinor: 150000n,
      status: (opts.orderStatus ?? "PAYMENT_VERIFIED") as never
    }
  });
  createdOrderIds.push(order.id);

  await clientA.paymentAttempt.create({
    data: {
      fixedOrderId: order.id,
      amountMinor: 150000n,
      currency: "PKR",
      idempotencyKey: `${tag}-pay`,
      status: (opts.paymentStatus ?? "PAID") as never
    }
  });

  const item = await clientA.fixedOrderItem.create({
    data: {
      fixedOrderId: order.id,
      kind: "RESTORATION_DIGITAL_TIER",
      tierOrSku: "ORIGINAL",
      unitAmountMinor: 150000n,
      totalAmountMinor: 150000n,
      currency: "PKR",
      pricingSource: "approved_pricebook",
      pricingApproved: true,
      sourceDraftId: draft.id
    }
  });

  const entitlement = await clientA.restorationEntitlement.create({
    data: { fixedOrderId: order.id, fixedOrderItemId: item.id, draftId: draft.id, status: "GRANTED" }
  });

  const master = await clientA.restorationMaster.create({
    data: { restorationEntitlementId: entitlement.id, status: "NOT_STARTED" }
  });

  const execution = await clientA.replicateExecution.create({
    data: {
      restorationMasterId: master.id,
      idempotencyKey: `restoration-execution:${master.id}`,
      status: (opts.executionStatus ?? "QUEUED") as never
    }
  });

  return {
    draftId: draft.id,
    orderId: order.id,
    entitlementId: entitlement.id,
    masterId: master.id,
    executionId: execution.id
  };
}

// Lazily imported so DATABASE_URL is already pointed at the disposable instance.
async function loadModules() {
  const worker = await import("./replicate-execution.worker");
  const runnerModule = await import("./p4b-internal-worker-runner.service");
  return { ...worker, ...runnerModule };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("(pg0) the disposable database is reachable, migrated, and has the P4A/P3A chain tables", async () => {
  PNG_OUTPUT = await sharp({ create: { width: 80, height: 60, channels: 3, background: { r: 3, g: 5, b: 7 } } })
    .png()
    .toBuffer();
  PNG_SHA256 = createHash("sha256").update(PNG_OUTPUT).digest("hex");

  const rows = await clientA.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('RestorationDraft','FixedOrder','PaymentAttempt','RestorationEntitlement','RestorationMaster','ReplicateExecution')`;
  assert.equal(rows.length, 6, "all six chain tables must exist in the migrated disposable database");

  const version = await clientA.$queryRaw<{ v: string }[]>`SELECT version() AS v`;
  assert.match(version[0].v, /PostgreSQL/, "the test must be talking to a real PostgreSQL server");
});

test("(pg1) static proof: no controller or route file references the P4B runner or its main entry point", () => {
  const apiSrcRoot = join(__dirname, "..");
  const suspiciousFiles: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules") continue;
        walk(full);
      } else if (
        (dir.includes(`${sep}routes`) || dir.includes(`${sep}controllers`)) &&
        (entry.endsWith(".ts") || entry.endsWith(".js"))
      ) {
        const content = readFileSync(full, "utf8");
        if (content.includes("p4b-internal-worker-runner.service") || content.includes("p4b-worker-runner-main")) {
          suspiciousFiles.push(full);
        }
      }
    }
  }
  walk(apiSrcRoot);

  assert.deepEqual(suspiciousFiles, [], "no route/controller file may reference the P4B runner");
});

test("(pg2) an ineligible QUEUED row (unpaid payment attempt) is never claimed or processed by the runner", async () => {
  const { ReplicateExecutionWorker, PrismaReplicateExecutionRepository } = await loadModules();
  const { InternalWorkerRunner, PrismaQueuedExecutionCandidateRepository } = await loadModules();

  const unpaid = await seedChain("unpaid", { paymentStatus: "CREATED", orderStatus: "PAYMENT_VERIFIED" });

  const provider = new CountingProviderExecutor(1);
  const persistence = new CountingPersistence();
  const worker = new ReplicateExecutionWorker({
    repository: new PrismaReplicateExecutionRepository(),
    persistence,
    providerExecutor: provider,
    providerSelection: "replicate"
  });

  const runner = new InternalWorkerRunner({
    candidates: new PrismaQueuedExecutionCandidateRepository(),
    worker,
    pollIntervalMs: 1,
    maxBackoffMs: 5,
    sleep: noopSleep,
    maxIterations: 1
  });

  const summary = await runner.run();

  assert.equal(summary.processed, 1, "the runner still calls the worker on the row it picked up");
  assert.deepEqual(summary.outcomes, { INELIGIBLE: 1 }, "the P3A worker's own eligibility check rejects the unpaid row");
  assert.equal(provider.calls, 0, "no provider call for an unpaid row");
  assert.equal(persistence.uploads.length, 0);

  const exec = await clientB.replicateExecution.findUniqueOrThrow({ where: { id: unpaid.executionId } });
  assert.equal(exec.status, "QUEUED", "an ineligible row is left exactly as found -- still QUEUED, never claimed");

  // Clean up this deliberately-ineligible row now so it cannot mask the
  // "oldest QUEUED row" candidate selection in the tests that follow. A
  // process restart legitimately DOES re-poll a still-QUEUED ineligible row
  // once (proven above and in the unit-test exclude-list coverage); that
  // behaviour is exercised there, not by leaving this row lying around here.
  await clientA.fixedOrder.delete({ where: { id: unpaid.orderId } });
  await clientA.restorationDraft.delete({ where: { id: unpaid.draftId } });
  createdOrderIds.splice(createdOrderIds.indexOf(unpaid.orderId), 1);
  createdDraftIds.splice(createdDraftIds.indexOf(unpaid.draftId), 1);
});

let raceChain: SeededChain;

test("(pg3) two independent InternalWorkerRunner instances racing on ONE real QUEUED row: exactly one claim, one provider call", async () => {
  const { ReplicateExecutionWorker, PrismaReplicateExecutionRepository } = await loadModules();
  const { InternalWorkerRunner, PrismaQueuedExecutionCandidateRepository } = await loadModules();

  raceChain = await seedChain("race");

  const provider = new CountingProviderExecutor(30);
  const persistence = new CountingPersistence();

  const buildRunner = () =>
    new InternalWorkerRunner({
      candidates: new PrismaQueuedExecutionCandidateRepository(),
      worker: new ReplicateExecutionWorker({
        repository: new PrismaReplicateExecutionRepository(),
        persistence,
        providerExecutor: provider,
        providerSelection: "replicate"
      }),
      pollIntervalMs: 1,
      maxBackoffMs: 5,
      sleep: noopSleep,
      // A couple of spare iterations so a runner whose peek loses the race
      // (finds nothing QUEUED because the other runner's claim already
      // landed) still gets to report a clean summary instead of racing the
      // assertions below against an in-flight query.
      maxIterations: 3
    });

  const [summaryA, summaryB] = await Promise.all([buildRunner().run(), buildRunner().run()]);

  const outcomesFlat = [
    ...Object.entries(summaryA.outcomes).flatMap(([k, v]) => Array(v).fill(k)),
    ...Object.entries(summaryB.outcomes).flatMap(([k, v]) => Array(v).fill(k))
  ].sort();

  // Two valid shapes prove the same invariant ("exactly one provider call
  // across two independently polling runner processes"), depending on
  // exactly how the two runners' non-locking "peek" queries interleave with
  // each other's atomic claim:
  //   (a) both peeks see the row QUEUED, both attempt the claim inside the
  //       P3A worker, and the atomic `UPDATE ... WHERE status='QUEUED'`
  //       resolves it to one CLAIM_LOST + one SUCCEEDED (the P3A-worker-level
  //       race, identical to `p3a-replicate-execution-worker.pg-race.test.ts`);
  //   (b) the slower peek runs after the faster runner's claim has already
  //       landed, so it correctly finds nothing QUEUED and reports zero
  //       outcomes instead of attempting a claim it would only lose.
  // Both are correct; what must NEVER happen is two SUCCEEDED outcomes or
  // two claims.
  const succeededCount = outcomesFlat.filter((o) => o === "SUCCEEDED").length;
  const claimLostCount = outcomesFlat.filter((o) => o === "CLAIM_LOST").length;
  assert.equal(succeededCount, 1, `exactly one SUCCEEDED outcome across both runners; got ${JSON.stringify(outcomesFlat)}`);
  assert.ok(claimLostCount <= 1, `at most one CLAIM_LOST outcome; got ${JSON.stringify(outcomesFlat)}`);
  assert.equal(outcomesFlat.length, 1 + claimLostCount, `no outcome besides SUCCEEDED/CLAIM_LOST; got ${JSON.stringify(outcomesFlat)}`);
  assert.equal(provider.calls, 1, "exactly ONE real provider call across two racing runner processes");
  assert.equal(persistence.uploads.length, 1, "exactly ONE permanent master object uploaded");

  const exec = await clientB.replicateExecution.findUniqueOrThrow({ where: { id: raceChain.executionId } });
  assert.equal(exec.status, "SUCCEEDED");
  assert.equal(exec.outputSha256, PNG_SHA256, "the persisted hash matches the mocked provider output bytes exactly");
});

test("(pg4) restart/replay safety: a fresh runner instance polling again performs zero further provider or storage work", async () => {
  const { ReplicateExecutionWorker, PrismaReplicateExecutionRepository } = await loadModules();
  const { InternalWorkerRunner, PrismaQueuedExecutionCandidateRepository } = await loadModules();

  const provider = new CountingProviderExecutor(1);
  const persistence = new CountingPersistence();
  const runner = new InternalWorkerRunner({
    candidates: new PrismaQueuedExecutionCandidateRepository(),
    worker: new ReplicateExecutionWorker({
      repository: new PrismaReplicateExecutionRepository(),
      persistence,
      providerExecutor: provider,
      providerSelection: "replicate"
    }),
    pollIntervalMs: 1,
    maxBackoffMs: 5,
    sleep: noopSleep,
    maxIterations: 3
  });

  const summary = await runner.run();

  // No QUEUED row remains at this point: pg2's ineligible row was cleaned up
  // and pg3's race row is now SUCCEEDED, so every poll finds nothing and the
  // candidate repository never hands the completed row back to the worker.
  assert.equal(summary.processed, 0, "nothing legitimately claimable remains, so nothing is (re)processed");
  assert.equal(provider.calls, 0, "no provider call on restart/replay once nothing new is legitimately claimable");
  assert.equal(persistence.uploads.length, 0);

  const exec = await clientB.replicateExecution.findUniqueOrThrow({ where: { id: raceChain.executionId } });
  assert.equal(exec.status, "SUCCEEDED", "replay never reopened or reprocessed the completed execution");
});

test("(pg5) graceful shutdown: requestStop lets the in-flight execution finish and then stops, real DB end-to-end", async () => {
  const { ReplicateExecutionWorker, PrismaReplicateExecutionRepository } = await loadModules();
  const { InternalWorkerRunner, PrismaQueuedExecutionCandidateRepository } = await loadModules();

  const chain = await seedChain("shutdown");
  const provider = new CountingProviderExecutor(40);
  const persistence = new CountingPersistence();

  const runner = new InternalWorkerRunner({
    candidates: new PrismaQueuedExecutionCandidateRepository(),
    worker: new ReplicateExecutionWorker({
      repository: new PrismaReplicateExecutionRepository(),
      persistence,
      providerExecutor: provider,
      providerSelection: "replicate"
    }),
    pollIntervalMs: 5,
    maxBackoffMs: 50,
    sleep: noopSleep
    // no maxIterations: only requestStop() ends this run
  });

  const runPromise = runner.run();
  setTimeout(() => runner.requestStop(), 5);
  const summary = await runPromise;

  assert.equal(summary.stoppedByRequest, true);
  assert.equal(summary.processed, 1, "the one in-flight execution completed before shutdown took effect");
  assert.equal(provider.calls, 1);

  const exec = await clientB.replicateExecution.findUniqueOrThrow({ where: { id: chain.executionId } });
  assert.equal(exec.status, "SUCCEEDED", "graceful shutdown did not abandon the row mid-claim");
});

test("(pg6a) fail-closed configuration: startP4BWorkerRunnerProcess refuses a non-replicate provider selection before touching any port", async () => {
  // Minimal set of otherwise-required env vars so `loadConfig()` itself
  // succeeds and the ASSERTION IS SPECIFICALLY about the RESTORATION_PROVIDER
  // gate, not an unrelated missing-variable failure.
  const keysToRestore: Array<[string, string | undefined]> = [
    "RESTORATION_PROVIDER",
    "STORAGE_PROVIDER",
    "REDIS_URL",
    "WHATSAPP_VERIFY_TOKEN",
    "PAYMENT_GATEWAY_NAME",
    "ADMIN_JWT_SECRET",
    "JWT_SECRET",
    "AI_PROVIDER"
  ].map((k) => [k, process.env[k]]);

  process.env.RESTORATION_PROVIDER = "mock";
  process.env.STORAGE_PROVIDER = "mock";
  process.env.REDIS_URL = "redis://127.0.0.1:0";
  process.env.WHATSAPP_VERIFY_TOKEN = "p4b-race-test-token";
  process.env.PAYMENT_GATEWAY_NAME = "manual";
  process.env.ADMIN_JWT_SECRET = "p4b-race-test-admin-secret";
  process.env.JWT_SECRET = "p4b-race-test-jwt-secret";
  process.env.AI_PROVIDER = "mock";

  try {
    const mod = await import("../scripts/p4b-worker-runner-main");
    await assert.rejects(
      () => mod.startP4BWorkerRunnerProcess(),
      /RESTORATION_PROVIDER must be "replicate"/,
      "a non-replicate provider selection must be refused before any worker/runner object is built"
    );
  } finally {
    for (const [key, value] of keysToRestore) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("(pg6b) fail-closed configuration: startP4BWorkerRunnerProcess refuses to start when required config is missing entirely", async () => {
  const original = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    const mod = await import("../scripts/p4b-worker-runner-main");
    await assert.rejects(
      () => mod.startP4BWorkerRunnerProcess(),
      /Invalid environment configuration/,
      "a missing required env var must fail closed via the same loadConfig() gate the HTTP process uses"
    );
  } finally {
    if (original === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original;
  }
});

test("(pg7) no external network call was attempted at any point", () => {
  assert.equal(externalCallAttempts, 0, "the mocked provider/storage ports made zero real fetch/network calls");
});

test("(pg8) teardown: every seeded row is removed and all clients disconnect", async () => {
  await clientA.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await clientA.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });

  const residual = await clientA.replicateExecution.count();
  const drafts = await clientA.restorationDraft.count({ where: { originalStorageKey: { contains: "p4b-race-" } } });
  assert.equal(residual, 0, "no ReplicateExecution row survives teardown");
  assert.equal(drafts, 0, "no synthetic draft survives teardown");

  const { prisma } = await import("../db/prisma");
  await prisma.$disconnect();
  await clientA.$disconnect();
  await clientB.$disconnect();
});
