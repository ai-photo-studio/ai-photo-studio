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
// Real approved data: the six owner-approved prices resolve correctly (test 1).
// ---------------------------------------------------------------------------
{
  const provider = new ApprovedOfferProvider({ now: () => new Date("2026-08-03T00:00:01Z") });
  const pkOffers = expectOk("Pakistan offers resolve", () => provider.getDigitalOffers({ market: "PAKISTAN" }));
  if (!Array.isArray(pkOffers)) throw new Error("expected Pakistan offers to be available");
  const pkExpected: Record<string, number> = { ORIGINAL: 25000, HD_2X: 35000, HD_4X: 50000 };
  for (const tier of ALLOWED_DIGITAL_TIERS) {
    const offer = pkOffers.find((o) => o.tier === tier);
    if (!offer) throw new Error(`missing Pakistan offer for ${tier}`);
    if (offer.amountMinor !== pkExpected[tier]) throw new Error(`Pakistan ${tier}: expected ${pkExpected[tier]}, got ${offer.amountMinor}`);
    if (offer.currency !== "PKR") throw new Error(`Pakistan ${tier}: expected PKR, got ${offer.currency}`);
    if (offer.source !== "approved_pricebook") throw new Error(`Pakistan ${tier}: expected approved_pricebook source`);
    if (offer.priceBookVersion !== "PB-2026-08-03-v1") throw new Error(`Pakistan ${tier}: unexpected PriceBook version ${offer.priceBookVersion}`);
  }

  const intlOffers = expectOk("International offers resolve", () => provider.getDigitalOffers({ market: "INTERNATIONAL" }));
  if (!Array.isArray(intlOffers)) throw new Error("expected International offers to be available");
  const usdExpected: Record<string, number> = { ORIGINAL: 150, HD_2X: 250, HD_4X: 350 };
  for (const tier of ALLOWED_DIGITAL_TIERS) {
    const offer = intlOffers.find((o) => o.tier === tier);
    if (!offer) throw new Error(`missing International offer for ${tier}`);
    if (offer.amountMinor !== usdExpected[tier]) throw new Error(`International ${tier}: expected ${usdExpected[tier]}, got ${offer.amountMinor}`);
    if (offer.currency !== "USD") throw new Error(`International ${tier}: expected USD, got ${offer.currency}`);
  }
  console.log("PASS 1. six approved prices resolve correctly");
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
if (APPROVED_PRICE_BOOKS.length !== 1) throw new Error(`expected exactly 1 real PriceBook version, found ${APPROVED_PRICE_BOOKS.length}`);
if (APPROVED_PRICE_BOOKS[0].entries.length !== 6) throw new Error(`expected exactly 6 real PriceBook entries, found ${APPROVED_PRICE_BOOKS[0].entries.length}`);
if (APPROVED_PRICE_BOOKS[0].automaticFxAllowed !== false) throw new Error("expected automaticFxAllowed:false on the real PriceBook");
console.log("PASS real APPROVED_PRICE_BOOKS shape (1 version, 6 entries, automaticFxAllowed:false)");

console.log("priceBook.test.ts: all checks passed");
