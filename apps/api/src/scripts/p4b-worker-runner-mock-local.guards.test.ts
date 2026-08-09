import assert from "node:assert/strict";
import test from "node:test";

async function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) original[key] = process.env[key];
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// Every test dynamically re-imports the module under fresh env so the guard
// evaluation order (NODE_ENV -> COMMERCE_E2E_TEST_MODE -> RESTORATION_PROVIDER)
// is exercised exactly as a real process boot would see it.
async function freshImport() {
  const url = `./p4b-worker-runner-mock-local?t=${Date.now()}-${Math.random()}`;
  return import(url);
}

test("mock P4B worker runner refuses to start in production, even with test flags set", async () => {
  await withEnv(
    { NODE_ENV: "production", COMMERCE_E2E_TEST_MODE: "true", RESTORATION_PROVIDER: "mock" },
    async () => {
      const mod = await freshImport();
      await assert.rejects(() => mod.startP4BMockWorkerRunnerProcess(), /NODE_ENV=production/);
    }
  );
});

test("mock P4B worker runner refuses to start without explicit COMMERCE_E2E_TEST_MODE=true", async () => {
  await withEnv(
    { NODE_ENV: "test", COMMERCE_E2E_TEST_MODE: undefined, RESTORATION_PROVIDER: "mock" },
    async () => {
      const mod = await freshImport();
      await assert.rejects(() => mod.startP4BMockWorkerRunnerProcess(), /COMMERCE_E2E_TEST_MODE=true explicitly/);
    }
  );
});

test("mock P4B worker runner refuses to start against RESTORATION_PROVIDER=replicate", async () => {
  await withEnv(
    {
      NODE_ENV: "test",
      COMMERCE_E2E_TEST_MODE: "true",
      RESTORATION_PROVIDER: "replicate",
      DATABASE_URL: "postgresql://127.0.0.1:5432/guard-test-placeholder",
      REDIS_URL: "redis://127.0.0.1:6399",
      WHATSAPP_VERIFY_TOKEN: "guard-test",
      PAYMENT_GATEWAY_NAME: "manual",
      AI_PROVIDER: "mock",
      AI_PROVIDER_NAME: "mock",
      STORAGE_PROVIDER: "mock",
      ADMIN_JWT_SECRET: "guard-test-admin-secret",
      JWT_SECRET: "guard-test-jwt-secret"
    },
    async () => {
      const mod = await freshImport();
      await assert.rejects(() => mod.startP4BMockWorkerRunnerProcess(), /RESTORATION_PROVIDER must be "mock"/);
    }
  );
});

test("mock P4B worker runner source contains no external payment/provider host", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./p4b-worker-runner-mock-local.ts", import.meta.url), "utf8");
  assert.equal(/api\.replicate\.com|api\.runpod\.ai|bankalfalah|mastercard\.com|api\.thannow\.com/i.test(source), false);
});

test("mock P4B worker runner never imports the payment-verification-queue module", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./p4b-worker-runner-mock-local.ts", import.meta.url), "utf8");
  assert.equal(/from\s+["']\.\.\/services\/p4a-payment-verified-execution-queue\.service["']/.test(source), false);
});
