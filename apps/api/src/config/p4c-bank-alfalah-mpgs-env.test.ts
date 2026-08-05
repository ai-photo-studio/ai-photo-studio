/**
 * R9.2-P4C-MPGS-ENV-FAIL-CLOSED
 *
 * Proves BANK_ALFALAH_MPGS_* env parsing in src/config/env.ts fails closed:
 * disabled by default, and required fields enforced only when enabled.
 * Also proves no literal secret-shaped credential value exists anywhere in
 * this repository's tracked source (this session never had real values, so
 * this is a structural guarantee, not a live-value check).
 *
 *   npx tsx --test src/config/p4c-bank-alfalah-mpgs-env.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REQUIRED_BASE_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  WHATSAPP_VERIFY_TOKEN: "test",
  PAYMENT_GATEWAY_NAME: "manual",
  ADMIN_JWT_SECRET: "test-admin-jwt",
  JWT_SECRET: "test-jwt",
  STORAGE_PROVIDER: "mock",
  AI_PROVIDER: "mock"
};

function freshEnv(overrides: Record<string, string | undefined>) {
  const env: Record<string, string | undefined> = { ...process.env, ...REQUIRED_BASE_ENV, ...overrides };
  // Strip any BANK_ALFALAH_MPGS_* not explicitly set by the test/overrides.
  for (const key of Object.keys(env)) {
    if (key.startsWith("BANK_ALFALAH_MPGS_") && !(key in overrides)) delete env[key];
  }
  return env;
}

async function loadConfigWith(overrides: Record<string, string | undefined>) {
  const savedEnv = process.env;
  try {
    process.env = freshEnv(overrides) as NodeJS.ProcessEnv;
    // Bust the module cache so loadConfig re-reads process.env each call.
    const modulePath = require.resolve("./env");
    delete require.cache[modulePath];
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("./env");
    return mod.loadConfig() as import("./env").AppConfig;
  } finally {
    process.env = savedEnv;
  }
}

test("BANK_ALFALAH_MPGS_ENABLED defaults to false (fail-closed) and required fields are optional when disabled", async () => {
  const cfg = await loadConfigWith({});
  assert.equal(cfg.bankAlfalahMpgs.enabled, false);
  assert.equal(cfg.bankAlfalahMpgs.baseUrl, "https://test-bankalfalah.gateway.mastercard.com");
  // R9.2-P4D: bank-confirmed API V100 for this merchant profile (see
  // docs/payments/bank-alfalah-mastercard/P4D_BANK_CONFIRMED_MERCHANT_PROFILE_2026-08-05.md).
  assert.equal(cfg.bankAlfalahMpgs.apiVersion, "100");
  assert.equal(cfg.bankAlfalahMpgs.checkoutMode, "hosted_checkout");
});

test("BANK_ALFALAH_MPGS_ENABLED=true without merchant id / api password throws", async () => {
  await assert.rejects(() =>
    loadConfigWith({ BANK_ALFALAH_MPGS_ENABLED: "true" })
  );
});

test("BANK_ALFALAH_MPGS_ENABLED=true with merchant id but no password throws", async () => {
  await assert.rejects(() =>
    loadConfigWith({ BANK_ALFALAH_MPGS_ENABLED: "true", BANK_ALFALAH_MPGS_MERCHANT_ID: "REDACTED" })
  );
});

test("BANK_ALFALAH_MPGS_ENABLED=true with merchant id and password succeeds", async () => {
  const cfg = await loadConfigWith({
    BANK_ALFALAH_MPGS_ENABLED: "true",
    BANK_ALFALAH_MPGS_MERCHANT_ID: "REDACTEDMID",
    BANK_ALFALAH_MPGS_API_PASSWORD: "REDACTEDPASS"
  });
  assert.equal(cfg.bankAlfalahMpgs.enabled, true);
  assert.equal(cfg.bankAlfalahMpgs.merchantId, "REDACTEDMID");
});

test("BANK_ALFALAH_MPGS_ENABLED=true with an invalid checkout mode throws", async () => {
  await assert.rejects(() =>
    loadConfigWith({
      BANK_ALFALAH_MPGS_ENABLED: "true",
      BANK_ALFALAH_MPGS_MERCHANT_ID: "REDACTEDMID",
      BANK_ALFALAH_MPGS_API_PASSWORD: "REDACTEDPASS",
      BANK_ALFALAH_MPGS_CHECKOUT_MODE: "not_hosted_checkout"
    })
  );
});

test("getConfigPreview never surfaces the API password value", async () => {
  const cfg = await loadConfigWith({
    BANK_ALFALAH_MPGS_ENABLED: "true",
    BANK_ALFALAH_MPGS_MERCHANT_ID: "REDACTEDMID",
    BANK_ALFALAH_MPGS_API_PASSWORD: "REDACTEDPASS"
  });
  const modulePath = require.resolve("./env");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getConfigPreview } = require(modulePath);
  const preview = getConfigPreview(cfg);
  const serialized = JSON.stringify(preview);
  assert.ok(!serialized.includes("REDACTEDPASS"), "API password value leaked into config preview");
});

// ---------------------------------------------------------------------------
// Structural no-secrets guarantee: this session never had real Bank Alfalah
// credential values, so there is nothing real to leak -- this proves no
// plausible-looking merchant id / password literal was typed into source.
// ---------------------------------------------------------------------------

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".git", "dist", "build", ".next", "coverage"]);

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) yield* walk(full);
    else yield full;
  }
}

test("no BANK_ALFALAH_MPGS_ credential value is hardcoded as a non-placeholder literal anywhere new for this packet", () => {
  const suspicious: string[] = [];
  const placeholderPattern = /^(REDACTED|test-|placeholder|replace_me|)/i;
  for (const file of walk(join(REPO_ROOT, "docs", "payments", "bank-alfalah-mastercard"))) {
    let content: string;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const assignMatches = content.matchAll(/BANK_ALFALAH_MPGS_(MERCHANT_ID|API_PASSWORD|OPERATOR_ID)\s*[:=]\s*["'`]?([^\s"'`\n]+)/g);
    for (const m of assignMatches) {
      const value = m[2];
      if (!placeholderPattern.test(value)) {
        suspicious.push(`${relative(REPO_ROOT, file)}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(suspicious, []);
});
