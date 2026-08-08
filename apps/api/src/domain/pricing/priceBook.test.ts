// R9.2-P1C-B pure PriceBook selection/validation tests. No DB/network
// imports; every time-boundary case uses an explicit injected `now`, never
// the real wall clock.
import { APPROVED_PRICE_BOOKS, type PriceBook } from "./priceBook";
import { PriceBookValidationError, selectActivePriceBookEntry } from "./priceBookValidator";
import { ApprovedOfferProvider } from "./approvedOfferProvider";
import { ALLOWED_DIGITAL_TIERS } from "./offerProvider";

function expectThrows(name: string, fn: () => void) {
  try {
    fn();
  } catch (err) {
    if (err instanceof PriceBookValidationError) return;
    throw new Error(`${name}: expected PriceBookValidationError, got ${(err as Error).message}`);
  }
  throw new Error(`${name}: expected to throw, but it did not`);
}

function expectOk<T>(name: string, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new Error(`${name}: expected no throw, got ${(err as Error).message}`);
  }
}

const REF_NOW = new Date("2026-06-01T00:00:00Z");

function makeBook(overrides: Partial<PriceBook> = {}): PriceBook {
  return {
    version: "PB-TEST-v1",
    approvalStatus: "APPROVED",
    approvedBy: "Test Owner",
    approvalReference: "TEST-REF-1",
    effectiveStartsAt: "2026-01-01T00:00:00Z",
    effectiveEndsAt: null,
    pricesIncludeTax: false,
    printingIncluded: false,
    automaticFxAllowed: false,
    entries: [{ market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", amountMinor: 25000 }],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Real approved data: V1 remains immutable and V2 resolves the workbook values.
// ---------------------------------------------------------------------------
{
  const provider = new ApprovedOfferProvider({ now: () => new Date("2026-08-09T00:00:01Z") });
  const pkOffers = expectOk("Pakistan offers resolve", () => provider.getDigitalOffers({ market: "PAKISTAN" }));
  if (!Array.isArray(pkOffers)) throw new Error("expected Pakistan offers to be available");
  const pkExpected: Record<string, number> = { ORIGINAL: 50000, HD_2X: 100000, HD_4X: 150000, HD_6X: 250000, HD_8X: 350000, HD_10X: 400000, HD_12X: 500000 };
  for (const tier of ALLOWED_DIGITAL_TIERS) {
    const offer = pkOffers.find((o) => o.tier === tier);
    if (!offer) throw new Error(`missing Pakistan offer for ${tier}`);
    if (offer.amountMinor !== pkExpected[tier]) throw new Error(`Pakistan ${tier}: expected ${pkExpected[tier]}, got ${offer.amountMinor}`);
    if (offer.currency !== "PKR") throw new Error(`Pakistan ${tier}: expected PKR, got ${offer.currency}`);
    if (offer.source !== "approved_pricebook") throw new Error(`Pakistan ${tier}: expected approved_pricebook source`);
     if (offer.priceBookVersion !== "PB-2026-08-09-TRIAL-V3") throw new Error(`Pakistan ${tier}: unexpected PriceBook version ${offer.priceBookVersion}`);
  }

  const intlOffers = expectOk("International USD offers resolve independently", () => provider.getDigitalOffers({ market: "INTERNATIONAL" }));
  if (!Array.isArray(intlOffers)) throw new Error("expected International USD offers to be available");
  const usdExpected: Record<string, number> = { ORIGINAL: 199, HD_2X: 299, HD_4X: 499, HD_6X: 699, HD_8X: 899, HD_10X: 1099, HD_12X: 1299 };
  for (const tier of ALLOWED_DIGITAL_TIERS) if (intlOffers.find((o) => o.tier === tier)?.amountMinor !== usdExpected[tier]) throw new Error(`USD ${tier} mismatch`);
  console.log("PASS 1. V3 seven PKR and seven USD prices resolve correctly");
}

// ---------------------------------------------------------------------------
// 2/3. Pakistan/USD and International/PKR are rejected (invalid pairing).
// ---------------------------------------------------------------------------
expectThrows("Pakistan with USD rejected", () =>
  selectActivePriceBookEntry([makeBook()], { market: "PAKISTAN", currency: "USD", tier: "ORIGINAL", now: REF_NOW })
);
expectThrows("International with PKR rejected", () =>
  selectActivePriceBookEntry([makeBook()], { market: "INTERNATIONAL", currency: "PKR", tier: "ORIGINAL", now: REF_NOW })
);
console.log("PASS 2-3. Pakistan/USD and International/PKR rejected");

// ---------------------------------------------------------------------------
// 4. Invalid minor-unit values (negative, zero, fractional, unsafe) rejected.
// ---------------------------------------------------------------------------
for (const badAmount of [-100, 0, 100.5, Number.MAX_SAFE_INTEGER + 10]) {
  expectThrows(`invalid amount ${badAmount} rejected`, () =>
    selectActivePriceBookEntry(
      [makeBook({ entries: [{ market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", amountMinor: badAmount }] })],
      { market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", now: REF_NOW }
    )
  );
}
console.log("PASS 4. invalid minor-unit values rejected");

// ---------------------------------------------------------------------------
// 5/6. Effective-window boundary: inactive strictly before effectiveStartsAt,
// active exactly at effectiveStartsAt (inclusive boundary).
// ---------------------------------------------------------------------------
const boundaryBook = makeBook({ effectiveStartsAt: "2026-06-01T00:00:00Z", effectiveEndsAt: null });
expectThrows("inactive 1ms before effectiveAt", () =>
  selectActivePriceBookEntry([boundaryBook], {
    market: "PAKISTAN",
    currency: "PKR",
    tier: "ORIGINAL",
    now: new Date("2026-05-31T23:59:59.999Z")
  })
);
expectOk("active exactly at effectiveAt", () =>
  selectActivePriceBookEntry([boundaryBook], {
    market: "PAKISTAN",
    currency: "PKR",
    tier: "ORIGINAL",
    now: new Date("2026-06-01T00:00:00.000Z")
  })
);
console.log("PASS 5-6. PriceBook inactive before effectiveAt, active at effectiveAt");

// ---------------------------------------------------------------------------
// 7. Future, expired, and unapproved books all fail closed.
// ---------------------------------------------------------------------------
expectThrows("future book rejected", () =>
  selectActivePriceBookEntry([makeBook({ effectiveStartsAt: "2099-01-01T00:00:00Z" })], {
    market: "PAKISTAN",
    currency: "PKR",
    tier: "ORIGINAL",
    now: REF_NOW
  })
);
expectThrows("expired book rejected", () =>
  selectActivePriceBookEntry(
    [makeBook({ effectiveStartsAt: "2020-01-01T00:00:00Z", effectiveEndsAt: "2021-01-01T00:00:00Z" })],
    { market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", now: REF_NOW }
  )
);
expectThrows("unapproved book rejected", () =>
  // approvalStatus is typed "APPROVED" only in this repo's own PriceBook
  // authoring surface -- cast here purely to prove the runtime guard rejects
  // any non-approved status a future data source could supply.
  selectActivePriceBookEntry([makeBook({ approvalStatus: "DRAFT" as unknown as "APPROVED" })], {
    market: "PAKISTAN",
    currency: "PKR",
    tier: "ORIGINAL",
    now: REF_NOW
  })
);
console.log("PASS 7. future/expired/unapproved books rejected");

// ---------------------------------------------------------------------------
// 8. Two overlapping active versions for the same market/currency/tier are
// rejected deterministically rather than picking one arbitrarily.
// ---------------------------------------------------------------------------
expectThrows("overlapping active versions rejected", () =>
  selectActivePriceBookEntry([makeBook({ version: "A" }), makeBook({ version: "B" })], {
    market: "PAKISTAN",
    currency: "PKR",
    tier: "ORIGINAL",
    now: REF_NOW
  })
);
console.log("PASS 8. overlapping active versions rejected");

// ---------------------------------------------------------------------------
// 9. No active book (empty set, or none covering the requested tier) fails closed.
// ---------------------------------------------------------------------------
expectThrows("empty book set fails closed", () =>
  selectActivePriceBookEntry([], { market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", now: REF_NOW })
);
expectThrows("book without the requested tier fails closed", () =>
  selectActivePriceBookEntry([makeBook({ entries: [] })], { market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", now: REF_NOW })
);
console.log("PASS 9. missing active book fails closed");

// ---------------------------------------------------------------------------
// automaticFxAllowed defense-in-depth: even if a future data source set this
// true, the selector must never honor it.
// ---------------------------------------------------------------------------
expectThrows("automaticFxAllowed:true is never honored", () =>
  selectActivePriceBookEntry([makeBook({ automaticFxAllowed: true as unknown as false })], {
    market: "PAKISTAN",
    currency: "PKR",
    tier: "ORIGINAL",
    now: REF_NOW
  })
);
console.log("PASS automaticFxAllowed defense-in-depth");

// ---------------------------------------------------------------------------
// Sanity: the real APPROVED_PRICE_BOOKS constant itself has exactly one
// version and exactly six entries (the owner-approved six, no more/less).
// ---------------------------------------------------------------------------
if (APPROVED_PRICE_BOOKS.length !== 1) throw new Error(`expected exactly one current PriceBook, found ${APPROVED_PRICE_BOOKS.length}`);
if (APPROVED_PRICE_BOOKS[0].version !== "PB-2026-08-09-TRIAL-V3" || APPROVED_PRICE_BOOKS[0].entries.length !== 14) throw new Error("V3 shape mismatch");
if (APPROVED_PRICE_BOOKS[0].automaticFxAllowed !== false) throw new Error("expected automaticFxAllowed:false on V3");
console.log("PASS real APPROVED_PRICE_BOOKS shape (one V3 catalog, FX disabled)");

console.log("priceBook.test.ts: all checks passed");
