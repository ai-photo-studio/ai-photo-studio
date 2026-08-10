import { PRINT_CATALOG, PRINT_CATALOG_VERSION, quotePrint } from "./printCatalog";

// Values sourced from `price book/prices.xlsx` (Sheet1, "photo printing +
// home delivery" table); 40x60 and Triple Canvas verified R9.5-P5O.
const expected = [
  ["4x6", 10000, 10, 25000], ["5x7", 15000, 5, 25000], ["6x8", 35000, 5, 25000],
  ["8x10", 50000, 3, 25000], ["8x12", 55000, 2, 25000], ["10x12", 55000, 2, 25000],
  ["12x18", 150000, 1, 25000], ["16x24", 250000, 1, 50000], ["20x30", 500000, 1, 50000],
  ["24x36", 750000, 1, 50000], ["30x40", 1500000, 1, 100000], ["40x60", 2000000, 1, 100000],
  ["Triple Canvas", 2500000, 1, 250000]
] as const;
if (PRINT_CATALOG_VERSION !== "PRINT-CATALOG-2026-08-10-TRIAL-V3") throw new Error("unexpected catalog version");
if (PRINT_CATALOG.length !== 13) throw new Error(`expected 13 PKR print catalog entries (12 original + Triple Canvas), got ${PRINT_CATALOG.length}`);
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

// R9.5-P5N: exact PriceBook-V3 + 4x6-qty-10 examples named by the task.
// Original 500 + 4x6x10 (1000) + delivery 250 = 1750.
const originalQuote = quotePrint(50000, "4x6", 10);
if (originalQuote.totalAmountMinor !== 175000) throw new Error(`Original 4x6x10 total mismatch: ${originalQuote.totalAmountMinor}`);
// 2x HD 1000 + 4x6x10 (1000) + delivery 250 = 2250.
const hd2xQuote = quotePrint(100000, "4x6", 10);
if (hd2xQuote.totalAmountMinor !== 225000) throw new Error(`2x HD 4x6x10 total mismatch: ${hd2xQuote.totalAmountMinor}`);
// 4x Ultra HD 1500 + 4x6x10 (1000) + delivery 250 = 2750.
const hd4xQuote = quotePrint(150000, "4x6", 10);
if (hd4xQuote.totalAmountMinor !== 275000) throw new Error(`4x Ultra HD 4x6x10 total mismatch: ${hd4xQuote.totalAmountMinor}`);

// Quantity change updates the quote (server recomputes from scratch every
// call; there is no cached/stale total to accidentally reuse).
const qty11 = quotePrint(50000, "4x6", 11);
if (qty11.printSubtotalMinor !== 110000 || qty11.totalAmountMinor !== 185000) throw new Error("quantity change did not update the quote");

// The quote function's signature has no parameter for a client-supplied
// total/amount at all -- there is nothing for a tampered client value to
// override. `createFixedOrder` (fixed-order.service.ts) independently never
// reads a client `totalAmountMinor`/`amountMinor`/print-subtotal field from
// its input DTO, only `tier`/`printSize`/`quantity`/`deliveryAddress`, so a
// forged total in the request body has no code path that could reach it.
if (quotePrint.length !== 3) throw new Error("quotePrint signature changed -- re-verify no client amount parameter was added");

// 40x60 corrected (previously an erroneous duplicate of 30x40's price).
const q40x60 = quotePrint(50000, "40x60", 1);
if (q40x60.printSubtotalMinor !== 2000000 || q40x60.totalAmountMinor !== 2150000) throw new Error(`40x60 quote mismatch: ${q40x60.totalAmountMinor}`);

// Triple Canvas: PKR 25000 unit, min 1, PKR 2500 delivery.
const qTripleCanvas = quotePrint(150000, "Triple Canvas", 1);
if (qTripleCanvas.printSubtotalMinor !== 2500000 || qTripleCanvas.deliveryFeeMinor !== 250000 || qTripleCanvas.totalAmountMinor !== 2900000) throw new Error(`Triple Canvas quote mismatch: ${qTripleCanvas.totalAmountMinor}`);

console.log("printCatalog.test.ts: exact catalog (including corrected 40x60 and new Triple Canvas), minimums, delivery, PKR 1750/2250/2750 examples, and quote arithmetic passed");
