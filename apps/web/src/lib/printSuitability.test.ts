import assert from "node:assert/strict";
import test from "node:test";
import { calculatePrintSuitability, displayAspectRatio } from "./printSuitability";

test("1324x864 uses a concise decimal display and deterministic print PPI", () => {
  assert.equal(displayAspectRatio(1324, 864), "1.53:1 (≈ 3:2)");
  assert.deepEqual(calculatePrintSuitability(1324, 864, "4x6"), {
    size: "4x6", effectivePpi: 216, category: "Good", cropRequired: true
  });
  assert.equal(calculatePrintSuitability(1324, 864, "5x7")?.category, "Upscaling Recommended");
});

test("landscape, portrait, and square dimensions remain deterministic", () => {
  assert.equal(displayAspectRatio(1600, 900), "1.78:1");
  assert.equal(displayAspectRatio(900, 1600), "0.56:1");
  assert.equal(displayAspectRatio(1000, 1000), "1.00:1");
  assert.equal(calculatePrintSuitability(1000, 1000, "4x6")?.effectivePpi, 167);
});
