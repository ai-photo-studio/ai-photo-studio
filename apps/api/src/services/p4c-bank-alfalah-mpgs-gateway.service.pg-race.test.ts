/**
 * R9.2-P4C-MPGS-VERIFY-REAL-POSTGRES-RACE
 *
 * Proves the MPGS verify-then-apply orchestrator
 * (verifyMpgsPaymentByRetrieveOrder / handleMpgsBrowserReturn /
 * handleMpgsWebhookTrigger in p4c-bank-alfalah-mpgs-gateway.service.ts)
 * against a REAL, disposable, local PostgreSQL instance -- same fail-closed
 * loopback-only guard as p4a-payment-verified-execution-queue.service.pg-race.test.ts.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/p4c-bank-alfalah-mpgs-gateway.service.pg-race.test.ts
 *
 * Every row it creates is prefixed `p4c-race-` and is deleted in the final teardown test.
 * Only the DB is real -- the Bank Alfalah gateway itself is always a local fetch stub;
 * no live network call is ever made.
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
  const gateway = await import("./p4c-bank-alfalah-mpgs-gateway.service");
  return gateway;
}

const clientA = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const clientB = new PrismaClient({ datasources: { db: { url: RAW_URL } } });

const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

async function seedUnpaidOrder(label: string) {
  const tag = `p4c-race-${label}-${randomUUID()}`;
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
      provider: "bank_alfalah_mpgs",
      amountMinor: 150000n,
      currency: "PKR",
      idempotencyKey: `${tag}-pay`,
      status: "CUSTOMER_RETURNED"
    }
  });

  return { tag, draftId: draft.id, orderId: order.id, attemptId: attempt.id };
}

const MERCHANT_ID = "REDACTEDTESTMERCHANT";

function mpgsFetchStub(paidGatewayOrderId: string, amountMinor: bigint) {
  return (async (url: unknown) => {
    const str = String(url);
    if (!str.includes(`/merchant/${MERCHANT_ID}/order/`)) {
      throw new Error(`unexpected MPGS URL shape: ${str}`);
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: paidGatewayOrderId,
        merchant: MERCHANT_ID,
        result: "SUCCESS",
        status: "CAPTURED",
        amount: Number(amountMinor) / 100,
        currency: "PKR",
        transaction: [{ transaction: { id: `${paidGatewayOrderId}-txn` } }]
      })
    } as Response;
  }) as typeof globalThis.fetch;
}

test("verifyMpgsPaymentByRetrieveOrder applies a matched PAID order exactly once", async () => {
  const { BankAlfalahMpgsGateway, verifyMpgsPaymentByRetrieveOrder } = await loadModules();
  const seeded = await seedUnpaidOrder("single");
  const stub = mpgsFetchStub(seeded.tag, 150000n);
  const gw = new BankAlfalahMpgsGateway(
    { enabled: true, baseUrl: "https://test-bankalfalah.gateway.mastercard.com", apiVersion: "74", merchantId: MERCHANT_ID, apiPassword: "REDACTED", merchantName: "REDACTED Test Merchant", checkoutMode: "hosted_checkout" },
    stub
  );

  const { outcome, applied } = await verifyMpgsPaymentByRetrieveOrder(gw, MERCHANT_ID, {
    fixedOrderId: seeded.orderId,
    paymentAttemptId: seeded.attemptId,
    gatewayOrderId: seeded.tag,
    amountMinor: 150000n,
    currency: "PKR",
    provider: "bank_alfalah_mpgs"
  });

  assert.equal(outcome.matched, true);
  assert.equal(applied?.outcome, "APPLIED");

  const attemptRow = await clientA.paymentAttempt.findUnique({ where: { id: seeded.attemptId } });
  assert.equal(attemptRow?.status, "PAID");

  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 1);
});

test("duplicate sequential webhook-trigger verification converges to exactly one PaymentEvent (idempotent)", async () => {
  const { BankAlfalahMpgsGateway, handleMpgsWebhookTrigger } = await loadModules();
  const seeded = await seedUnpaidOrder("dup-seq");
  const stub = mpgsFetchStub(seeded.tag, 150000n);
  const gw = new BankAlfalahMpgsGateway(
    { enabled: true, baseUrl: "https://test-bankalfalah.gateway.mastercard.com", apiVersion: "74", merchantId: MERCHANT_ID, apiPassword: "REDACTED", merchantName: "REDACTED Test Merchant", checkoutMode: "hosted_checkout" },
    stub
  );

  const attemptDescriptor = {
    fixedOrderId: seeded.orderId,
    paymentAttemptId: seeded.attemptId,
    gatewayOrderId: seeded.tag,
    amountMinor: 150000n,
    currency: "PKR" as const,
    provider: "bank_alfalah_mpgs"
  };

  const first = await handleMpgsWebhookTrigger(gw, MERCHANT_ID, attemptDescriptor);
  const second = await handleMpgsWebhookTrigger(gw, MERCHANT_ID, attemptDescriptor);
  const third = await handleMpgsWebhookTrigger(gw, MERCHANT_ID, attemptDescriptor);

  assert.equal(first.applied?.outcome, "APPLIED");
  assert.equal(second.applied?.outcome, "APPLIED");
  assert.equal(third.applied?.outcome, "APPLIED");
  assert.equal(first.applied?.applied?.paymentEventId, second.applied?.applied?.paymentEventId);
  assert.equal(second.applied?.applied?.paymentEventId, third.applied?.applied?.paymentEventId);
  assert.equal(first.applied?.applied?.replicateExecutionId, third.applied?.applied?.replicateExecutionId);

  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 1);
  const executions = await clientA.replicateExecution.findMany({
    where: { restorationMaster: { restorationEntitlement: { fixedOrderId: seeded.orderId } } }
  });
  assert.equal(executions.length, 1);
  assert.equal(executions[0].status, "QUEUED");
});

test("concurrent browser-return + webhook-trigger verification racing on one order produce exactly one paid transition", async () => {
  const { BankAlfalahMpgsGateway, handleMpgsBrowserReturn, handleMpgsWebhookTrigger } = await loadModules();
  const seeded = await seedUnpaidOrder("dup-concurrent");
  const stub = mpgsFetchStub(seeded.tag, 150000n);
  const gwA = new BankAlfalahMpgsGateway(
    { enabled: true, baseUrl: "https://test-bankalfalah.gateway.mastercard.com", apiVersion: "74", merchantId: MERCHANT_ID, apiPassword: "REDACTED", merchantName: "REDACTED Test Merchant", checkoutMode: "hosted_checkout" },
    stub
  );
  const gwB = new BankAlfalahMpgsGateway(
    { enabled: true, baseUrl: "https://test-bankalfalah.gateway.mastercard.com", apiVersion: "74", merchantId: MERCHANT_ID, apiPassword: "REDACTED", merchantName: "REDACTED Test Merchant", checkoutMode: "hosted_checkout" },
    stub
  );

  const attemptDescriptor = {
    fixedOrderId: seeded.orderId,
    paymentAttemptId: seeded.attemptId,
    gatewayOrderId: seeded.tag,
    amountMinor: 150000n,
    currency: "PKR" as const,
    provider: "bank_alfalah_mpgs"
  };

  const [r1, r2] = await Promise.all([
    handleMpgsBrowserReturn(gwA, MERCHANT_ID, attemptDescriptor),
    handleMpgsWebhookTrigger(gwB, MERCHANT_ID, attemptDescriptor)
  ]);

  assert.equal(r1.applied?.outcome, "APPLIED");
  assert.equal(r2.applied?.outcome, "APPLIED");
  assert.equal(r1.applied?.applied?.paymentEventId, r2.applied?.applied?.paymentEventId);
  assert.equal(r1.applied?.applied?.replicateExecutionId, r2.applied?.applied?.replicateExecutionId);

  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 1, "exactly one PaymentEvent must exist after a real race");
  const entitlements = await clientA.restorationEntitlement.findMany({ where: { fixedOrderId: seeded.orderId } });
  assert.equal(entitlements.length, 1, "exactly one entitlement must exist after a real race");
});

test("a forged browser return with a PENDING gateway order is never applied and mutates nothing", async () => {
  const { BankAlfalahMpgsGateway, handleMpgsBrowserReturn } = await loadModules();
  const seeded = await seedUnpaidOrder("forged");
  const pendingStub = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        id: seeded.tag,
        merchant: MERCHANT_ID,
        result: undefined,
        status: "PENDING",
        amount: 1500,
        currency: "PKR",
        transaction: []
      })
    }) as Response) as typeof globalThis.fetch;

  const gw = new BankAlfalahMpgsGateway(
    { enabled: true, baseUrl: "https://test-bankalfalah.gateway.mastercard.com", apiVersion: "74", merchantId: MERCHANT_ID, apiPassword: "REDACTED", merchantName: "REDACTED Test Merchant", checkoutMode: "hosted_checkout" },
    pendingStub
  );

  const { outcome, applied } = await handleMpgsBrowserReturn(gw, MERCHANT_ID, {
    fixedOrderId: seeded.orderId,
    paymentAttemptId: seeded.attemptId,
    gatewayOrderId: seeded.tag,
    amountMinor: 150000n,
    currency: "PKR",
    provider: "bank_alfalah_mpgs"
  });

  assert.equal(outcome.matched, false);
  assert.equal(applied, undefined);

  const attemptRow = await clientA.paymentAttempt.findUnique({ where: { id: seeded.attemptId } });
  assert.equal(attemptRow?.status, "CUSTOMER_RETURNED");
  const events = await clientA.paymentEvent.findMany({ where: { paymentAttemptId: seeded.attemptId } });
  assert.equal(events.length, 0);
});

test("zero live network calls were made in this test file", () => {
  assert.equal(externalCallAttempts, 0);
});

test("teardown: delete every p4c-race- row created by this file", async () => {
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
  await clientB.$disconnect();
});
