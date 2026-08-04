import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./RestorationStatusPage.tsx", import.meta.url), "utf8");

test("restoration status page keeps browser return untrusted and exposes no storage keys", () => {
  assert.ok(source.includes("Refresh"));
  assert.ok(source.includes("Download"));
  assert.ok(source.includes("getRestorationOrder"));
  assert.ok(source.includes("getRestorationDownload"));
  assert.ok(!source.includes("storageKey"));
  assert.ok(!source.includes("applyVerifiedPaymentEvidence"));
});
