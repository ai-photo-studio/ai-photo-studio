/**
 * R9.2-P6B-APPROVED-OFFER-WIRING-VERIFY-REAL-POSTGRES-RACE
 *
 * Proves `FixedOrderService.createRestorationDigitalOrder`
 * (apps/api/src/services/fixed-order.service.ts) against a REAL, disposable,
 * local PostgreSQL instance -- same fail-closed loopback-only guard as
 * `p3a-replicate-execution-worker.pg-race.test.ts` / `p4a-...pg-race.test.ts`.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/fixed-order.service.pg-race.test.ts
 *
 * Every row it creates is prefixed `p6b-race-` and is deleted in the final
 * teardown test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createGuestOwnershipToken, hashGuestOwnershipToken } from "../utils/guest-ownership";

// ---------------------------------------------------------------------------
// Fail-closed disposable-URL guard (identical policy to P3A/P4A/P4B pg-race tests)
// ---------------------------------------------------------------------------

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

// ---- Zero-external-call guard ------------------------------------------------

let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

async function loadServiceModule() {
  return import("./fixed-order.service");
}
async function loadOfferProviderModule() {
  return import("../domain/pricing/offerProvider");
}

// ---------------------------------------------------------------------------
// Real Prisma clients / seeding
// ---------------------------------------------------------------------------

const clientA = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const clientB = new PrismaClient({ datasources: { db: { url: RAW_URL } } });

const createdDraftIds: string[] = [];
const createdOrderIds: string[] = [];

async function seedDraft(
  label: string,
  overrides: Partial<{ market: "PAKISTAN" | "INTERNATIONAL"; currency: "PKR" | "USD" | null; ownerUserId: string | null }> = {}
) {
  const tag = `p6b-race-${label}-${randomUUID()}`;
  const guestToken = createGuestOwnershipToken();
  const draft = await clientA.restorationDraft.create({
    data: {
      originalStorageKey: `originals/${tag}-source.jpg`,
      originalMimeType: "image/jpeg",
      market: overrides.market === undefined ? "PAKISTAN" : overrides.market,
      currency: overrides.currency === undefined ? "PKR" : overrides.currency,
      guestOwnershipTokenHash: hashGuestOwnershipToken(guestToken),
      ownerUserId: overrides.ownerUserId ?? null,
      status: "UPLOADED"
    }
  });
  createdDraftIds.push(draft.id);
  return { draft, guestToken };
}

/** Row counts for every out-of-scope table this packet must never write to. */
async function outOfScopeCounts() {
  const [paymentAttempt, paymentEvent, restorationEntitlement, restorationMaster, replicateExecution] = await Promise.all([
    clientA.paymentAttempt.count(),
    clientA.paymentEvent.count(),
    clientA.restorationEntitlement.count(),
    clientA.restorationMaster.count(),
    clientA.replicateExecution.count()
  ]);
  return { paymentAttempt, paymentEvent, restorationEntitlement, restorationMaster, replicateExecution };
}

let baselineOutOfScope: Awaited<ReturnType<typeof outOfScopeCounts>>;

test("(q0) the disposable database is reachable and migrated with the FixedOrder chain tables", async () => {
  const rows = await clientA.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('RestorationDraft','FixedOrder','FixedOrderItem','PaymentAttempt')`;
  assert.equal(rows.length, 4, "all four chain tables must exist in the migrated disposable database");
  baselineOutOfScope = await outOfScopeCounts();
});

test("(q1) Pakistan ORIGINAL creates the correct PKR approved-price order", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("pkr-original");

  const result = await service.createRestorationDigitalOrder(
    { draftId: draft.id, tier: "ORIGINAL" },
    { guestToken }
  );
  createdOrderIds.push(result.id);

  assert.equal(result.market, "PAKISTAN");
  assert.equal(result.currency, "PKR");
  assert.equal(result.totalAmountMinor, "50000");
  assert.equal(result.pricingApproved, true);
  assert.equal(result.pricingSource, "approved_pricebook");
  assert.equal(result.priceBookVersion, "PB-2026-08-09-TRIAL-V3");
  assert.ok(result.priceBookApprovalReference, "approval reference must be recorded");
  assert.ok(result.priceBookEffectiveAt, "effective-at snapshot must be recorded");

  const row = await clientA.fixedOrder.findUnique({ where: { id: result.id }, include: { items: true } });
  assert.equal(row?.priceBookVersion, "PB-2026-08-09-TRIAL-V3", "server persists the exact PriceBook version");
  assert.equal(row?.items[0]?.pricingApproved, true);
  assert.equal(row?.items[0]?.pricingSource, "approved_pricebook");
});

test("(q2) International 2HD creates the correct USD approved-price order", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("usd-2hd", { market: "INTERNATIONAL", currency: "USD" });

  const result = await service.createRestorationDigitalOrder(
    { draftId: draft.id, tier: "HD_2X" },
    { guestToken }
  );
  createdOrderIds.push(result.id);

  assert.equal(result.market, "INTERNATIONAL");
  assert.equal(result.currency, "USD");
  assert.equal(result.totalAmountMinor, "299");
  assert.equal(result.pricingApproved, true);
  assert.equal(result.pricingSource, "approved_pricebook");
});

test("(q3) 4HD tier uses the exact server prices for both markets", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();

  const { draft: pkrDraft, guestToken: pkrGuest } = await seedDraft("pkr-4hd");
  const pkrResult = await service.createRestorationDigitalOrder({ draftId: pkrDraft.id, tier: "HD_4X" }, { guestToken: pkrGuest });
  createdOrderIds.push(pkrResult.id);
  assert.equal(pkrResult.totalAmountMinor, "150000");

  const { draft: usdDraft, guestToken: usdGuest } = await seedDraft("usd-4hd", { market: "INTERNATIONAL", currency: "USD" });
  const usdResult = await service.createRestorationDigitalOrder({ draftId: usdDraft.id, tier: "HD_4X" }, { guestToken: usdGuest });
  createdOrderIds.push(usdResult.id);
  assert.equal(usdResult.totalAmountMinor, "499");
});

test("(q4) forged amount/currency/version/source/approval fields in the request are ignored, never trusted", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("forged-fields");

  const forgedInput = {
    draftId: draft.id,
    tier: "ORIGINAL",
    // None of the following fields exist on CreateRestorationDigitalOrderInput
    // -- this proves the service never reads them even if a caller (e.g. a
    // misbehaving controller) attached them to the object.
    amountMinor: 1,
    currency: "USD",
    priceBookVersion: "FORGED-VERSION",
    pricingSource: "local_fixture",
    pricingApproved: true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const result = await service.createRestorationDigitalOrder(forgedInput, { guestToken });
  createdOrderIds.push(result.id);

  assert.equal(result.currency, "PKR", "server-resolved currency must win, not the forged USD");
  assert.equal(result.totalAmountMinor, "50000", "server-resolved amount must win, not the forged 1");
  assert.equal(result.priceBookVersion, "PB-2026-08-09-TRIAL-V3", "server-resolved version must win, not the forged value");
  assert.equal(result.pricingSource, "approved_pricebook", "server-resolved source must win, not the forged local_fixture");
});

test("(q5) no local_fixture order can ever become payment-eligible (pricingApproved is always false)", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const { FixtureOfferProvider } = await loadOfferProviderModule();
  // Explicit test-only injection -- production FixedOrderController never
  // does this; see fixed-order.controller.ts.
  const service = new FixedOrderService(new FixtureOfferProvider());
  const { draft, guestToken } = await seedDraft("fixture-path");

  const result = await service.createRestorationDigitalOrder({ draftId: draft.id, tier: "ORIGINAL" }, { guestToken });
  createdOrderIds.push(result.id);

  assert.equal(result.pricingSource, "local_fixture");
  assert.equal(result.pricingApproved, false, "a local_fixture order must never be marked pricingApproved");

  const row = await clientA.fixedOrder.findUnique({ where: { id: result.id }, include: { items: true } });
  assert.equal(row?.items[0]?.pricingApproved, false);
  assert.equal(row?.priceBookVersion, null, "a local_fixture order must never carry a PriceBook snapshot");
});

test("(q6) invalid market/currency on the draft fails closed before any FixedOrder row is written", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("no-market", { market: null as unknown as "PAKISTAN", currency: null });

  await assert.rejects(
    () => service.createRestorationDigitalOrder({ draftId: draft.id, tier: "ORIGINAL" }, { guestToken }),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "INVALID_MARKET");
      return true;
    }
  );

  const count = await clientA.fixedOrder.count({ where: { sourceDraftId: draft.id } });
  assert.equal(count, 0, "no FixedOrder row may exist after a failed market/currency validation");
});

test("(q7) invalid tier fails closed before any FixedOrder row is written", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("bad-tier");

  await assert.rejects(
    () => service.createRestorationDigitalOrder({ draftId: draft.id, tier: "GIGANTIC" }, { guestToken }),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "INVALID_TIER");
      return true;
    }
  );

  const count = await clientA.fixedOrder.count({ where: { sourceDraftId: draft.id } });
  assert.equal(count, 0);
});

test("(q8) unchanged submission reuses an unpaid order while a changed selection replaces it", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("repeat-submit");

  const first = await service.createRestorationDigitalOrder({ draftId: draft.id, tier: "ORIGINAL" }, { guestToken });
  createdOrderIds.push(first.id);
  const second = await service.createRestorationDigitalOrder({ draftId: draft.id, tier: "HD_4X" }, { guestToken });
  createdOrderIds.push(second.id);

  assert.notEqual(second.id, first.id, "an unpaid changed selection replaces the stale order");
  assert.equal(second.tier, "HD_4X", "the deliberate replacement tier is persisted");

  const third = await service.createRestorationDigitalOrder({ draftId: draft.id, tier: "HD_4X" }, { guestToken });
  assert.equal(third.id, second.id, "the unchanged replacement selection is idempotent");
  assert.equal(third.tier, "HD_4X");

  const count = await clientA.fixedOrder.count({ where: { sourceDraftId: draft.id } });
  assert.equal(count, 1, "exactly one FixedOrder must exist for this draft");
});

test("(q9) two real concurrent submissions for the same draft converge on exactly one order (page-refresh-safe)", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const serviceA = new FixedOrderService();
  const serviceB = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("concurrent-submit");

  const [resultA, resultB] = await Promise.all([
    serviceA.createRestorationDigitalOrder({ draftId: draft.id, tier: "ORIGINAL" }, { guestToken }),
    serviceB.createRestorationDigitalOrder({ draftId: draft.id, tier: "ORIGINAL" }, { guestToken })
  ]);
  createdOrderIds.push(resultA.id);

  assert.equal(resultA.id, resultB.id, "both concurrent calls must converge on the same order id");
  const count = await clientA.fixedOrder.count({ where: { sourceDraftId: draft.id } });
  assert.equal(count, 1, "exactly one FixedOrder row may exist even under real concurrency");
});

test("(q10) wrong-owner and nonexistent draft both fail with an identical, enumeration-safe error", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft } = await seedDraft("wrong-owner");

  const capture = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (err) {
      return { status: (err as { statusCode?: number }).statusCode, code: (err as { code?: string }).code, message: (err as Error).message };
    }
  };

  const wrongOwner = await capture(() =>
    service.createRestorationDigitalOrder({ draftId: draft.id, tier: "ORIGINAL" }, { guestToken: "totally-different-token" })
  );
  const nonexistent = await capture(() =>
    service.createRestorationDigitalOrder({ draftId: "does-not-exist-at-all", tier: "ORIGINAL" }, { guestToken: "any-token" })
  );

  assert.ok(wrongOwner, "wrong-owner access must be rejected");
  assert.ok(nonexistent, "nonexistent draft access must be rejected");
  assert.deepEqual(wrongOwner, nonexistent, "wrong-owner and nonexistent must be indistinguishable to the caller");
  assert.equal(wrongOwner?.status, 404);

  const count = await clientA.fixedOrder.count({ where: { sourceDraftId: draft.id } });
  assert.equal(count, 0, "a rejected wrong-owner attempt must never create an order");
});

test("(q11) out-of-scope tables are never touched: no PaymentAttempt/PaymentEvent/RestorationEntitlement/RestorationMaster/ReplicateExecution row is created", async () => {
  const after = await outOfScopeCounts();
  assert.deepEqual(after, baselineOutOfScope, "order creation must never touch payment/entitlement/execution tables");
});

test("(q11a) R9.2-P6C: getByOrderNo returns the server review view (amount, market, tier, PriceBook version)", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("review-view");

  const created = await service.createRestorationDigitalOrder({ draftId: draft.id, tier: "HD_2X" }, { guestToken });
  createdOrderIds.push(created.id);

  const reviewed = await service.getByOrderNo(created.orderNo, { guestToken });
  assert.equal(reviewed.id, created.id);
  assert.equal(reviewed.market, "PAKISTAN");
  assert.equal(reviewed.currency, "PKR");
  assert.equal(reviewed.tier, "HD_2X");
  assert.equal(reviewed.totalAmountMinor, "100000");
  assert.equal(reviewed.priceBookVersion, "PB-2026-08-09-TRIAL-V3");
});

test("(q11b) R9.2-P6C: getByOrderNo wrong-owner and nonexistent orderNo produce an identical enumeration-safe 404", async () => {
  const { FixedOrderService } = await loadServiceModule();
  const service = new FixedOrderService();
  const { draft, guestToken } = await seedDraft("review-view-owner");
  const created = await service.createRestorationDigitalOrder({ draftId: draft.id, tier: "ORIGINAL" }, { guestToken });
  createdOrderIds.push(created.id);

  const capture = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (err) {
      return { status: (err as { statusCode?: number }).statusCode, code: (err as { code?: string }).code };
    }
  };

  const wrongOwner = await capture(() => service.getByOrderNo(created.orderNo, { guestToken: "different-token" }));
  const nonexistent = await capture(() => service.getByOrderNo("NOT-A-REAL-ORDER-NO", { guestToken: "any-token" }));
  assert.ok(wrongOwner);
  assert.ok(nonexistent);
  assert.deepEqual(wrongOwner, nonexistent);
  assert.equal(wrongOwner?.status, 404);
});

test("(q12) zero external network calls across every test in this file", () => {
  assert.equal(externalCallAttempts, 0);
});

test("(q13) teardown: every seeded row is removed and all clients disconnect", async () => {
  await clientA.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
  await clientA.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });

  const remainingOrders = await clientA.fixedOrder.count({ where: { id: { in: createdOrderIds } } });
  const remainingDrafts = await clientA.restorationDraft.count({ where: { id: { in: createdDraftIds } } });
  assert.equal(remainingOrders, 0, "no synthetic order survives teardown");
  assert.equal(remainingDrafts, 0, "no synthetic draft survives teardown");

  await clientA.$disconnect();
  await clientB.$disconnect();
});
