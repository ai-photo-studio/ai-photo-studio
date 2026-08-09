import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const rawUrl = process.env.DISPOSABLE_DATABASE_URL;
if (!rawUrl) throw new Error("DISPOSABLE_DATABASE_URL is required");
const parsed = new URL(rawUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) throw new Error("print fulfilment pg-race requires loopback PostgreSQL");
process.env.DATABASE_URL = rawUrl;

const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
const run = `print-race-${randomUUID()}`;
const actor = { userId: `${run}-owner` };
let orderId = "";
let itemId = "";
let draftId = "";

after(async () => {
  if (orderId) await prisma.fixedOrder.delete({ where: { id: orderId } }).catch(() => undefined);
  if (draftId) await prisma.restorationDraft.delete({ where: { id: draftId } }).catch(() => undefined);
  await prisma.$disconnect();
});

test("print fulfilment requires PAID and VALIDATED, then concurrent prepare converges once", async () => {
  const draft = await prisma.restorationDraft.create({ data: { ownerUserId: actor.userId, market: "PAKISTAN", country: "PK", currency: "PKR", originalStorageKey: `${run}/original.jpg` } });
  draftId = draft.id;
  const order = await prisma.fixedOrder.create({
    data: {
      orderNo: run,
      type: "RESTORATION_WITH_PRINT",
      market: "PAKISTAN",
      currency: "PKR",
      ownerUserId: actor.userId,
      sourceDraftId: draft.id,
      totalAmountMinor: 275000n,
      priceBookVersion: "PB-2026-08-09-TRIAL-V3",
      items: { create: { kind: "RESTORATION_DIGITAL_TIER", tierOrSku: "HD_4X", unitAmountMinor: 150000n, totalAmountMinor: 275000n, currency: "PKR", pricingSource: "approved_pricebook", pricingApproved: true, metadata: { print: { size: "4x6", quantity: 10, unitAmountMinor: 10000, subtotalMinor: 100000, deliveryAmountMinor: 25000, catalogVersion: "PRINT-CATALOG-2026-08-09-TRIAL-V2" } } } },
      deliveryAddress: { create: { recipientName: "Race Test", phone: "03001234567", addressLine1: "1 Test Street", city: "Lahore", countryCode: "PK" } },
      paymentAttempt: { create: { provider: "commerce-e2e-test", status: "CREATED", amountMinor: 275000n, currency: "PKR", idempotencyKey: `${run}-payment` } },
      restorationEntitlement: { create: { draftId: draft.id, status: "GRANTED", restorationMaster: { create: { status: "NOT_STARTED" } } } }
    },
    include: { items: true, restorationEntitlement: { include: { restorationMaster: true } } }
  });
  orderId = order.id;
  itemId = order.items[0].id;
  const { PrintFulfilmentBoundaryService } = await import("./print-fulfilment-boundary.service");
  const service = new PrintFulfilmentBoundaryService();
  await assert.rejects(() => service.prepare(order.orderNo, actor), (error: unknown) => (error as { code?: string }).code === "PAYMENT_REQUIRED");
  await prisma.paymentAttempt.update({ where: { fixedOrderId: order.id }, data: { status: "PAID" } });
  await assert.rejects(() => service.prepare(order.orderNo, actor), (error: unknown) => (error as { code?: string }).code === "RESTORATION_NOT_READY");
  await prisma.restorationMaster.update({ where: { restorationEntitlementId: order.restorationEntitlement!.id }, data: { status: "VALIDATED", storageKey: `${run}/final.jpg`, validatedAt: new Date() } });

  const [first, second] = await Promise.all([service.prepare(order.orderNo, actor), service.prepare(order.orderNo, actor)]);
  assert.equal(first.printEntitlementId, second.printEntitlementId);
  assert.equal(first.fulfilmentOrderId, second.fulfilmentOrderId);
  assert.equal(first.status, "PENDING");
  assert.equal(first.blocker, "PRINT_PARTNER_ASSIGNMENT_REQUIRED");
  assert.equal(await prisma.printEntitlement.count({ where: { fixedOrderItemId: itemId } }), 1);
  assert.equal(await prisma.fulfilmentOrder.count({ where: { printEntitlement: { fixedOrderItemId: itemId } } }), 1);
  assert.equal(await prisma.shipment.count(), 0);
});
