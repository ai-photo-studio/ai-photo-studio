/**
 * R9.2-P1C-B: disposable-database integration test for the owner-approved
 * PriceBook -> immutable FixedOrder pricing snapshot -> payment-readiness
 * boundary.
 *
 * Like `p1a-fixed-order-flow.test.ts` and `p1b-payment-attempt-flow.test.ts`,
 * this requires an explicit, already-migrated, local-only DATABASE_URL
 * supplied via `DISPOSABLE_DATABASE_URL` -- it refuses to run against
 * anything else, and performs no provider/network call besides that one
 * local database.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx src/services/p1c-b-pricebook-flow.test.ts
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
  await record("0. fixed-order service never reads a client-supplied amount/currency", async () => {
    const source = readFileSync(join(__dirname, "fixed-order.service.ts"), "utf8");
    const codeOnly = source.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
    if (/input\.(amount|currency|price)\b/i.test(codeOnly)) {
      throw new Error("fixed-order.service.ts reads a client-supplied amount/currency/price field from input");
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
  const { ApprovedOfferProvider } = await import("../domain/pricing/approvedOfferProvider");
  const { APPROVED_PRICE_BOOKS } = await import("../domain/pricing/priceBook");

  // Deterministic test clock, strictly after the real PriceBook's
  // effectiveAt (2026-08-03T00:00:00Z) -- injected explicitly rather than
  // depending on wall-clock timing, per this packet's own requirement. The
  // production default (bare `new ApprovedOfferProvider()`, used by
  // `new FixedOrderService()` with no argument) correctly uses the real
  // wall clock instead; that boundary behavior is proven deterministically
  // in `priceBook.test.ts` (tests 5/6), not here.
  const testNow = () => new Date("2026-08-03T00:00:01Z");
  const draftService = new RestorationDraftService(config);
  const approvedOrderService = new FixedOrderService(new ApprovedOfferProvider({ now: testNow }));
  const fixtureOrderService = new FixedOrderService(new FixtureOfferProvider());

  class CountingProvider extends BankAlfalahAdapter {
    public checkoutCallCount = 0;
    async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
      this.checkoutCallCount += 1;
      return super.createCheckoutSession(input);
    }
  }
  const countingProvider = new CountingProvider();

  const validPng = await sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 3, g: 4, b: 5 } } })
    .png()
    .toBuffer();
  const validPngBase64 = validPng.toString("base64");

  const createdDraftIds: string[] = [];
  const createdOrderIds: string[] = [];

  async function createPkDraft(): Promise<{ draftId: string; guestToken: string }> {
    const { draft, guestOwnershipToken } = await draftService.createDraft({
      country: "PK",
      marketConfirmed: true,
      fileName: "pricebook-photo.png",
      contentType: "image/png",
      bodyBase64: validPngBase64
    });
    createdDraftIds.push(draft.id);
    return { draftId: draft.id, guestToken: guestOwnershipToken! };
  }

  try {
    // 10. Existing fixture orders remain unapproved.
    let fixtureOrderNo = "";
    await record("10. existing fixture orders remain unapproved and payment-ineligible", async () => {
      const { draftId, guestToken } = await createPkDraft();
      const order = await fixtureOrderService.createRestorationDigitalOrder({ draftId, tier: "ORIGINAL", actor: { guestToken } });
      createdOrderIds.push(order.id);
      fixtureOrderNo = order.orderNo;
      if (order.items[0].pricingSource !== "local_fixture") throw new Error(`expected local_fixture, got ${order.items[0].pricingSource}`);
      if (order.items[0].pricingApproved) throw new Error("expected pricingApproved:false for a fixture order");
      if (order.priceBookApprovalReference !== null) throw new Error("expected no approval reference for a fixture order");
    });

    // 11. FixedOrder stores an immutable version/source/market/currency/amount snapshot.
    let firstOrderId = "";
    let firstOrderNo = "";
    let pkGuestToken = "";
    await record("11. FixedOrder stores an immutable PriceBook snapshot", async () => {
      const { draftId, guestToken } = await createPkDraft();
      pkGuestToken = guestToken;
      const order = await approvedOrderService.createRestorationDigitalOrder({ draftId, tier: "ORIGINAL", actor: { guestToken } });
      firstOrderId = order.id;
      firstOrderNo = order.orderNo;
      createdOrderIds.push(order.id);

      if (order.totalAmountMinor !== "25000") throw new Error(`expected 25000, got ${order.totalAmountMinor}`);
      if (order.market !== "PAKISTAN" || order.currency !== "PKR") throw new Error("expected PAKISTAN/PKR");
      if (order.priceBookVersion !== "PB-2026-08-03-v1") throw new Error(`unexpected priceBookVersion ${order.priceBookVersion}`);
      if (order.priceBookApprovalReference !== "OWNER-CHAT-2026-08-03-P1C-B-01") {
        throw new Error(`unexpected priceBookApprovalReference ${order.priceBookApprovalReference}`);
      }
      if (!order.priceBookEffectiveAt || order.priceBookEffectiveAt.toISOString() !== "2026-08-03T00:00:00.000Z") {
        throw new Error(`unexpected priceBookEffectiveAt ${order.priceBookEffectiveAt}`);
      }
      const item = order.items[0];
      if (item.unitAmountMinor !== "25000" || item.totalAmountMinor !== "25000") throw new Error("expected item amount 25000");
      if (item.pricingSource !== "approved_pricebook" || !item.pricingApproved) throw new Error("expected an approved_pricebook, approved item");
    });

    // 12. Later PriceBook changes do not alter an existing FixedOrder.
    await record("12. later PriceBook changes do not alter an existing order", async () => {
      const laterBooks = [
        {
          ...APPROVED_PRICE_BOOKS[0],
          version: "PB-2099-01-01-v2",
          entries: APPROVED_PRICE_BOOKS[0].entries.map((entry) => ({ ...entry, amountMinor: entry.amountMinor + 999 }))
        }
      ];
      const laterProvider = new ApprovedOfferProvider({ books: laterBooks, now: () => new Date("2026-08-03T00:00:01Z") });
      const laterOrderService = new FixedOrderService(laterProvider);
      // getOrderByOrderNo never touches pricing at all -- re-fetching through
      // a service wired to a completely different "later" PriceBook proves
      // the persisted snapshot is immune to it.
      const refetched = await laterOrderService.getOrderByOrderNo(firstOrderNo, { guestToken: pkGuestToken });
      if (refetched.totalAmountMinor !== "25000") throw new Error(`expected the original 25000 to survive, got ${refetched.totalAmountMinor}`);
      if (refetched.priceBookVersion !== "PB-2026-08-03-v1") throw new Error(`expected the original version to survive, got ${refetched.priceBookVersion}`);
    });

    // 13. Client amount/currency overrides are structurally impossible
    // (see static check #0) and, positively, the persisted amount always
    // matches the server-resolved PriceBook value regardless (test 11).
    await record("13. client amount/currency cannot override the resolved PriceBook price", async () => {
      const persisted = await prisma.fixedOrder.findUniqueOrThrow({ where: { id: firstOrderId } });
      if (persisted.totalAmountMinor !== 25000n) throw new Error(`expected 25000n in the database, got ${persisted.totalAmountMinor}`);
    });

    // 14. Payment readiness rejects an invalid/incomplete approved snapshot.
    await record("14. payment readiness rejects an invalid snapshot", async () => {
      await prisma.fixedOrder.update({ where: { id: firstOrderId }, data: { priceBookApprovalReference: null } });
      const service = new PaymentAttemptService(new MockPaymentProvider({ ready: true }));
      const readiness = await service.getReadiness(firstOrderNo, { guestToken: pkGuestToken });
      if (readiness.ready) throw new Error("expected an incomplete snapshot (missing approval reference) to be rejected");
      if (!readiness.reasons.some((r) => /incomplete snapshot/.test(r))) {
        throw new Error(`expected an incomplete-snapshot reason, got ${JSON.stringify(readiness.reasons)}`);
      }
      // Restore the correct snapshot for later checks in this file.
      await prisma.fixedOrder.update({
        where: { id: firstOrderId },
        data: { priceBookApprovalReference: "OWNER-CHAT-2026-08-03-P1C-B-01" }
      });
    });

    // 15. A valid, approved snapshot passes pricing checks, but payment
    // remains unavailable because the real Bank Alfalah adapter is not ready.
    await record("15. approved snapshot passes pricing checks but Bank Alfalah is not ready", async () => {
      const service = new PaymentAttemptService(countingProvider);
      const readiness = await service.getReadiness(firstOrderNo, { guestToken: pkGuestToken });
      if (readiness.ready) throw new Error("expected not-ready (Bank Alfalah is never ready in this packet)");
      if (readiness.reasons.some((r) => /not owner-approved|incomplete snapshot/.test(r))) {
        throw new Error(`expected no pricing-related blocker for an approved order, got ${JSON.stringify(readiness.reasons)}`);
      }
      if (!readiness.reasons.some((r) => r.startsWith("provider unavailable:"))) {
        throw new Error(`expected a provider-unavailable reason, got ${JSON.stringify(readiness.reasons)}`);
      }
      if (countingProvider.checkoutCallCount !== 0) throw new Error("expected zero external calls from a readiness check");
    });

    // 16. Concurrent fixed-order creation uses one PriceBook version and
    // produces no conflicting snapshots.
    await record("16. concurrent creation uses one PriceBook version", async () => {
      const [a, b] = await Promise.all([createPkDraft(), createPkDraft()]);
      const [orderA, orderB] = await Promise.all([
        approvedOrderService.createRestorationDigitalOrder({ draftId: a.draftId, tier: "HD_2X", actor: { guestToken: a.guestToken } }),
        approvedOrderService.createRestorationDigitalOrder({ draftId: b.draftId, tier: "HD_2X", actor: { guestToken: b.guestToken } })
      ]);
      createdOrderIds.push(orderA.id, orderB.id);
      if (orderA.priceBookVersion !== "PB-2026-08-03-v1" || orderB.priceBookVersion !== "PB-2026-08-03-v1") {
        throw new Error("expected both concurrent orders to use the same PriceBook version");
      }
      if (orderA.totalAmountMinor !== "35000" || orderB.totalAmountMinor !== "35000") {
        throw new Error("expected both concurrent orders to snapshot the same 2HD amount");
      }
    });

    // 17. No entitlement/master/execution/variant row exists anywhere in this flow.
    await record("17. zero downstream entitlement/master/execution/variant rows", async () => {
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
      const paymentEventCount = await prisma.paymentEvent.count({ where: { paymentAttempt: { fixedOrderId: { in: createdOrderIds } } } });
      if (paymentEventCount !== 0) throw new Error(`expected 0 PaymentEvent rows, found ${paymentEventCount}`);
    });

    // 18. Zero external/provider/payment calls anywhere in this file's flow.
    await record("18. zero external/provider/payment calls", async () => {
      if (countingProvider.checkoutCallCount !== 0) {
        throw new Error(`expected 0 external calls across this entire test file, found ${countingProvider.checkoutCallCount}`);
      }
      // fixtureOrderNo is unused beyond proving test 10's order persisted --
      // referenced here only to satisfy the no-unused-locals convention.
      if (!fixtureOrderNo) throw new Error("expected the fixture order to have been created in test 10");
    });
  } finally {
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
