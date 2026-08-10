import { test, expect, expectNoHorizontalOverflow } from "./fixtures";

const ORDER_ID = "print-qa-order";
const ITEM_ID = "print-qa-item";

function orderFixture(status: "COMPLETED" | "PROCESSING" | "FAILED") {
  return {
    id: ORDER_ID,
    orderNo: "ORD-PRINT-QA",
    title: "Print QA restoration",
    status,
    totalItems: 1,
    completedItems: status === "COMPLETED" ? 1 : 0,
    failedItems: status === "FAILED" ? 1 : 0,
    createdAt: "2026-08-08T10:00:00.000Z",
    updatedAt: "2026-08-08T10:01:00.000Z",
    entitlement: "DIGITAL",
    items: [{
      id: ITEM_ID,
      status,
      processingStage: status === "PROCESSING" ? "Restoring detail" : null,
      errorMessage: status === "FAILED" ? "Provider failed" : null,
      createdAt: "2026-08-08T10:00:00.000Z",
      updatedAt: "2026-08-08T10:01:00.000Z",
      imageCategory: "PORTRAIT",
      totalDurationMs: status === "COMPLETED" ? 1200 : null,
      beforeQualityScore: null,
      afterQualityScore: status === "COMPLETED" ? 0.94 : null,
      damageSeverity: null,
      damageScore: null,
      originalStorageKey: "originals/print-qa.jpg",
      finalStorageKey: status === "COMPLETED" ? "finals/print-qa.jpg" : null,
      originalUrl: null,
      finalUrl: status === "COMPLETED" ? "/assets/hero/hero/hero-01-affluent-parents-now.jpg" : null,
      availableTiers: status === "COMPLETED" ? ["master"] : []
    }]
  };
}

async function mockOrder(page: import("@playwright/test").Page, body: unknown, status = 200) {
  await page.route(`**/api/restorations/${ORDER_ID}`, async (route) => {
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ success: true, data: body }) });
  });
}

async function mockNotFound(page: import("@playwright/test").Page) {
  await page.route(`**/api/restorations/${ORDER_ID}`, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ success: false, code: "NOT_FOUND", message: "Not found" })
    });
  });
}

test.describe("truthful print checkout", () => {
  test("completed result renders with pending checkout and current pricing", async ({ page }) => {
    await mockOrder(page, orderFixture("COMPLETED"));
    await page.goto(`/restore/${ORDER_ID}/print`);

    await expect(page.getByText("PRINT_CHECKOUT_PENDING")).toBeVisible();
    await expect(page.getByAltText("Restored result")).toBeVisible();
    await expect(page.getByRole("link", { name: "View Current Pricing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
    await expect(page.getByText(/PKR\s*\d/)).toHaveCount(0);
  });

  test("unfinished and failed restorations cannot print", async ({ page }) => {
    for (const status of ["PROCESSING", "FAILED"] as const) {
      await mockOrder(page, orderFixture(status));
      await page.goto(`/restore/${ORDER_ID}/print`);
      await expect(page.getByText("There is no completed restoration result to print yet.")).toBeVisible();
      await expect(page.getByAltText("Restored result")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
      await page.reload();
    }
  });

  test("wrong owner is uniformly blocked and has no checkout controls", async ({ page }) => {
    await mockNotFound(page);
    await page.goto(`/restore/${ORDER_ID}/print`);

    await expect(page.getByText("Not found")).toBeVisible();
    await expect(page.getByRole("link", { name: "View Current Pricing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  });

  test("refresh performs read-only GET and never creates print/payment writes", async ({ page }) => {
    const methods: string[] = [];
    await page.route(`**/api/restorations/${ORDER_ID}`, async (route) => {
      methods.push(route.request().method());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: orderFixture("COMPLETED") }) });
    });
    await page.goto(`/restore/${ORDER_ID}/print`);
    await page.reload();
    expect(methods.length).toBeGreaterThanOrEqual(2);
    expect(methods.some((method) => method !== "GET")).toBe(false);
  });

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 900 },
    { width: 430, height: 900 },
    { width: 390, height: 844 },
    { width: 360, height: 800 }
  ]) {
    test(`fits without horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mockOrder(page, orderFixture("COMPLETED"));
      await page.goto(`/restore/${ORDER_ID}/print`);
      await expect(page.getByRole("heading", { name: "Print your restored memory." })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      const colors = await page.locator(".site-header").evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, border: style.borderBottomColor };
      });
      expect(colors.border).not.toBe("rgb(223, 232, 225)");
    });
  }
});
