// R9.2-P2R-ADMIN: pure-logic tests for the read-only admin commerce boundary.
//
// No live database is required -- `prisma.fixedOrder` is monkey-patched with
// fake findMany/count/findUnique implementations that record every call they
// receive. This lets the tests prove, without any network or DB dependency:
//   - pagination is clamped to the documented max page size
//   - filters build the expected `where` clause
//   - list/detail responses never contain a secret/sensitive field name
//   - an unknown orderNo yields a safe 404 (no stack trace, no extra detail)
//   - the service never calls a write-capable Prisma method (create/update/
//     delete/upsert/deleteMany/updateMany) for any of its read methods
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://user:pass@127.0.0.1:5432/test_db_unused";

import { prisma } from "../db/prisma";
import { AppError } from "../utils/errors";
import { AdminCommerceService, ADMIN_COMMERCE_MAX_PAGE_SIZE } from "./admin-commerce.service";

const FORBIDDEN_KEY_PATTERN = /token|secret|password|authorization|key$/i;

function assertNoForbiddenFields(value: unknown, path = "$") {
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    assert.ok(!FORBIDDEN_KEY_PATTERN.test(key), `forbidden-looking field "${key}" found at ${path}.${key}`);
    assertNoForbiddenFields(child, `${path}.${key}`);
  }
}

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNo: "FXD-TEST-1",
    type: "RESTORATION_DIGITAL",
    market: "PAKISTAN",
    currency: "PKR",
    ownerUserId: "user-1",
    guestOwnershipTokenHash: "should-never-be-returned",
    totalAmountMinor: 35000n,
    status: "LOCKED",
    priceBookVersion: "PB-1",
    priceBookApprovalReference: "APPROVAL-1",
    priceBookEffectiveAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    items: [
      {
        id: "item-1",
        kind: "DIGITAL_TIER",
        tierOrSku: "HD_2X",
        quantity: 1,
        unitAmountMinor: 35000n,
        totalAmountMinor: 35000n,
        currency: "PKR",
        pricingSource: "approved_pricebook",
        pricingApproved: true
      }
    ],
    paymentAttempt: {
      id: "attempt-1",
      status: "PAID",
      provider: "bank_alfalah",
      providerRef: "ref-123"
    },
    ...overrides
  };
}

function installFakePrisma(rows: ReturnType<typeof fakeOrder>[]) {
  const calls: { method: string; args: unknown }[] = [];
  const forbidden = ["create", "update", "delete", "upsert", "deleteMany", "updateMany", "createMany"];
  const fake: Record<string, unknown> = {
    findMany: async (args: unknown) => {
      calls.push({ method: "findMany", args });
      return rows;
    },
    count: async (args: unknown) => {
      calls.push({ method: "count", args });
      return rows.length;
    },
    findUnique: async (args: { where: { orderNo: string } }) => {
      calls.push({ method: "findUnique", args });
      return rows.find((row) => row.orderNo === args.where.orderNo) ?? null;
    }
  };
  for (const method of forbidden) {
    fake[method] = async (...args: unknown[]) => {
      calls.push({ method, args });
      throw new Error(`unexpected write-capable Prisma call: fixedOrder.${method}`);
    };
  }
  (prisma as unknown as { fixedOrder: unknown }).fixedOrder = fake;
  return calls;
}

test("list response contains no secret/sensitive field names", async () => {
  installFakePrisma([fakeOrder()]);
  const service = new AdminCommerceService();
  const result = await service.listOrders({});
  assertNoForbiddenFields(result);
  assert.equal(result.items[0].orderNo, "FXD-TEST-1");
  assert.equal(result.items[0].paymentStatus, "PAID");
});

test("detail response contains no secret/sensitive field names", async () => {
  installFakePrisma([fakeOrder()]);
  const service = new AdminCommerceService();
  const detail = await service.getOrderDetail("FXD-TEST-1");
  assertNoForbiddenFields(detail);
  assert.equal(detail.priceBookVersion, "PB-1");
  assert.equal(detail.items[0].pricingApproved, true);
  assert.equal(detail.paymentAttempt?.status, "PAID");
});

test("page size is capped at the documented maximum", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new AdminCommerceService();
  await service.listOrders({ pageSize: 999 });
  const findManyCall = calls.find((call) => call.method === "findMany");
  assert.equal((findManyCall!.args as { take: number }).take, ADMIN_COMMERCE_MAX_PAGE_SIZE);
});

test("negative/zero page and pageSize fall back to safe defaults", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new AdminCommerceService();
  await service.listOrders({ page: -5, pageSize: 0 });
  const findManyCall = calls.find((call) => call.method === "findMany");
  assert.equal((findManyCall!.args as { skip: number }).skip, 0);
  assert.equal((findManyCall!.args as { take: number }).take, 20);
});

test("each filter builds the expected where clause", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new AdminCommerceService();
  await service.listOrders({
    orderNo: "abc",
    status: "locked",
    market: "pakistan",
    currency: "pkr",
    paymentStatus: "paid"
  });
  const where = (calls.find((call) => call.method === "findMany")!.args as { where: Record<string, unknown> }).where;
  assert.deepEqual(where.orderNo, { contains: "abc", mode: "insensitive" });
  assert.equal(where.status, "LOCKED");
  assert.equal(where.market, "PAKISTAN");
  assert.equal(where.currency, "PKR");
  assert.deepEqual(where.paymentAttempt, { status: "PAID" });
});

test("deterministic newest-first ordering with id tiebreaker", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new AdminCommerceService();
  await service.listOrders({});
  const orderBy = (calls.find((call) => call.method === "findMany")!.args as { orderBy: unknown }).orderBy;
  assert.deepEqual(orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("unknown orderNo returns a safe 404 with no leaking detail", async () => {
  installFakePrisma([]);
  const service = new AdminCommerceService();
  await assert.rejects(
    () => service.getOrderDetail("FXD-DOES-NOT-EXIST"),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, "ORDER_NOT_FOUND");
      assert.equal(error.message, "Order not found");
      return true;
    }
  );
});

test("no write-capable Prisma method is ever invoked by list or detail reads", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new AdminCommerceService();
  await service.listOrders({});
  await service.getOrderDetail("FXD-TEST-1");
  const writeMethods = ["create", "update", "delete", "upsert", "deleteMany", "updateMany", "createMany"];
  const writeCalls = calls.filter((call) => writeMethods.includes(call.method));
  assert.deepEqual(writeCalls, []);
});

test("fixture/unapproved pricing surfaces as payment-blocked, not ready", async () => {
  installFakePrisma([
    fakeOrder({
      items: [
        {
          id: "item-2",
          kind: "DIGITAL_TIER",
          tierOrSku: "HD_2X",
          quantity: 1,
          unitAmountMinor: 35000n,
          totalAmountMinor: 35000n,
          currency: "PKR",
          pricingSource: "local_fixture",
          pricingApproved: false
        }
      ],
      paymentAttempt: null
    })
  ]);
  const service = new AdminCommerceService();
  const detail = await service.getOrderDetail("FXD-TEST-1");
  assert.equal(detail.paymentReadiness.ready, false);
  assert.ok(detail.paymentReadiness.reasons.some((reason) => reason.includes("not owner-approved")));
  assert.ok(detail.paymentReadiness.reasons.some((reason) => reason.includes("provider unavailable")));
  assert.equal(detail.paymentAttempt, null);
});
