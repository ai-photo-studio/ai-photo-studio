// R9.2-P1C-B: server-owned digital-tier offers backed by the owner-approved
// PriceBook. Replaces FixtureOfferProvider as FixedOrderService's default
// provider -- FixtureOfferProvider itself is untouched and remains available
// for tests that need to prove fixture pricing stays permanently unapproved.
import { type DigitalOffer, type OfferProvider, type OfferQuery, type OffersUnavailable } from "./offerProvider";
import { APPROVED_PRICE_BOOKS, type PriceBook } from "./priceBook";
import { PriceBookValidationError, selectActivePriceBookEntry } from "./priceBookValidator";

const TIER_LABELS: Record<string, string> = {
  ORIGINAL: "Restored Original",
  HD_2X: "2x HD",
  HD_4X: "4x Ultra HD", HD_6X: "6x", HD_8X: "8x", HD_10X: "10x", HD_12X: "12x"
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  ORIGINAL: "Source resolution -- ideal for basic sharing",
  HD_2X: "2x enhanced -- sharp detail for listings",
  HD_4X: "Best for printing", HD_6X: "High-resolution enlargement", HD_8X: "High-resolution enlargement", HD_10X: "High-resolution enlargement", HD_12X: "Maximum enlargement"
};

export interface ApprovedOfferProviderOptions {
  /** Injectable clock for deterministic effective/expiry-window tests. Defaults to the real wall clock. */
  now?: () => Date;
  /** Injectable PriceBook set for tests. Defaults to the real owner-approved books. */
  books?: readonly PriceBook[];
}

export class ApprovedOfferProvider implements OfferProvider {
  private readonly now: () => Date;
  private readonly books: readonly PriceBook[];

  constructor(options: ApprovedOfferProviderOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.books = options.books ?? APPROVED_PRICE_BOOKS;
  }

  getDigitalOffers({ market }: OfferQuery): DigitalOffer[] | OffersUnavailable {
    const currency = market === "PAKISTAN" ? "PKR" : "USD";
    const offers: DigitalOffer[] = [];

    const nowMs = this.now().getTime();
    const activeEntries = this.books
      .filter((book) => Date.parse(book.effectiveStartsAt) <= nowMs && (book.effectiveEndsAt === null || nowMs < Date.parse(book.effectiveEndsAt)))
      .flatMap((book) => book.entries.filter((entry) => entry.market === market && entry.currency === currency))
      .map((entry) => entry.tier)
      .filter((tier, index, tiers) => tiers.indexOf(tier) === index);
    if (activeEntries.length === 0) return { available: false, reason: "no approved pricing for this market" };
    for (const tier of activeEntries) {
      let selection;
      try {
        selection = selectActivePriceBookEntry(this.books, { market, currency, tier, now: this.now() });
      } catch (error) {
        return {
          available: false,
          reason: error instanceof PriceBookValidationError ? error.message : "pricing is unavailable"
        };
      }
      offers.push({
        tier,
        label: TIER_LABELS[tier],
        market,
        currency,
        amountMinor: selection.entry.amountMinor,
        description: TIER_DESCRIPTIONS[tier],
        source: "approved_pricebook",
        priceBookVersion: selection.priceBook.version,
        approvalReference: selection.priceBook.approvalReference,
        effectiveAt: selection.priceBook.effectiveStartsAt
      });
    }

    return offers;
  }
}
