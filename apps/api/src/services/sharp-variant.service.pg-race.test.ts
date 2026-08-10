import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { SharpVariantService, PrismaSharpVariantStore } from "./sharp-variant.service";

const rawUrl = process.env.DATABASE_URL;
if (!rawUrl || !new URL(rawUrl).hostname.match(/^(127\.0\.0\.1|localhost|::1)$/)) {
  throw new Error("DATABASE_URL must point to the disposable loopback PostgreSQL instance");
}

let externalCalls = 0;
globalThis.fetch = (() => {
  externalCalls++;
  throw new Error("external calls are forbidden in P5B tests");
}) as typeof fetch;

const prisma = new PrismaClient({ datasources: { db: { url: rawUrl } } });
const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

async function seedMaster(status: "VALIDATED" | "NOT_STARTED" = "VALIDATED") {
  const tag = `p5b-race-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const draft = await prisma.restorationDraft.create({ data: { originalStorageKey: `originals/${tag}.jpg`, originalMimeType: "image/jpeg", market: "PAKISTAN", currency: "PKR", status: "ORDER_SELECTION" } });
  createdDraftIds.push(draft.id);
  const order = await prisma.fixedOrder.create({ data: { orderNo: `${tag}-order`, type: "RESTORATION_DIGITAL", market: "PAKISTAN", currency: "PKR", sourceDraftId: draft.id, totalAmountMinor: 100n, status: "LOCKED" } });
  createdOrderIds.push(order.id);
  const attempt = await prisma.paymentAttempt.create({ data: { fixedOrderId: order.id, amountMinor: 100n, currency: "PKR", idempotencyKey: `${tag}-payment`, status: "PAID" } });
  void attempt;
  const item = await prisma.fixedOrderItem.create({ data: { fixedOrderId: order.id, kind: "RESTORATION_DIGITAL_TIER", tierOrSku: "ORIGINAL", unitAmountMinor: 100n, totalAmountMinor: 100n, currency: "PKR", pricingSource: "approved_pricebook", pricingApproved: true, sourceDraftId: draft.id } });
  const entitlement = await prisma.restorationEntitlement.create({ data: { fixedOrderId: order.id, fixedOrderItemId: item.id, draftId: draft.id, status: "GRANTED" } });
  return prisma.restorationMaster.create({ data: { restorationEntitlementId: entitlement.id, status, storageKey: status === "VALIDATED" ? `finals/${tag}.jpg` : null, sha256: status === "VALIDATED" ? "master-sha" : null, width: status === "VALIDATED" ? 256 : null, height: status === "VALIDATED" ? 192 : null, contentType: status === "VALIDATED" ? "image/jpeg" : null } });
}

function buildService(masterBytes: Buffer, options: { uploadFails?: boolean } = {}) {
  const uploaded: string[] = [];
  const service = new SharpVariantService(new PrismaSharpVariantStore(prisma), {
    download: async () => masterBytes,
    upload: async (key) => {
      if (options.uploadFails) throw new Error("storage failure");
      uploaded.push(key);
    },
    delete: async () => {}
  });
  return { service, uploaded };
}

test("P5B concurrent duplicate requests converge on one AVAILABLE ImageVariant", async () => {
  const master = await seedMaster();
  const bytes = await sharp({ create: { width: 256, height: 192, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
  const { service, uploaded } = buildService(bytes);
  const results = await Promise.allSettled([
    service.getOrCreateVariant(master.id, "2hd"),
    service.getOrCreateVariant(master.id, "2hd")
  ]);
  const rows = await prisma.imageVariant.findMany({ where: { restorationMasterId: master.id, variantSpecId: "2hd" } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "AVAILABLE");
  assert.ok(results.some((result) => result.status === "fulfilled"));
  assert.ok(uploaded.length >= 1 && uploaded.length <= 2);
  assert.equal(externalCalls, 0);
});

test("P5B rejects invalid masters and corrupt output before persistence", async () => {
  const invalid = await seedMaster("NOT_STARTED");
  const invalidService = buildService(Buffer.from("not-image")).service;
  await assert.rejects(() => invalidService.getOrCreateVariant(invalid.id, "original"), /validated restoration master/);

  const valid = await seedMaster();
  const before = await prisma.imageVariant.count({ where: { restorationMasterId: valid.id } });
  const corrupt = buildService(Buffer.from("not-image"));
  await assert.rejects(() => corrupt.service.getOrCreateVariant(valid.id, "2hd"), /could not be decoded/);
  assert.equal(await prisma.imageVariant.count({ where: { restorationMasterId: valid.id } }), before);
  assert.equal(corrupt.uploaded.length, 0);
});

test("P5B storage failure cannot create AVAILABLE state", async () => {
  const master = await seedMaster();
  const bytes = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 4, g: 5, b: 6 } } }).jpeg().toBuffer();
  const service = buildService(bytes, { uploadFails: true }).service;
  await assert.rejects(() => service.getOrCreateVariant(master.id, "4hd"), /storage failure/);
  assert.equal(await prisma.imageVariant.count({ where: { restorationMasterId: master.id } }), 0);
});

test.after(async () => {
  await prisma.imageVariant.deleteMany({ where: { restorationMasterId: { in: (await prisma.restorationMaster.findMany({ where: { restorationEntitlement: { fixedOrderId: { in: createdOrderIds } } }, select: { id: true } })).map((row) => row.id) } } });
  await prisma.restorationMaster.deleteMany({ where: { restorationEntitlement: { fixedOrderId: { in: createdOrderIds } } } });
  await prisma.restorationEntitlement.deleteMany({ where: { fixedOrderId: { in: createdOrderIds } } });
  await prisma.paymentAttempt.deleteMany({ where: { fixedOrderId: { in: createdOrderIds } } });
  await prisma.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });
  await prisma.$disconnect();
});
