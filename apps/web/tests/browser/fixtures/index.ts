// R9.2-P5A minimal browser-test fixtures.
//
// - blockExternalNetwork aborts every request that is not same-origin (the
//   local Vite dev server), so no test can reach a real API, MPGS,
//   Replicate, R2, RunPod, or Local host.
// - mockRestorationStatus / mockRestorationDownload install page.route
//   handlers that satisfy the narrow customer DTO contract used by
//   RestorationStatusPage, without ever touching a real backend.
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

export const test = base;
export { expect };
