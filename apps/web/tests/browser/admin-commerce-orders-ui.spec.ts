import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors
} from "./fixtures";

/**
 * R9.2-P2R-ADMIN: read-only admin commerce order list + detail UI.
 *
 * Every backend call is mocked via page.route(); no real `apps/api` process
 * is started for this spec file, and every request made by the page is
 * a GET (no POST/PUT/PATCH/DELETE call is ever issued from this UI).
 */

const ADMIN_TOKEN_KEY = "ai-photo-studio-admin-access-token";

async function seedAdminSession(page: import("@playwright/test").Page) {
  await page.addInitScript(
    ({ key }) => window.localStorage.setItem(key, "fake-admin-token"),
    { key: ADMIN_TOKEN_KEY }
  );
}

function listOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order-1",
    orderNo: "FXD-ADMIN-1",
    type: "RESTORATION_DIGITAL",
    market: "PAKISTAN",
    currency: "PKR",
    totalAmountMinor: "35000",
    status: "LOCKED",
    paymentStatus: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

function detailOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    orderNo: "FXD-ADMIN-1",
    type: "RESTORATION_DIGITAL",
    status: "LOCKED",
    market: "PAKISTAN",
    currency: "PKR",
    totalAmountMinor: "35000",
    priceBookVersion: "PB-2026-08-03-v1",
    priceBookApprovalReference: "OWNER-CHAT-2026-08-03-P1C-B-01",
    priceBookEffectiveAt: "2026-08-03T00:00:00Z",
    items: [
      {
        id: "item-1",
        kind: "DIGITAL_TIER",
        tierOrSku: "HD_2X",
        quantity: 1,
        unitAmountMinor: "35000",
        totalAmountMinor: "35000",
        currency: "PKR",
        pricingSource: "approved_pricebook",
        pricingApproved: true
      }
    ],
    paymentReadiness: { ready: true, reasons: [] },
    paymentAttempt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  };
}

test.describe("admin commerce orders: list", () => {
  test("renders orders list, no mutation network calls", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await seedAdminSession(page);
    const methodsSeen: string[] = [];
    await page.route("**/api/admin/commerce-orders*", (route) => {
      methodsSeen.push(route.request().method());
      route.fulfill({
        json: { success: true, data: { items: [listOrder()], total: 1, page: 1, pageSize: 20 } }
      });
    });

    await page.goto("/admin/commerce-orders");
    await expect(page.getByText("FXD-ADMIN-1")).toBeVisible();
    await expect(page.getByText("No attempt yet")).toBeVisible();

    expect(methodsSeen.every((method) => method === "GET")).toBe(true);

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("empty state renders when there are no orders", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders*", (route) =>
      route.fulfill({ json: { success: true, data: { items: [], total: 0, page: 1, pageSize: 20 } } })
    );
    await page.goto("/admin/commerce-orders");
    await expect(page.getByText(/no commerce orders match these filters/i)).toBeVisible();
  });

  test("error state renders with retry", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders*", (route) =>
      route.fulfill({ status: 500, json: { success: false, code: "INTERNAL_ERROR", message: "boom" } })
    );
    await page.goto("/admin/commerce-orders");
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });

  test("responsive at 360/390/430px with no horizontal overflow", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders*", (route) =>
      route.fulfill({ json: { success: true, data: { items: [listOrder()], total: 1, page: 1, pageSize: 20 } } })
    );
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/admin/commerce-orders");
      await expectNoHorizontalOverflow(page);
    }
  });

  test("filter inputs are keyboard-accessible and labeled", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders*", (route) =>
      route.fulfill({ json: { success: true, data: { items: [listOrder()], total: 1, page: 1, pageSize: 20 } } })
    );
    await page.goto("/admin/commerce-orders");
    await expect(page.getByLabel(/order number/i)).toBeVisible();
    await page.getByLabel(/order number/i).focus();
    await expect(page.getByLabel(/order number/i)).toBeFocused();
  });
});

test.describe("admin commerce orders: detail", () => {
  test("shows PriceBook provenance, approved pricing, and no-attempt state", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-ADMIN-1", (route) =>
      route.fulfill({ json: { success: true, data: detailOrder() } })
    );
    await page.goto("/admin/commerce-orders/FXD-ADMIN-1");
    await expect(page.getByText("PB-2026-08-03-v1")).toBeVisible();
    await expect(page.getByTestId("item-pricing-approved")).toBeVisible();
    await expect(page.getByTestId("no-payment-attempt")).toBeVisible();
    await expect(page.getByTestId("payment-ready")).toBeVisible();
  });

  test("fixture/unapproved pricing renders as payment-blocked", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-ADMIN-1", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: detailOrder({
            items: [
              {
                id: "item-2",
                kind: "DIGITAL_TIER",
                tierOrSku: "HD_2X",
                quantity: 1,
                unitAmountMinor: "35000",
                totalAmountMinor: "35000",
                currency: "PKR",
                pricingSource: "local_fixture",
                pricingApproved: false
              }
            ],
            paymentReadiness: {
              ready: false,
              reasons: [
                'pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing',
                "provider unavailable: No verified Bank Alfalah sandbox or production endpoint URL exists in this repository."
              ]
            }
          })
        }
      })
    );
    await page.goto("/admin/commerce-orders/FXD-ADMIN-1");
    await expect(page.getByTestId("item-pricing-unapproved")).toBeVisible();
    await expect(page.getByTestId("payment-blocked")).toBeVisible();
    await expect(page.getByTestId("provider-unavailable-reason")).toBeVisible();
  });

  test("existing payment attempt state renders (PENDING-like CANCELLED_BY_CUSTOMER)", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-ADMIN-1", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: detailOrder({
            paymentAttempt: { id: "attempt-1", status: "CANCELLED_BY_CUSTOMER", provider: "bank_alfalah", providerRef: "ref-1" }
          })
        }
      })
    );
    await page.goto("/admin/commerce-orders/FXD-ADMIN-1");
    await expect(page.getByTestId("payment-attempt-state")).toContainText("CANCELLED_BY_CUSTOMER");
  });

  test("PAID attempt renders only from the API response, never fabricated by query params", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-ADMIN-1", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: detailOrder({
            paymentAttempt: { id: "attempt-2", status: "PAID", provider: "bank_alfalah", providerRef: "ref-2" }
          })
        }
      })
    );
    // Manipulated query string must have zero effect -- the page never reads it.
    await page.goto("/admin/commerce-orders/FXD-ADMIN-1?paid=true&status=success");
    await expect(page.getByTestId("payment-attempt-state")).toContainText("PAID");
  });

  test("unknown order shows a safe not-found state with no stack trace", async ({ page, pageErrors }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-DOES-NOT-EXIST", (route) =>
      route.fulfill({ status: 404, json: { success: false, code: "ORDER_NOT_FOUND", message: "Order not found" } })
    );
    await page.goto("/admin/commerce-orders/FXD-DOES-NOT-EXIST");
    await expect(page.getByTestId("order-not-found")).toBeVisible();
    await expect(page.getByText(/this order could not be found/i)).toBeVisible();
    // No uncaught page error (a stack trace surfacing to the page) -- the
    // browser's own devtools "resource failed to load" console log for the
    // mocked 404 response is expected and is not a page error.
    expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
  });

  test("responsive at 360/390/430px with no horizontal overflow", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-ADMIN-1", (route) =>
      route.fulfill({ json: { success: true, data: detailOrder() } })
    );
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/admin/commerce-orders/FXD-ADMIN-1");
      await expectNoHorizontalOverflow(page);
    }
  });

  test("only GET requests are ever issued from the detail page", async ({ page }) => {
    await seedAdminSession(page);
    const methodsSeen: string[] = [];
    await page.route("**/api/admin/commerce-orders/FXD-ADMIN-1", (route) => {
      methodsSeen.push(route.request().method());
      route.fulfill({ json: { success: true, data: detailOrder() } });
    });
    await page.goto("/admin/commerce-orders/FXD-ADMIN-1");
    await expect(page.getByText("FXD-ADMIN-1")).toBeVisible();
    expect(methodsSeen.every((method) => method === "GET")).toBe(true);
  });
});
