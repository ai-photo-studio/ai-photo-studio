import test from "node:test";
import assert from "node:assert/strict";
import { DryRunRestorationProvider } from "./DryRunRestorationProvider";

test("dry run restoration never posts to Replicate and returns mock pipeline output", async () => {
  const originalFetch = global.fetch;
  const calls: Array<{ url: string; method: string }> = [];

  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || "GET").toUpperCase();
    calls.push({ url, method });
    if (url.includes("api.replicate.com") && method === "POST") {
      throw new Error("Replicate POST should never happen in dry-run mode");
    }
    throw new Error(`Unexpected network call in dry-run test: ${method} ${url}`);
  }) as typeof fetch;

  try {
    const provider = new DryRunRestorationProvider();
    const result = await provider.restore({
      image: Buffer.from("dry-run-fixture"),
      contentType: "image/jpeg",
      fileName: "fixture.jpg",
      options: { orderId: "order_1", itemId: "item_1" }
    });

    assert.equal(result.providerName, "dry-run");
    assert.deepEqual(result.stages, ["flux_restore", "face_restoration_gfpgan"]);
    assert.equal(result.creditsUsed, 0);
    assert.equal(result.estimatedCost, 0);
    assert.equal(result.actualCost, 0);
    assert.ok(result.image.length > 0);
    assert.equal(calls.some((call) => call.url.includes("api.replicate.com") && call.method === "POST"), false);
  } finally {
    global.fetch = originalFetch;
  }
});
