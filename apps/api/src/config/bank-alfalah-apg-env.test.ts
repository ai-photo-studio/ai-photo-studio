import assert from "node:assert/strict";
import test from "node:test";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  WHATSAPP_VERIFY_TOKEN: "test",
  PAYMENT_GATEWAY_NAME: "manual",
  ADMIN_JWT_SECRET: "test-admin-jwt",
  JWT_SECRET: "test-jwt",
  STORAGE_PROVIDER: "mock",
  AI_PROVIDER: "mock"
};

async function loadWith(overrides: Record<string, string | undefined>) {
  const saved = process.env;
  const next = { ...process.env, ...baseEnv, ...overrides } as NodeJS.ProcessEnv;
  for (const key of Object.keys(next)) if (key.startsWith("BANK_ALFALAH_APG_") || key === "BANK_ALFALAH_PROVIDER") delete next[key];
  Object.assign(next, overrides);
  try {
    process.env = next;
    const modulePath = require.resolve("./env");
    delete require.cache[modulePath];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("./env").loadConfig() as import("./env").AppConfig;
  } finally {
    process.env = saved;
  }
}

const complete = {
  BANK_ALFALAH_PROVIDER: "apg",
  BANK_ALFALAH_APG_ENABLED: "true",
  BANK_ALFALAH_APG_MERCHANT_ID: "REDACTED-MERCHANT",
  BANK_ALFALAH_APG_STORE_ID: "REDACTED-STORE",
  BANK_ALFALAH_APG_MERCHANT_HASH: "REDACTED-HASH",
  BANK_ALFALAH_APG_USERNAME: "REDACTED-USERNAME",
  BANK_ALFALAH_APG_PASSWORD: "REDACTED-PASSWORD",
  BANK_ALFALAH_APG_AES_KEY: "0123456789abcdef",
  BANK_ALFALAH_APG_AES_IV: "fedcba9876543210"
};

test("APG defaults disabled with explicit provider none", async () => {
  const config = await loadWith({});
  assert.equal(config.bankAlfalahProvider, "none");
  assert.equal(config.bankAlfalahApg.enabled, false);
  assert.equal(config.bankAlfalahApg.baseUrl, "https://sandbox.bankalfalah.com");
});

test("APG cannot be enabled without explicitly selecting APG", async () => {
  await assert.rejects(() => loadWith({ BANK_ALFALAH_APG_ENABLED: "true" }));
});

test("APG enabled configuration requires every credential field", async () => {
  await assert.rejects(() => loadWith({ BANK_ALFALAH_PROVIDER: "apg", BANK_ALFALAH_APG_ENABLED: "true" }));
});

test("complete APG configuration parses without exposing credential values in preview", async () => {
  const config = await loadWith(complete);
  assert.equal(config.bankAlfalahProvider, "apg");
  assert.equal(config.bankAlfalahApg.merchantId, "REDACTED-MERCHANT");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const preview = require("./env").getConfigPreview(config) as unknown;
  assert.ok(!JSON.stringify(preview).includes("REDACTED-PASSWORD"));
  assert.ok(!JSON.stringify(preview).includes("REDACTED-HASH"));
});

test("APG cannot be enabled in production", async () => {
  await assert.rejects(() => loadWith({ ...complete, NODE_ENV: "production" }));
});
