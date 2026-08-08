// R9.2-P6C-CUSTOMER-MVP-FLOW minimal browser harness.
//
// Every test blocks all non-local network traffic and mocks only the exact
// endpoints it exercises. No real API server, MPGS, Replicate, R2, RunPod,
// or Local provider is ever contacted.
import { test, expect, blockExternalNetwork } from "./fixtures/index";
import {
  DRAFT_ID,
  ORDER_NO,
  tinyPngPath,
  draftFixture,
  offersFixture,
  orderFixture,
  mockCreateDraft,
  mockGetDraft,
  mockOffers,
  mockCreateOrder,
  mockGetOrder
} from "./fixtures/mvp";

test.describe("P6C upload page never uploads before the explicit button click", () => {
  test("homepage modal uploads exactly once and continues to the persisted preview", async ({ page }) => {
    await blockExternalNetwork(page);
    let createCalls = 0;
    await page.route("**/api/restoration-drafts", async (route) => {
      if (route.request().method() === "POST") createCalls++;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: draftFixture() }) });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Upload Your Photo" }).first().click();
    await page.setInputFiles('#photoInput', tinyPngPath());
    expect(createCalls).toBe(0);
    await page.getByRole("button", { name: "Continue to Preview" }).click();
    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/preview$`));
    expect(createCalls).toBe(1);
  });

  test("selecting a file and confirming market does not upload until the button is clicked", async ({ page }) => {
    await blockExternalNetwork(page);
    let createCalls = 0;
    await page.route("**/api/restoration-drafts", async (route) => {
      if (route.request().method() === "POST") createCalls++;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: draftFixture() }) });
    });
    await page.goto("/restore-mvp/new");
    await page.setInputFiles('input[type="file"]', tinyPngPath());
    await page.getByRole("checkbox").check();
    await page.waitForTimeout(300);
    expect(createCalls).toBe(0);

    await page.getByRole("button", { name: "Upload photo" }).click();
    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/preview$`));
    expect(createCalls).toBe(1);
  });
});

test.describe("P6C Pakistan PKR flow end to end", () => {
  test("upload -> preview -> tiers -> order -> review shows PKR ORIGINAL pricing", async ({ page }) => {
    await blockExternalNetwork(page);
    const draft = draftFixture({ market: "PAKISTAN", currency: "PKR", country: "PK" });
    await mockCreateDraft(page, draft);
    await mockGetDraft(page, DRAFT_ID, { ...draft, previewUrl: "http://127.0.0.1/mock-preview.png" });
    await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
    const order = orderFixture({ market: "PAKISTAN", currency: "PKR", tier: "ORIGINAL", amount: "50000" });
    await mockCreateOrder(page, order);
    await mockGetOrder(page, ORDER_NO, order);

    await page.goto("/restore-mvp/new");
    await page.setInputFiles('input[type="file"]', tinyPngPath());
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Upload photo" }).click();

    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/preview$`));
    await page.getByRole("button", { name: "Choose Your Restoration" }).click();

    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/tiers$`));
    await expect(page.getByText("PKR 500.00")).toBeVisible();
    await page.getByText("Restored Original", { exact: true }).click();
    await page.getByRole("button", { name: "Review & Checkout" }).click();

    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NO}/review$`));
    await expect(page.getByText("PAKISTAN", { exact: true })).toBeVisible();
    await expect(page.getByText("PKR 500.00")).toBeVisible();
    await expect(page.getByText("PB-2026-08-09-TRIAL-V3")).toBeVisible();
    await expect(page.getByText(/Online payment is temporarily unavailable/i)).toBeVisible();
  });
});

test.describe("P6C International USD flow", () => {
  test("International draft shows exact USD ORIGINAL/2HD/4HD prices", async ({ page }) => {
    await blockExternalNetwork(page);
    const draft = draftFixture({ market: "INTERNATIONAL", currency: "USD", country: "US" });
    await mockGetDraft(page, DRAFT_ID, { ...draft, previewUrl: "http://127.0.0.1/mock-preview.png" });
    await mockOffers(page, DRAFT_ID, offersFixture("USD"));

    await page.goto(`/restore-mvp/${DRAFT_ID}/tiers`);
    await expect(page.getByText("USD 1.99")).toBeVisible();
    await expect(page.getByText("USD 2.99")).toBeVisible();
    await expect(page.getByText("USD 4.99")).toBeVisible();
  });

  test("International order review shows correct USD amount and market", async ({ page }) => {
    await blockExternalNetwork(page);
    const order = orderFixture({ market: "INTERNATIONAL", currency: "USD", tier: "HD_4X", amount: "499" });
    await mockGetOrder(page, ORDER_NO, order);
    await page.goto(`/orders/${ORDER_NO}/review`);
    await expect(page.getByText("INTERNATIONAL")).toBeVisible();
    await expect(page.getByText("USD 4.99")).toBeVisible();
  });
});

test.describe("P6C product choice truthfulness", () => {
  test("digital and Print + Digital are visible while print checkout remains blocked", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
    await page.goto(`/restore-mvp/${DRAFT_ID}/tiers`);
    await expect(page.getByRole("button", { name: "Digital Download Restore your photo and download it when ready.", exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Print \+ Digital Download/i }).click();
    await expect(page.locator("select")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review & Checkout" })).toBeDisabled();
  });
});

test.describe("P6C ownership: forged/wrong guest token is rejected", () => {
  test("wrong guest token on the review page renders a not-found state, not the order", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockGetOrder(page, ORDER_NO, null);
    await page.goto(`/orders/${ORDER_NO}/review`);
    await expect(page.getByText(/not found/i)).toBeVisible();
  });

  test("nonexistent draft on the preview page renders a not-found state", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockGetDraft(page, DRAFT_ID, null);
    await page.goto(`/restore-mvp/${DRAFT_ID}/preview`);
    await expect(page.getByText(/not found/i)).toBeVisible();
  });
});

test.describe("P6C forged query parameters cannot fabricate payment success", () => {
  test("forged success query params on the review page change nothing", async ({ page }) => {
    await blockExternalNetwork(page);
    const order = orderFixture();
    await mockGetOrder(page, ORDER_NO, order);
    await page.goto(`/orders/${ORDER_NO}/review?status=success&paid=true&forced=true`);
    // The page ignores query parameters entirely and always renders the
    // truthful, server-reported payment-blocked state -- never a fabricated
    // "paid"/"success" state derived from the URL.
    await expect(page.getByText(/Online payment is temporarily unavailable/i)).toBeVisible();
    await expect(page.getByText(/payment successful|payment complete|paid in full/i)).toHaveCount(0);
  });
});

test.describe("P6C refresh issues GET requests only, never a duplicate draft/order or a processing POST", () => {
  test("refreshing the preview page issues GET only", async ({ page }) => {
    await blockExternalNetwork(page);
    const draft = draftFixture();
    let getCount = 0;
    let writeCount = 0;
    await page.route(`**/api/restoration-drafts/${DRAFT_ID}`, async (route) => {
      if (route.request().method() === "GET") getCount++;
      else writeCount++;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { ...draft, previewUrl: "http://127.0.0.1/mock-preview.png" } }) });
    });
    await page.goto(`/restore-mvp/${DRAFT_ID}/preview`);
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.waitForTimeout(200);
    expect(writeCount).toBe(0);
    expect(getCount).toBeGreaterThanOrEqual(2);
  });

  test("refreshing the review page issues GET only and never creates a processing/payment call", async ({ page }) => {
    await blockExternalNetwork(page);
    const order = orderFixture();
    let getCount = 0;
    const otherCalls: string[] = [];
    await page.route(`**/api/fixed-orders/${ORDER_NO}`, async (route) => {
      if (route.request().method() === "GET") getCount++;
      else otherCalls.push(route.request().method());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: order }) });
    });
    await page.route("**/api/fixed-orders/restoration-digital", async (route) => {
      otherCalls.push("POST-order-create");
      await route.continue();
    });
    await page.goto(`/orders/${ORDER_NO}/review`);
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.reload();
    await page.waitForTimeout(200);
    expect(otherCalls).toEqual([]);
    expect(getCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe("P6C mobile usability", () => {
  for (const width of [360, 390, 430]) {
    test(`review page renders correctly at ${width}px width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await blockExternalNetwork(page);
      const order = orderFixture();
      await mockGetOrder(page, ORDER_NO, order);
      await page.goto(`/orders/${ORDER_NO}/review`);
      await expect(page.getByText(order.orderNo)).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`tier select page renders correctly at ${width}px width`, async ({ page }) => {
      page.setDefaultTimeout(10000);
      await page.setViewportSize({ width, height: 800 });
      await blockExternalNetwork(page);
      const draft = draftFixture();
      await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
      await page.goto(`/restore-mvp/${DRAFT_ID}/tiers`);
      await expect(page.getByRole("button", { name: "Review & Checkout" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      void draft;
    });
  }
});

test.describe("P6C zero external network calls across the full flow", () => {
  test("full upload->preview->tiers->order->review flow makes zero external network calls", async ({ page }) => {
    const externalCompleted: string[] = [];
    const isExternal = (url: string) => {
      const hostname = new URL(url).hostname;
      return hostname !== "127.0.0.1" && hostname !== "localhost";
    };
    page.on("requestfinished", (request) => {
      if (isExternal(request.url())) externalCompleted.push(request.url());
    });
    await blockExternalNetwork(page);
    const draft = draftFixture();
    await mockCreateDraft(page, draft);
    await mockGetDraft(page, DRAFT_ID, { ...draft, previewUrl: "http://127.0.0.1/mock-preview.png" });
    await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
    const order = orderFixture();
    await mockCreateOrder(page, order);
    await mockGetOrder(page, ORDER_NO, order);

    await page.goto("/restore-mvp/new");
    await page.setInputFiles('input[type="file"]', tinyPngPath());
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Upload photo" }).click();
    await page.getByRole("button", { name: "Choose Your Restoration" }).click();
    await page.getByText("Restored Original", { exact: true }).click();
    await page.getByRole("button", { name: "Review & Checkout" }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NO}/review$`));

    expect(externalCompleted).toEqual([]);
  });
});
