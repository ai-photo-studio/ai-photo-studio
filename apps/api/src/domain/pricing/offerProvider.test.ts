import { FixtureOfferProvider, findOfferByTier } from "./offerProvider";

const provider = new FixtureOfferProvider();

// 7. Pakistan receives PKR offers only.
{
  const offers = provider.getDigitalOffers({ market: "PAKISTAN" });
  if (!Array.isArray(offers)) throw new Error("expected Pakistan offers to be available");
  if (offers.length !== 3) throw new Error(`expected 3 Pakistan tiers, got ${offers.length}`);
  for (const offer of offers) {
    if (offer.currency !== "PKR") throw new Error(`expected PKR, got ${offer.currency}`);
    if (offer.market !== "PAKISTAN") throw new Error(`expected PAKISTAN, got ${offer.market}`);
    if (!Number.isInteger(offer.amountMinor) || offer.amountMinor <= 0) {
      throw new Error(`expected a positive integer minor amount, got ${offer.amountMinor}`);
    }
  }
  const tiers = offers.map((o) => o.tier).sort();
  if (JSON.stringify(tiers) !== JSON.stringify(["HD_2X", "HD_4X", "ORIGINAL"])) {
    throw new Error(`unexpected tier set: ${JSON.stringify(tiers)}`);
  }
}

// 8. International receives USD offers only -- and since no approved USD
// price exists anywhere in the repository, "USD offers only" means a
// truthful unavailable state, never a fabricated PKR/USD mix or an invented
// number.
{
  const offers = provider.getDigitalOffers({ market: "INTERNATIONAL" });
  if (Array.isArray(offers)) throw new Error("expected INTERNATIONAL offers to be unavailable (no approved USD price)");
  if (offers.available !== false) throw new Error("expected available:false");
  if (!offers.reason) throw new Error("expected a truthful reason string");
}

// findOfferByTier helper
{
  const offers = provider.getDigitalOffers({ market: "PAKISTAN" });
  const original = findOfferByTier(offers, "ORIGINAL");
  if (!original || original.tier !== "ORIGINAL") throw new Error("expected to find ORIGINAL offer");
  const missing = findOfferByTier(offers, "NOT_A_TIER");
  if (missing !== null) throw new Error("expected null for an unknown tier");
  const unavailable = provider.getDigitalOffers({ market: "INTERNATIONAL" });
  if (findOfferByTier(unavailable, "ORIGINAL") !== null) {
    throw new Error("expected null when offers are unavailable");
  }
}

console.log("offer provider tests passed");
