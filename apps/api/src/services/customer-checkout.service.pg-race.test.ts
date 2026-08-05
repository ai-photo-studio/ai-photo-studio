/**
 * R9.2-PAYMENT-VERIFICATION-BRIDGE
 *
 * Proves CustomerCheckoutService.getStatus -- the newly-wired bridge that
 * calls the existing, already race-tested handleMpgsBrowserReturn /
 * matchRetrievedOrderToAttempt / applyVerifiedPaymentEvidence chain -- end
 * to end against a REAL, disposable, local PostgreSQL instance. This file
 * adds no new verification logic and no new database transaction; it only
 * exercises the new caller (customer-checkout.service.ts) against the
 * unmodified P4C/P4A machinery already proven by
 * p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts and
 * p4a-payment-verified-execution-queue.service.pg-race.test.ts.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/customer-checkout.service.pg-race.test.ts
 *
 * Every row it creates is prefixed `ccb-race-` and is deleted in the final
 * teardown test. Only the DB is real -- the Bank Alfalah gateway itself is
 * always a local fetch stub; no live network call is ever made.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

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

// ---- Zero-live-network-call guard: only our own stub may ever be installed. ----
let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No live network call is permitted from globalThis.fetch in this test file (attempted: ${String(args[0]).slice(0, 60)})`);
};

async function loadModules() {
  const [checkout, gateway, envMod] = await Promise.all([
    import("./customer-checkout.service"),
    import("./p4c-bank-alfalah-mpgs-gateway.service"),
    import("../config/env")
  ]);
  return { ...checkout, ...gateway, ...envMod };
}

const clientA = new PrismaClient({ datasources: { db: { url: RAW_URL } } });

const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

const OWNER_USER_ID = "ccb-race-owner-user";
const MERCHANT_ID = "REDACTEDTESTMERCHANT";
const AMOUNT_MINOR = 250000n; // PKR 2500.00

/** Seeds a FixedOrder + PaymentAttempt in REDIRECT_READY (checkout already
 * initiated, gateway session already created) -- the state getStatus must
 * actually call the gateway from. */
async function seedRedirectReadyOrder(label: string) {
  const tag = `ccb-race-${label}-${randomUUID()}`;
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
      totalAmountMinor: AMOUNT_MINOR,
      status: "PAYMENT_PENDING",
      ownerUserId: OWNER_USER_ID
    }
  });
  createdOrderIds.push(order.id);

  // providerRef intentionally left unset -- matches createCheckout's real
  // (post-fix) behavior. The gate for "checkout was initiated" is
  // status === REDIRECT_READY, not providerRef (see the fix note in
  // customer-checkout.service.ts).
  const attempt = await clientA.paymentAttempt.create({
    data: {
      fixedOrderId: order.id,
      provider: "bank_alfalah",
      amountMinor: AMOUNT_MINOR,
      currency: "PKR",
      idempotencyKey: `${tag}-pay`,
      status: "REDIRECT_READY"
    }
  });

  return { tag, draftId: draft.id, orderId: order.id, orderNo: order.orderNo, attemptId: attempt.id };
}

function mpgsPaidStub(gatewayOrderId: string, amountMinor: bigint, merchantId = MERCHANT_ID) {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        id: gatewayOrderId,
        merchant: merchantId,
        result: "SUCCESS",
        status: "CAPTURED",
        amount: Number(amountMinor) / 100,
        currency: "PKR",
        transaction: [{ transaction: { id: `${gatewayOrderId}-txn` } }]
      })
    }) as Response) as typeof globalThis.fetch;
}

function mpgsPendingStub(gatewayOrderId: string) {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        id: gatewayOrderId,
        merchant: MERCHANT_ID,
        result: undefined,
        status: "PENDING",
        amount: 2500,
        currency: "PKR",
        transaction: []
      })
    }) as Response) as typeof globalThis.fetch;
}

/** Retrieve Order reports a DIFFERENT amount than the stored attempt -- a
 * forged/mismatched gateway response (or a client tampering attempt further
 * upstream) must never be applied. */
function mpgsForgedAmountStub(gatewayOrderId: string) {
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        id: gatewayOrderId,
        merchant: MERCHANT_ID,
        result: "SUCCESS",
        status: "CAPTURED",
        amount: 1.0, // real attempt is PKR 2500.00 -- forged/mismatched
        currency: "PKR",
        transaction: [{ transaction: { id: `${gatewayOrderId}-txn` } }]
      })
    }) as Response) as typeof globalThis.fetch;
}

async function buildService(fetchImpl: typeof globalThis.fetch) {
  const { CustomerCheckoutService, BankAlfalahMpgsGateway, createMockConfig } = await loadModules();
  const config = createMockConfig({
    bankAlfalahMpgs: {
      enabled: true,
      baseUrl: "https://test-bankalfalah.gateway.mastercard.com",
      apiVersion: "100",
      merchantId: MERCHANT_ID,
      apiPassword: "REDACTED",
      operatorId: "",
      returnUrl: "http://127.0.0.1:5173/checkout/return",
      merchantName: "REDACTED Test Merchant",
      checkoutMode: "hosted_checkout"
    }
  });
  const gateway = new BankAlfalahMpgsGateway(config.bankAlfalahMpgs, fetchImpl);
  return new CustomerCheckoutService(config, gateway);
}

test("(q1) success: getStatus verifies a real PAID order exactly once -- PAID, one PaymentEvent, one entitlement, one QUEUED execution", async () => {
  const seeded = await seedRedirectReadyOrder("success");
  const service = await buildService(mpgsPaidStub(seeded.orderNo, AMOUNT_MINOR));

  const result = await service.getStatus(seeded.orderNo, { userId: OWNER_USER_ID });
  assert.equal(result.status, "PAID");

  const attemptRow = await clientA.paymentAttempt.findUnique({ where: { id: seeded.attemptId } });
  assert.equal(attemptRow?.status, "PAID");
  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 1);
  const entitlements = await clientA.restorationEntitlement.findMany({ where: { fixedOrderId: seeded.orderId } });
  assert.equal(entitlements.length, 1);
  const executions = await clientA.replicateExecution.findMany({
    where: { restorationMaster: { restorationEntitlement: { fixedOrderId: seeded.orderId } } }
  });
  assert.equal(executions.length, 1);
  assert.equal(executions[0].status, "QUEUED");
});

test("(q2) pending: getStatus never fabricates PAID and never queues processing when the gateway reports PENDING", async () => {
  const seeded = await seedRedirectReadyOrder("pending");
  const service = await buildService(mpgsPendingStub(seeded.orderNo));

  const result = await service.getStatus(seeded.orderNo, { userId: OWNER_USER_ID });
  assert.equal(result.status, "REDIRECT_READY", "status must remain exactly as stored -- never fabricated PAID");

  const attemptRow = await clientA.paymentAttempt.findUnique({ where: { id: seeded.attemptId } });
  assert.equal(attemptRow?.status, "REDIRECT_READY");
  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 0);
  const entitlements = await clientA.restorationEntitlement.findMany({ where: { fixedOrderId: seeded.orderId } });
  assert.equal(entitlements.length, 0);
});

test("(q3) forged amount: a gateway response reporting a different amount than the stored attempt is rejected and mutates nothing", async () => {
  const seeded = await seedRedirectReadyOrder("forged-amount");
  const service = await buildService(mpgsForgedAmountStub(seeded.orderNo));

  const result = await service.getStatus(seeded.orderNo, { userId: OWNER_USER_ID });
  assert.equal(result.status, "REDIRECT_READY");

  const attemptRow = await clientA.paymentAttempt.findUnique({ where: { id: seeded.attemptId } });
  assert.equal(attemptRow?.status, "REDIRECT_READY");
  assert.equal(attemptRow?.amountMinor, AMOUNT_MINOR, "the stored server-owned amount must never be overwritten");
  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 0);
});

test("(q4) forged merchant/order id: a gateway response for a different order id is rejected and mutates nothing", async () => {
  const seeded = await seedRedirectReadyOrder("forged-order");
  // Stub reports a DIFFERENT gateway order id than what was stored.
  const service = await buildService(mpgsPaidStub(`${seeded.orderNo}-WRONG-ORDER`, AMOUNT_MINOR));

  const result = await service.getStatus(seeded.orderNo, { userId: OWNER_USER_ID });
  assert.equal(result.status, "REDIRECT_READY");
  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 0);
});

test("(q5) ownership: a non-owning actor gets an identical not-found error and triggers zero gateway calls", async () => {
  const seeded = await seedRedirectReadyOrder("ownership");
  const before = externalCallAttempts;
  let networkAttempted = false;
  const service = await buildService((async () => {
    networkAttempted = true;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof globalThis.fetch);

  await assert.rejects(
    () => service.getStatus(seeded.orderNo, { userId: "someone-else-entirely" }),
    (err: unknown) => {
      const appErr = err as { statusCode?: number; code?: string };
      return appErr.statusCode === 404 && appErr.code === "NOT_FOUND";
    }
  );
  assert.equal(networkAttempted, false, "ownership must be checked before any gateway call is ever made");
  assert.equal(externalCallAttempts, before);

  const attemptRow = await clientA.paymentAttempt.findUnique({ where: { id: seeded.attemptId } });
  assert.equal(attemptRow?.status, "REDIRECT_READY", "a rejected wrong-owner request must not mutate the attempt");
});

test("(q6) duplicate/concurrent getStatus calls converge on exactly one paid transition, one entitlement, one execution", async () => {
  const seeded = await seedRedirectReadyOrder("concurrent");
  const serviceA = await buildService(mpgsPaidStub(seeded.orderNo, AMOUNT_MINOR));
  const serviceB = await buildService(mpgsPaidStub(seeded.orderNo, AMOUNT_MINOR));

  const [r1, r2, r3] = await Promise.all([
    serviceA.getStatus(seeded.orderNo, { userId: OWNER_USER_ID }),
    serviceB.getStatus(seeded.orderNo, { userId: OWNER_USER_ID }),
    serviceA.getStatus(seeded.orderNo, { userId: OWNER_USER_ID })
  ]);

  assert.equal(r1.status, "PAID");
  assert.equal(r2.status, "PAID");
  assert.equal(r3.status, "PAID");

  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 1, "real concurrent duplicate returns must converge on exactly one PaymentEvent");
  const entitlements = await clientA.restorationEntitlement.findMany({ where: { fixedOrderId: seeded.orderId } });
  assert.equal(entitlements.length, 1);
  const executions = await clientA.replicateExecution.findMany({
    where: { restorationMaster: { restorationEntitlement: { fixedOrderId: seeded.orderId } } }
  });
  assert.equal(executions.length, 1);
});

test("(q7) refresh/query fabrication: getStatus accepts only orderNo + actor -- no query-string or body field can influence the result", async () => {
  const seeded = await seedRedirectReadyOrder("refresh-fabrication");
  const service = await buildService(mpgsPendingStub(seeded.orderNo));

  // getStatus's real signature is (orderNo: string, actor: RequestActor) --
  // there is no channel for a caller to pass a forged "status=success" or
  // "paid=true" style value; TypeScript itself forecloses it. This proves
  // that at the value level too: passing extra (structurally irrelevant)
  // properties on the actor object cannot change the outcome.
  const forgedActor = { userId: OWNER_USER_ID, status: "PAID", paid: true, forced: true } as unknown as {
    userId?: string;
  };
  const result = await service.getStatus(seeded.orderNo, forgedActor);
  assert.equal(result.status, "REDIRECT_READY", "extraneous caller-supplied fields must never influence the result");
});

test("(q8) zero external calls when no gateway session exists yet (no providerRef)", async () => {
  const tag = `ccb-race-no-session-${randomUUID()}`;
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
      totalAmountMinor: AMOUNT_MINOR,
      status: "PAYMENT_PENDING",
      ownerUserId: OWNER_USER_ID
    }
  });
  createdOrderIds.push(order.id);
  const attempt = await clientA.paymentAttempt.create({
    data: {
      fixedOrderId: order.id,
      provider: "bank_alfalah",
      amountMinor: AMOUNT_MINOR,
      currency: "PKR",
      idempotencyKey: `${tag}-pay`,
      status: "CREATED"
      // providerRef intentionally left unset -- checkout was never initiated.
    }
  });

  let networkAttempted = false;
  const service = await buildService((async () => {
    networkAttempted = true;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof globalThis.fetch);

  const result = await service.getStatus(order.orderNo, { userId: OWNER_USER_ID });
  assert.equal(result.status, "CREATED");
  assert.equal(networkAttempted, false, "no providerRef means nothing to verify yet -- must not call the gateway");
  void attempt;
});

test("(q9) zero external calls once already PAID", async () => {
  const seeded = await seedRedirectReadyOrder("already-paid");
  await clientA.paymentAttempt.update({ where: { id: seeded.attemptId }, data: { status: "PAID" } });

  let networkAttempted = false;
  const service = await buildService((async () => {
    networkAttempted = true;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof globalThis.fetch);

  const result = await service.getStatus(seeded.orderNo, { userId: OWNER_USER_ID });
  assert.equal(result.status, "PAID");
  assert.equal(networkAttempted, false, "an already-PAID attempt must never re-contact the gateway");
});

test("(q10) zero live network calls were made in this test file", () => {
  assert.equal(externalCallAttempts, 0);
});

test("(q11) teardown: delete every ccb-race- row created by this file", async () => {
  await clientA.replicateExecution.deleteMany({
    where: { restorationMaster: { restorationEntitlement: { fixedOrderId: { in: createdOrderIds } } } }
  });
  await clientA.restorationMaster.deleteMany({
    where: { restorationEntitlement: { fixedOrderId: { in: createdOrderIds } } }
  });
  await clientA.restorationEntitlement.deleteMany({ where: { fixedOrderId: { in: createdOrderIds } } });
  await clientA.paymentEvent.deleteMany({ where: { paymentAttempt: { fixedOrderId: { in: createdOrderIds } } } });
  await clientA.paymentAttempt.deleteMany({ where: { fixedOrderId: { in: createdOrderIds } } });
  await clientA.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await clientA.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });

  const remaining = await clientA.fixedOrder.findMany({ where: { id: { in: createdOrderIds } } });
  assert.equal(remaining.length, 0);

  await clientA.$disconnect();
});
