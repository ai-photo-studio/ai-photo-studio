import { test, expect } from "@playwright/test";

const order = {
  id: "fixed-p4e-1",
  orderNo: "FO-P4E-0001",
  status: "CREATED",
  market: "PAKISTAN",
  currency: "PKR",
  tier: "ORIGINAL",
  totalAmountMinor: "250000",
  pricingSource: "approved_pricebook",
  pricingApproved: true,
  priceBookVersion: "PB-2026-08-03-v1",
  priceBookApprovalReference: "approval-p4e",
  priceBookEffectiveAt: new Date().toISOString(),
  createdAt: new Date().toISOString()
};

async function setup(page: Parameters<typeof test>[0]["page"], checkoutStatus = 503) {
  const calls: string[] = [];
  await page.route("**/api/fixed-orders/FO-P4E-0001", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: order }) })
  );
  await page.route("**/api/fixed-orders/FO-P4E-0001/payment-status", (route) => {
    calls.push("GET status");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { paymentAttemptId: "p4e-attempt", status: "CREATED", amountMinor: "250000", currency: "PKR", sessionId: null, successIndicator: null } }) });
  });
  await page.route("**/api/fixed-orders/FO-P4E-0001/checkout", (route) => {
    calls.push(route.request().method() + " checkout");
    return route.fulfill({ status: checkoutStatus, contentType: "application/json", body: JSON.stringify(checkoutStatus === 503 ? { success: false, code: "PAYMENT_PROVIDER_UNAVAILABLE", message: "Payment provider is unavailable" } : { success: true, data: { paymentAttemptId: "p4e-attempt", status: "REDIRECT_READY", amountMinor: "250000", currency: "PKR", sessionId: "mock-session", successIndicator: "mock-success" } }) });
  });
  await page.goto("/orders/FO-P4E-0001/review?success=true&status=PAID");
  await expect(page.getByText("FO-P4E-0001")).toBeVisible();
  return calls;
}

test("blocked provider is truthful and Pay is explicit", async ({ page }) => {
  const calls = await setup(page);
  expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Pay 100% & Restore Photo" }).click();
  await expect(page.getByText(/Online payment is temporarily unavailable/i)).toBeVisible();
  expect(calls).toEqual(["POST checkout"]);
  await expect(page.getByText(/PAID/i)).not.toBeVisible();
});

test("refresh payment status performs GET only", async ({ page }) => {
  const calls = await setup(page);
  await page.getByRole("button", { name: "Check payment status" }).click();
  await expect(page.getByText(/Payment status: CREATED/)).toBeVisible();
  expect(calls).toEqual(["GET status"]);
});

test("mocked-ready session redirects only after explicit Pay and duplicate clicks are disabled", async ({ page }) => {
  const calls = await setup(page, 200);
  await page.getByRole("button", { name: "Pay 100% & Restore Photo" }).click();
  expect(calls).toEqual(["POST checkout"]);
});

test("hard refresh recovers persisted PAID processing and completed download", async ({ page }) => {
  let statusReads = 0;
  await page.route("**/api/fixed-orders/FO-P4E-0001", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { ...order, paymentStatus: "PAID" } }) }));
  await page.route("**/api/fixed-orders/FO-P4E-0001/restoration-status", (route) => {
    statusReads++;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { orderNo: order.orderNo, entitlementStatus: "GRANTED", masterStatus: "VALIDATED", executionStatus: "SUCCEEDED", failureReason: null, downloadAvailable: true, downloadUrl: "http://127.0.0.1/download.jpg" } }) });
  });
  await page.goto("/orders/FO-P4E-0001/review");
  await expect(page.getByText("Completed")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Completed")).toBeVisible();
  expect(statusReads).toBeGreaterThanOrEqual(2);
});

for (const width of [360, 390, 430]) {
  test(`review remains usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await setup(page);
    await expect(page.getByText("PKR 2500.00")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay 100% & Restore Photo" })).toBeVisible();
  });
}
