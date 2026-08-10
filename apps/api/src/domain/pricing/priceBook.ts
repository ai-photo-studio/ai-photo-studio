import type { FixedOrderCurrency, Market } from "../fixedOrder/fixedOrderGuards";
import type { DigitalTier } from "./offerProvider";

export interface PriceBookEntry { market: Market; currency: FixedOrderCurrency; tier: DigitalTier; amountMinor: number; }
export interface PriceBook { version: string; approvalStatus: "APPROVED"; approvedBy: string; approvalReference: string; effectiveStartsAt: string; effectiveEndsAt: string | null; pricesIncludeTax: boolean; printingIncluded: boolean; automaticFxAllowed: false; entries: readonly PriceBookEntry[]; }

export const CURRENT_PRICE_BOOK_VERSION = "PB-2026-08-09-TRIAL-V3";
const tiers: readonly DigitalTier[] = ["ORIGINAL", "HD_2X", "HD_4X", "HD_6X", "HD_8X", "HD_10X", "HD_12X"];
const pkr = [50000, 100000, 150000, 250000, 350000, 400000, 500000];
const usd = [199, 299, 499, 699, 899, 1099, 1299];
export const CURRENT_PRICE_BOOK: PriceBook = {
  version: CURRENT_PRICE_BOOK_VERSION,
  approvalStatus: "APPROVED",
  approvedBy: "Owner pre-production price reset",
  approvalReference: "OWNER-P4B4-2026-08-09",
  effectiveStartsAt: "2026-08-08T00:00:00Z",
  effectiveEndsAt: null,
  pricesIncludeTax: false,
  printingIncluded: false,
  automaticFxAllowed: false,
  entries: [
    ...tiers.map((tier, index) => ({ market: "PAKISTAN" as const, currency: "PKR" as const, tier, amountMinor: pkr[index] })),
    ...tiers.map((tier, index) => ({ market: "INTERNATIONAL" as const, currency: "USD" as const, tier, amountMinor: usd[index] }))
  ]
};
export const APPROVED_PRICE_BOOKS: readonly PriceBook[] = [CURRENT_PRICE_BOOK];
