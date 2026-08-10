// R9.2-P5A minimal browser-test fixtures.
//
// - blockExternalNetwork aborts every request that is not same-origin (the
//   local Vite dev server), so no test can reach a real API, MPGS,
//   Replicate, R2, RunPod, or Local host.
// - mockRestorationStatus / mockRestorationDownload install page.route
//   handlers that satisfy the narrow customer DTO contract used by
//   RestorationStatusPage, without ever touching a real backend.
//
// The `test` export additionally installs automatic per-test collectors for
// blocked external requests, console/page errors, and failed first-party
// requests (Premium Hero V2 slider tests assert on these). Existing helpers
// are unchanged and additive; no collector asserts on its own.
import { test as base, expect, type Page, type Route } from "@playwright/test";

export const ORDER_ID = "order-p5a-test-0001";
export const ITEM_ID_QUEUED = "item-p5a-queued";
export const ITEM_ID_PROCESSING = "item-p5a-processing";
export const ITEM_ID_FAILED = "item-p5a-failed";
export const ITEM_ID_SUCCEEDED = "item-p5a-succeeded";

export type RestorationStatusFixture = {
  id: string;
  orderNo: string;
  status: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    status: string;
    processingStage: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  hasDownload: boolean;
};

const now = () => new Date().toISOString();

export function buildStatusFixture(overrides: Partial<RestorationStatusFixture> = {}): RestorationStatusFixture {
  return {
    id: ORDER_ID,
    orderNo: "ORD-P5A-0001",
    status: "PROCESSING",
    title: "P5A restoration",
    createdAt: now(),
    updatedAt: now(),
    hasDownload: false,
    items: [
      {
        id: ITEM_ID_PROCESSING,
        status: "PROCESSING",
        processingStage: "Restoring detail",
        errorMessage: null,
        createdAt: now(),
        updatedAt: now()
      }
    ],
    ...overrides
  };
}

/** Aborts every request not aimed at the local dev server (baseURL origin). */
export async function blockExternalNetwork(page: Page) {
  await page.route("**/*", async (route: Route) => {
    const url = new URL(route.request().url());
    const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!isLocal) {
      await route.abort("blockedbyclient");
      return;
    }
    await route.fallback();
  });
}

/** Mocks GET /api/customer/restorations/:id with the given fixture (or a 404/403 style not-found). */
export async function mockRestorationStatus(
  page: Page,
  fixture: RestorationStatusFixture | null,
  options: { orderId?: string; status?: number } = {}
) {
  const orderId = options.orderId ?? ORDER_ID;
  await page.route(`**/api/customer/restorations/${orderId}`, async (route: Route) => {
    if (!fixture) {
      await route.fulfill({
        status: options.status ?? 404,
        contentType: "application/json",
        body: JSON.stringify({ success: false, code: "NOT_FOUND", message: "Not found" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: fixture })
    });
  });
}

// Note: unlike the status endpoint, RestorationCustomerController's download
// route response is consumed via a raw `fetch(...).then(r => r.json())` in
// customerApi.getRestorationDownload -- it is NOT unwrapped through the
// shared `{ success, data }` apiRequest envelope. The mock below matches
// that real client contract exactly.
export type DownloadFixture = {
  orderId: string;
  orderNo: string;
  itemId: string;
  itemStatus: string;
  masterStatus: string;
  downloadUrl: string;
  expiresAt: string;
  contentType: string;
};

export function buildDownloadFixture(overrides: Partial<DownloadFixture> = {}): DownloadFixture {
  return {
    orderId: ORDER_ID,
    orderNo: "ORD-P5A-0001",
    itemId: ITEM_ID_SUCCEEDED,
    itemStatus: "COMPLETED",
    masterStatus: "VALIDATED",
    downloadUrl: "http://127.0.0.1/mock-signed-download/master.jpg",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    contentType: "image/jpeg",
    ...overrides
  };
}

/** Mocks GET /api/customer/restorations/:id/download/:itemId. */
export async function mockRestorationDownload(
  page: Page,
  fixture: DownloadFixture | null,
  options: { orderId?: string; itemId?: string; status?: number; code?: string } = {}
) {
  const orderId = options.orderId ?? ORDER_ID;
  const itemId = options.itemId ?? ITEM_ID_SUCCEEDED;
  await page.route(`**/api/customer/restorations/${orderId}/download/${itemId}`, async (route: Route) => {
    if (!fixture) {
      // customerApi.getRestorationDownload only reads `.message` off a
      // non-ok JSON body (see apps/web/src/services/customerApi.ts); this
      // stays intentionally close to the real error envelope shape.
      await route.fulfill({
        status: options.status ?? 400,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          code: options.code ?? "RESTORATION_MASTER_NOT_READY",
          message: "Validated restoration master is unavailable"
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fixture)
    });
  });
}

export type BlockedRequest = { url: string; method: string };

type Fixtures = {
  blockedRequests: BlockedRequest[];
  consoleErrors: string[];
  pageErrors: string[];
  failedFirstPartyRequests: string[];
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// apps/web/src/main.tsx injects a Facebook Pixel bootstrap script (and a GA
// gtag stub) with placeholder IDs on every page load -- pre-existing and
// unrelated to this suite. It is aborted here (never reaches the real network)
// but is deliberately not counted as a test-failing violation, matching the
// established fixture behavior. Any OTHER non-local host IS counted and fails
// via expectCleanNetwork().
const KNOWN_BOOTSTRAP_TRACKERS = [
  /(^|\.)facebook\.com$/,
  /(^|\.)facebook\.net$/,
  /(^|\.)googletagmanager\.com$/,
  /(^|\.)google-analytics\.com$/
];

export const test = base.extend<Fixtures>({
  blockedRequests: async ({ page }, provide) => {
    const blocked: BlockedRequest[] = [];
    await page.route("**/*", async (route) => {
      let hostname: string;
      try {
        hostname = new URL(route.request().url()).hostname;
      } catch {
        await route.continue();
        return;
      }
      if (LOCAL_HOSTS.has(hostname)) {
        await route.continue();
        return;
      }
      if (!KNOWN_BOOTSTRAP_TRACKERS.some((pattern) => pattern.test(hostname))) {
        blocked.push({ url: route.request().url(), method: route.request().method() });
      }
      await route.abort("blockedbyclient");
    });
    await provide(blocked);
  },

  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (message.text().includes("ERR_BLOCKED_BY_CLIENT")) return;
      errors.push(message.text());
    });
    await provide(errors);
  },

  pageErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await provide(errors);
  },

  failedFirstPartyRequests: async ({ page }, provide) => {
    const failed: string[] = [];
    page.on("requestfailed", (request) => {
      let hostname: string;
      try {
        hostname = new URL(request.url()).hostname;
      } catch {
        return;
      }
      if (LOCAL_HOSTS.has(hostname)) {
        failed.push(`${request.url()} (${request.failure()?.errorText ?? "unknown error"})`);
      }
    });
    await provide(failed);
  }
});

export { expect };

export function expectCleanNetwork(blockedRequests: BlockedRequest[]) {
  expect(blockedRequests, `Unexpected external network requests were blocked: ${JSON.stringify(blockedRequests)}`).toEqual([]);
}

export function expectNoPageErrors(consoleErrors: string[], pageErrors: string[]) {
  expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join("; ")}`).toEqual([]);
}

export function expectNoFailedFirstPartyRequests(failedFirstPartyRequests: string[]) {
  expect(failedFirstPartyRequests, `Failed first-party requests: ${failedFirstPartyRequests.join("; ")}`).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `Horizontal viewport overflow detected: ${overflow}px`).toBeLessThanOrEqual(1);
}
