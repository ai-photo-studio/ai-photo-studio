// R9.2-P6C-CUSTOMER-MVP-FLOW browser-test fixtures.
import type { Page, Route } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

export const DRAFT_ID = "draft-p6c-test-0001";
export const ORDER_NO = "FO-P6C-TEST-0001";

/** Writes a tiny valid PNG to a temp file so Playwright can attach a real file input. */
export function tinyPngPath(): string {
  const buf = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const file = path.join(os.tmpdir(), `p6c-tiny-${Date.now()}.png`);
  fs.writeFileSync(file, buf);
  return file;
}

export function draftFixture(overrides: Partial<{ market: string; currency: string; country: string }> = {}) {
  return {
    id: DRAFT_ID,
    status: "UPLOADED",
    market: overrides.market ?? "PAKISTAN",
    currency: overrides.currency ?? "PKR",
    country: overrides.country ?? "PK",
    originalMimeType: "image/png",
    originalWidth: 1,
    originalHeight: 1,
    createdAt: new Date().toISOString(),
    guestOwnershipToken: "guest-token-p6c-test"
  };
}

export function offersFixture(currency: "PKR" | "USD") {
  const amounts = currency === "PKR" ? [25000, 35000, 50000] : [150, 250, 350];
  return [
    { tier: "ORIGINAL", label: "Original", amountMinor: amounts[0], currency, description: "Source resolution", source: "approved_pricebook" },
    { tier: "HD_2X", label: "2HD", amountMinor: amounts[1], currency, description: "2x enhanced", source: "approved_pricebook" },
    { tier: "HD_4X", label: "4HD", amountMinor: amounts[2], currency, description: "4x enhanced", source: "approved_pricebook" }
  ];
}

export function orderFixture(overrides: Partial<{ market: string; currency: string; tier: string; amount: string }> = {}) {
  return {
    id: "order-p6c-test-0001",
    orderNo: ORDER_NO,
    status: "CREATED",
    market: overrides.market ?? "PAKISTAN",
    currency: overrides.currency ?? "PKR",
    tier: overrides.tier ?? "ORIGINAL",
    totalAmountMinor: overrides.amount ?? "25000",
    pricingSource: "approved_pricebook",
    pricingApproved: true,
    priceBookVersion: "PB-2026-08-03-v1",
    priceBookApprovalReference: "OWNER-CHAT-2026-08-03-P1C-B-01",
    priceBookEffectiveAt: "2026-08-03T00:00:00Z",
    createdAt: new Date().toISOString()
  };
}

export async function mockCreateDraft(page: Page, fixture: ReturnType<typeof draftFixture>) {
  await page.route("**/api/restoration-drafts", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: fixture }) });
  });
}

export async function mockGetDraft(page: Page, draftId: string, fixture: (ReturnType<typeof draftFixture> & { previewUrl: string }) | null, status = 200) {
  await page.route(`**/api/restoration-drafts/${draftId}`, async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (!fixture) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, code: "NOT_FOUND", message: "Not found" }) });
      return;
    }
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: true, data: fixture }) });
  });
}

export async function mockOffers(page: Page, draftId: string, offers: ReturnType<typeof offersFixture> | null) {
  await page.route(`**/api/restoration-drafts/${draftId}/offers`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: offers ?? { available: false, reason: "USD pricing has not been approved yet" } })
    });
  });
}

export async function mockCreateOrder(page: Page, fixture: ReturnType<typeof orderFixture>) {
  await page.route("**/api/fixed-orders/restoration-digital", async (route: Route) => {
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: fixture }) });
  });
}

export async function mockGetOrder(page: Page, orderNo: string, fixture: ReturnType<typeof orderFixture> | null) {
  await page.route(`**/api/fixed-orders/${orderNo}`, async (route: Route) => {
    if (!fixture) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, code: "NOT_FOUND", message: "Not found" }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: fixture }) });
  });
}
