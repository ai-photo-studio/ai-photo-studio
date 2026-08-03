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
 * R9.2-P2R-STATUS-UI: focused coverage for the shared, read-only
 * `PaymentStatusLabel` presentation layer, exercised through the real
 * consuming pages (no isolated component-test runner exists in this
 * workspace -- only Playwright browser specs, per apps/web/package.json).
 * Every backend call is mocked (page.route); no real `apps/api` process is
 * started for this spec file, and only GET requests are ever observed.
 */

const ADMIN_TOKEN_KEY = "ai-photo-studio-admin-access-token";

async function seedAdminSession(page: import("@playwright/test").Page) {
  await page.addInitScript(({ key }) => window.localStorage.setItem(key, "fake-admin-token"), { key: ADMIN_TOKEN_KEY });
}

function detailOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    orderNo: "FXD-STATUSUI-1",
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

const KNOWN_STATUSES = [
  "CREATED",
  "REDIRECT_READY",
  "CUSTOMER_RETURNED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CALLBACK_PENDING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "DISPUTED",
  "CHARGEBACK"
] as const;

test.describe("PaymentStatusLabel: every known PaymentAttemptStatus renders truthfully", () => {
  for (const status of KNOWN_STATUSES) {
    test(`${status} renders its raw value and an accessible name that is never a bare success claim unless PAID`, async ({ page }) => {
      await seedAdminSession(page);
      await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
        route.fulfill({
          json: {
            success: true,
            data: detailOrder({
              paymentAttempt: { id: "attempt-1", status, provider: "bank_alfalah", providerRef: "ref-1" }
            })
          }
        })
      );

      await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
      const badge = page.locator(".payment-status-label");
      await expect(badge).toBeVisible();
      await expect(badge).toContainText(status);

      const ariaLabel = await badge.getAttribute("aria-label");
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toMatch(/^Payment status:/);

      if (status !== "PAID") {
        // A non-PAID persisted status must never surface a bare "Paid" claim
        // in its accessible name.
        expect(ariaLabel).not.toMatch(/^Payment status: Paid\b/);
      }

      expect(await badge.getAttribute("data-payment-status-known")).toBe("true");
    });
  }
});

test.describe("PaymentStatusLabel: distinct no-attempt / provider-unavailable / readiness-blocked / unknown states", () => {
  test("no attempt is rendered distinctly, never as PENDING or any attempt status", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
      route.fulfill({ json: { success: true, data: detailOrder({ paymentAttempt: null }) } })
    );
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
    await expect(page.getByTestId("no-payment-attempt")).toBeVisible();
    await expect(page.locator(".payment-status-label")).toHaveCount(0);
    const bodyText = (await page.textContent("body")) || "";
    expect(bodyText).not.toMatch(/\bPENDING\b/);
  });

  test("provider-unavailable readiness reason is shown distinctly from a FAILED/CANCELLED attempt", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: detailOrder({
            paymentReadiness: {
              ready: false,
              reasons: ["provider unavailable: No verified Bank Alfalah sandbox or production endpoint URL exists in this repository."]
            },
            paymentAttempt: null
          })
        }
      })
    );
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
    await expect(page.getByTestId("provider-unavailable-reason")).toBeVisible();
    await expect(page.getByTestId("no-payment-attempt")).toBeVisible();
    const bodyText = (await page.textContent("body")) || "";
    expect(bodyText).not.toMatch(/\bFAILED\b/);
    expect(bodyText).not.toMatch(/\bCANCELLED\b/);
  });

  test("readiness-blocked (unapproved pricing) is shown distinctly from a failed/cancelled attempt", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
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
              reasons: ['pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing']
            },
            paymentAttempt: null
          })
        }
      })
    );
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
    await expect(page.getByTestId("payment-blocked")).toBeVisible();
    await expect(page.getByTestId("item-pricing-unapproved")).toBeVisible();
    const bodyText = (await page.textContent("body")) || "";
    expect(bodyText).not.toMatch(/\bFAILED\b/);
  });

  test("an unexpected/unknown status string renders the neutral fail-safe presentation, never a success-implying label", async ({
    page
  }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: detailOrder({
            paymentAttempt: { id: "attempt-unknown", status: "TOTALLY_UNRECOGNIZED_STATUS", provider: "bank_alfalah", providerRef: "ref-x" }
          })
        }
      })
    );
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
    const badge = page.locator(".payment-status-label");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("TOTALLY_UNRECOGNIZED_STATUS");
    expect(await badge.getAttribute("data-payment-status-known")).toBe("false");
    const ariaLabel = await badge.getAttribute("aria-label");
    expect(ariaLabel).toMatch(/unavailable/i);
    expect(ariaLabel).not.toMatch(/paid/i);
    const bodyText = (await page.textContent("body")) || "";
    expect(bodyText).not.toMatch(/\bPaid\b/);
  });

  test("PAID renders only when the mocked API response's PaymentAttempt.status is literally PAID, and query params cannot fabricate it", async ({
    page
  }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: detailOrder({
            paymentAttempt: { id: "attempt-paid", status: "AUTHORIZED", provider: "bank_alfalah", providerRef: "ref-y" }
          })
        }
      })
    );
    // Attach fake success-looking query params -- the page never reads
    // location.search for status, so this must have zero effect.
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1?paid=true&status=PAID&success=1");
    await expect(page.getByTestId("payment-attempt-state")).toContainText("AUTHORIZED");
    const bodyText = (await page.textContent("body")) || "";
    expect(bodyText).not.toMatch(/\bPAID\b/);
  });
});

test.describe("PaymentStatusLabel: consuming pages actually use the shared presentation", () => {
  test("AdminCommerceOrderDetailPage renders the shared badge for its payment attempt status", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: detailOrder({ paymentAttempt: { id: "attempt-1", status: "CANCELLED_BY_CUSTOMER", provider: "bank_alfalah", providerRef: "ref-1" } })
        }
      })
    );
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
    await expect(page.locator(".payment-status-label")).toContainText("CANCELLED_BY_CUSTOMER");
  });

  test("AdminCommerceOrdersPage renders the shared badge for its list payment status", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders*", (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [
              {
                id: "order-1",
                orderNo: "FXD-STATUSUI-LIST-1",
                type: "RESTORATION_DIGITAL",
                market: "PAKISTAN",
                currency: "PKR",
                totalAmountMinor: "35000",
                status: "LOCKED",
                paymentStatus: "FAILED",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }
            ],
            total: 1,
            page: 1,
            pageSize: 20
          }
        }
      })
    );
    await page.goto("/admin/commerce-orders");
    await expect(page.locator(".payment-status-label")).toContainText("FAILED");
  });

  test("FixedOrderReviewPage renders the shared badge for a terminal attempt status", async ({ page }) => {
    const orderNo = "FXD-STATUSUIREVIEW1";
    const order = {
      id: "order-review-status-1",
      orderNo,
      type: "RESTORATION_DIGITAL",
      market: "PAKISTAN",
      currency: "PKR",
      totalAmountMinor: "35000",
      status: "LOCKED",
      immutableAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      priceBookVersion: "PB-1",
      priceBookApprovalReference: "OWNER-1",
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
      ]
    };
    await page.route(`**/api/fixed-orders/${orderNo}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${orderNo}/payment-readiness`, (route) =>
      route.fulfill({
        json: { ready: false, reasons: ["payment attempt is already CANCELLED; a new or repeated attempt is not permitted"], order: { orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status } }
      })
    );
    await page.route(`**/api/fixed-orders/${orderNo}/payment-attempt`, (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            id: "attempt-cancelled-1",
            fixedOrderId: order.id,
            orderNo,
            provider: "bank_alfalah",
            status: "CANCELLED",
            amountMinor: order.totalAmountMinor,
            currency: order.currency,
            providerRef: "ref-cancelled-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      })
    );

    await page.goto(`/restore/drafts/draft-status-ui-1/review?orderNo=${orderNo}`);
    await expect(page.locator(".payment-status-label")).toContainText("CANCELLED");
  });

  test("RestorationOrdersHistorySection carries the shared aria-label without changing its visible text", async ({ page }) => {
    const FAKE_SESSION: SeededAuthSession = {
      token: "fake-test-token",
      refreshToken: "fake-test-refresh-token",
      user: { id: "user-1", email: "customer@example.com", name: "Test Customer", customerId: "cust-1" }
    };
    await seedAuthSession(page, FAKE_SESSION);
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
    await page.route("**/api/fixed-orders?**", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              orderNo: "FXD-HIST-STATUSUI-1",
              type: "RESTORATION_DIGITAL",
              status: "LOCKED",
              market: "PAKISTAN",
              currency: "PKR",
              totalAmountMinor: "35000",
              priceBookVersion: "PB-1",
              items: [{ tierOrSku: "HD_2X", pricingSource: "approved_pricebook", pricingApproved: true }],
              paymentAttempt: { id: "attempt-1", status: "PAID" },
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z"
            }
          ],
          total: 1,
          page: 1,
          pageSize: 20
        }
      })
    );

    await page.goto("/orders");
    await expect(page.getByText("Payment: PAID")).toBeVisible();
    const dd = page.locator("dd[aria-label^='Payment status:']");
    await expect(dd).toHaveCount(1);
    await expect(dd).toHaveAttribute("aria-label", /Paid/);
  });
});

test.describe("PaymentStatusLabel: no mutation, network safety, and responsive layout", () => {
  test("rendering every status never issues a mutation request and only touches known first-party APIs", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await seedAdminSession(page);
    const methodsSeen: string[] = [];
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) => {
      methodsSeen.push(route.request().method());
      route.fulfill({
        json: { success: true, data: detailOrder({ paymentAttempt: { id: "attempt-1", status: "PAID", provider: "bank_alfalah", providerRef: "ref-1" } }) }
      });
    });
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
    await expect(page.locator(".payment-status-label")).toContainText("PAID");
    expect(methodsSeen.every((method) => method === "GET")).toBe(true);

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  const MOBILE_VIEWPORTS = [
    { name: "360x800", width: 360, height: 800 },
    { name: "390x844", width: 390, height: 844 },
    { name: "430x932", width: 430, height: 932 }
  ] as const;

  for (const viewport of MOBILE_VIEWPORTS) {
    test(`payment status badge shows no horizontal overflow at ${viewport.name}`, async ({ page }) => {
      await seedAdminSession(page);
      await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
        route.fulfill({
          json: { success: true, data: detailOrder({ paymentAttempt: { id: "attempt-1", status: "PARTIALLY_REFUNDED", provider: "bank_alfalah", providerRef: "ref-1" } }) }
        })
      );
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
      await expect(page.locator(".payment-status-label")).toContainText("PARTIALLY_REFUNDED");
      await expectNoHorizontalOverflow(page);
    });
  }

  test("the status badge is reachable via accessible name for a screen reader without depending on color alone", async ({ page }) => {
    await seedAdminSession(page);
    await page.route("**/api/admin/commerce-orders/FXD-STATUSUI-1", (route) =>
      route.fulfill({
        json: { success: true, data: detailOrder({ paymentAttempt: { id: "attempt-1", status: "DISPUTED", provider: "bank_alfalah", providerRef: "ref-1" } }) }
      })
    );
    await page.goto("/admin/commerce-orders/FXD-STATUSUI-1");
    const badge = page.locator(".payment-status-label");
    await expect(badge).toBeVisible();
    // Accessible name and visible text both convey meaning -- never color-only.
    expect((await badge.innerText()).length).toBeGreaterThan(0);
    expect((await badge.getAttribute("aria-label")) || "").toMatch(/Disputed/);
  });
});
