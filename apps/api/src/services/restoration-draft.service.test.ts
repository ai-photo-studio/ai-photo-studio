// R9.2-P6C-CUSTOMER-MVP-FLOW unit tests (no DB, no network).
//
// Proves the pure request-shape/validation guards on
// RestorationDraftService.createDraft fail closed BEFORE any storage write
// -- the full create/get/offers/ownership path is proven against a real
// disposable PostgreSQL instance in restoration-draft.service.pg-race.test.ts.
import test from "node:test";
import assert from "node:assert/strict";

let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`No external network call is permitted in this test file (attempted: ${String(args[0]).slice(0, 40)})`);
};

async function loadModule() {
  return import("./restoration-draft.service");
}

// A 1x1 transparent PNG, valid magic bytes + decodable.
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function fakeStorage() {
  let uploadCalls = 0;
  return {
    calls: () => uploadCalls,
    port: {
      uploadOriginal: async (params: { fileName: string; contentType: string; body: Buffer }) => {
        uploadCalls++;
        return { key: `originals/test/${params.fileName}` };
      },
      getSignedUrl: async (key: string) => `https://signed.example/${key}?sig=mock`
    }
  };
}

test("(u1) unconfirmed market/country is rejected before any storage write", async () => {
  const { RestorationDraftService } = await loadModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  await assert.rejects(() =>
    service.createDraft(
      { fileName: "a.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "PK", confirmed: false },
      {}
    )
  );
  assert.equal(storage.calls(), 0, "no upload may occur before market confirmation");
});

test("(u2) invalid country code is rejected before any storage write", async () => {
  const { RestorationDraftService } = await loadModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  await assert.rejects(() =>
    service.createDraft(
      { fileName: "a.png", contentType: "image/png", bodyBase64: VALID_PNG_BASE64, country: "not-a-country", confirmed: true },
      {}
    )
  );
  assert.equal(storage.calls(), 0);
});

test("(u3) corrupt/non-image bytes are rejected (real decode check) before any storage write", async () => {
  const { RestorationDraftService } = await loadModule();
  const storage = fakeStorage();
  const service = new RestorationDraftService(storage.port);

  const notAnImage = Buffer.from("this is definitely not an image").toString("base64");
  await assert.rejects(() =>
    service.createDraft(
      { fileName: "a.png", contentType: "image/png", bodyBase64: notAnImage, country: "PK", confirmed: true },
      {}
    )
  );
  assert.equal(storage.calls(), 0, "no upload may occur for undecodable bytes");
});

test("(u4) zero external network calls in this test file", () => {
  assert.equal(externalCallAttempts, 0);
});
