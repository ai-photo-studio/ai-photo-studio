// R9.2-P1C-B: pure PriceBook selection/validation guard.
//
// No DB/network imports -- a plain function over injected data and an
// injected clock (`now`), so time-boundary behavior is deterministic and
// testable without depending on wall-clock timing. Mirrors the style of
// `../fixedOrder/fixedOrderGuards.ts` and `../payment/paymentReadiness.ts`.
import type { FixedOrderCurrency, Market } from "../fixedOrder/fixedOrderGuards";
import type { PriceBook, PriceBookEntry } from "./priceBook";

export class PriceBookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceBookValidationError";
  }
}

export interface PriceBookSelectionQuery {
  market: Market;
  currency: FixedOrderCurrency;
  tier: string;
  now: Date;
}

export interface PriceBookSelection {
  priceBook: PriceBook;
  entry: PriceBookEntry;
}

function isEffectiveAt(book: PriceBook, nowMs: number): boolean {
  const startsMs = Date.parse(book.effectiveStartsAt);
  if (!Number.isFinite(startsMs) || nowMs < startsMs) return false;
  if (book.effectiveEndsAt !== null) {
    const endsMs = Date.parse(book.effectiveEndsAt);
    if (!Number.isFinite(endsMs) || nowMs >= endsMs) return false;
  }
  return true;
}

/**
 * Selects the single active, approved PriceBook entry for a market/currency/
 * tier at a given instant. Fails closed (throws `PriceBookValidationError`)
 * for: no matching entry, more than one overlapping active version, a
 * not-yet-effective or expired book, an unapproved book, an invalid
 * market/currency pairing, or a non-positive/non-integer amount. Never
 * returns a partial or best-guess result.
 */
export function selectActivePriceBookEntry(
  books: readonly PriceBook[],
  query: PriceBookSelectionQuery
): PriceBookSelection {
  if ((query.market === "PAKISTAN" && query.currency !== "PKR") || (query.market === "INTERNATIONAL" && query.currency !== "USD")) {
    throw new PriceBookValidationError(
      `invalid market/currency pairing: market=${query.market} currency=${query.currency}`
    );
  }

  const nowMs = query.now.getTime();
  const matches: PriceBookSelection[] = [];
  for (const book of books) {
    if (book.approvalStatus !== "APPROVED") continue;
    if (book.automaticFxAllowed) continue; // defense-in-depth: this repo only ever authors automaticFxAllowed:false
    if (!isEffectiveAt(book, nowMs)) continue;
    const entry = book.entries.find(
      (candidate) => candidate.market === query.market && candidate.currency === query.currency && candidate.tier === query.tier
    );
    if (entry) matches.push({ priceBook: book, entry });
  }

  if (matches.length === 0) {
    throw new PriceBookValidationError(
      `no active, approved PriceBook entry for market=${query.market} currency=${query.currency} tier=${query.tier}`
    );
  }
  if (matches.length > 1) {
    throw new PriceBookValidationError(
      `overlapping active PriceBook versions for market=${query.market} currency=${query.currency} tier=${query.tier}: ${matches
        .map((m) => m.priceBook.version)
        .join(", ")}`
    );
  }

  const [selection] = matches;
  const { amountMinor } = selection.entry;
  if (!Number.isInteger(amountMinor) || amountMinor <= 0 || !Number.isSafeInteger(amountMinor)) {
    throw new PriceBookValidationError(`PriceBook entry amount must be a positive safe integer: ${amountMinor}`);
  }

  return selection;
}
