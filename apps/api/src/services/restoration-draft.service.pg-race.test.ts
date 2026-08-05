/**
 * R9.2-P6C-CUSTOMER-MVP-FLOW-VERIFY-REAL-POSTGRES-RACE
 *
 * Proves `RestorationDraftService` (apps/api/src/services/restoration-draft.service.ts)
 * against a REAL, disposable, local PostgreSQL instance -- same fail-closed
 * loopback-only guard as the other R9.2 pg-race tests.
 *
 *   DISPOSABLE_DATABASE_URL="postgresql://user:pass@127.0.0.1:PORT/db" \
 *     npx tsx --test src/services/restoration-draft.service.pg-race.test.ts
 *
 * Every row it creates is prefixed `p6c-race-` and is deleted in the final
 * teardown test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const RAW_URL = process.env.DISPOSABLE_DATABASE_URL;

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!RAW_URL) {
  fail("DISPOSABLE_DATABASE_URL is required. Refusing to fall back to DATABASE_URL or any default.");
}

const parsedUrl = (() => {
  try {
    return new URL(RAW_URL);
  } catch {
    return fail("DISPOSABLE_DATABASE_URL is not a valid URL.");
  }
})();

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
if (!ALLOWED_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
  fail(`refusing non-loopback host "${parsedUrl.hostname}". Only localhost/127.0.0.1/::1 are permitted.`);
}
const BLOCKED_PATTERNS = [
  /neon\.tech/i,
  /supabase/i,
  /amazonaws/i,
  /northflank/i,
  /render\.com/i,
  /railway\.app/i,
  /googleapis/i,
  /database\.windows\.net/i,
  /planetscale/i,
  /cockroachlabs/i
];
if (BLOCKED_PATTERNS.some((p) => p.test(RAW_URL))) {
  fail("refusing a URL matching a known managed/production database provider pattern.");
}

process.env.DATABASE_URL = RAW_URL;

let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

async function loadServiceModule() {
  return import("./restoration-draft.service");
}

const clientA = new PrismaClient({ datasources: { db: { url: RAW_URL } } });
const createdDraftIds: string[] = [];

// A 1x1 transparent PNG, valid magic bytes + decodable.
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fakeStorage() {
  const uploads: string[] = [];
  return {
    keys: uploads,
    port: {
      uploadOriginal: async (params: { fileName: string; contentType: string; body: Buffer }) => {
        const key = `originals/p6c-race/${randomUUID()}-${params.fileName}`;
        uploads.push(key);
        return { key };
      },
      getSignedUrl: async (key: string) => `https://signed.example/${key}?sig=mock`
    }
  };
}

test("(q0) the disposable database is reachable and migrated with the RestorationDraft table", async () => {
  const rows = await clientA.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'RestorationDraft'`;
  assert.equal(rows.length, 1);
});

test("(q1) Pakistan upload creates a PAKISTAN/PKR draft with a guest ownership token, storage key never returned", async () => {
  const { RestorationDraftService } = await loadServiceModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  const created = await service.createDraft(
    { fileName: "p6c-race-pk.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "PK", confirmed: true },
    {}
  );
  createdDraftIds.push(created.id);

  assert.equal(created.market, "PAKISTAN");
  assert.equal(created.currency, "PKR");
  assert.ok(created.guestOwnershipToken, "a guest actor must receive a raw guest ownership token");
  assert.equal(storage.keys.length, 1, "exactly one upload for one create call");
  assert.ok(!("originalStorageKey" in created), "the safe view must never include the storage key field name");
  assert.ok(!JSON.stringify(created).includes(storage.keys[0]), "the raw storage key must never appear in the response");

  const fetched = await service.getDraft(created.id, { guestToken: created.guestOwnershipToken });
  assert.equal(fetched.previewUrl, `https://signed.example/${storage.keys[0]}?sig=mock`);
});

test("(q2) International upload creates an INTERNATIONAL/USD draft", async () => {
  const { RestorationDraftService } = await loadServiceModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  const created = await service.createDraft(
    { fileName: "p6c-race-intl.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "US", confirmed: true },
    {}
  );
  createdDraftIds.push(created.id);

  assert.equal(created.market, "INTERNATIONAL");
  assert.equal(created.currency, "USD");
});

test("(q3) Pakistan draft's offers are the exact approved PKR ORIGINAL/2HD/4HD prices", async () => {
  const { RestorationDraftService } = await loadServiceModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  const created = await service.createDraft(
    { fileName: "p6c-race-pk-offers.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "PK", confirmed: true },
    {}
  );
  createdDraftIds.push(created.id);

  const offers = await service.getOffers(created.id, { guestToken: created.guestOwnershipToken });
  assert.ok(Array.isArray(offers));
  const byTier = Object.fromEntries((offers as Array<{ tier: string; amountMinor: number }>).map((o) => [o.tier, o.amountMinor]));
  assert.deepEqual(byTier, { ORIGINAL: 25000, HD_2X: 35000, HD_4X: 50000 });
});

test("(q4) International draft's offers are the exact approved USD ORIGINAL/2HD/4HD prices", async () => {
  const { RestorationDraftService } = await loadServiceModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  const created = await service.createDraft(
    { fileName: "p6c-race-us-offers.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "DE", confirmed: true },
    {}
  );
  createdDraftIds.push(created.id);

  const offers = await service.getOffers(created.id, { guestToken: created.guestOwnershipToken });
  assert.ok(Array.isArray(offers));
  const byTier = Object.fromEntries((offers as Array<{ tier: string; amountMinor: number }>).map((o) => [o.tier, o.amountMinor]));
  assert.deepEqual(byTier, { ORIGINAL: 150, HD_2X: 250, HD_4X: 350 });
});

test("(q5) wrong-owner and nonexistent draft both fail with an identical, enumeration-safe 404", async () => {
  const { RestorationDraftService } = await loadServiceModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  const created = await service.createDraft(
    { fileName: "p6c-race-owner.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "PK", confirmed: true },
    {}
  );
  createdDraftIds.push(created.id);

  const capture = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (err) {
      return { status: (err as { statusCode?: number }).statusCode, code: (err as { code?: string }).code };
    }
  };

  const wrongOwner = await capture(() => service.getDraft(created.id, { guestToken: "totally-different-token" }));
  const nonexistent = await capture(() => service.getDraft("does-not-exist-at-all", { guestToken: "any-token" }));

  assert.ok(wrongOwner);
  assert.ok(nonexistent);
  assert.deepEqual(wrongOwner, nonexistent);
  assert.equal(wrongOwner?.status, 404);
});

test("(q6) refresh (repeated getDraft calls) never creates a second draft row or a second upload", async () => {
  const { RestorationDraftService } = await loadServiceModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  const created = await service.createDraft(
    { fileName: "p6c-race-refresh.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "PK", confirmed: true },
    {}
  );
  createdDraftIds.push(created.id);
  assert.equal(storage.keys.length, 1);

  await service.getDraft(created.id, { guestToken: created.guestOwnershipToken });
  await service.getDraft(created.id, { guestToken: created.guestOwnershipToken });
  await service.getDraft(created.id, { guestToken: created.guestOwnershipToken });

  assert.equal(storage.keys.length, 1, "no additional upload from repeated reads");
  const count = await clientA.restorationDraft.count({ where: { id: created.id } });
  assert.equal(count, 1, "exactly one draft row exists regardless of read count");
});

test("(q7) zero external network calls across every test in this file", () => {
  assert.equal(externalCallAttempts, 0);
});

test("(q8) teardown: every seeded row is removed and the client disconnects", async () => {
  await clientA.restorationDraft.deleteMany({ where: { id: { in: createdDraftIds } } });
  const remaining = await clientA.restorationDraft.count({ where: { id: { in: createdDraftIds } } });
  assert.equal(remaining, 0);
  await clientA.$disconnect();
});
