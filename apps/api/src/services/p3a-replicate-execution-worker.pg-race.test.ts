/**
 * R9.2-P3A-VERIFY-REAL-POSTGRES-RACE
 *
 * The DB-backed half of the P3A one-call proof. `p3a-replicate-execution-worker.test.ts`
 * proves the worker's invariants against an in-process fake repository; this file proves
 * the SAME invariants against a REAL, disposable, local PostgreSQL instance, using the
 * REAL production `PrismaReplicateExecutionRepository` (real `updateMany` claim, real
 * `$transaction` commit) and real rows in the real
 * RestorationDraft -> FixedOrder -> PaymentAttempt -> RestorationEntitlement ->
 * RestorationMaster -> ReplicateExecution chain.
 *
 * Only the DATABASE is real. The provider and storage ports are deterministic in-process
 * mocks and `globalThis.fetch` is a throwing spy, so no Replicate/R2/payment/RunPod
 * network call is possible.
 *
 * Like `verify-disposable-db.ts` and `p1a-fixed-order-flow.test.ts`, this refuses to run
 * against anything but an explicitly supplied local-loopback throwaway database:
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/p3a-replicate-execution-worker.pg-race.test.ts
 *
 * Every row it creates is prefixed `p3a-race-` and is deleted in the final teardown test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import type { PipelineResult } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { ProviderExecutionPort } from "../restoration-providers/pipeline/RestorationExecutionPorts";
import type {
  MasterPersistencePort,
  MasterUploadResult,
  ReplicateExecutionWorkerResult
} from "./replicate-execution.worker";

// ---------------------------------------------------------------------------
// Fail-closed disposable-URL guard (identical policy to verify-disposable-db.ts)
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

// The production `PrismaReplicateExecutionRepository` uses the shared
// `src/db/prisma.ts` client, which reads DATABASE_URL at construction time.
// Point it at the disposable instance BEFORE the worker module is imported.
process.env.DATABASE_URL = RAW_URL;

// ---- Zero-external-call guard ------------------------------------------------

let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

// ---------------------------------------------------------------------------
// Deterministic mocked provider / storage ports (only the DB is real)
// ---------------------------------------------------------------------------

const SOURCE_BYTES = Buffer.from("p3a-race-source-image-bytes");
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
    requestId: "rpl_req_pgrace_001"
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
  async execute(): Promise<PipelineResult> {
    this.calls++;
    // A real provider call is not instantaneous. The delay widens the window in
    // which a second worker could double-dispatch if the claim were not atomic.
    await new Promise((r) => setTimeout(r, 25));
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
    const key = `finals/p3a-race-${params.restorationMasterId}-${this.uploads.length}.png`;
    this.uploads.push({ restorationMasterId: params.restorationMasterId, contentType: params.contentType, key });
    return { key };
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.deletes.push(storageKey);
  }
}

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

async function seedEligibleChain(label: string): Promise<SeededChain> {
  const tag = `p3a-race-${label}-${randomUUID()}`;

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
      status: "PAYMENT_VERIFIED"
    }
  });
  createdOrderIds.push(order.id);

  await clientA.paymentAttempt.create({
    data: {
      fixedOrderId: order.id,
      amountMinor: 150000n,
      currency: "PKR",
      idempotencyKey: `${tag}-pay`,
      status: "PAID"
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
      status: "QUEUED"
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

/** Row counts for every out-of-scope table this packet must never write to. */
async function outOfScopeCounts() {
  const [imageVariant, digitalEntitlement, printEntitlement, addOnOrderLink, fulfilmentOrder, shipment, paymentEvent, paymentAttempt, restorationEntitlement] =
    await Promise.all([
      clientA.imageVariant.count(),
      clientA.digitalEntitlement.count(),
      clientA.printEntitlement.count(),
      clientA.addOnOrderLink.count(),
      clientA.fulfilmentOrder.count(),
      clientA.shipment.count(),
      clientA.paymentEvent.count(),
      clientA.paymentAttempt.count(),
      clientA.restorationEntitlement.count()
    ]);
  return { imageVariant, digitalEntitlement, printEntitlement, addOnOrderLink, fulfilmentOrder, shipment, paymentEvent, paymentAttempt, restorationEntitlement };
}

// Lazily imported so DATABASE_URL is already pointed at the disposable instance.
async function loadWorkerModule() {
  return import("./replicate-execution.worker");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let raceChain: SeededChain;
let raceProvider: CountingProviderExecutor;
let racePersistence: CountingPersistence;
let raceResults: ReplicateExecutionWorkerResult[];
let baselineCounts: Awaited<ReturnType<typeof outOfScopeCounts>>;

test("(pg0) the disposable database is reachable, migrated, and has the P3A chain tables", async () => {
  PNG_OUTPUT = await sharp({ create: { width: 96, height: 72, channels: 3, background: { r: 7, g: 9, b: 11 } } })
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

test("(pg1) one complete eligible paid chain is seeded with real rows", async () => {
  baselineCounts = await outOfScopeCounts();
  raceChain = await seedEligibleChain("race");

  const exec = await clientA.replicateExecution.findUniqueOrThrow({ where: { id: raceChain.executionId } });
  assert.equal(exec.status, "QUEUED");
  const master = await clientA.restorationMaster.findUniqueOrThrow({ where: { id: raceChain.masterId } });
  assert.equal(master.status, "NOT_STARTED");
  assert.equal(master.storageKey, null);
});

test("(pg2) two genuinely concurrent workers on ONE real QUEUED row: exactly one claim, one provider call, one upload, one commit", async () => {
  const { ReplicateExecutionWorker, PrismaReplicateExecutionRepository } = await loadWorkerModule();

  raceProvider = new CountingProviderExecutor();
  racePersistence = new CountingPersistence();

  // Two independently constructed workers, each with its OWN production
  // repository instance, issuing their statements over separate pooled
  // Postgres connections. No mutex, no lock, no JS-level serialization: the
  // only thing that can prevent a double claim is Postgres's own row-level
  // atomicity on `UPDATE ... WHERE id=$1 AND status='QUEUED'`.
  const buildWorker = () =>
    new ReplicateExecutionWorker({
      repository: new PrismaReplicateExecutionRepository(),
      persistence: racePersistence,
      providerExecutor: raceProvider,
      providerSelection: "replicate"
    });

  raceResults = await Promise.all([
    buildWorker().processReplicateExecution(raceChain.executionId),
    buildWorker().processReplicateExecution(raceChain.executionId)
  ]);

  const outcomes = raceResults.map((r) => r.outcome).sort();
  assert.deepEqual(
    outcomes,
    ["CLAIM_LOST", "SUCCEEDED"].sort(),
    `exactly one winner and one loser; got ${JSON.stringify(outcomes)}`
  );
  assert.equal(raceProvider.calls, 1, "exactly ONE real provider call across both racing workers");
  assert.equal(racePersistence.uploads.length, 1, "exactly ONE permanent master object uploaded");
  assert.equal(racePersistence.downloads, 1, "only the claim winner downloaded the source");
  assert.equal(racePersistence.deletes.length, 0, "no compensation delete on the success path");

  // Exactly one completion transaction, read once from the real DB.
  const exec = await clientB.replicateExecution.findUniqueOrThrow({ where: { id: raceChain.executionId } });
  assert.equal(exec.status, "SUCCEEDED", "the real ReplicateExecution row ends SUCCEEDED");
  assert.ok(exec.startedAt, "the claim recorded startedAt");
  assert.ok(exec.completedAt, "the commit recorded completedAt");
  assert.equal(exec.failureReason, null, "a successful execution records no failure reason");
});

test("(pg3) the loser's outcome is CLAIM_LOST and it performed no provider, storage, or DB mutation", async () => {
  const loser = raceResults.find((r) => r.outcome !== "SUCCEEDED");
  assert.ok(loser, "one of the two racers must have lost the claim");
  assert.equal(loser.outcome, "CLAIM_LOST");
  assert.equal(loser.master, undefined, "the loser reports no master");
  // Counts are still 1 (asserted in pg2) -- the loser added nothing.
  assert.equal(raceProvider.calls, 1);
  assert.equal(racePersistence.uploads.length, 1);
});

test("(pg4) the persisted RestorationMaster matches the mocked provider/storage output byte-for-byte", async () => {
  const master = await clientB.restorationMaster.findUniqueOrThrow({ where: { id: raceChain.masterId } });
  const upload = racePersistence.uploads[0];
  const winner = raceResults.find((r) => r.outcome === "SUCCEEDED");

  assert.equal(master.status, "VALIDATED", "the real RestorationMaster row ends VALIDATED");
  assert.equal(master.storageKey, upload.key, "persisted storage key is exactly the key the storage port returned");
  assert.equal(master.sha256, PNG_SHA256, "persisted SHA-256 is the hash of the exact mocked output bytes");
  assert.equal(master.width, 96);
  assert.equal(master.height, 72);
  assert.equal(master.contentType, "image/png");
  assert.ok(master.validatedAt, "validatedAt is stamped by the completion transaction");

  const exec = await clientB.replicateExecution.findUniqueOrThrow({ where: { id: raceChain.executionId } });
  assert.equal(exec.outputSha256, PNG_SHA256, "the execution records the same hash as the master");
  assert.equal(exec.providerRequestRef, "rpl_req_pgrace_001", "the opaque provider reference is persisted verbatim");

  assert.equal(winner?.master?.sha256, PNG_SHA256);
  assert.equal(winner?.master?.width, 96);
  assert.equal(winner?.master?.height, 72);
  assert.equal(winner?.master?.contentType, "image/png");
  assert.equal(winner?.master?.providerRequestRef, "rpl_req_pgrace_001");
  assert.equal(winner?.master?.restorationMasterId, raceChain.masterId);
});

test("(pg5) replaying the now-SUCCEEDED execution performs zero further provider or storage work", async () => {
  const { ReplicateExecutionWorker, PrismaReplicateExecutionRepository } = await loadWorkerModule();
  const providerCallsBefore = raceProvider.calls;
  const uploadsBefore = racePersistence.uploads.length;
  const masterBefore = await clientB.restorationMaster.findUniqueOrThrow({ where: { id: raceChain.masterId } });

  const replay = await new ReplicateExecutionWorker({
    repository: new PrismaReplicateExecutionRepository(),
    persistence: racePersistence,
    providerExecutor: raceProvider,
    providerSelection: "replicate"
  }).processReplicateExecution(raceChain.executionId);

  assert.equal(replay.outcome, "INELIGIBLE", "a SUCCEEDED execution is never re-claimed");
  assert.equal(raceProvider.calls, providerCallsBefore, "zero additional provider calls on replay");
  assert.equal(racePersistence.uploads.length, uploadsBefore, "zero additional uploads on replay");
  assert.equal(racePersistence.deletes.length, 0);

  const masterAfter = await clientB.restorationMaster.findUniqueOrThrow({ where: { id: raceChain.masterId } });
  assert.equal(masterAfter.storageKey, masterBefore.storageKey, "the replay did not overwrite the persisted master");
  assert.equal(masterAfter.sha256, masterBefore.sha256);
  assert.equal(masterAfter.updatedAt.getTime(), masterBefore.updatedAt.getTime(), "the replay wrote nothing at all");
});

test("(pg6) the raw claim SQL is atomic across two INDEPENDENT PrismaClient connections", async () => {
  // Isolates the claim itself from the rest of the worker: two separate
  // PrismaClients (separate pools, separate backend processes) issue the exact
  // production claim statement concurrently against one fresh QUEUED row.
  const chain = await seedEligibleChain("rawclaim");
  const now = new Date();
  const claim = (client: PrismaClient) =>
    client.replicateExecution.updateMany({
      where: { id: chain.executionId, status: "QUEUED" },
      data: { status: "PROCESSING", startedAt: now }
    });

  const [a, b] = await Promise.all([claim(clientA), claim(clientB)]);
  assert.equal(a.count + b.count, 1, `exactly one connection may transition the row; got ${a.count} + ${b.count}`);

  const row = await clientA.replicateExecution.findUniqueOrThrow({ where: { id: chain.executionId } });
  assert.equal(row.status, "PROCESSING");

  // A third claim against the now-PROCESSING row must transition nothing.
  const third = await claim(clientB);
  assert.equal(third.count, 0, "a non-QUEUED row can never be claimed again");
});

test("(pg7) no payment, entitlement-grant, variant, fulfilment, or RunPod-adjacent row was created", async () => {
  const after = await outOfScopeCounts();
  assert.equal(after.imageVariant, baselineCounts.imageVariant, "no ImageVariant (Sharp variant) row");
  assert.equal(after.digitalEntitlement, baselineCounts.digitalEntitlement, "no DigitalEntitlement grant");
  assert.equal(after.printEntitlement, baselineCounts.printEntitlement, "no PrintEntitlement grant");
  assert.equal(after.addOnOrderLink, baselineCounts.addOnOrderLink, "no add-on order link");
  assert.equal(after.fulfilmentOrder, baselineCounts.fulfilmentOrder, "no fulfilment order");
  assert.equal(after.shipment, baselineCounts.shipment, "no shipment");
  assert.equal(after.paymentEvent, baselineCounts.paymentEvent, "no payment event written by the worker");
  // Exactly the two PaymentAttempt / RestorationEntitlement rows THIS test seeded.
  assert.equal(after.paymentAttempt, baselineCounts.paymentAttempt + 2, "only the seeded payment attempts exist");
  assert.equal(after.restorationEntitlement, baselineCounts.restorationEntitlement + 2, "only the seeded entitlements exist");

  // The worker never mutated the payment/entitlement rows it read.
  const attempt = await clientA.paymentAttempt.findFirstOrThrow({ where: { fixedOrderId: raceChain.orderId } });
  assert.equal(attempt.status, "PAID", "the payment attempt is untouched");
  const ent = await clientA.restorationEntitlement.findUniqueOrThrow({ where: { id: raceChain.entitlementId } });
  assert.equal(ent.status, "GRANTED", "the entitlement is untouched (never CONSUMED by this worker)");
  const order = await clientA.fixedOrder.findUniqueOrThrow({ where: { id: raceChain.orderId } });
  assert.equal(order.status, "PAYMENT_VERIFIED", "the fixed order is untouched");
});

test("(pg8) no external network call was attempted at any point", () => {
  assert.equal(externalCallAttempts, 0, "the mocked provider/storage ports made zero real fetch/network calls");
});

test("(pg9) teardown: every seeded row is removed and all clients disconnect", async () => {
  await clientA.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await clientA.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });

  const residual = await clientA.replicateExecution.count();
  const drafts = await clientA.restorationDraft.count({ where: { originalStorageKey: { contains: "p3a-race-" } } });
  assert.equal(residual, 0, "no ReplicateExecution row survives teardown");
  assert.equal(drafts, 0, "no synthetic draft survives teardown");

  const { prisma } = await import("../db/prisma");
  await prisma.$disconnect();
  await clientA.$disconnect();
  await clientB.$disconnect();
});
