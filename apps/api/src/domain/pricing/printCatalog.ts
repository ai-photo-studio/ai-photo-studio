export interface PrintCatalogEntry { size: string; currency: "PKR" | "USD"; unitPriceMinor: number; minQuantity: number; deliveryFeeMinor: number | null; blocker?: "INTERNATIONAL_PRINT_SHIPPING_REQUIRED"; }
// Sourced from `price book/prices.xlsx` (Sheet1, "photo printing + home
// delivery" table). USD prices exist only for the 12 sizes that table
// carried before this revision -- there is no owner-approved USD price for
// Triple Canvas, so it is PKR-only (international print is fail-closed via
// INTERNATIONAL_PRINT_SHIPPING_REQUIRED regardless, so this has no live
// customer effect; it only avoids inventing a number the source doesn't
// have).
const sizes = ["4x6", "5x7", "6x8", "8x10", "8x12", "10x12", "12x18", "16x24", "20x30", "24x36", "30x40", "40x60"] as const;
const mins = [10, 5, 5, 3, 2, 2, 1, 1, 1, 1, 1, 1];
// R9.5-P5O: 40x60 corrected from an erroneous 1500000 (duplicated from
// 30x40) to the workbook's actual 2000000 (PKR 20000).
const pkrUnits = [10000, 15000, 35000, 50000, 55000, 55000, 150000, 250000, 500000, 750000, 1500000, 2000000];
const pkrDelivery = [25000, 25000, 25000, 25000, 25000, 25000, 25000, 50000, 50000, 50000, 100000, 100000];
const usdUnits = [49, 149, 249, 399, 499, 599, 1199, 1899, 2999, 3999, 6999, 9999];
// R9.5-P5O: Triple Canvas added -- workbook lists it twice (the main size
// table and the "Premium Triple Canvas" bulk-package block), consistently
// at PKR 25000 unit price, minimum 1, PKR 2500 delivery.
const TRIPLE_CANVAS_PKR_UNIT_MINOR = 2500000;
const TRIPLE_CANVAS_MIN_QUANTITY = 1;
const TRIPLE_CANVAS_PKR_DELIVERY_MINOR = 250000;
export const PRINT_CATALOG_VERSION = "PRINT-CATALOG-2026-08-10-TRIAL-V3";
export const PRINT_CATALOG: readonly PrintCatalogEntry[] = [
  ...sizes.map((size, i) => ({ size, currency: "PKR" as const, unitPriceMinor: pkrUnits[i], minQuantity: mins[i], deliveryFeeMinor: pkrDelivery[i] })),
  { size: "Triple Canvas", currency: "PKR" as const, unitPriceMinor: TRIPLE_CANVAS_PKR_UNIT_MINOR, minQuantity: TRIPLE_CANVAS_MIN_QUANTITY, deliveryFeeMinor: TRIPLE_CANVAS_PKR_DELIVERY_MINOR }
];
export const INTERNATIONAL_PRINT_CATALOG: readonly PrintCatalogEntry[] = sizes.map((size, i) => ({ size, currency: "USD", unitPriceMinor: usdUnits[i], minQuantity: mins[i], deliveryFeeMinor: null, blocker: "INTERNATIONAL_PRINT_SHIPPING_REQUIRED" }));
export function publicPrintCatalog() { return [...PRINT_CATALOG, ...INTERNATIONAL_PRINT_CATALOG].map((item) => ({ catalogVersion: PRINT_CATALOG_VERSION, size: item.size, unitAmountMinor: item.unitPriceMinor, currency: item.currency, minimumQuantity: item.minQuantity, deliveryAmountMinor: item.deliveryFeeMinor, blocker: item.blocker })); }
export function quotePrint(digitalAmountMinor: number, size: string, quantity: number, currency: "PKR" | "USD" = "PKR") {
  const entry = [...PRINT_CATALOG, ...INTERNATIONAL_PRINT_CATALOG].find((item) => item.size === size && item.currency === currency);
  if (!entry) throw new Error("unknown print size");
  if (!Number.isSafeInteger(quantity) || quantity < entry.minQuantity) throw new Error("quantity below catalog minimum");
  if (quantity > 10) throw new Error("quantity exceeds maximum of 10");
  if (entry.deliveryFeeMinor === null) throw new Error("INTERNATIONAL_PRINT_SHIPPING_REQUIRED");
  return { digitalAmountMinor, printSubtotalMinor: entry.unitPriceMinor * quantity, deliveryFeeMinor: entry.deliveryFeeMinor, totalAmountMinor: digitalAmountMinor + entry.unitPriceMinor * quantity + entry.deliveryFeeMinor };
}
