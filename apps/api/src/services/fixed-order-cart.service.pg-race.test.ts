/**
 * R9.5-P5Q-CART-ORDER-CREATION-RACE
 *
 * Proves `FixedOrderService.createRestorationCartOrder` against a REAL
 * disposable PostgreSQL instance -- same fail-closed loopback-only guard as
 * every other pg-race test in this repository.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/fixed-order-cart.service.pg-race.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const RAW_URL = process.env.DISPOSABLE_DATABASE_URL;
if (!RAW_URL) { console.error("FAIL: DISPOSABLE_DATABASE_URL is required"); process.exit(1); }
const parsed = new URL(RAW_URL);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) { console.error("FAIL: loopback only"); process.exit(1); }
process.env.DATABASE_URL = RAW_URL;

let externalCalls = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = () => { externalCalls++; throw new Error("no external network call is permitted"); };

const prisma = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

async function seedDraft(label: string) {
  const tag = `p5q-cart-${label}-${randomUUID()}`;
  const ownerUserId = `p5q-cart-owner-${randomUUID()}`;
  const draft = await prisma.restorationDraft.create({
    data: { ownerUserId, originalStorageKey: `originals/${tag}.jpg`, originalMimeType: "image/jpeg", market: "PAKISTAN", currency: "PKR", status: "UPLOADED" }
  });
  createdDraftIds.push(draft.id);
  return { draftId: draft.id, ownerUserId };
}

async function loadService() {
  const mod = await import("./fixed-order.service");
  return new mod.FixedOrderService();
}

test("(1) a 3-item mixed cart (1 digital, 2 print) charges delivery once at the highest band", async () => {
  const service = await loadService();
  const a = await seedDraft("a");
  const b = await seedDraft("b");
  const c = await seedDraft("c");
  // Same owner for all three -- one cart, one actor.
  await prisma.restorationDraft.updateMany({ where: { id: { in: [a.draftId, b.draftId, c.draftId] } }, data: { ownerUserId: a.ownerUserId } });
  const actor = { userId: a.ownerUserId };

  const order = await service.createRestorationCartOrder({
    items: [
      { draftId: a.draftId, tier: "HD_2X", product: "DIGITAL" }, // 1000
      { draftId: b.draftId, tier: "HD_4X", product: "PRINT_DIGITAL", printSize: "4x6", quantity: 10 }, // 1500 + (100*10=1000) print, delivery band 250
      { draftId: c.draftId, tier: "HD_8X", product: "PRINT_DIGITAL", printSize: "16x24", quantity: 1 } // 3500 + 2500 print, delivery band 500
    ],
    deliveryAddress: { recipientName: "P5Q Cart", phone: "03001234567", addressLine1: "1 Test Street", city: "Lahore", countryCode: "PK" }
  }, actor);
  createdOrderIds.push(order.id);

  assert.equal(order.items.length, 3);
  assert.equal(order.restorationTotalMinor, String(100000 + 150000 + 350000)); // 1000+1500+3500 = 6000
  assert.equal(order.printTotalMinor, String(100000 + 250000)); // 4x6x10=1000 + 16x24x1=2500 = 3500
  assert.equal(order.deliveryAmountMinor, "50000"); // highest band (500), not 250+500=750
  const expectedGrandTotal = 600000 + 350000 + 50000; // restoration 6000 + print 3500 + delivery 500 = PKR 10000
  assert.equal(order.totalAmountMinor, String(expectedGrandTotal));

  const printItems = order.items.filter((i) => i.product === "PRINT_DIGITAL");
  assert.equal(printItems.length, 2);
  const digitalOnly = order.items.filter((i) => i.product === "DIGITAL");
  assert.equal(digitalOnly.length, 1);
});

test("(2) below-minimum print quantity is rejected before any row is written", async () => {
  const service = await loadService();
  const a = await seedDraft("below-min");
  const actor = { userId: a.ownerUserId };
  await assert.rejects(
    () => service.createRestorationCartOrder({
      items: [{ draftId: a.draftId, tier: "ORIGINAL", product: "PRINT_DIGITAL", printSize: "4x6", quantity: 2 }],
      deliveryAddress: { recipientName: "X", phone: "03001234567", addressLine1: "1 St", city: "Lahore", countryCode: "PK" }
    }, actor),
    (error: unknown) => (error as { code?: string }).code === "INVALID_PRINT_SELECTION"
  );
  assert.equal(await prisma.fixedOrder.count({ where: { sourceDraftId: a.draftId } }), 0);
});

test("(3) more than 10 items is rejected", async () => {
  const service = await loadService();
  const drafts = await Promise.all(Array.from({ length: 11 }, (_, i) => seedDraft(`over10-${i}`)));
  const actor = { userId: drafts[0].ownerUserId };
  await prisma.restorationDraft.updateMany({ where: { id: { in: drafts.map((d) => d.draftId) } }, data: { ownerUserId: actor.userId } });
  await assert.rejects(
    () => service.createRestorationCartOrder({ items: drafts.map((d) => ({ draftId: d.draftId, tier: "ORIGINAL", product: "DIGITAL" as const })) }, actor),
    (error: unknown) => (error as { code?: string }).code === "INVALID_ITEM_COUNT"
  );
});

test("(4) zero items is rejected", async () => {
  const service = await loadService();
  const a = await seedDraft("zero-items");
  await assert.rejects(
    () => service.createRestorationCartOrder({ items: [] }, { userId: a.ownerUserId }),
    (error: unknown) => (error as { code?: string }).code === "INVALID_ITEM_COUNT"
  );
});

test("(5) a draft not owned by the actor is rejected (wrong ownership)", async () => {
  const service = await loadService();
  const a = await seedDraft("owner-a");
  const stranger = { userId: "p5q-cart-stranger" };
  await assert.rejects(
    () => service.createRestorationCartOrder({ items: [{ draftId: a.draftId, tier: "ORIGINAL", product: "DIGITAL" }] }, stranger),
    (error: unknown) => (error as { code?: string }).code === "NOT_FOUND"
  );
});

test("(6) duplicate cart submission (identical drafts) converges on the same existing order, no duplicate", async () => {
  const service = await loadService();
  const a = await seedDraft("dup-a");
  const b = await seedDraft("dup-b");
  await prisma.restorationDraft.updateMany({ where: { id: { in: [a.draftId, b.draftId] } }, data: { ownerUserId: a.ownerUserId } });
  const actor = { userId: a.ownerUserId };
  const input = { items: [{ draftId: a.draftId, tier: "ORIGINAL", product: "DIGITAL" as const }, { draftId: b.draftId, tier: "HD_2X", product: "DIGITAL" as const }] };

  const first = await service.createRestorationCartOrder(input, actor);
  createdOrderIds.push(first.id);
  const second = await service.createRestorationCartOrder(input, actor);
  assert.equal(first.orderNo, second.orderNo);
  assert.equal(await prisma.fixedOrder.count({ where: { id: first.id } }), 1);
  assert.equal(await prisma.fixedOrderItem.count({ where: { fixedOrderId: first.id } }), 2);
});

test("(7) a partial overlap (one draft already ordered, one fresh) is rejected, not guessed", async () => {
  const service = await loadService();
  const already = await seedDraft("partial-already");
  const fresh = await seedDraft("partial-fresh");
  await prisma.restorationDraft.updateMany({ where: { id: { in: [already.draftId, fresh.draftId] } }, data: { ownerUserId: already.ownerUserId } });
  const actor = { userId: already.ownerUserId };
  const solo = await service.createRestorationCartOrder({ items: [{ draftId: already.draftId, tier: "ORIGINAL", product: "DIGITAL" }] }, actor);
  createdOrderIds.push(solo.id);
  await assert.rejects(
    () => service.createRestorationCartOrder({ items: [{ draftId: already.draftId, tier: "ORIGINAL", product: "DIGITAL" }, { draftId: fresh.draftId, tier: "HD_2X", product: "DIGITAL" }] }, actor),
    (error: unknown) => (error as { code?: string }).code === "DRAFT_ALREADY_ORDERED"
  );
});

test("(8) the cart total has no client-writable field: totalAmountMinor is always server-derived", async () => {
  const service = await loadService();
  const a = await seedDraft("tamper");
  const actor = { userId: a.ownerUserId };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forged: any = { items: [{ draftId: a.draftId, tier: "ORIGINAL", product: "DIGITAL", totalAmountMinor: "1", grandTotalMinor: "1" }] };
  const order = await service.createRestorationCartOrder(forged, actor);
  createdOrderIds.push(order.id);
  assert.equal(order.totalAmountMinor, "50000", "forged monetary fields on the item are silently ignored, never trusted");
});

test("(9) zero external network calls were attempted", () => {
  assert.equal(externalCalls, 0);
});

test("(10) teardown", async () => {
  await prisma.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });
  await prisma.$disconnect();
});
