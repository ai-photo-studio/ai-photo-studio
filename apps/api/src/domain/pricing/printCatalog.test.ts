import { PRINT_CATALOG, PRINT_CATALOG_VERSION, quotePrint } from "./printCatalog";

const expected = [
  ["4x6", 10000, 10, 25000], ["5x7", 15000, 5, 25000], ["6x8", 35000, 5, 25000],
  ["8x10", 50000, 3, 25000], ["8x12", 55000, 2, 25000], ["10x12", 55000, 2, 25000],
  ["12x18", 150000, 1, 25000], ["16x24", 250000, 1, 50000], ["20x30", 500000, 1, 50000],
  ["24x36", 750000, 1, 50000], ["30x40", 1500000, 1, 100000], ["40x60", 1500000, 1, 100000]
] as const;
if (PRINT_CATALOG_VERSION !== "PRINT-CATALOG-2026-08-09-TRIAL-V2") throw new Error("unexpected catalog version");
for (const [size, unit, min, delivery] of expected) {
  const item = PRINT_CATALOG.find((entry) => entry.size === size);
  if (!item || item.unitPriceMinor !== unit || item.minQuantity !== min || item.deliveryFeeMinor !== delivery) throw new Error(`catalog mismatch: ${size}`);
}
const quote = quotePrint(150000, "12x18", 2);
if (quote.printSubtotalMinor !== 300000 || quote.deliveryFeeMinor !== 25000 || quote.totalAmountMinor !== 475000) throw new Error("quote arithmetic mismatch");
if (quote.totalAmountMinor !== quote.digitalAmountMinor + quote.printSubtotalMinor + quote.deliveryFeeMinor) throw new Error("server quote formula mismatch");
if (Object.prototype.hasOwnProperty.call(quote, "clientAmountMinor")) throw new Error("quote must not trust a client amount");
const usdQuote = (() => { try { return quotePrint(199, "4x6", 10, "USD"); } catch (error) { return error; } })();
if (!(usdQuote instanceof Error) || usdQuote.message !== "INTERNATIONAL_PRINT_SHIPPING_REQUIRED") throw new Error("international shipping must fail closed");
for (const bad of [{ size: "unknown", quantity: 1 }, { size: "4x6", quantity: 9 }]) {
  try { quotePrint(50000, bad.size, bad.quantity); throw new Error("invalid print selection accepted"); } catch (error) { if (!(error instanceof Error)) throw error; }
}
console.log("printCatalog.test.ts: exact catalog, minimums, delivery and quote arithmetic passed");
