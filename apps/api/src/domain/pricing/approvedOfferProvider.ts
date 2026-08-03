// R9.2-P1C-B: server-owned digital-tier offers backed by the owner-approved
// PriceBook. Replaces FixtureOfferProvider as FixedOrderService's default
// provider -- FixtureOfferProvider itself is untouched and remains available
// for tests that need to prove fixture pricing stays permanently unapproved.
import { ALLOWED_DIGITAL_TIERS, type DigitalOffer, type OfferProvider, type OfferQuery, type OffersUnavailable } from "./offerProvider";
import { APPROVED_PRICE_BOOKS, type PriceBook } from "./priceBook";
import { PriceBookValidationError, selectActivePriceBookEntry } from "./priceBookValidator";

const TIER_LABELS: Record<string, string> = {
  ORIGINAL: "Original",
  HD_2X: "2HD",
  HD_4X: "4HD"
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  ORIGINAL: "Source resolution -- ideal for basic sharing",
  HD_2X: "2x enhanced -- sharp detail for listings",
  HD_4X: "4x enhanced -- premium print ready"
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

    for (const tier of ALLOWED_DIGITAL_TIERS) {
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
