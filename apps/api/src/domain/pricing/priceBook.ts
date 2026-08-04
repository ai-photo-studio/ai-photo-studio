// R9.2-P1C-B: typed, versioned, owner-approved PriceBook.
//
// This module holds exactly one owner-approved record, entered verbatim from
// the owner's explicit PRICEBOOK_APPROVAL block (chat approval, not invented
// or auto-approved by any code in this repository):
//
//   version: PB-2026-08-03-v1
//   effectiveAt: 2026-08-03T00:00:00Z, expiresAt: NONE
//   approvedBy: Muhammad Nazim Saeed
//   approvalReference: OWNER-CHAT-2026-08-03-P1C-B-01
//   PKR: ORIGINAL 25000 / 2HD 35000 / 4HD 50000 (minor units)
//   USD: ORIGINAL 150 / 2HD 250 / 4HD 350 (minor units)
//   pricesIncludeTax: false, printingIncluded: false, automaticFxAllowed: false
//
// No code path in this repository may construct a PriceBook with
// approvalStatus other than "APPROVED" from real (non-test) data, and no
// code path may set automaticFxAllowed to anything but false -- USD entries
// above are independently owner-set values, never FX-derived from PKR.
import type { FixedOrderCurrency, Market } from "../fixedOrder/fixedOrderGuards";
import type { DigitalTier } from "./offerProvider";

export interface PriceBookEntry {
  market: Market;
  currency: FixedOrderCurrency;
  tier: DigitalTier;
  /** Integer minor-unit price. Never a float/major-unit value. */
  amountMinor: number;
}

export interface PriceBook {
  version: string;
  approvalStatus: "APPROVED";
  approvedBy: string;
  approvalReference: string;
  /** UTC ISO-8601. Inactive before this instant. */
  effectiveStartsAt: string;
  /** UTC ISO-8601, or null for no expiry. Inactive at/after this instant when set. */
  effectiveEndsAt: string | null;
  pricesIncludeTax: boolean;
  printingIncluded: boolean;
  /** Always false in this repository -- USD entries are independently owner-set, never FX-derived. */
  automaticFxAllowed: false;
  entries: readonly PriceBookEntry[];
}

export const APPROVED_PRICE_BOOKS: readonly PriceBook[] = [
  {
    version: "PB-2026-08-03-v1",
    approvalStatus: "APPROVED",
    approvedBy: "Muhammad Nazim Saeed",
    approvalReference: "OWNER-CHAT-2026-08-03-P1C-B-01",
    effectiveStartsAt: "2026-08-03T00:00:00Z",
    effectiveEndsAt: null,
    pricesIncludeTax: false,
    printingIncluded: false,
    automaticFxAllowed: false,
    entries: [
      { market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", amountMinor: 25000 },
      { market: "PAKISTAN", currency: "PKR", tier: "HD_2X", amountMinor: 35000 },
      { market: "PAKISTAN", currency: "PKR", tier: "HD_4X", amountMinor: 50000 },
      { market: "INTERNATIONAL", currency: "USD", tier: "ORIGINAL", amountMinor: 150 },
      { market: "INTERNATIONAL", currency: "USD", tier: "HD_2X", amountMinor: 250 },
      { market: "INTERNATIONAL", currency: "USD", tier: "HD_4X", amountMinor: 350 }
    ]
  }
];
