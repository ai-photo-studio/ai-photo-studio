import assert from "node:assert/strict";
import test from "node:test";

test("test payment seam refuses production and requires explicit mock mode", async () => {
  const originalNode = process.env.NODE_ENV;
  const originalMode = process.env.COMMERCE_E2E_TEST_MODE;
  const originalProvider = process.env.RESTORATION_PROVIDER;
  process.env.NODE_ENV = "production";
  process.env.COMMERCE_E2E_TEST_MODE = "true";
  process.env.RESTORATION_PROVIDER = "mock";
  await assert.rejects(() => import("./commerce-e2e-payment"), /unavailable in production/);
  process.env.NODE_ENV = originalNode;
  process.env.COMMERCE_E2E_TEST_MODE = originalMode;
  process.env.RESTORATION_PROVIDER = originalProvider;
});

test("test payment script contains no external payment/provider host", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./commerce-e2e-payment.ts", import.meta.url), "utf8");
  assert.equal(/api\.replicate\.com|api\.runpod\.ai|bankalfalah|mastercard\.com/i.test(source), false);
});
