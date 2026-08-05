// R9.2-P1A: server-owned digital-tier offer pricing.
//
// PRICING AUDIT (recorded here, not invented): a repository-wide search
// found no approved/live price book, no `PriceBook`/`Offer` model or data,
// and no owner-confirmed USD figure anywhere. The only PKR numbers that
// exist anywhere in the repository are the hardcoded `SINGLE_RESOLUTION_TIERS`
// demo constants in `apps/web/src/pages/RestoreNewPage.tsx` (250/350/500 PKR
// for Original/2HD/4HD) behind that page's own `IS_DEMO_MODE = true` flag --
// these are demo/local fixture values, not an owner-approved price book.
//
// Per this packet's pricing rule ("do not invent PKR or USD prices; if
// approved live prices do not exist, add a server-owned offer-provider
// interface, use explicit test/local fixtures only, keep production offers
// feature-disabled for markets with no approved price, and report owner
// pricing as a blocker"):
//   - PAKISTAN/PKR: served from an explicitly-labeled local fixture (the
//     same non-invented numbers above), so the free-upload -> preview ->
//     select -> review flow required by this packet is fully testable and
//     usable end to end.
//   - INTERNATIONAL/USD: NO fixture exists, because inventing one would
//     violate the "do not invent" rule with zero repository evidence to
//     anchor it. `getDigitalOffers` returns `{ available: false }` for
//     INTERNATIONAL, and every layer above (service/controller/UI) must
//     surface this truthfully as "pricing unavailable", never a fabricated
//     price. Real USD pricing is an **owner-approval blocker**, recorded in
//     AI_code_audit_report_RI.md's R9.2-P1A section.
//
// UPDATE (2026-08-03, R9.2-P1C-B): the above was the correct state at the
// time this file (and its FixtureOfferProvider) was written -- it is
// preserved verbatim as a dated historical record and must not be edited.
// It is no longer the current state: the owner subsequently approved a real
// PriceBook (`PB-2026-08-03-v1`, see `priceBook.ts`) covering BOTH PKR and
// USD. `ApprovedOfferProvider` (`approvedOfferProvider.ts`) is the correct,
// current server-owned offer provider for both markets and returns real USD
// offers from that approved PriceBook. `FixtureOfferProvider` below is
// retained only for tests that must exercise unapproved/local-fixture
// pricing on purpose (e.g. proving fixture data never satisfies
// `pricingApproved`); it must not be used as a live/production provider.
import type { FixedOrderCurrency, Market } from "../fixedOrder/fixedOrderGuards";

export type DigitalTier = "ORIGINAL" | "HD_2X" | "HD_4X";

export const ALLOWED_DIGITAL_TIERS: readonly DigitalTier[] = ["ORIGINAL", "HD_2X", "HD_4X"];

export interface DigitalOffer {
  tier: DigitalTier;
  label: string;
  market: Market;
  currency: FixedOrderCurrency;
  /** Integer minor-unit price (e.g. paisa for PKR). Never a float/major-unit value. */
  amountMinor: number;
  description: string;
  /**
   * Identifies this offer's provenance. "local_fixture" is demo/local data,
   * never owner-approved. "approved_pricebook" (R9.2-P1C-B) is a real,
   * owner-approved PriceBook entry -- the only source that may ever set
   * `pricingApproved: true` on a FixedOrderItem.
   */
  source: "local_fixture" | "approved_pricebook";
  /** Present only for source: "approved_pricebook" -- the PriceBook version this offer was resolved from. */
  priceBookVersion?: string;
  /** Present only for source: "approved_pricebook" -- the owner approval reference for that PriceBook version. */
  approvalReference?: string;
  /** Present only for source: "approved_pricebook" -- the PriceBook's UTC ISO-8601 effective-start timestamp. */
  effectiveAt?: string;
}

export interface OffersUnavailable {
  available: false;
  reason: string;
}

export interface OfferQuery {
  market: Market;
}

export interface OfferProvider {
  getDigitalOffers(query: OfferQuery): DigitalOffer[] | OffersUnavailable;
}

const PKR_FIXTURE_OFFERS: readonly DigitalOffer[] = [
  {
    tier: "ORIGINAL",
    label: "Original",
    market: "PAKISTAN",
    currency: "PKR",
    amountMinor: 25000,
    description: "Source resolution -- ideal for basic sharing",
    source: "local_fixture"
  },
  {
    tier: "HD_2X",
    label: "2HD",
    market: "PAKISTAN",
    currency: "PKR",
    amountMinor: 35000,
    description: "2x enhanced -- sharp detail for listings",
    source: "local_fixture"
  },
  {
    tier: "HD_4X",
    label: "4HD",
    market: "PAKISTAN",
    currency: "PKR",
    amountMinor: 50000,
    description: "4x enhanced -- premium print ready",
    source: "local_fixture"
  }
];

export class FixtureOfferProvider implements OfferProvider {
  getDigitalOffers({ market }: OfferQuery): DigitalOffer[] | OffersUnavailable {
    if (market === "PAKISTAN") {
      return PKR_FIXTURE_OFFERS.slice();
    }
    return {
      available: false,
      reason: "USD pricing has not been approved yet; International digital offers are unavailable."
    };
  }
}

export function findOfferByTier(
  offers: DigitalOffer[] | OffersUnavailable,
  tier: string
): DigitalOffer | null {
  if (!Array.isArray(offers)) return null;
  return offers.find((offer) => offer.tier === tier) ?? null;
}
