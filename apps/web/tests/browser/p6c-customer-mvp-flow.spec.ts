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
    await page.getByRole("button", { name: "Continue to Restoration" }).click();
    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/preview$`));
    expect(createCalls).toBe(1);
  });

  test("double Continue creates exactly one persisted draft", async ({ page }) => {
    await blockExternalNetwork(page);
    let createCalls = 0;
    await page.route("**/api/restoration-drafts", async (route) => {
      createCalls++;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: draftFixture() }) });
    });
    await page.goto("/?upload=1");
    await page.setInputFiles("#photoInput", tinyPngPath());
    await page.getByRole("button", { name: "Continue to Restoration" }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/preview$`));
    expect(createCalls).toBe(1);
  });

  test("direct former upload route resolves to the modal and uploads only on Continue", async ({ page }) => {
    await blockExternalNetwork(page);
    let createCalls = 0;
    await page.route("**/api/restoration-drafts", async (route) => {
      if (route.request().method() === "POST") createCalls++;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, data: draftFixture() }) });
    });
    await page.goto("/restore-mvp/new");
    await expect(page).toHaveURL(/\/?upload=1/);
    await page.setInputFiles("#photoInput", tinyPngPath());
    await page.waitForTimeout(300);
    expect(createCalls).toBe(0);

    await page.getByRole("button", { name: "Continue to Restoration" }).click();
    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/preview$`));
    expect(createCalls).toBe(1);
  });
});

test.describe("R9.5-P5N Preview metadata", () => {
  test("Preview shows factual metadata and the explanatory copy, no invented AI analysis", async ({ page }) => {
    await blockExternalNetwork(page);
    const draft = draftFixture({ market: "PAKISTAN", currency: "PKR", country: "PK" });
    await mockGetDraft(page, DRAFT_ID, { ...draft, previewUrl: "http://127.0.0.1/mock-preview.png" });

    await page.goto(`/restore-mvp/${DRAFT_ID}/preview`);
    await expect(page.getByText("Your original photo is uploaded once and stored securely. Review its details, then choose the restoration quality you need.")).toBeVisible();
    await expect(page.getByText("PNG", { exact: true })).toBeVisible();
    await expect(page.getByText("1 × 1 px", { exact: true })).toBeVisible();
    await expect(page.getByText("1.00:1", { exact: true })).toBeVisible();
    await expect(page.getByText("Square", { exact: true })).toBeVisible();
    // No damage/face/quality AI-analysis language may appear pre-payment.
    await expect(page.getByText(/damage detected|quality score|face detected/i)).toHaveCount(0);
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

    await page.goto("/?upload=1");
    await page.setInputFiles("#photoInput", tinyPngPath());
    await page.getByRole("button", { name: "Continue to Restoration" }).click();

    await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/preview$`));
    await page.getByRole("button", { name: "Choose Product & Image Quality" }).click();

     await expect(page).toHaveURL(new RegExp(`/restore-mvp/${DRAFT_ID}/tiers$`));
     await page.getByRole("radio", { name: /Digital Download/i }).click();
     await expect(page.getByText("PKR 500")).toBeVisible();
    await page.getByText("Restored Original", { exact: true }).click();
    await page.getByRole("button", { name: "Continue to Review" }).click();

    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NO}/review$`));
     await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
     await expect(page.locator(".order-summary dd").last()).toHaveText("PKR 500.00");
     await expect(page.getByText("Subtotal", { exact: true })).toBeVisible();
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
     await page.getByRole("radio", { name: /Digital Download/i }).click();
     await expect(page.getByText("USD 1.99", { exact: true })).toBeVisible();
     await expect(page.getByText("USD 2.99", { exact: true })).toBeVisible();
     await expect(page.getByText("USD 4.99", { exact: true })).toBeVisible();
  });

   test("International order review shows correct USD amount", async ({ page }) => {
    await blockExternalNetwork(page);
    const order = orderFixture({ market: "INTERNATIONAL", currency: "USD", tier: "HD_4X", amount: "499" });
    await mockGetOrder(page, ORDER_NO, order);
    await page.goto(`/orders/${ORDER_NO}/review`);
     await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
     await expect(page.locator(".order-summary dd").last()).toHaveText("USD 4.99");
  });
});

test.describe("P6C product choice truthfulness", () => {
  test("digital and Print + Digital are visible while print checkout remains blocked", async ({ page }) => {
    await blockExternalNetwork(page);
     await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
     await page.goto(`/restore-mvp/${DRAFT_ID}/tiers`);
     await expect(page.getByRole("radio", { name: /Digital Download/i })).toBeVisible();
     await expect(page.getByText("Restored Original", { exact: true })).toHaveCount(0);
     await page.getByRole("radio", { name: /Digital Download/i }).click();
      await expect(page.getByText("Choose image quality")).toBeVisible();
     await expect(page.locator("input[type=number]")).toHaveCount(0);
     await expect(page.getByText("Restored Original", { exact: true })).toBeVisible();
      await page.getByRole("radio", { name: /Print \+ Digital/i }).click();
      await page.getByRole("radio", { name: /Small Print/i }).click();
      await expect(page.getByRole("radio", { name: /Canvas/i })).toHaveCount(0);
      await expect(page.locator("select")).toBeVisible();
     await expect(page.locator("input[type=number]")).toHaveAttribute("max", "10");
    await expect(page.getByRole("button", { name: "Continue to Review" })).toBeDisabled();
  });

  test("print size with a mismatched aspect ratio is blocked before order creation", async ({ page }) => {
    await blockExternalNetwork(page);
    const draft = { ...draftFixture(), originalWidth: 1000, originalHeight: 1000, previewUrl: "http://127.0.0.1/mock-preview.png" };
    await mockGetDraft(page, DRAFT_ID, draft);
    await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
    await page.route("**/api/print-catalog", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [{ catalogVersion: "PRINT-TEST", size: "5x7", unitAmountMinor: 15000, currency: "PKR", minimumQuantity: 5, deliveryAmountMinor: 25000 }] }) }));

    await page.goto(`/restore-mvp/${DRAFT_ID}/tiers`);
    await page.getByRole("radio", { name: /Print \+ Digital/i }).click();
    await page.getByRole("radio", { name: /Small Print/i }).click();
    await page.getByLabel("Recipient name").fill("Launch Test");
    await page.getByLabel("Phone").fill("03001234567");
    await page.getByLabel("Address").fill("1 Test Street");
    await page.getByLabel("City").fill("Lahore");
    await expect(page.getByText(/does not match the selected print aspect ratio/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to Review" })).toBeDisabled();
  });

  test("ratio-compatible PKR print selection reaches review", async ({ page }) => {
    await blockExternalNetwork(page);
    const draft = { ...draftFixture(), originalWidth: 1200, originalHeight: 800, previewUrl: "http://127.0.0.1/mock-preview.png" };
    await mockGetDraft(page, DRAFT_ID, draft);
    await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
    await mockCreateOrder(page, orderFixture({ amount: "225000" }));
    await page.route("**/api/print-catalog", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [{ catalogVersion: "PRINT-TEST", size: "4x6", unitAmountMinor: 10000, currency: "PKR", minimumQuantity: 10, deliveryAmountMinor: 25000 }] }) }));

    await page.goto(`/restore-mvp/${DRAFT_ID}/tiers`);
    await page.getByRole("radio", { name: /Print \+ Digital/i }).click();
    await page.getByRole("radio", { name: /Small Print/i }).click();
    await page.getByLabel("Recipient name").fill("Launch Test");
    await page.getByLabel("Phone").fill("03001234567");
    await page.getByLabel("Address").fill("1 Test Street");
    await page.getByLabel("City").fill("Lahore");
    await expect(page.getByText(/does not match the selected print aspect ratio/i)).toHaveCount(0);
    await page.getByRole("button", { name: "Continue to Review" }).click();
    await expect(page).toHaveURL(/\/orders\/FO-P6C-TEST-0001\/review$/);
  });
});

test("P4B11 Pakistan offer page exposes all seven V3 tiers and no stale 250 price", async ({ page }) => {
  await blockExternalNetwork(page);
  await mockOffers(page, DRAFT_ID, offersFixture("PKR"));
     await page.goto(`/restore-mvp/${DRAFT_ID}/tiers`);
     await page.getByRole("radio", { name: /Digital Download/i }).click();
    await expect(page.getByText("Restored Original", { exact: true })).toBeVisible();
  for (const label of ["2x HD", "4x Ultra HD", "6x", "8x", "10x", "12x"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText(/PKR 250\.00|PKR 350\.00/)).toHaveCount(0);
  await expect(page.getByText("PB-2026-08-09-TRIAL-V3")).toHaveCount(0);
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
       await expect(page.getByRole("heading", { name: "Review your order" })).toBeVisible();
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
      await expect(page.getByRole("button", { name: "Continue to Review" })).toBeVisible();
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

    await page.goto("/?upload=1");
    await page.setInputFiles("#photoInput", tinyPngPath());
    await page.getByRole("button", { name: "Continue to Restoration" }).click();
     await page.getByRole("button", { name: "Choose Product & Image Quality" }).click();
     await page.getByRole("radio", { name: /Digital Download/i }).click();
    await page.getByText("Restored Original", { exact: true }).click();
    await page.getByRole("button", { name: "Continue to Review" }).click();
    await expect(page).toHaveURL(new RegExp(`/orders/${ORDER_NO}/review$`));

    expect(externalCompleted).toEqual([]);
  });
});
