/**
 * R9.2-P1A: disposable-database integration test for the free-upload ->
 * preview -> tier-select -> fixed-order flow.
 *
 * Like `src/scripts/verify-disposable-db.ts`, this requires an explicit,
 * already-migrated, local-only DATABASE_URL supplied via
 * `DISPOSABLE_DATABASE_URL` -- it refuses to run against anything else, and
 * performs no provider/network call besides that one local database.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx src/services/p1a-fixed-order-flow.test.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

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

// Required, non-defaulted env vars for loadConfig() -- dummy, non-secret
// local values only; this process never contacts Redis/WhatsApp/payment.
process.env.DATABASE_URL = RAW_URL;
process.env.REDIS_URL ||= "redis://replace_me";
process.env.WHATSAPP_VERIFY_TOKEN ||= "test-verify-token";
process.env.PAYMENT_GATEWAY_NAME ||= "manual";
process.env.ADMIN_JWT_SECRET ||= "test-admin-secret";
process.env.JWT_SECRET ||= "test-jwt-secret";
// Forces StorageService to use its in-memory MockStorageProvider -- no real
// R2/S3 credentials exist or are needed for this test.
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
  // 1. Static proof that neither service file *imports* a paid provider or
  // payment implementation -- upload/order creation makes zero such calls.
  // Only import/require lines are checked (not prose comments, which
  // legitimately name these providers when explaining what is NOT used).
  await record("1. no Replicate/RunPod/payment import in draft or order services", async () => {
    const forbidden = /replicate|runpod|bankalfalah|bank_alfalah|jazzcash|easypaisa/i;
    for (const relPath of ["restoration-draft.service.ts", "fixed-order.service.ts"]) {
      const source = readFileSync(join(__dirname, relPath), "utf8");
      const importLines = source.split("\n").filter((line) => /^\s*import\b/.test(line));
      const offending = importLines.filter((line) => forbidden.test(line));
      if (offending.length > 0) {
        throw new Error(`${relPath} has a forbidden import: ${offending.join("; ")}`);
      }
    }
  });

  const { loadConfig } = await import("../config/env");
  const config = loadConfig();

  // Dynamic imports so the Prisma singleton inside these modules is
  // constructed AFTER process.env.DATABASE_URL is set above (static
  // top-of-file imports would be hoisted before that assignment).
  const { prisma } = await import("../db/prisma");
  const { RestorationDraftService } = await import("./restoration-draft.service");
  const { FixedOrderService } = await import("./fixed-order.service");
  const { FixedOrderDomainError } = await import("../domain/fixedOrder/fixedOrderGuards");
  const { ApprovedOfferProvider } = await import("../domain/pricing/approvedOfferProvider");

  // R9.2-P1C-B: deterministic test clock, strictly after the real
  // PriceBook's effectiveAt (2026-08-03T00:00:00Z) -- injected explicitly
  // rather than depending on wall-clock timing, so this suite passes
  // identically no matter when it is actually run. The production default
  // (bare `new ApprovedOfferProvider()`) correctly uses the real wall clock
  // instead; that boundary behavior is proven in `priceBook.test.ts`.
  const testNow = () => new Date("2026-08-03T00:00:01Z");
  const draftService = new RestorationDraftService(config, new ApprovedOfferProvider({ now: testNow }));
  const orderService = new FixedOrderService(new ApprovedOfferProvider({ now: testNow }));

  const validPng = await sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 5, g: 6, b: 7 } } })
    .png()
    .toBuffer();
  const validPngBase64 = validPng.toString("base64");

  const createdDraftIds: string[] = [];
  const createdOrderIds: string[] = [];

  try {
    let pkDraftId = "";
    let pkGuestToken = "";

    // 4. Valid image metadata/hash is persisted.
    await record("4. valid image metadata/hash is persisted", async () => {
      const { draft, guestOwnershipToken } = await draftService.createDraft({
        country: "PK",
        marketConfirmed: true,
        fileName: "family-photo.png",
        contentType: "image/png",
        bodyBase64: validPngBase64
      });
      pkDraftId = draft.id;
      pkGuestToken = guestOwnershipToken!;
      createdDraftIds.push(draft.id);

      if (!guestOwnershipToken) throw new Error("expected a guest ownership token for an anonymous upload");
      if (draft.market !== "PAKISTAN" || draft.currency !== "PKR") throw new Error("expected PAKISTAN/PKR");
      if (draft.originalMimeType !== "image/png") throw new Error("expected image/png");
      if (draft.originalWidth !== 60 || draft.originalHeight !== 40) throw new Error("expected 60x40");
      if (!draft.previewUrl) throw new Error("expected a signed preview URL");

      const row = await prisma.restorationDraft.findUniqueOrThrow({ where: { id: draft.id } });
      if (!row.originalSha256 || row.originalSha256.length !== 64) throw new Error("expected a 64-char sha256 hex digest persisted");
      if (row.originalFileSizeBytes !== validPng.length) throw new Error("expected persisted file size to match upload");
    });

    // 2. A fake image (extension/content-type lie, real bytes are not an
    // image) is rejected, and creates no draft row.
    await record("2. fake image extension/content is rejected and persists nothing", async () => {
      const before = await prisma.restorationDraft.count();
      const fakeBytes = Buffer.from("not actually an image").toString("base64");
      let threw = false;
      try {
        await draftService.createDraft({
          country: "PK",
          marketConfirmed: true,
          fileName: "totally-a-photo.jpg",
          contentType: "image/jpeg",
          bodyBase64: fakeBytes
        });
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("expected fake image bytes to be rejected");
      const after = await prisma.restorationDraft.count();
      if (after !== before) throw new Error("expected no draft row to be created for a rejected upload");
    });

    // 3. Oversize image is rejected and persists nothing.
    await record("3. oversize image is rejected and persists nothing", async () => {
      const before = await prisma.restorationDraft.count();
      const oversized = Buffer.concat([validPng, Buffer.alloc(11 * 1024 * 1024)]).toString("base64");
      let threw = false;
      try {
        await draftService.createDraft({
          country: "PK",
          marketConfirmed: true,
          fileName: "huge.png",
          contentType: "image/png",
          bodyBase64: oversized
        });
      } catch {
        threw = true;
      }
      if (!threw) throw new Error("expected an oversized upload to be rejected");
      const after = await prisma.restorationDraft.count();
      if (after !== before) throw new Error("expected no draft row to be created for a rejected upload");
    });

    // 5. Preview requires owner or a valid guest token.
    await record("5. preview/draft access requires owner or valid guest token", async () => {
      let threw = false;
      try {
        await draftService.getDraft(pkDraftId, { guestToken: "wrong-token-entirely" });
      } catch (err) {
        threw = (err as { code?: string }).code === "NOT_FOUND";
      }
      if (!threw) throw new Error("expected NOT_FOUND for a wrong guest token");

      const owned = await draftService.getDraft(pkDraftId, { guestToken: pkGuestToken });
      if (owned.id !== pkDraftId) throw new Error("expected the owner (correct guest token) to succeed");
    });

    // 6. Cross-customer draft access is rejected with the SAME not-found
    // behavior as a nonexistent id (no enumeration signal).
    await record("6. cross-customer draft access is rejected (consistent not-found)", async () => {
      const otherUsersDraft = await draftService.createDraft({
        country: "PK",
        marketConfirmed: true,
        fileName: "someone-elses.png",
        contentType: "image/png",
        bodyBase64: validPngBase64,
        actorUserId: "user-A"
      });
      createdDraftIds.push(otherUsersDraft.draft.id);

      let codeForWrongUser: string | undefined;
      try {
        await draftService.getDraft(otherUsersDraft.draft.id, { userId: "user-B" });
      } catch (err) {
        codeForWrongUser = (err as { code?: string }).code;
      }
      let codeForNonexistent: string | undefined;
      try {
        await draftService.getDraft("does-not-exist-at-all", { userId: "user-B" });
      } catch (err) {
        codeForNonexistent = (err as { code?: string }).code;
      }
      if (codeForWrongUser !== "NOT_FOUND" || codeForNonexistent !== "NOT_FOUND") {
        throw new Error(`expected identical NOT_FOUND for both cases, got ${codeForWrongUser} / ${codeForNonexistent}`);
      }
    });

    // 7. Pakistan receives PKR offers only.
    await record("7. Pakistan receives PKR offers only", async () => {
      const offers = await draftService.getOffers(pkDraftId, { guestToken: pkGuestToken });
      if (offers.currency !== "PKR") throw new Error(`expected PKR, got ${offers.currency}`);
      if (!Array.isArray(offers.offers)) throw new Error("expected Pakistan offers to be available");
      if (offers.offers.some((o) => o.currency !== "PKR")) throw new Error("expected every offer to be PKR");
    });

    // 8. R9.2-P1C-B: International now receives real, owner-approved USD
    // offers (PriceBook PB-2026-08-03-v1) -- this reflects a genuine,
    // intended change in business reality (the owner approved USD pricing),
    // not a weakened test. Before this packet, USD was truthfully
    // unavailable and this test asserted exactly that; the assertion below
    // has been updated to match the new, correct behavior.
    let intlDraftId = "";
    let intlGuestToken = "";
    await record("8. International receives approved USD offers from the PriceBook", async () => {
      const { draft, guestOwnershipToken } = await draftService.createDraft({
        country: "US",
        marketConfirmed: true,
        fileName: "intl-photo.png",
        contentType: "image/png",
        bodyBase64: validPngBase64
      });
      intlDraftId = draft.id;
      intlGuestToken = guestOwnershipToken!;
      createdDraftIds.push(draft.id);

      if (draft.market !== "INTERNATIONAL" || draft.currency !== "USD") throw new Error("expected INTERNATIONAL/USD");
      const offers = await draftService.getOffers(intlDraftId, { guestToken: intlGuestToken });
      if (offers.currency !== "USD") throw new Error(`expected USD, got ${offers.currency}`);
      if (!Array.isArray(offers.offers)) throw new Error("expected International offers to be available (owner-approved USD pricing exists)");
      const expected: Record<string, number> = { ORIGINAL: 150, HD_2X: 250, HD_4X: 350 };
      for (const offer of offers.offers) {
        if (offer.source !== "approved_pricebook") throw new Error(`expected approved_pricebook source, got ${offer.source}`);
        if (offer.amountMinor !== expected[offer.tier]) {
          throw new Error(`${offer.tier}: expected ${expected[offer.tier]}, got ${offer.amountMinor}`);
        }
      }
    });

    // International order creation now succeeds with the approved USD price
    // -- immutably snapshotted, never a fabricated or client-supplied amount.
    await record("International order creation succeeds with the approved USD PriceBook snapshot", async () => {
      const order = await orderService.createRestorationDigitalOrder({
        draftId: intlDraftId,
        tier: "ORIGINAL",
        actor: { guestToken: intlGuestToken }
      });
      createdOrderIds.push(order.id);
      if (order.market !== "INTERNATIONAL" || order.currency !== "USD") throw new Error("expected INTERNATIONAL/USD");
      if (order.totalAmountMinor !== "150") throw new Error(`expected the approved ORIGINAL USD price 150, got ${order.totalAmountMinor}`);
      if (order.priceBookVersion !== "PB-2026-08-03-v1") throw new Error(`unexpected priceBookVersion ${order.priceBookVersion}`);
      if (order.priceBookApprovalReference !== "OWNER-CHAT-2026-08-03-P1C-B-01") {
        throw new Error(`unexpected priceBookApprovalReference ${order.priceBookApprovalReference}`);
      }
      if (!order.items[0].pricingApproved) throw new Error("expected the item to be pricingApproved:true");
      if (order.items[0].pricingSource !== "approved_pricebook") throw new Error(`unexpected pricingSource ${order.items[0].pricingSource}`);
    });

    let firstOrderId = "";
    let firstOrderNo = "";

    // 9. Client amount/currency is ignored -- the input type/service never
    // accepts them at all; the persisted amount always comes from the
    // server offer, proven by asserting it matches the known fixture price.
    await record("9. order amount/currency always comes from the server offer, never the client", async () => {
      const order = await orderService.createRestorationDigitalOrder({
        draftId: pkDraftId,
        tier: "ORIGINAL",
        actor: { guestToken: pkGuestToken }
      });
      firstOrderId = order.id;
      firstOrderNo = order.orderNo;
      createdOrderIds.push(order.id);

      if (order.totalAmountMinor !== "25000") throw new Error(`expected the fixture ORIGINAL price 25000, got ${order.totalAmountMinor}`);
      if (order.currency !== "PKR" || order.market !== "PAKISTAN") throw new Error("expected server-resolved PAKISTAN/PKR");
    });

    // 10. Repeated idempotency key (the draft id) returns the same order.
    await record("10. repeated request for the same draft returns the same order", async () => {
      const again = await orderService.createRestorationDigitalOrder({
        draftId: pkDraftId,
        tier: "ORIGINAL",
        actor: { guestToken: pkGuestToken }
      });
      if (again.id !== firstOrderId || again.orderNo !== firstOrderNo) {
        throw new Error("expected the same order to be returned for a repeated request");
      }
      const count = await prisma.fixedOrder.count({ where: { sourceDraftId: pkDraftId } });
      if (count !== 1) throw new Error(`expected exactly 1 FixedOrder for this draft, found ${count}`);
    });

    // 11. A locked (just-created) order rejects edit/reprice via the shared
    // P0A guard, proven against a real persisted order.
    await record("11. a locked order rejects edit/reprice/add-line operations", async () => {
      const persisted = await prisma.fixedOrder.findUniqueOrThrow({ where: { id: firstOrderId } });
      let threw = false;
      try {
        orderService.assertMutable({ immutableAt: persisted.immutableAt, status: persisted.status });
      } catch (err) {
        threw = err instanceof FixedOrderDomainError;
      }
      if (!threw) throw new Error("expected assertMutable to reject a real persisted, already-created order");
    });

    // 12/13. Fixed-order creation creates no PaymentAttempt, entitlement,
    // master, execution, or variant.
    await record("12. fixed-order creation creates no PaymentAttempt", async () => {
      const count = await prisma.paymentAttempt.count({ where: { fixedOrderId: firstOrderId } });
      if (count !== 0) throw new Error(`expected 0 PaymentAttempt rows, found ${count}`);
    });
    await record("13. fixed-order creation creates no entitlement/master/execution/variant", async () => {
      const entitlementCount = await prisma.restorationEntitlement.count({ where: { fixedOrderId: firstOrderId } });
      if (entitlementCount !== 0) throw new Error(`expected 0 RestorationEntitlement rows, found ${entitlementCount}`);
      const masterCount = await prisma.restorationMaster.count({
        where: { restorationEntitlement: { fixedOrderId: firstOrderId } }
      });
      if (masterCount !== 0) throw new Error(`expected 0 RestorationMaster rows, found ${masterCount}`);
      const executionCount = await prisma.replicateExecution.count({
        where: { restorationMaster: { restorationEntitlement: { fixedOrderId: firstOrderId } } }
      });
      if (executionCount !== 0) throw new Error(`expected 0 ReplicateExecution rows, found ${executionCount}`);
      const variantCount = await prisma.imageVariant.count({
        where: { restorationMaster: { restorationEntitlement: { fixedOrderId: firstOrderId } } }
      });
      if (variantCount !== 0) throw new Error(`expected 0 ImageVariant rows, found ${variantCount}`);
    });

    // 14. Refresh returns the same persisted draft/order.
    await record("14. refresh returns the same persisted draft and order", async () => {
      const draftAgain = await draftService.getDraft(pkDraftId, { guestToken: pkGuestToken });
      if (draftAgain.id !== pkDraftId) throw new Error("expected the same draft on refresh");
      const orderAgain = await orderService.getOrderByOrderNo(firstOrderNo, { guestToken: pkGuestToken });
      if (orderAgain.id !== firstOrderId) throw new Error("expected the same order on refresh");
    });
  } finally {
    // Cleanup: deleting FixedOrder cascades to FixedOrderItem; deleting
    // RestorationDraft cascades to any dependent rows (none expected here).
    await prisma.fixedOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
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
