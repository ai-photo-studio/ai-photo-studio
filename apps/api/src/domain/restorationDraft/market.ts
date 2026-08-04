// R9.2-P1A: server-derived market/currency from a customer-confirmed country.
//
// The client sends only a raw ISO 3166-1 alpha-2 country code plus an
// explicit confirmation flag -- never a market or currency value directly.
// The server is the sole authority translating country -> market/currency,
// per business rule: "IP may suggest country but customer must confirm it.
// Client never sends authoritative amount or currency."
import { validateMarketCurrencyPair, type FixedOrderCurrency, type Market } from "../fixedOrder/fixedOrderGuards";

export class MarketConfirmationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketConfirmationError";
  }
}

export interface DerivedMarket {
  market: Market;
  country: string;
  currency: FixedOrderCurrency;
}

/**
 * Pakistan (`PK`) maps to PAKISTAN/PKR. Every other well-formed ISO alpha-2
 * country code maps to INTERNATIONAL/USD (per this packet's "Supported
 * non-Pakistan country = INTERNATIONAL + USD only" rule) -- note that market
 * classification succeeding does not imply a purchasable offer exists for
 * that market; see `../pricing/offerProvider.ts` for the separate,
 * evidence-based pricing-availability boundary (USD has no approved price
 * yet, so INTERNATIONAL offers currently report unavailable regardless of
 * how country/market classification resolves here).
 */
export function deriveMarketFromCountry(countryCode: string): DerivedMarket {
  if (typeof countryCode !== "string") {
    throw new MarketConfirmationError("country is required");
  }
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    // R9.2-P2R-UPLOAD-SECURITY-AUDIT-A: the rejected value is echoed for
    // diagnostics, so it must be bounded -- an unbounded client string must
    // never be reflected verbatim into an error response or a log line.
    const echoed = normalized.slice(0, 16);
    throw new MarketConfirmationError(`country must be a 2-letter ISO country code, received: ${echoed}`);
  }

  const derived: DerivedMarket =
    normalized === "PK"
      ? { market: "PAKISTAN", country: normalized, currency: "PKR" }
      : { market: "INTERNATIONAL", country: normalized, currency: "USD" };

  validateMarketCurrencyPair(derived.market, derived.currency);
  return derived;
}

/** Throws unless the customer has explicitly confirmed their market/country (never inferred from IP alone). */
export function assertMarketConfirmed(confirmed: unknown): asserts confirmed is true {
  if (confirmed !== true) {
    throw new MarketConfirmationError("market/country must be explicitly confirmed by the customer before upload");
  }
}
