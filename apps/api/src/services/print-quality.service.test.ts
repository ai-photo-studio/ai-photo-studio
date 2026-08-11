import assert from "node:assert/strict";
import test from "node:test";
import { effectivePpiForPrint, minimumTierForPrint, qualitySurchargeForLines, requiredTierSurcharge } from "./print-quality.service";

const offers = ["ORIGINAL", "HD_2X", "HD_4X", "HD_6X", "HD_8X", "HD_10X", "HD_12X"].map((tier, index) => ({ tier: tier as never, amountMinor: [50000, 100000, 150000, 250000, 350000, 400000, 500000][index] }));

test("4x master supports 4x6 and 8x10 without an image-quality surcharge", () => {
  assert.equal(minimumTierForPrint(1324, 864, "4x6"), "ORIGINAL");
  assert.equal(minimumTierForPrint(1324, 864, "8x10"), "HD_2X");
  assert.equal(requiredTierSurcharge("HD_4X", "HD_2X", offers), 0);
  assert.ok((effectivePpiForPrint(1324, 864, "8x10", "HD_4X") ?? 0) >= 200);
});

test("insufficient quality requires the full required tier price, not a difference", () => {
  assert.equal(requiredTierSurcharge("ORIGINAL", "HD_4X", offers), 150000);
  assert.notEqual(requiredTierSurcharge("ORIGINAL", "HD_4X", offers), 100000);
});

test("multiple lines charge one highest-tier quality surcharge", () => {
  assert.equal(qualitySurchargeForLines("HD_2X", ["HD_4X", "HD_4X", "HD_4X"], offers), 150000);
  assert.equal(qualitySurchargeForLines("HD_2X", ["HD_4X", "HD_8X"], offers), 350000);
  assert.equal(qualitySurchargeForLines("HD_8X", ["HD_4X", "HD_8X"], offers), 0);
});

test("canvas without documented dimensions remains unresolved", () => {
  assert.equal(minimumTierForPrint(1324, 864, "Triple Canvas"), null);
});
