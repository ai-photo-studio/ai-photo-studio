import { test, expect } from "./fixtures";

/**
 * Permanent regression test for the network guard installed by
 * ./fixtures/index.ts. Proves that direct attempts to reach paid AI
 * providers, a payment provider, the production API host, and an
 * advertising/analytics endpoint are aborted client-side and never leave
 * the browser context, and that the guard records them so a real
 * accidental call in any other test would fail that test via
 * expectCleanNetwork().
 */

const BLOCKED_PROVIDER_URLS = [
  "https://api.replicate.com/v1/predictions", // paid AI provider
  "https://api.runpod.ai/v2/some-endpoint/run", // paid AI provider
  "https://sandbox.bankalfalah.com/pay", // payment provider
  "https://api.thannow.com/api/restorations", // production API host
  "https://stats.g.doubleclick.net/collect" // advertising/analytics endpoint
];

test.describe("network safety: paid/production/analytics providers are blocked", () => {
  test("direct fetch attempts to known blocked hosts are aborted and recorded, never reaching the network", async ({
    page,
    blockedRequests
  }) => {
    await page.goto("/");

    for (const url of BLOCKED_PROVIDER_URLS) {
      const outcome = await page.evaluate(async (target) => {
        try {
          await fetch(target, { method: "GET" });
          return "unexpectedly-succeeded";
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      }, url);
      expect(outcome, `Expected ${url} to be blocked by the network guard, but got: ${outcome}`).not.toBe(
        "unexpectedly-succeeded"
      );
    }

    const blockedHosts = blockedRequests.map((entry) => new URL(entry.url).hostname);
    for (const url of BLOCKED_PROVIDER_URLS) {
      const hostname = new URL(url).hostname;
      expect(blockedHosts, `Expected ${hostname} to be recorded as a blocked request`).toContain(hostname);
    }
  });
});
