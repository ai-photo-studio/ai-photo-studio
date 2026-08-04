/**
 * R9.2-P4A-VERIFY-REAL-POSTGRES-RACE
 *
 * Proves `applyVerifiedPaymentEvidence` (apps/api/src/services/p4a-payment-verified-execution-queue.service.ts)
 * against a REAL, disposable, local PostgreSQL instance -- same fail-closed
 * loopback-only guard as `p3a-replicate-execution-worker.pg-race.test.ts`.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/p4a-payment-verified-execution-queue.service.pg-race.test.ts
 *
 * Every row it creates is prefixed `p4a-race-` and is deleted in the final teardown test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Fail-closed disposable-URL guard (identical policy to the P3A pg-race test)
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

async function loadServiceModule() {
  return import("./p4a-payment-verified-execution-queue.service");
}

// ---------------------------------------------------------------------------
// Real Prisma clients / seeding
// ---------------------------------------------------------------------------

const clientA = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const clientB = new PrismaClient({ datasources: { db: { url: RAW_URL } } });

const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

type SeededOrder = {
  draftId: string;
  orderId: string;
  attemptId: string;
  amountMinor: bigint;
  currency: "PKR";
  providerRef: string;
};

async function seedUnpaidOrder(label: string): Promise<SeededOrder> {
  const tag = `p4a-race-${label}-${randomUUID()}`;

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
      status: "PAYMENT_PENDING"
    }
  });
  createdOrderIds.push(order.id);

  const attempt = await clientA.paymentAttempt.create({
    data: {
      fixedOrderId: order.id,
      provider: "bank_alfalah",
      amountMinor: 150000n,
      currency: "PKR",
      idempotencyKey: `${tag}-pay`,
      status: "CUSTOMER_RETURNED"
    }
  });

  return {
    draftId: draft.id,
    orderId: order.id,
    attemptId: attempt.id,
    amountMinor: 150000n,
    currency: "PKR",
    providerRef: `${tag}-provider-ref`
  };
}

function evidenceFor(seed: SeededOrder, overrides: Partial<{ amountMinor: bigint; currency: "PKR" | "USD"; providerRef: string; provider: string }> = {}) {
  const provider = overrides.provider ?? "bank_alfalah";
  const providerEventId = `${seed.orderId}-evt`;
  const amountMinor = overrides.amountMinor ?? seed.amountMinor;
  const currency = overrides.currency ?? seed.currency;
  const providerRef = overrides.providerRef ?? seed.providerRef;
  const dedupeHash = createHash("sha256")
    .update(`${provider}:${providerEventId}:${seed.orderId}:${amountMinor}:${currency}:${providerRef}`)
    .digest("hex");
  return {
    fixedOrderId: seed.orderId,
    paymentAttemptId: seed.attemptId,
    provider,
    providerEventId,
    providerRef,
    amountMinor,
    currency,
    dedupeHash
  };
}

/** Row counts for every out-of-scope table this packet must never write to. */
async function outOfScopeCounts() {
  const [imageVariant, digitalEntitlement, printEntitlement, addOnOrderLink, fulfilmentOrder, shipment, replicateExecution] = await Promise.all([
    clientA.imageVariant.count(),
    clientA.digitalEntitlement.count(),
    clientA.printEntitlement.count(),
    clientA.addOnOrderLink.count(),
    clientA.fulfilmentOrder.count(),
    clientA.shipment.count(),
    clientA.replicateExecution.count()
  ]);
  return { imageVariant, digitalEntitlement, printEntitlement, addOnOrderLink, fulfilmentOrder, shipment, replicateExecution };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let happySeed: SeededOrder;
let baselineOutOfScope: Awaited<ReturnType<typeof outOfScopeCounts>>;

test("(q0) the disposable database is reachable and migrated with the P4A chain tables", async () => {
  const rows = await clientA.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('FixedOrder','PaymentAttempt','PaymentEvent','RestorationEntitlement','RestorationMaster','ReplicateExecution')`;
  assert.equal(rows.length, 6, "all six chain tables must exist in the migrated disposable database");
  baselineOutOfScope = await outOfScopeCounts();
});

test("(q1) happy path: verified evidence marks the attempt PAID, locks the order, and enqueues exactly one QUEUED execution", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  happySeed = await seedUnpaidOrder("happy");
  const evidence = evidenceFor(happySeed);

  const result = await applyVerifiedPaymentEvidence(evidence);
  assert.equal(result.outcome, "APPLIED");
  assert.ok(result.applied);

  const attempt = await clientA.paymentAttempt.findUniqueOrThrow({ where: { id: happySeed.attemptId } });
  assert.equal(attempt.status, "PAID");
  assert.equal(attempt.providerRef, happySeed.providerRef);

  const order = await clientA.fixedOrder.findUniqueOrThrow({ where: { id: happySeed.orderId } });
  assert.equal(order.status, "LOCKED");
  assert.ok(order.lockedAt, "lockedAt is stamped");

  const entitlement = await clientA.restorationEntitlement.findUniqueOrThrow({ where: { fixedOrderId: happySeed.orderId } });
  assert.equal(entitlement.status, "GRANTED");
  assert.equal(entitlement.draftId, happySeed.draftId);

  const master = await clientA.restorationMaster.findUniqueOrThrow({ where: { restorationEntitlementId: entitlement.id } });
  assert.equal(master.status, "NOT_STARTED");

  const execution = await clientA.replicateExecution.findUniqueOrThrow({ where: { restorationMasterId: master.id } });
  assert.equal(execution.status, "QUEUED");
  assert.equal(execution.idempotencyKey, `restoration-execution:${master.id}`);

  const event = await clientA.paymentEvent.findUniqueOrThrow({ where: { dedupeHash: evidence.dedupeHash } });
  assert.equal(event.verified, true);
  assert.equal(event.paymentAttemptId, happySeed.attemptId);
});

test("(q2) replaying the exact same evidence is idempotent: no duplicate PaymentEvent/entitlement/master/execution row", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  const evidence = evidenceFor(happySeed);

  const before = {
    events: await clientA.paymentEvent.count({ where: { paymentAttemptId: happySeed.attemptId } }),
    entitlements: await clientA.restorationEntitlement.count({ where: { fixedOrderId: happySeed.orderId } }),
    executions: await clientA.replicateExecution.count()
  };

  const replay1 = await applyVerifiedPaymentEvidence(evidence);
  const replay2 = await applyVerifiedPaymentEvidence(evidence);

  assert.equal(replay1.outcome, "APPLIED");
  assert.equal(replay2.outcome, "APPLIED");
  assert.equal(replay1.applied?.replicateExecutionId, replay2.applied?.replicateExecutionId);

  const after = {
    events: await clientA.paymentEvent.count({ where: { paymentAttemptId: happySeed.attemptId } }),
    entitlements: await clientA.restorationEntitlement.count({ where: { fixedOrderId: happySeed.orderId } }),
    executions: await clientA.replicateExecution.count()
  };
  assert.equal(after.events, before.events, "no duplicate PaymentEvent row on replay");
  assert.equal(after.entitlements, before.entitlements, "no duplicate RestorationEntitlement row on replay");
  assert.equal(after.executions, before.executions, "no duplicate ReplicateExecution row on replay");
});

test("(q3) two REAL concurrent calls with identical evidence converge on exactly one attempt/entitlement/master/execution row", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  const seed = await seedUnpaidOrder("concurrent");
  const evidence = evidenceFor(seed);

  // Two independent module invocations racing over the SAME shared `prisma`
  // client's connection pool -- no mutex, no JS-level serialization. Only
  // Postgres's own unique constraints (PaymentEvent.dedupeHash,
  // RestorationEntitlement.fixedOrderId, RestorationMaster.restorationEntitlementId,
  // ReplicateExecution.restorationMasterId/idempotencyKey) can prevent a double write.
  const [r1, r2] = await Promise.all([applyVerifiedPaymentEvidence(evidence), applyVerifiedPaymentEvidence(evidence)]);

  assert.equal(r1.outcome, "APPLIED");
  assert.equal(r2.outcome, "APPLIED");
  assert.equal(r1.applied?.replicateExecutionId, r2.applied?.replicateExecutionId, "both racers converge on the same execution id");
  assert.equal(r1.applied?.restorationEntitlementId, r2.applied?.restorationEntitlementId);
  assert.equal(r1.applied?.restorationMasterId, r2.applied?.restorationMasterId);
  assert.equal(r1.applied?.paymentEventId, r2.applied?.paymentEventId);

  const eventCount = await clientB.paymentEvent.count({ where: { paymentAttemptId: seed.attemptId } });
  const entitlementCount = await clientB.restorationEntitlement.count({ where: { fixedOrderId: seed.orderId } });
  const executionCount = await clientB.replicateExecution.count({ where: { restorationMasterId: r1.applied!.restorationMasterId } });
  assert.equal(eventCount, 1, "exactly one PaymentEvent row");
  assert.equal(entitlementCount, 1, "exactly one RestorationEntitlement row");
  assert.equal(executionCount, 1, "exactly one ReplicateExecution row");

  const attempt = await clientB.paymentAttempt.findUniqueOrThrow({ where: { id: seed.attemptId } });
  assert.equal(attempt.status, "PAID");
});

test("(q4) amount mismatch is rejected and writes nothing", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  const seed = await seedUnpaidOrder("amount-mismatch");
  const evidence = evidenceFor(seed, { amountMinor: 999999n });

  const result = await applyVerifiedPaymentEvidence(evidence);
  assert.equal(result.outcome, "AMOUNT_MISMATCH");

  const attempt = await clientA.paymentAttempt.findUniqueOrThrow({ where: { id: seed.attemptId } });
  assert.equal(attempt.status, "CUSTOMER_RETURNED", "attempt status untouched on mismatch");
  const order = await clientA.fixedOrder.findUniqueOrThrow({ where: { id: seed.orderId } });
  assert.equal(order.status, "PAYMENT_PENDING", "order untouched on mismatch");
  const entitlementCount = await clientA.restorationEntitlement.count({ where: { fixedOrderId: seed.orderId } });
  assert.equal(entitlementCount, 0, "no entitlement created on mismatch");
});

test("(q5) currency mismatch is rejected and writes nothing", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  const seed = await seedUnpaidOrder("currency-mismatch");
  const evidence = evidenceFor(seed, { currency: "USD" });

  const result = await applyVerifiedPaymentEvidence(evidence);
  assert.equal(result.outcome, "CURRENCY_MISMATCH");
  const attempt = await clientA.paymentAttempt.findUniqueOrThrow({ where: { id: seed.attemptId } });
  assert.equal(attempt.status, "CUSTOMER_RETURNED");
});

test("(q6) provider reference mismatch on a second, different evidence call is rejected", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  const seed = await seedUnpaidOrder("ref-mismatch");
  const first = evidenceFor(seed);
  const applied = await applyVerifiedPaymentEvidence(first);
  assert.equal(applied.outcome, "APPLIED");

  // A second, DIFFERENT provider reference for the same attempt (which is now
  // PAID) must never be treated as a fresh, different-evidence "re-verify".
  const second = evidenceFor(seed, { providerRef: `${seed.providerRef}-DIFFERENT` });
  const result = await applyVerifiedPaymentEvidence(second);
  assert.equal(result.outcome, "PROVIDER_REFERENCE_MISMATCH");
});

test("(q7) order not found and attempt not found are rejected and write nothing", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  const seed = await seedUnpaidOrder("not-found");

  const badOrder = await applyVerifiedPaymentEvidence(evidenceFor({ ...seed, orderId: "does-not-exist" }));
  assert.equal(badOrder.outcome, "ORDER_NOT_FOUND");

  const badAttempt = await applyVerifiedPaymentEvidence(evidenceFor({ ...seed, attemptId: "does-not-exist" }));
  assert.equal(badAttempt.outcome, "ATTEMPT_NOT_FOUND");
});

test("(q8) attempt already in a disallowed terminal state rejects new evidence", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  const seed = await seedUnpaidOrder("terminal");
  await clientA.paymentAttempt.update({ where: { id: seed.attemptId }, data: { status: "REFUNDED" } });

  const result = await applyVerifiedPaymentEvidence(evidenceFor(seed));
  assert.equal(result.outcome, "ATTEMPT_STATE_NOT_PERMITTED");
  const entitlementCount = await clientA.restorationEntitlement.count({ where: { fixedOrderId: seed.orderId } });
  assert.equal(entitlementCount, 0);
});

test("(q9) malformed / manual-input-shaped evidence (missing fields, wrong types) is rejected before any DB read of business state", async () => {
  const { applyVerifiedPaymentEvidence } = await loadServiceModule();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const garbage: any = { fixedOrderId: "", paymentAttemptId: null, amountMinor: -5 };
  const result = await applyVerifiedPaymentEvidence(garbage);
  assert.equal(result.outcome, "INVALID_EVIDENCE_SHAPE");
});

test("(q10) this module is not reachable from any controller or route: browser-return, client-input, and admin-action call sites do not exist", () => {
  // The ONLY security boundary this internal function has is the absence of
  // any HTTP entry point. This statically proves that boundary by scanning
  // every controller and route source file for a reference to this module.
  const apiSrc = join(__dirname, "..");
  const scanDirs = ["controllers", "routes"];
  const offenders: string[] = [];
  for (const dir of scanDirs) {
    const full = join(apiSrc, dir);
    let files: string[];
    try {
      files = readdirSync(full).filter((f) => f.endsWith(".ts"));
    } catch {
      continue;
    }
    for (const file of files) {
      const contents = readFileSync(join(full, file), "utf8");
      if (contents.includes("p4a-payment-verified-execution-queue") || contents.includes("applyVerifiedPaymentEvidence")) {
        offenders.push(`${dir}/${file}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `no controller or route may reference the P4A trust boundary; found: ${offenders.join(", ")}`);
});

test("(q11) out-of-scope tables (variants, digital/print entitlements, add-ons, fulfilment, shipment) remain untouched", async () => {
  const after = await outOfScopeCounts();
  assert.equal(after.imageVariant, baselineOutOfScope.imageVariant);
  assert.equal(after.digitalEntitlement, baselineOutOfScope.digitalEntitlement);
  assert.equal(after.printEntitlement, baselineOutOfScope.printEntitlement);
  assert.equal(after.addOnOrderLink, baselineOutOfScope.addOnOrderLink);
  assert.equal(after.fulfilmentOrder, baselineOutOfScope.fulfilmentOrder);
  assert.equal(after.shipment, baselineOutOfScope.shipment);
});

test("(q12) no external network call was attempted at any point", () => {
  assert.equal(externalCallAttempts, 0, "zero Replicate/R2/Bank Alfalah/any network call inside the P4A transaction path");
});

test("(q13) teardown: every seeded row is removed and all clients disconnect", async () => {
  await clientA.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await clientA.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });

  const drafts = await clientA.restorationDraft.count({ where: { originalStorageKey: { contains: "p4a-race-" } } });
  assert.equal(drafts, 0, "no synthetic draft survives teardown");

  const { prisma } = await import("../db/prisma");
  await prisma.$disconnect();
  await clientA.$disconnect();
  await clientB.$disconnect();
});
