import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors,
  seedAuthSession,
  type SeededAuthSession
} from "./fixtures";

/**
 * R9.2-P2R-CUSTOMER-ORDERS: the new "Restoration orders" section added to
 * the existing (authenticated) /orders page. Backend is fully mocked via
 * page.route -- no real apps/api process is started for this spec file.
 */

const FAKE_SESSION: SeededAuthSession = {
  token: "fake-test-token",
  refreshToken: "fake-test-refresh-token",
  user: { id: "user-1", email: "customer@example.com", name: "Test Customer", customerId: "cust-1" }
};

async function mockLegacyOrdersPageApis(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: FAKE_SESSION.user }));
  await page.route("**/api/me/wallet", (route) =>
    route.fulfill({
      json: {
        user: FAKE_SESSION.user,
        wallet: { id: "w1", userId: "user-1", balance: 0, reservedBalance: 0, lifetimeSpent: 0, lifetimeCredited: 0, currency: "PKR", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), availableBalance: 0, transactions: [], subscriptions: [] },
        summary: { availableBalance: 0, totalTransactions: 0, activeSubscriptions: 0, lifetimeSpent: 0, lifetimeCredited: 0, pendingPayments: 0 },
        activeSubscription: null
      }
    })
  );
  await page.route("**/api/packages**", (route) => route.fulfill({ json: [] }));
}

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    orderNo: "FXD-HIST-1",
    type: "RESTORATION_DIGITAL",
    status: "LOCKED",
    market: "PAKISTAN",
    currency: "PKR",
    totalAmountMinor: "35000",
    priceBookVersion: "PB-1",
    items: [{ tierOrSku: "HD_2X", pricingSource: "approved_pricebook", pricingApproved: true }],
    paymentAttempt: { id: "attempt-1", status: "PAID" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides
  };
}

test.describe("customer orders history: renders alongside legacy content", () => {
  test("legacy order-status content is preserved and the new section appears with real data", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({ json: { items: [orderFixture()], total: 1, page: 1, pageSize: 20 } })
    );

    await page.goto("/orders");
    await expect(page.getByRole("heading", { level: 1, name: "Track credits, uploads, and downloads in one place." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Your restoration orders" })).toBeVisible();
    await expect(page.getByText("FXD-HIST-1")).toBeVisible();
    await expect(page.getByText("Owner-approved pricing")).toBeVisible();
    await expect(page.getByText("Payment: PAID")).toBeVisible();
    await expect(page.getByRole("link", { name: "View order" })).toHaveAttribute(
      "href",
      "/restore/drafts/account/review?orderNo=FXD-HIST-1"
    );

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("empty state is truthful when the customer has no orders", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } })
    );

    await page.goto("/orders");
    await expect(page.getByText("You have no restoration orders yet.")).toBeVisible();
  });

  test("no-attempt state renders truthfully, not as a fabricated status", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({
        json: { items: [orderFixture({ paymentAttempt: null, items: [{ tierOrSku: "ORIGINAL", pricingSource: "local_fixture", pricingApproved: false }] })], total: 1, page: 1, pageSize: 20 }
      })
    );

    await page.goto("/orders");
    await expect(page.getByText("No payment attempt yet")).toBeVisible();
    await expect(page.getByText("Fixture pricing (not payment-eligible)")).toBeVisible();
  });

  test("error state shows a retry control that succeeds on retry", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    let callCount = 0;
    await page.route("**/api/fixed-orders?**", (route) => {
      callCount += 1;
      if (callCount === 1) {
        route.fulfill({ status: 500, json: { success: false, code: "INTERNAL_ERROR", message: "boom" } });
        return;
      }
      route.fulfill({ json: { items: [orderFixture()], total: 1, page: 1, pageSize: 20 } });
    });

    await page.goto("/orders");
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("FXD-HIST-1")).toBeVisible();
  });

  test("tampering with URL query params cannot fabricate a PAID display", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({ json: { items: [orderFixture({ status: "CREATED", paymentAttempt: null })], total: 1, page: 1, pageSize: 20 } })
    );

    await page.goto("/orders?paid=true&status=PAID");
    await expect(page.getByText("No payment attempt yet")).toBeVisible();
    await expect(page.getByText("Payment: PAID")).toHaveCount(0);
  });
});

const MOBILE_VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 }
] as const;

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`customer orders history responsive @ ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("renders without horizontal overflow at mobile widths", async ({
      page,
      consoleErrors,
      pageErrors,
      failedFirstPartyRequests,
      blockedRequests
    }) => {
      await seedAuthSession(page, FAKE_SESSION);
      await mockLegacyOrdersPageApis(page);
      await page.route("**/api/fixed-orders?**", (route) =>
        route.fulfill({ json: { items: [orderFixture()], total: 1, page: 1, pageSize: 20 } })
      );

      await page.goto("/orders");
      await expect(page.getByRole("heading", { level: 2, name: "Your restoration orders" })).toBeVisible();

      await expectNoHorizontalOverflow(page);
      expectNoPageErrors(consoleErrors, pageErrors);
      expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
      expectCleanNetwork(blockedRequests);
    });
  });
}

/**
 * R9.2-P2R-ADMIN-READINESS-REFINEMENT: presentation-only refinements to this
 * same section. No new API field is used -- `market`, `priceBookVersion`, and
 * per-item `pricingApproved` are all already returned by
 * `GET /api/fixed-orders` and are asserted here exactly as the server sent them.
 */
test.describe("customer orders history: readiness/immutable-fact refinement", () => {
  test("a mixed order with any unapproved line is NOT presented as owner-approved pricing", async ({
    page,
    blockedRequests
  }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({
        json: {
          items: [
            orderFixture({
              items: [
                { tierOrSku: "HD_2X", pricingSource: "approved_pricebook", pricingApproved: true },
                { tierOrSku: "PRINT_A4", pricingSource: "local_fixture", pricingApproved: false }
              ]
            })
          ],
          total: 1,
          page: 1,
          pageSize: 20
        }
      })
    );

    await page.goto("/orders");
    await expect(page.getByTestId("history-pricing-unapproved")).toHaveText("Fixture pricing (not payment-eligible)");
    await expect(page.getByTestId("history-pricing-approved")).toHaveCount(0);
    await expect(page.getByText("Owner-approved pricing")).toHaveCount(0);
    expectCleanNetwork(blockedRequests);
  });

  test("a fully approved order is still presented as owner-approved pricing", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({ json: { items: [orderFixture()], total: 1, page: 1, pageSize: 20 } })
    );

    await page.goto("/orders");
    await expect(page.getByTestId("history-pricing-approved")).toHaveText("Owner-approved pricing");
  });

  test("an order with no line items is never presented as owner-approved pricing", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({ json: { items: [orderFixture({ items: [] })], total: 1, page: 1, pageSize: 20 } })
    );

    await page.goto("/orders");
    await expect(page.getByTestId("history-pricing-unapproved")).toBeVisible();
  });

  test("market and PriceBook version are shown consistently, and PKR is displayed from minor units without conversion", async ({
    page,
    blockedRequests
  }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({ json: { items: [orderFixture()], total: 1, page: 1, pageSize: 20 } })
    );

    await page.goto("/orders");
    await expect(page.getByTestId("history-order-market")).toHaveText("Pakistan");
    await expect(page.getByTestId("history-order-pricebook-version")).toHaveText("PB-1");
    // 35000 PKR minor units -> PKR 350 exactly. No FX conversion, no USD text.
    await expect(page.getByText("350", { exact: false })).toBeVisible();
    await expect(page.getByText("$", { exact: false })).toHaveCount(0);
    expectCleanNetwork(blockedRequests);
  });

  test("a USD order is displayed in USD from its own minor units, with no FX recomputation", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({
        json: {
          items: [
            orderFixture({ orderNo: "FXD-HIST-USD", market: "INTERNATIONAL", currency: "USD", totalAmountMinor: "1200" })
          ],
          total: 1,
          page: 1,
          pageSize: 20
        }
      })
    );

    await page.goto("/orders");
    await expect(page.getByTestId("history-order-market")).toHaveText("International");
    await expect(page.getByText("$12", { exact: false })).toBeVisible();
  });

  test("a missing PriceBook snapshot renders as an explicit placeholder, never as an approved version", async ({
    page
  }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({
        json: { items: [orderFixture({ priceBookVersion: null })], total: 1, page: 1, pageSize: 20 }
      })
    );

    await page.goto("/orders");
    await expect(page.getByTestId("history-order-pricebook-version")).toHaveText("—");
  });

  test("order status and payment status remain separate, distinguishable fields", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({
        json: {
          items: [orderFixture({ status: "LOCKED", paymentAttempt: { id: "a1", status: "CALLBACK_PENDING" } })],
          total: 1,
          page: 1,
          pageSize: 20
        }
      })
    );

    await page.goto("/orders");
    await expect(page.getByText("LOCKED", { exact: true })).toBeVisible();
    await expect(page.getByText("Payment: CALLBACK_PENDING")).toBeVisible();
    await expect(page.getByText("Payment: LOCKED")).toHaveCount(0);
  });
});

test.describe("customer orders history: keyboard/accessibility", () => {
  test("the View order link is reachable via keyboard and properly labeled", async ({ page }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockLegacyOrdersPageApis(page);
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({ json: { items: [orderFixture()], total: 1, page: 1, pageSize: 20 } })
    );

    await page.goto("/orders");
    const link = page.getByRole("link", { name: "View order" });
    await expect(link).toBeVisible();
    await link.focus();
    await expect(link).toBeFocused();
  });
});
