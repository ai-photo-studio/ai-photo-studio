/**
 * R9.2-P1B: disposable-database integration test for the payment-readiness
 * -> idempotent PaymentAttempt lifecycle flow.
 *
 * Like `p1a-fixed-order-flow.test.ts`, this requires an explicit,
 * already-migrated, local-only DATABASE_URL supplied via
 * `DISPOSABLE_DATABASE_URL` -- it refuses to run against anything else, and
 * performs no provider/network call besides that one local database (the
 * "ready" scenarios use the in-process MockPaymentProvider, which makes no
 * real network request of its own).
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx src/services/p1b-payment-attempt-flow.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { CreateCheckoutSessionInput, CheckoutSessionResult } from "../domain/payment/paymentProvider";

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
const BLOCKED_PATTERNS = [/neon\.tech/i, /supabase/i, /amazonaws/i, /northflank/i, /render\.com/i, /railway\.app/i, /googleapis/i];
if (BLOCKED_PATTERNS.some((p) => p.test(RAW_URL))) {
  fail("refusing a URL matching a known managed/production database provider pattern.");
}

process.env.DATABASE_URL = RAW_URL;
process.env.REDIS_URL ||= "redis://replace_me";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test-verify-token";
process.env.PAYMENT_GATEWAY_NAME ||= "manual";
process.env.ADMIN_JWT_SECRET ||= "test-admin-secret";
process.env.JWT_SECRET ||= "test-jwt-secret";
process.env.STORAGE_PROVIDER = "mock";

const results: { name: string; ok: boolean; detail?: string }[] = [];
async function record(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, detail });
    console.log(`  FAIL  ${name} -- ${detail}`);
  }
}

async function main() {
  // Static proof: the controller never reads client-supplied amount,
  // currency, or provider fields off the request body for any payment route.
  await record("0. controller never reads client amount/currency/provider from req.body", async () => {
    const source = readFileSync(join(__dirname, "..", "controllers", "payment-attempt.controller.ts"), "utf8");
    const codeOnly = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const forbidden = /req\.body\s*(\??\.|\[)\s*['"]?\s*(amount|currency|provider)\b/i;
    if (forbidden.test(codeOnly)) {
      throw new Error("payment-attempt.controller.ts reads a client-supplied amount/currency/provider field");
    }
  });

  const { loadConfig } = await import("../config/env");
  const config = loadConfig();

  const { prisma } = await import("../db/prisma");
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { FixedOrderService } = await import("./fixed-order.service");
  const { PaymentAttemptService } = await import("./payment-attempt.service");
  const { BankAlfalahAdapter } = await import("../domain/payment/bankAlfalahAdapter");
  const { MockPaymentProvider } = await import("../domain/payment/mockPaymentProvider");
  const { FixtureOfferProvider } = await import("../domain/pricing/offerProvider");
  const { Prisma } = await import("@prisma/client");

  const draftService = new RestorationDraftService(config);
  // R9.2-P1C-B: FixedOrderService's default provider is now the real
  // owner-approved PriceBook. This test suite specifically exercises the
  // payment-attempt boundary against KNOWN-unapproved local_fixture pricing
  // (then manually promotes to "approved" via approvePricing() below for the
  // ready-path tests) -- explicitly pinning FixtureOfferProvider here keeps
  // that original intent intact regardless of what the real PriceBook says.
  const orderService = new FixedOrderService(new FixtureOfferProvider());

  // A provider wrapper that counts external-call attempts so blocked-path
  // tests can prove zero external calls, not just infer it.
  class CountingProvider extends BankAlfalahAdapter {
    public checkoutCallCount = 0;
    async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
      this.checkoutCallCount += 1;
      return super.createCheckoutSession(input);
    }
  }

  const validPng = await sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 9, g: 9, b: 9 } } })
    .png()
    .toBuffer();
  const validPngBase64 = validPng.toString("base64");

  const createdDraftIds: string[] = [];
  const createdOrderIds: string[] = [];

  async function createPkOrder(): Promise<{ orderNo: string; orderId: string; guestToken: string }> {
    const { draft, guestOwnershipToken } = await draftService.createDraft({
      country: "PK",
      marketConfirmed: true,
      fileName: "family-photo.png",
      contentType: "image/png",
      bodyBase64: validPngBase64
    });
    createdDraftIds.push(draft.id);
    const order = await orderService.createRestorationDigitalOrder({
      draftId: draft.id,
      tier: "ORIGINAL",
      actor: { guestToken: guestOwnershipToken! }
    });
    createdOrderIds.push(order.id);
    return { orderNo: order.orderNo, orderId: order.id, guestToken: guestOwnershipToken! };
  }

  async function approvePricing(orderId: string): Promise<void> {
    // No production service can ever set this -- simulates a hypothetical
    // owner-approved price book so the "ready" path can be exercised
    // deterministically without inventing a real one. Sets a complete
    // snapshot (item flag + order-level PriceBook version/approval
    // reference) -- R9.2-P1C-B's payment-readiness guard rejects an
    // approved item whose order is missing either half of the snapshot.
    await prisma.fixedOrderItem.updateMany({
      where: { fixedOrderId: orderId },
      data: { pricingSource: "approved_live", pricingApproved: true }
    });
    await prisma.fixedOrder.update({
      where: { id: orderId },
      data: { priceBookVersion: "PB-TEST-approved-v1", priceBookApprovalReference: "TEST-SIMULATED-APPROVAL" }
    });
  }

  try {
    // 1. local_fixture order cannot start payment.
    let pk1: Awaited<ReturnType<typeof createPkOrder>>;
    await record("1. local_fixture order cannot start payment", async () => {
      pk1 = await createPkOrder();
      const service = new PaymentAttemptService(new CountingProvider());
      let code: string | undefined;
      try {
        await service.createAttempt(pk1.orderNo, { guestToken: pk1.guestToken });
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      if (code !== "PAYMENT_NOT_READY") throw new Error(`expected PAYMENT_NOT_READY, got ${code}`);
    });

    // 2. unapproved/USD-unavailable order cannot start payment. INTERNATIONAL
    // orders cannot even be created via the service (pricing unavailable at
    // the P1A layer), so this proves the same truthful blocking at the
    // payment layer directly against a raw INTERNATIONAL/USD order row.
    let intlOrderId = "";
    let intlOrderNo = "";
    await record("2. unapproved/USD-unavailable order cannot start payment", async () => {
      const order = await prisma.fixedOrder.create({
        data: {
          orderNo: `FXD-TEST-INTL-${Date.now()}`,
          type: "RESTORATION_DIGITAL",
          market: "INTERNATIONAL",
          currency: "USD",
          ownerUserId: "test-user-intl",
          totalAmountMinor: 500n,
          items: {
            create: {
              kind: "DIGITAL_TIER",
              tierOrSku: "ORIGINAL",
              unitAmountMinor: 500n,
              totalAmountMinor: 500n,
              currency: "USD",
              pricingSource: "local_fixture",
              pricingApproved: false
            }
          }
        }
      });
      intlOrderId = order.id;
      intlOrderNo = order.orderNo;
      createdOrderIds.push(order.id);

      const service = new PaymentAttemptService(new CountingProvider());
      const readiness = await service.getReadiness(intlOrderNo, { userId: "test-user-intl" });
      if (readiness.ready) throw new Error("expected an unapproved USD order to be not-ready");
    });

    // 3/4. Blocked readiness creates zero PaymentAttempt rows and makes zero
    // external calls.
    await record("3-4. blocked readiness creates zero rows and makes zero external calls", async () => {
      const counting = new CountingProvider();
      const service = new PaymentAttemptService(counting);
      let threw = false;
      try {
        await service.createAttempt(pk1.orderNo, { guestToken: pk1.guestToken });
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("expected createAttempt to throw for a blocked order");
      if (counting.checkoutCallCount !== 0) throw new Error(`expected 0 external calls, got ${counting.checkoutCallCount}`);
      const count = await prisma.paymentAttempt.count({ where: { fixedOrderId: pk1.orderId } });
      if (count !== 0) throw new Error(`expected 0 PaymentAttempt rows, found ${count}`);
      const intlCount = await prisma.paymentAttempt.count({ where: { fixedOrderId: intlOrderId } });
      if (intlCount !== 0) throw new Error(`expected 0 PaymentAttempt rows for the INTL order, found ${intlCount}`);
    });

    // 5. Wrong owner receives uniform not-found behavior.
    await record("5. wrong owner receives uniform not-found behavior", async () => {
      const service = new PaymentAttemptService(new CountingProvider());
      let codeWrongOwner: string | undefined;
      try {
        await service.getReadiness(pk1.orderNo, { guestToken: "definitely-the-wrong-token" });
      } catch (err) {
        codeWrongOwner = (err as { code?: string }).code;
      }
      let codeNonexistent: string | undefined;
      try {
        await service.getReadiness("FXD-DOES-NOT-EXIST", { guestToken: pk1.guestToken });
      } catch (err) {
        codeNonexistent = (err as { code?: string }).code;
      }
      if (codeWrongOwner !== "NOT_FOUND" || codeNonexistent !== "NOT_FOUND") {
        throw new Error(`expected identical NOT_FOUND for both, got ${codeWrongOwner} / ${codeNonexistent}`);
      }
    });

    // 6. Client amount/currency/provider cannot override the order (the
    // service signature accepts none of these; verified structurally by
    // check #0 above, and here confirmed the persisted row matches the
    // server-known order total exactly).
    let pk2: Awaited<ReturnType<typeof createPkOrder>>;
    let readyAttemptId = "";
    await record("6-7. mock approved pricing plus ready adapter creates one attempt matching server amount", async () => {
      pk2 = await createPkOrder();
      await approvePricing(pk2.orderId);
      const service = new PaymentAttemptService(new MockPaymentProvider({ ready: true }));
      const attempt = await service.createAttempt(pk2.orderNo, { guestToken: pk2.guestToken });
      readyAttemptId = attempt.id;
      if (attempt.amountMinor !== "25000") throw new Error(`expected amountMinor 25000 from the order, got ${attempt.amountMinor}`);
      if (attempt.currency !== "PKR") throw new Error(`expected PKR, got ${attempt.currency}`);
      if (attempt.status !== "REDIRECT_READY") throw new Error(`expected REDIRECT_READY, got ${attempt.status}`);
      if (!attempt.checkoutUrl || !attempt.checkoutUrl.startsWith("http://localhost/mock-checkout/")) {
        throw new Error(`expected a local mock checkout URL, got ${attempt.checkoutUrl}`);
      }
      const count = await prisma.paymentAttempt.count({ where: { fixedOrderId: pk2.orderId } });
      if (count !== 1) throw new Error(`expected exactly 1 PaymentAttempt row, found ${count}`);
    });

    // 8. Repeated request returns the same attempt.
    await record("8. repeated request returns the same attempt", async () => {
      const service = new PaymentAttemptService(new MockPaymentProvider({ ready: true }));
      const again = await service.createAttempt(pk2.orderNo, { guestToken: pk2.guestToken });
      if (again.id !== readyAttemptId) throw new Error("expected the same attempt id on a repeated request");
      const count = await prisma.paymentAttempt.count({ where: { fixedOrderId: pk2.orderId } });
      if (count !== 1) throw new Error(`expected exactly 1 PaymentAttempt row after a repeat, found ${count}`);
    });

    // 9. Concurrent requests create one row only.
    let pk3: Awaited<ReturnType<typeof createPkOrder>>;
    await record("9. concurrent requests create one row only", async () => {
      pk3 = await createPkOrder();
      await approvePricing(pk3.orderId);
      const service = new PaymentAttemptService(new MockPaymentProvider({ ready: true }));
      const results3 = await Promise.allSettled([
        service.createAttempt(pk3.orderNo, { guestToken: pk3.guestToken }),
        service.createAttempt(pk3.orderNo, { guestToken: pk3.guestToken })
      ]);
      const fulfilled = results3.filter((r) => r.status === "fulfilled");
      if (fulfilled.length === 0) throw new Error("expected at least one concurrent request to succeed");
      const count = await prisma.paymentAttempt.count({ where: { fixedOrderId: pk3.orderId } });
      if (count !== 1) throw new Error(`expected exactly 1 PaymentAttempt row after concurrent requests, found ${count}`);
    });

    // 10. A second idempotency key creates no second lifecycle -- the unique
    // constraint on fixedOrderId rejects a second row even with a different key.
    await record("10. second idempotency key creates no second lifecycle", async () => {
      let p2002 = false;
      try {
        await prisma.paymentAttempt.create({
          data: {
            fixedOrderId: pk2.orderId,
            provider: "mock_payment_provider",
            status: "CREATED",
            amountMinor: 25000n,
            currency: "PKR",
            idempotencyKey: "a-completely-different-idempotency-key"
          }
        });
      } catch (err) {
        p2002 = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      }
      if (!p2002) throw new Error("expected a second PaymentAttempt with a different idempotency key to be rejected");
      const count = await prisma.paymentAttempt.count({ where: { fixedOrderId: pk2.orderId } });
      if (count !== 1) throw new Error(`expected exactly 1 PaymentAttempt row, found ${count}`);
    });

    // 11. Provider initialization failure reuses/updates the same attempt.
    let pk4: Awaited<ReturnType<typeof createPkOrder>>;
    let failedAttemptId = "";
    await record("11. provider initialization failure reuses/updates the same attempt", async () => {
      pk4 = await createPkOrder();
      await approvePricing(pk4.orderId);
      const failingService = new PaymentAttemptService(new MockPaymentProvider({ ready: true, failCheckout: true }));
      let failCode: string | undefined;
      try {
        await failingService.createAttempt(pk4.orderNo, { guestToken: pk4.guestToken });
      } catch (err) {
        failCode = (err as { code?: string }).code;
      }
      if (failCode !== "PAYMENT_PROVIDER_ERROR") throw new Error(`expected PAYMENT_PROVIDER_ERROR, got ${failCode}`);
      const failedRow = await prisma.paymentAttempt.findUniqueOrThrow({ where: { fixedOrderId: pk4.orderId } });
      if (failedRow.status !== "FAILED") throw new Error(`expected status FAILED, got ${failedRow.status}`);
      failedAttemptId = failedRow.id;

      const retryService = new PaymentAttemptService(new MockPaymentProvider({ ready: true }));
      const retried = await retryService.createAttempt(pk4.orderNo, { guestToken: pk4.guestToken });
      if (retried.id !== failedAttemptId) throw new Error("expected the retry to reuse the same attempt row");
      if (retried.status !== "REDIRECT_READY") throw new Error(`expected REDIRECT_READY after retry, got ${retried.status}`);
      const count = await prisma.paymentAttempt.count({ where: { fixedOrderId: pk4.orderId } });
      if (count !== 1) throw new Error(`expected exactly 1 PaymentAttempt row after retry, found ${count}`);
    });

    // 12. A paid/cancelled/ineligible order is rejected.
    await record("12. a paid/cancelled/ineligible order is rejected", async () => {
      await prisma.paymentAttempt.update({ where: { fixedOrderId: pk4.orderId }, data: { status: "PAID" } });
      const service = new PaymentAttemptService(new MockPaymentProvider({ ready: true }));
      let code: string | undefined;
      try {
        await service.createAttempt(pk4.orderNo, { guestToken: pk4.guestToken });
      } catch (err) {
        code = (err as { code?: string }).code;
      }
      if (code !== "PAYMENT_NOT_READY") throw new Error(`expected PAYMENT_NOT_READY for an already-paid order, got ${code}`);

      await prisma.fixedOrder.update({ where: { id: pk1!.orderId }, data: { status: "CANCELLED" } });
      let cancelledCode: string | undefined;
      try {
        await service.createAttempt(pk1!.orderNo, { guestToken: pk1!.guestToken });
      } catch (err) {
        cancelledCode = (err as { code?: string }).code;
      }
      if (cancelledCode !== "PAYMENT_NOT_READY") throw new Error(`expected PAYMENT_NOT_READY for a cancelled order, got ${cancelledCode}`);
    });

    // 13. No PaymentEvent is created anywhere in this flow.
    await record("13. no PaymentEvent is created", async () => {
      const count = await prisma.paymentEvent.count({ where: { paymentAttempt: { fixedOrderId: { in: createdOrderIds } } } });
      if (count !== 0) throw new Error(`expected 0 PaymentEvent rows, found ${count}`);
    });

    // 14. No entitlement/master/execution/variant is created anywhere in this flow.
    await record("14. no entitlement/master/execution/variant is created", async () => {
      const entitlementCount = await prisma.restorationEntitlement.count({ where: { fixedOrderId: { in: createdOrderIds } } });
      if (entitlementCount !== 0) throw new Error(`expected 0 RestorationEntitlement rows, found ${entitlementCount}`);
      const masterCount = await prisma.restorationMaster.count({
        where: { restorationEntitlement: { fixedOrderId: { in: createdOrderIds } } }
      });
      if (masterCount !== 0) throw new Error(`expected 0 RestorationMaster rows, found ${masterCount}`);
      const executionCount = await prisma.replicateExecution.count({
        where: { restorationMaster: { restorationEntitlement: { fixedOrderId: { in: createdOrderIds } } } }
      });
      if (executionCount !== 0) throw new Error(`expected 0 ReplicateExecution rows, found ${executionCount}`);
      const variantCount = await prisma.imageVariant.count({
        where: { restorationMaster: { restorationEntitlement: { fixedOrderId: { in: createdOrderIds } } } }
      });
      if (variantCount !== 0) throw new Error(`expected 0 ImageVariant rows, found ${variantCount}`);
    });
  } finally {
    // Cleanup: deleting FixedOrder cascades to FixedOrderItem/PaymentAttempt;
    // deleting RestorationDraft cascades to any dependent rows (none expected).
    await prisma.fixedOrder.deleteMany({ where: { id: { in: [...new Set(createdOrderIds)] } } });
    await prisma.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) {
    console.log("Failed checks:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("FAIL: unexpected error", err instanceof Error ? err.stack : err);
  process.exitCode = 1;
});
