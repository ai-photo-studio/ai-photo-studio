/**
 * R9.5-P5P-MULTI-ITEM-ORCHESTRATION-RACE
 *
 * Proves the item-level restoration/print orchestration invariants against a
 * REAL, disposable, local PostgreSQL instance -- same fail-closed
 * loopback-only guard as every other pg-race test in this repository.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/p5p-multi-item-orchestration.pg-race.test.ts
 *
 * Every row it creates is prefixed `p5p-race-` and is deleted in the final
 * teardown test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const RAW_URL = process.env.DISPOSABLE_DATABASE_URL;
function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}
if (!RAW_URL) fail("DISPOSABLE_DATABASE_URL is required. Refusing to fall back to DATABASE_URL or any default.");
const parsedUrl = (() => {
  try {
    return new URL(RAW_URL);
  } catch {
    return fail("DISPOSABLE_DATABASE_URL is not a valid URL.");
  }
})();
if (!["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname.toLowerCase())) {
  fail(`refusing non-loopback host "${parsedUrl.hostname}". Only localhost/127.0.0.1/::1 are permitted.`);
}
process.env.DATABASE_URL = RAW_URL;
// Minimum env for `loadConfig()` (only used to construct
// FixedOrderRestorationStatusService's read-only StorageService) --
// zero-network mock provider, manual payment gateway, matching every other
// disposable-DB test's fail-closed defaults. Forced (not `||`) because
// importing `@prisma/client` above already auto-loads apps/api/.env, whose
// PAYMENT_GATEWAY_NAME=mock value is not one loadConfig()'s schema accepts.
process.env.PAYMENT_GATEWAY_NAME = "manual";
process.env.AI_PROVIDER = "mock";
process.env.STORAGE_PROVIDER = "mock";
process.env.RESTORATION_PROVIDER = "mock";

let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

const client = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

type ItemSpec = { tier: string; unitAmountMinor: bigint; print?: { size: string; quantity: number; unitAmountMinor: number; subtotalMinor: number; deliveryAmountMinor: number } };

async function seedOrderWithItems(label: string, items: ItemSpec[]) {
  const tag = `p5p-race-${label}-${randomUUID()}`;
  const ownerUserId = `${tag}-owner`;
  const draft = await client.restorationDraft.create({
    data: { ownerUserId, originalStorageKey: `originals/${tag}-source.jpg`, originalMimeType: "image/jpeg", market: "PAKISTAN", currency: "PKR", status: "ORDER_SELECTION" }
  });
  createdDraftIds.push(draft.id);

  const hasPrint = items.some((i) => i.print);
  const totalMinor = items.reduce((sum, i) => sum + i.unitAmountMinor + (i.print ? BigInt(i.print.subtotalMinor) : 0n), 0n) + (hasPrint ? 25000n : 0n);

  const order = await client.fixedOrder.create({
    data: {
      orderNo: `${tag}-order`,
      type: hasPrint ? "RESTORATION_WITH_PRINT" : "RESTORATION_DIGITAL",
      market: "PAKISTAN",
      currency: "PKR",
      ownerUserId,
      sourceDraftId: draft.id,
      totalAmountMinor: totalMinor,
      status: "PAYMENT_PENDING"
    }
  });
  createdOrderIds.push(order.id);

  if (hasPrint) {
    await client.printDeliveryAddress.create({
      data: { fixedOrderId: order.id, recipientName: "P5P Race", phone: "03001234567", addressLine1: "1 Test Street", city: "Lahore", countryCode: "PK" }
    });
  }

  const itemIds: string[] = [];
  for (const spec of items) {
    const item = await client.fixedOrderItem.create({
      data: {
        fixedOrderId: order.id,
        kind: "RESTORATION_DIGITAL_TIER",
        tierOrSku: spec.tier,
        unitAmountMinor: spec.unitAmountMinor,
        totalAmountMinor: spec.unitAmountMinor + (spec.print ? BigInt(spec.print.subtotalMinor) : 0n),
        currency: "PKR",
        pricingSource: "approved_pricebook",
        pricingApproved: true,
        sourceDraftId: draft.id,
        metadata: spec.print ? { print: spec.print } : undefined
      }
    });
    itemIds.push(item.id);
  }

  const attempt = await client.paymentAttempt.create({
    data: { fixedOrderId: order.id, provider: "bank_alfalah", amountMinor: totalMinor, currency: "PKR", idempotencyKey: `${tag}-pay`, status: "CUSTOMER_RETURNED" }
  });

  return { draftId: draft.id, orderId: order.id, orderNo: order.orderNo, ownerUserId, itemIds, attemptId: attempt.id, amountMinor: totalMinor, providerRef: `${tag}-provider-ref` };
}

function evidenceFor(seed: Awaited<ReturnType<typeof seedOrderWithItems>>, overrides: Partial<{ amountMinor: bigint; providerEventId: string; dedupeHash: string }> = {}) {
  const provider = "bank_alfalah";
  const providerEventId = overrides.providerEventId ?? `${seed.orderId}-evt`;
  const amountMinor = overrides.amountMinor ?? seed.amountMinor;
  const dedupeHash =
    overrides.dedupeHash ??
    createHash("sha256").update(`${provider}:${providerEventId}:${seed.orderId}:${amountMinor}:PKR:${seed.providerRef}`).digest("hex");
  return { fixedOrderId: seed.orderId, paymentAttemptId: seed.attemptId, provider, providerEventId, providerRef: seed.providerRef, amountMinor, currency: "PKR" as const, dedupeHash };
}

async function loadP4A() {
  return import("./p4a-payment-verified-execution-queue.service");
}
async function loadPrintService() {
  const mod = await import("./print-fulfilment-boundary.service");
  return new mod.PrintFulfilmentBoundaryService();
}
async function loadStatusService() {
  const mod = await import("./fixed-order-restoration-status.service");
  const { loadConfig } = await import("../config/env");
  return new mod.FixedOrderRestorationStatusService(loadConfig());
}

// ---------------------------------------------------------------------------
// A. Unpaid 3-item order -> 0 executions
// ---------------------------------------------------------------------------
test("(a) an unpaid 3-item order has zero entitlements/masters/executions", async () => {
  const seed = await seedOrderWithItems("unpaid-3", [
    { tier: "ORIGINAL", unitAmountMinor: 50000n },
    { tier: "HD_2X", unitAmountMinor: 100000n },
    { tier: "HD_4X", unitAmountMinor: 150000n }
  ]);
  const entitlements = await client.restorationEntitlement.count({ where: { fixedOrderId: seed.orderId } });
  const executions = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: seed.orderId } } } });
  assert.equal(entitlements, 0);
  assert.equal(executions, 0);
});

// ---------------------------------------------------------------------------
// B/H. Verified PAID 3-item order -> exactly 3/3/3, one order-level payment lifecycle
// ---------------------------------------------------------------------------
let mixedSeed: Awaited<ReturnType<typeof seedOrderWithItems>>;

test("(b/h) verified PAID 3-item order activates exactly 3 entitlements/masters/executions under one order-level payment lifecycle", async () => {
  const { applyVerifiedPaymentEvidence } = await loadP4A();
  mixedSeed = await seedOrderWithItems("mixed-3", [
    { tier: "HD_2X", unitAmountMinor: 100000n }, // Item A: Digital only
    { tier: "HD_4X", unitAmountMinor: 150000n, print: { size: "4x6", quantity: 10, unitAmountMinor: 10000, subtotalMinor: 100000, deliveryAmountMinor: 25000 } }, // Item B: Print+Digital
    { tier: "HD_8X", unitAmountMinor: 350000n, print: { size: "5x7", quantity: 5, unitAmountMinor: 15000, subtotalMinor: 75000, deliveryAmountMinor: 25000 } } // Item C: Print+Digital
  ]);
  const evidence = evidenceFor(mixedSeed);
  const result = await applyVerifiedPaymentEvidence(evidence);
  assert.equal(result.outcome, "APPLIED");
  assert.equal(result.applied?.items.length, 3);

  const entitlements = await client.restorationEntitlement.findMany({ where: { fixedOrderId: mixedSeed.orderId } });
  const masters = await client.restorationMaster.count({ where: { restorationEntitlement: { fixedOrderId: mixedSeed.orderId } } });
  const executions = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: mixedSeed.orderId } } } });
  assert.equal(entitlements.length, 3, "exactly 3 entitlements, one per item");
  assert.equal(masters, 3);
  assert.equal(executions, 3);
  // Each entitlement maps to a distinct item -- never two items sharing one.
  const distinctItemIds = new Set(entitlements.map((e) => e.fixedOrderItemId));
  assert.equal(distinctItemIds.size, 3);
  assert.deepEqual([...distinctItemIds].sort(), [...mixedSeed.itemIds].sort());

  // H: one order-level payment lifecycle -- exactly one PaymentAttempt row
  // regardless of item count.
  const attempts = await client.paymentAttempt.count({ where: { fixedOrderId: mixedSeed.orderId } });
  assert.equal(attempts, 1, "one PaymentAttempt per order, never one per item");
  const attempt = await client.paymentAttempt.findUniqueOrThrow({ where: { id: mixedSeed.attemptId } });
  assert.equal(attempt.status, "PAID");
});

// ---------------------------------------------------------------------------
// C. Duplicate payment callback -> still 3
// ---------------------------------------------------------------------------
test("(c) a duplicate payment callback (same evidence replayed) still leaves exactly 3", async () => {
  const { applyVerifiedPaymentEvidence } = await loadP4A();
  const evidence = evidenceFor(mixedSeed);
  const replay = await applyVerifiedPaymentEvidence(evidence);
  assert.equal(replay.outcome, "APPLIED");
  assert.equal(replay.applied?.items.length, 3);

  const executions = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: mixedSeed.orderId } } } });
  const events = await client.paymentEvent.count({ where: { paymentAttemptId: mixedSeed.attemptId } });
  assert.equal(executions, 3, "no duplicate execution created by the replay");
  assert.equal(events, 1, "no duplicate PaymentEvent row");
});

// ---------------------------------------------------------------------------
// D. 10 concurrent verified events -> still 3
// ---------------------------------------------------------------------------
test("(d) 10 real concurrent verified-evidence calls for a fresh 3-item order converge on exactly 3", async () => {
  const { applyVerifiedPaymentEvidence } = await loadP4A();
  const seed = await seedOrderWithItems("concurrent-3", [
    { tier: "ORIGINAL", unitAmountMinor: 50000n },
    { tier: "HD_2X", unitAmountMinor: 100000n },
    { tier: "HD_4X", unitAmountMinor: 150000n }
  ]);
  const evidence = evidenceFor(seed);
  const results = await Promise.all(Array.from({ length: 10 }, () => applyVerifiedPaymentEvidence(evidence)));
  for (const r of results) assert.equal(r.outcome, "APPLIED");
  const firstItemIds = results.map((r) => r.applied?.items.map((i) => i.replicateExecutionId).sort().join(",")).sort();
  assert.ok(firstItemIds.every((v) => v === firstItemIds[0]), "all 10 racers converge on the identical set of execution ids");

  const executions = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: seed.orderId } } } });
  const entitlements = await client.restorationEntitlement.count({ where: { fixedOrderId: seed.orderId } });
  assert.equal(executions, 3, "still exactly 3, never 1 and never 30");
  assert.equal(entitlements, 3);
});

// ---------------------------------------------------------------------------
// E. Status polling x10 -> still 3, GET-only, never creates work
// ---------------------------------------------------------------------------
test("(e) polling the restoration-status read endpoint 10 times never creates or duplicates a row", async () => {
  const statusService = await loadStatusService();
  const before = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: mixedSeed.orderId } } } });
  for (let i = 0; i < 10; i++) {
    await statusService.getRestorationStatus(mixedSeed.orderNo, { userId: mixedSeed.ownerUserId } as never).catch(() => undefined);
  }
  const after = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: mixedSeed.orderId } } } });
  assert.equal(after, before, "10x read-only polling never changes the execution count");
});

// ---------------------------------------------------------------------------
// F/I. Mixed Digital + Print -> correct print records only, no extra AI execution
// ---------------------------------------------------------------------------
test("(f/i) print fulfilment creates print records only for the print items, reuses their own master, and triggers zero additional restoration executions", async () => {
  // Validate the two print-eligible items' masters (simulating the P3A
  // worker having already completed them); the Digital-only item's master
  // is deliberately left NOT_STARTED to prove it is skipped, not required.
  const entitlements = await client.restorationEntitlement.findMany({ where: { fixedOrderId: mixedSeed.orderId }, include: { restorationMaster: true } });
  const printItemIds = new Set(mixedSeed.itemIds.slice(1)); // items B and C have print
  for (const entitlement of entitlements) {
    if (printItemIds.has(entitlement.fixedOrderItemId)) {
      await client.restorationMaster.update({ where: { id: entitlement.restorationMaster!.id }, data: { status: "VALIDATED", storageKey: `p5p/${entitlement.id}.jpg`, validatedAt: new Date() } });
    }
  }

  const executionsBefore = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: mixedSeed.orderId } } } });

  const service = await loadPrintService();
  const results = await service.prepareAllPrintItems(mixedSeed.orderNo, { userId: mixedSeed.ownerUserId } as never);
  assert.equal(results.length, 2, "exactly the 2 print-eligible items, never the digital-only item");
  for (const r of results) assert.equal(r.blocker, "IN_HOUSE_PRINT_PENDING");

  const printEntitlements = await client.printEntitlement.count({ where: { fixedOrderItemId: { in: mixedSeed.itemIds } } });
  assert.equal(printEntitlements, 2, "print entitlements exist only for the 2 print items, never for the digital-only item");
  const digitalOnlyPrintCount = await client.printEntitlement.count({ where: { fixedOrderItemId: mixedSeed.itemIds[0] } });
  assert.equal(digitalOnlyPrintCount, 0, "the digital-only item never gets a print entitlement");

  // Each print entitlement reuses THAT item's own master, never another item's.
  for (const printEnt of await client.printEntitlement.findMany({ where: { fixedOrderItemId: { in: mixedSeed.itemIds } } })) {
    const ownEntitlement = entitlements.find((e) => e.fixedOrderItemId === printEnt.fixedOrderItemId);
    assert.equal(printEnt.restorationMasterId, ownEntitlement?.restorationMaster?.id, "print entitlement points at its own item's master");
  }

  const executionsAfter = await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: mixedSeed.orderId } } } });
  assert.equal(executionsAfter, executionsBefore, "preparing print fulfilment never creates a new ReplicateExecution");
});

// ---------------------------------------------------------------------------
// G. One-image legacy-shaped order -> still exactly 1
// ---------------------------------------------------------------------------
test("(g) a one-item order (the existing single-image shape) still activates exactly 1 entitlement/master/execution", async () => {
  const { applyVerifiedPaymentEvidence } = await loadP4A();
  const seed = await seedOrderWithItems("single-item", [{ tier: "ORIGINAL", unitAmountMinor: 50000n }]);
  const result = await applyVerifiedPaymentEvidence(evidenceFor(seed));
  assert.equal(result.outcome, "APPLIED");
  assert.equal(result.applied?.items.length, 1);
  assert.equal(await client.restorationEntitlement.count({ where: { fixedOrderId: seed.orderId } }), 1);
  assert.equal(await client.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: seed.orderId } } } }), 1);
});

// ---------------------------------------------------------------------------
// J. Ownership cannot cross items/orders
// ---------------------------------------------------------------------------
test("(j) print fulfilment for one order cannot be reached using another order's actor/owner context", async () => {
  const service = await loadPrintService();
  const stranger = { userId: "p5p-stranger-does-not-own-this-order" };
  await assert.rejects(
    () => service.prepareAllPrintItems(mixedSeed.orderNo, stranger as never),
    (error: unknown) => (error as { code?: string; statusCode?: number }).code === "NOT_FOUND" || (error as { message?: string }).message !== undefined,
    "a non-owning actor must never reach another order's print items"
  );
});

test("(z) out-of-scope invariant: no external network call was attempted at any point", () => {
  assert.equal(externalCallAttempts, 0);
});

test("(zz) teardown: every seeded row is removed and all clients disconnect", async () => {
  await client.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await client.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });
  const { prisma } = await import("../db/prisma");
  await prisma.$disconnect();
  await client.$disconnect();
});
