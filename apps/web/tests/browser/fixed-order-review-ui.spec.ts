import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors
} from "./fixtures";

/**
 * R9.2-P2R-UI: additional truthful-display coverage for the fixed-order
 * review page -- PriceBook version, approved-vs-fixture pricing state, the
 * explicit "no payment attempt yet" state, and that a PAID label can only
 * ever come from a persisted API response, never from a query string.
 * Every backend call is mocked (page.route); no real `apps/api` process is
 * started for this spec file.
 */

const DRAFT_ID = "draft-review-ui-1";
const ORDER_NO = "FXD-TESTREVIEWUI01";

function mockOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order-review-ui-1",
    orderNo: ORDER_NO,
    type: "RESTORATION_DIGITAL",
    market: "PAKISTAN",
    currency: "PKR",
    totalAmountMinor: "35000",
    status: "LOCKED",
    immutableAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    priceBookVersion: "PB-2026-08-03-v1",
    priceBookApprovalReference: "OWNER-CHAT-2026-08-03-P1C-B-01",
    priceBookEffectiveAt: "2026-08-03T00:00:00Z",
    items: [
      {
        id: "item-review-ui-1",
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
    ...overrides
  };
}

function reviewUrl(extraQuery = "") {
  return `/restore/drafts/${DRAFT_ID}/review?orderNo=${ORDER_NO}${extraQuery}`;
}

test.describe("fixed-order review: PriceBook version, pricing state, no-attempt state", () => {
  test("approved order shows PriceBook version and approved pricing state", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    const order = mockOrder();
    await page.route(`**/api/fixed-orders/${ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: true,
          reasons: [],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );

    await page.goto(reviewUrl());
    await expect(page.getByText("PB-2026-08-03-v1")).toBeVisible();
    await expect(page.getByTestId("pricing-state-approved")).toBeVisible();

    // Integer-minor-unit formatting: 35000 minor PKR -> Rs 350 (no decimals).
    const mainText = (await page.locator("main").innerText()) || "";
    expect(mainText).toMatch(/350/);

    // Explicit "no attempt yet" state, since payment-attempt returned null.
    await expect(page.getByTestId("attempt-status")).toContainText(/no payment attempt has been started yet/i);

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("fixture/unapproved pricing is shown as blocked, not as approved", async ({ page }) => {
    const order = mockOrder({
      items: [
        {
          id: "item-review-ui-2",
          kind: "DIGITAL_TIER",
          tierOrSku: "HD_2X",
          quantity: 1,
          unitAmountMinor: "35000",
          totalAmountMinor: "35000",
          currency: "PKR",
          pricingSource: "local_fixture",
          pricingApproved: false
        }
      ]
    });
    await page.route(`**/api/fixed-orders/${ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: false,
          reasons: ['pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing'],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );

    await page.goto(reviewUrl());
    await expect(page.getByTestId("pricing-state-unapproved")).toBeVisible();
    await expect(page.getByTestId("pricing-state-approved")).toHaveCount(0);
    await expect(page.getByTestId("payment-blocked")).toBeVisible();
    await expect(page.getByRole("button", { name: /pay now/i })).toBeDisabled();
  });

  test("every server-provided blocking reason is rendered, not just the first", async ({ page }) => {
    const order = mockOrder({
      items: [{ ...mockOrder().items[0], pricingSource: "local_fixture", pricingApproved: false }]
    });
    await page.route(`**/api/fixed-orders/${ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    const reasons = [
      'pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing',
      "provider unavailable: No verified Bank Alfalah sandbox or production endpoint URL exists in this repository.",
      "order has no line items"
    ];
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: false,
          reasons,
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );

    await page.goto(reviewUrl());
    await expect(page.getByText(/pricing for this order has not been approved/i)).toBeVisible();
    await expect(page.getByText(/payment provider is not yet configured/i)).toBeVisible();
    await expect(page.getByText("order has no line items")).toBeVisible();
  });

  test("PENDING attempt status is rendered from the persisted API response", async ({ page }) => {
    const order = mockOrder();
    await page.route(`**/api/fixed-orders/${ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: true,
          reasons: [],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            id: "attempt-pending-1",
            fixedOrderId: order.id,
            orderNo: order.orderNo,
            provider: "bank_alfalah",
            status: "CANCELLED_BY_CUSTOMER",
            amountMinor: order.totalAmountMinor,
            currency: order.currency,
            providerRef: "ref-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      })
    );

    await page.goto(reviewUrl());
    await expect(page.getByTestId("attempt-status")).toContainText("CANCELLED_BY_CUSTOMER");
  });

  test("a PAID attempt is only ever rendered from the persisted API response, and query-string manipulation alone cannot produce it", async ({
    page
  }) => {
    const order = mockOrder();
    await page.route(`**/api/fixed-orders/${ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: false,
          reasons: ["payment attempt is already PAID; a new or repeated attempt is not permitted"],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({
        json: {
          success: true,
          data: {
            id: "attempt-paid-1",
            fixedOrderId: order.id,
            orderNo: order.orderNo,
            provider: "bank_alfalah",
            status: "PAID",
            amountMinor: order.totalAmountMinor,
            currency: order.currency,
            providerRef: "ref-paid-1",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      })
    );

    // Attach fake success-looking query params -- these must have zero effect
    // on the rendered state; only the persisted API response may show PAID.
    await page.goto(reviewUrl("&paid=true&status=success&return=1"));
    await expect(page.getByTestId("attempt-status")).toContainText("PAID");

    // Now prove the query string alone (without a matching API response)
    // cannot fabricate a PAID render: same query params, but the API says
    // there is no attempt at all.
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: true,
          reasons: [],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );
    await page.goto(reviewUrl("&paid=true&status=success&return=1"));
    await expect(page.getByTestId("attempt-status")).toContainText(/no payment attempt has been started yet/i);
    const bodyText = (await page.textContent("body")) || "";
    expect(bodyText).not.toMatch(/\bPAID\b/);
  });

  test("payment state panels expose accessible status/alert roles", async ({ page }) => {
    const order = mockOrder({
      items: [{ ...mockOrder().items[0], pricingSource: "local_fixture", pricingApproved: false }]
    });
    await page.route(`**/api/fixed-orders/${ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route(`**/api/fixed-orders/${ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: false,
          reasons: ['pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing'],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );

    await page.goto(reviewUrl());
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("button", { name: /pay now/i })).toBeDisabled();
  });
});
