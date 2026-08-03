// R9.2-P2R-CUSTOMER-ORDERS: pure-logic tests for the authenticated,
// read-only customer FixedOrder list (`FixedOrderService.listMyOrders`).
//
// Mirrors the pattern used by admin-commerce-read.test.ts: no live database
// is required -- `prisma.fixedOrder` is monkey-patched with fake
// findMany/count implementations that record every call they receive. This
// proves, without any network or DB dependency:
//   - the mandatory owner filter is always present and always derived from
//     the caller-supplied ownerUserId argument (never anything else)
//   - optional status/market/currency filters combine with, and never
//     override, the owner filter
//   - pagination is clamped to the documented max page size
//   - ordering is deterministic (createdAt desc, id desc tiebreaker)
//   - the response never contains a secret/sensitive field name
//   - the service never calls a write-capable Prisma method
//   - an owner with zero orders gets a truthful empty result, not an error
import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://user:pass@127.0.0.1:5432/test_db_unused";

import { prisma } from "../db/prisma";
import { FixedOrderService, CUSTOMER_ORDERS_MAX_PAGE_SIZE } from "./fixed-order.service";

const FORBIDDEN_KEY_PATTERN = /token|secret|password|authorization|checkoutUrl|hash|key$/i;

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
    orderNo: "FXD-CUST-1",
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
  const forbidden = ["create", "update", "delete", "upsert", "deleteMany", "updateMany", "createMany", "$executeRaw", "$queryRaw"];
  const fake: Record<string, unknown> = {
    findMany: async (args: { where: Record<string, unknown> }) => {
      calls.push({ method: "findMany", args });
      return rows.filter((row) => row.ownerUserId === args.where.ownerUserId);
    },
    count: async (args: { where: Record<string, unknown> }) => {
      calls.push({ method: "count", args });
      return rows.filter((row) => row.ownerUserId === args.where.ownerUserId).length;
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
  const service = new FixedOrderService();
  const result = await service.listMyOrders("user-1", {});
  assertNoForbiddenFields(result);
  assert.equal(result.items[0].orderNo, "FXD-CUST-1");
  assert.equal(result.items[0].paymentAttempt?.status, "PAID");
});

test("owner filter always uses the caller-supplied ownerUserId, never anything else", async () => {
  const calls = installFakePrisma([fakeOrder({ ownerUserId: "user-1" }), fakeOrder({ id: "order-2", orderNo: "FXD-OTHER", ownerUserId: "user-2" })]);
  const service = new FixedOrderService();
  const result = await service.listMyOrders("user-1", {});
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].orderNo, "FXD-CUST-1");
  const findManyCall = calls.find((call) => call.method === "findMany");
  assert.equal((findManyCall!.args as { where: { ownerUserId: string } }).where.ownerUserId, "user-1");
});

test("another owner's orders are excluded (cross-account isolation)", async () => {
  installFakePrisma([fakeOrder({ ownerUserId: "user-2" })]);
  const service = new FixedOrderService();
  const result = await service.listMyOrders("user-1", {});
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
});

test("a user with zero orders gets a truthful empty array, not an error", async () => {
  installFakePrisma([]);
  const service = new FixedOrderService();
  const result = await service.listMyOrders("user-1", {});
  assert.deepEqual(result.items, []);
  assert.equal(result.total, 0);
});

test("page size is capped at the documented maximum", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new FixedOrderService();
  await service.listMyOrders("user-1", { pageSize: 999 });
  const findManyCall = calls.find((call) => call.method === "findMany");
  assert.equal((findManyCall!.args as { take: number }).take, CUSTOMER_ORDERS_MAX_PAGE_SIZE);
});

test("deterministic newest-first ordering with id tiebreaker", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new FixedOrderService();
  await service.listMyOrders("user-1", {});
  const orderBy = (calls.find((call) => call.method === "findMany")!.args as { orderBy: unknown }).orderBy;
  assert.deepEqual(orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
});

test("status/market/currency filters combine with, and never override, the owner filter", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new FixedOrderService();
  await service.listMyOrders("user-1", { status: "locked", market: "pakistan", currency: "pkr" });
  const where = (calls.find((call) => call.method === "findMany")!.args as { where: Record<string, unknown> }).where;
  assert.equal(where.ownerUserId, "user-1");
  assert.equal(where.status, "LOCKED");
  assert.equal(where.market, "PAKISTAN");
  assert.equal(where.currency, "PKR");
});

test("every valid status filter is accepted after case normalization", async () => {
  for (const status of ["CREATED", "PAYMENT_PENDING", "PAYMENT_VERIFIED", "LOCKED", "CANCELLED", "EXPIRED"]) {
    const calls = installFakePrisma([fakeOrder()]);
    await new FixedOrderService().listMyOrders("user-1", { status: status.toLowerCase() });
    const where = (calls.find((call) => call.method === "findMany")!.args as { where: Record<string, unknown> }).where;
    assert.equal(where.status, status);
  }
});

test("every valid market and currency filter is accepted after case normalization", async () => {
  for (const market of ["PAKISTAN", "INTERNATIONAL"]) {
    const calls = installFakePrisma([fakeOrder()]);
    await new FixedOrderService().listMyOrders("user-1", { market: market.toLowerCase() });
    const where = (calls.find((call) => call.method === "findMany")!.args as { where: Record<string, unknown> }).where;
    assert.equal(where.market, market);
  }
  for (const currency of ["PKR", "USD"]) {
    const calls = installFakePrisma([fakeOrder()]);
    await new FixedOrderService().listMyOrders("user-1", { currency: currency[0] + currency.slice(1).toLowerCase() });
    const where = (calls.find((call) => call.method === "findMany")!.args as { where: Record<string, unknown> }).where;
    assert.equal(where.currency, currency);
  }
});

test("invalid or empty filters are rejected before any Prisma call", async () => {
  for (const params of [
    { status: "PAID" },
    { market: "MARS" },
    { currency: "EUR" },
    { status: "" },
    { market: "  " },
    { currency: "\t" }
  ]) {
    const calls = installFakePrisma([fakeOrder()]);
    await assert.rejects(() => new FixedOrderService().listMyOrders("user-1", params), {
      name: "AppError",
      code: "INVALID_FILTER"
    });
    assert.deepEqual(calls, []);
  }
});

test("fixture vs approved pricing represented truthfully per item", async () => {
  installFakePrisma([
    fakeOrder({
      items: [
        {
          id: "item-2",
          kind: "DIGITAL_TIER",
          tierOrSku: "ORIGINAL",
          quantity: 1,
          unitAmountMinor: 0n,
          totalAmountMinor: 0n,
          currency: "PKR",
          pricingSource: "local_fixture",
          pricingApproved: false
        }
      ]
    })
  ]);
  const service = new FixedOrderService();
  const result = await service.listMyOrders("user-1", {});
  assert.equal(result.items[0].items[0].pricingSource, "local_fixture");
  assert.equal(result.items[0].items[0].pricingApproved, false);
});

test("no-attempt state renders as null, not a fabricated status", async () => {
  installFakePrisma([fakeOrder({ paymentAttempt: null })]);
  const service = new FixedOrderService();
  const result = await service.listMyOrders("user-1", {});
  assert.equal(result.items[0].paymentAttempt, null);
});

test("no write-capable Prisma method is ever invoked", async () => {
  const calls = installFakePrisma([fakeOrder()]);
  const service = new FixedOrderService();
  await service.listMyOrders("user-1", {});
  const writeMethods = ["create", "update", "delete", "upsert", "deleteMany", "updateMany", "createMany", "$executeRaw", "$queryRaw"];
  const writeCalls = calls.filter((call) => writeMethods.includes(call.method));
  assert.deepEqual(writeCalls, []);
});
