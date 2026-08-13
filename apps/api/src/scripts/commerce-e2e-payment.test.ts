import assert from "node:assert/strict";
import test from "node:test";

test("test payment seam refuses production and requires explicit mock mode", async () => {
  const originalNode = process.env.NODE_ENV;
  const originalMode = process.env.COMMERCE_E2E_TEST_MODE;
  const originalProvider = process.env.RESTORATION_PROVIDER;
  const originalPrelaunch = process.env.PRELAUNCH_MOCK_MODE;
  process.env.NODE_ENV = "production";
  process.env.COMMERCE_E2E_TEST_MODE = "true";
  process.env.RESTORATION_PROVIDER = "mock";
  delete process.env.PRELAUNCH_MOCK_MODE;
  await assert.rejects(() => import("./commerce-e2e-payment"), /unavailable when disabled/);
  process.env.NODE_ENV = originalNode;
  process.env.COMMERCE_E2E_TEST_MODE = originalMode;
  process.env.RESTORATION_PROVIDER = originalProvider;
  process.env.PRELAUNCH_MOCK_MODE = originalPrelaunch;
});

test("prelaunch mock mode permits the trusted mock payment verifier in production", async () => {
  const originalNode = process.env.NODE_ENV;
  const originalMode = process.env.COMMERCE_E2E_TEST_MODE;
  const originalProvider = process.env.RESTORATION_PROVIDER;
  const originalPrelaunch = process.env.PRELAUNCH_MOCK_MODE;
  process.env.NODE_ENV = "production";
  process.env.PRELAUNCH_MOCK_MODE = "true";
  process.env.RESTORATION_PROVIDER = "mock";
  delete process.env.COMMERCE_E2E_TEST_MODE;
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./commerce-e2e-payment.ts", import.meta.url), "utf8"));
  assert.match(source, /PRELAUNCH_MOCK_MODE/);
  process.env.NODE_ENV = originalNode;
  process.env.COMMERCE_E2E_TEST_MODE = originalMode;
  process.env.RESTORATION_PROVIDER = originalProvider;
  process.env.PRELAUNCH_MOCK_MODE = originalPrelaunch;
});

test("test payment script contains no external payment/provider host", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./commerce-e2e-payment.ts", import.meta.url), "utf8");
  assert.equal(/api\.replicate\.com|api\.runpod\.ai|bankalfalah|mastercard\.com/i.test(source), false);
});

test("prelaunch mode is an explicit server-side switch", async () => {
  const fs = await import("node:fs/promises");
  const [envSource, routeSource, indexSource] = await Promise.all([
    fs.readFile(new URL("../config/env.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../routes/restoration.routes.ts", import.meta.url), "utf8"),
    fs.readFile(new URL("../index.ts", import.meta.url), "utf8")
  ]);
  assert.match(envSource, /PRELAUNCH_MOCK_MODE/);
  assert.match(routeSource, /PRELAUNCH_MOCK_MODE/);
  assert.match(indexSource, /startP4BMockWorkerRunnerProcess/);
});
