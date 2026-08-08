export interface PrintCatalogEntry { size: string; currency: "PKR" | "USD"; unitPriceMinor: number; minQuantity: number; deliveryFeeMinor: number | null; blocker?: "INTERNATIONAL_PRINT_SHIPPING_REQUIRED"; }
const sizes = ["4x6", "5x7", "6x8", "8x10", "8x12", "10x12", "12x18", "16x24", "20x30", "24x36", "30x40", "40x60"] as const;
const mins = [10, 5, 5, 3, 2, 2, 1, 1, 1, 1, 1, 1];
const pkrUnits = [10000, 15000, 35000, 50000, 55000, 55000, 150000, 250000, 500000, 750000, 1500000, 1500000];
const pkrDelivery = [25000, 25000, 25000, 25000, 25000, 25000, 25000, 50000, 50000, 50000, 100000, 100000];
const usdUnits = [49, 149, 249, 399, 499, 599, 1199, 1899, 2999, 3999, 6999, 9999];
export const PRINT_CATALOG_VERSION = "PRINT-CATALOG-2026-08-09-TRIAL-V2";
export const PRINT_CATALOG: readonly PrintCatalogEntry[] = sizes.map((size, i) => ({ size, currency: "PKR", unitPriceMinor: pkrUnits[i], minQuantity: mins[i], deliveryFeeMinor: pkrDelivery[i] }));
export const INTERNATIONAL_PRINT_CATALOG: readonly PrintCatalogEntry[] = sizes.map((size, i) => ({ size, currency: "USD", unitPriceMinor: usdUnits[i], minQuantity: mins[i], deliveryFeeMinor: null, blocker: "INTERNATIONAL_PRINT_SHIPPING_REQUIRED" }));
export function publicPrintCatalog() { return [...PRINT_CATALOG, ...INTERNATIONAL_PRINT_CATALOG].map((item) => ({ catalogVersion: PRINT_CATALOG_VERSION, size: item.size, unitAmountMinor: item.unitPriceMinor, currency: item.currency, minimumQuantity: item.minQuantity, deliveryAmountMinor: item.deliveryFeeMinor, blocker: item.blocker })); }
export function quotePrint(digitalAmountMinor: number, size: string, quantity: number, currency: "PKR" | "USD" = "PKR") {
  const entry = [...PRINT_CATALOG, ...INTERNATIONAL_PRINT_CATALOG].find((item) => item.size === size && item.currency === currency);
  if (!entry) throw new Error("unknown print size");
  if (!Number.isSafeInteger(quantity) || quantity < entry.minQuantity) throw new Error("quantity below catalog minimum");
  if (entry.deliveryFeeMinor === null) throw new Error("INTERNATIONAL_PRINT_SHIPPING_REQUIRED");
  return { digitalAmountMinor, printSubtotalMinor: entry.unitPriceMinor * quantity, deliveryFeeMinor: entry.deliveryFeeMinor, totalAmountMinor: digitalAmountMinor + entry.unitPriceMinor * quantity + entry.deliveryFeeMinor };
}
