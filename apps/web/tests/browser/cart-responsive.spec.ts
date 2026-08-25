// R9.5-P5Q-MULTI-IMAGE-UI-CART: mobile/desktop layout proof for the 3
// multi-image cart pages (Preview, Configure, Review). Every backend call is
// mocked -- this proves layout/legibility only, not backend behaviour (the
// real backend behaviour is proven by the pg-race suites and the zero-cost
// E2E harness). Mirrors the existing `print-truthfulness.spec.ts` viewport
// pattern (mobile 390x844 per this packet's requirement, plus a matching
// desktop 1440x900 size).
import { expectNoHorizontalOverflow, expect, test } from "./fixtures";

const DRAFT_IDS = ["draft-cart-resp-1", "draft-cart-resp-2"];
const ORDER_NO = "FO-CARTRESP-0001";

function draftFixture(id: string, index: number) {
  return {
    id,
    status: "UPLOADED",
    market: "PAKISTAN" as const,
    currency: "PKR" as const,
    country: "PK",
    originalMimeType: "image/jpeg",
    originalWidth: 1200,
    originalHeight: 1600 - index * 200,
    createdAt: new Date().toISOString(),
     previewUrl: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
  };
}

const OFFERS = [
  { tier: "ORIGINAL", label: "Restored Original", amountMinor: 19900, currency: "PKR" as const, description: "d", source: "approved_pricebook" as const },
  { tier: "HD_2X", label: "2x HD", amountMinor: 29900, currency: "PKR" as const, description: "d", source: "approved_pricebook" as const },
  { tier: "HD_4X", label: "4x Ultra HD", amountMinor: 49900, currency: "PKR" as const, description: "d", source: "approved_pricebook" as const }
];

const PRINT_CATALOG = [
  { catalogVersion: "v1", size: "4x6", unitAmountMinor: 10000, currency: "PKR" as const, minimumQuantity: 1, deliveryAmountMinor: 25000 },
  { catalogVersion: "v1", size: "5x7", unitAmountMinor: 15000, currency: "PKR" as const, minimumQuantity: 1, deliveryAmountMinor: 25000 }
];

async function mockDrafts(page: import("@playwright/test").Page) {
  for (const [index, id] of DRAFT_IDS.entries()) {
    await page.route(`**/api/restoration-drafts/${id}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: draftFixture(id, index) }) })
    );
    await page.route(`**/api/restoration-drafts/${id}/offers`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: OFFERS }) })
    );
  }
  await page.route("**/api/print-catalog", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: PRINT_CATALOG }) })
  );
}

function cartFixture() {
  return {
    id: "cart-order-resp-1",
    orderNo: ORDER_NO,
    status: "LOCKED",
    market: "PAKISTAN" as const,
    currency: "PKR" as const,
    items: DRAFT_IDS.map((draftId, index) => ({
      fixedOrderItemId: `item-${index}`,
      draftId,
      tier: "HD_2X",
      product: "DIGITAL" as const,
      digitalAmountMinor: "29900",
      lineTotalMinor: "29900"
    })),
    restorationTotalMinor: "59800",
    printTotalMinor: "0",
    deliveryAmountMinor: "0",
    totalAmountMinor: "59800",
    priceBookVersion: "PB-2026-08-09-TRIAL-V3",
    createdAt: new Date().toISOString()
  };
}

for (const viewport of [
  { width: 1440, height: 900, label: "desktop" },
  { width: 390, height: 844, label: "mobile" }
]) {
  test.describe(`cart pages at ${viewport.label} (${viewport.width}px)`, () => {
    test(`Preview page shows numbered "Photo N of ${DRAFT_IDS.length}" headings with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockDrafts(page);
      await page.goto(`/restore-cart/${DRAFT_IDS.join(",")}/preview`);
      await expect(page.getByText(`Photo 1 of ${DRAFT_IDS.length}`)).toBeVisible();
      await expect(page.getByText(`Photo 2 of ${DRAFT_IDS.length}`)).toBeVisible();
      await expect(page.getByRole("button", { name: "Configure Photos" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test(`Configure page shows numbered "Photo N of ${DRAFT_IDS.length}" headings with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockDrafts(page);
      await page.goto(`/restore-cart/${DRAFT_IDS.join(",")}/configure`);
      await expect(page.getByRole("heading", { name: `Photo 1 of ${DRAFT_IDS.length}` })).toBeVisible();
      await expect(page.getByRole("heading", { name: `Photo 2 of ${DRAFT_IDS.length}` })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue to Review" })).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });

    test(`Review page shows numbered "Photo N of ${DRAFT_IDS.length}" headings and order totals with no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.route(`**/api/fixed-orders/${ORDER_NO}/cart`, (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: cartFixture() }) })
      );
      await page.route("**/api/e2e/test-mode", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { enabled: false } }) })
      );
      await page.goto(`/orders/${ORDER_NO}/cart`);
      await expect(page.getByText(`Photo 1 of ${DRAFT_IDS.length}`)).toBeVisible();
      await expect(page.getByText(`Photo 2 of ${DRAFT_IDS.length}`)).toBeVisible();
      await expect(page.getByText("PKR 598.00").first()).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  });
}
