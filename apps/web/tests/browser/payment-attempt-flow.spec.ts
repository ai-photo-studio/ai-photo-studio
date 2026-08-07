import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors
} from "./fixtures";

/**
 * R9.2-P1B: payment readiness -> idempotent PaymentAttempt UI on the fixed
 * -order review page. Every backend call is mocked (page.route) -- no real
 * `apps/api` process is started for this spec file, and the mock adapter's
 * "checkout URL" is always a `http://localhost/...` string that is rendered
 * as a link but never navigated to, so no external request is ever made.
 */

const PK_DRAFT_ID = "draft-pk-payment-1";
const PK_ORDER_NO = "FXD-TESTPAY01";
const INTL_DRAFT_ID = "draft-intl-payment-1";
const INTL_ORDER_NO = "FXD-TESTPAYINTL01";

function mockOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order-payment-1",
    orderNo: PK_ORDER_NO,
    type: "RESTORATION_DIGITAL",
    market: "PAKISTAN",
    currency: "PKR",
    totalAmountMinor: "25000",
    status: "CREATED",
    immutableAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    items: [
      {
        id: "item-payment-1",
        kind: "DIGITAL_TIER",
        tierOrSku: "ORIGINAL",
        quantity: 1,
        unitAmountMinor: "25000",
        totalAmountMinor: "25000",
        currency: "PKR",
        pricingSource: "local_fixture",
        pricingApproved: false
      }
    ],
    ...overrides
  };
}

function reviewUrl(draftId: string, orderNo: string) {
  return `/restore/drafts/${draftId}/review?orderNo=${orderNo}`;
}

test.describe("payment readiness and attempt UI", () => {
  test("local_fixture order shows a truthful blocked state with a disabled CTA", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    const order = mockOrder();
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );

    let releaseReadiness: () => void = () => undefined;
    const readinessGate = new Promise<void>((resolve) => { releaseReadiness = resolve; });
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-readiness`, async (route) => {
      await readinessGate;
      await route.fulfill({
        json: {
          ready: false,
          reasons: ['pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing'],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      });
    });

    await page.goto(reviewUrl(PK_DRAFT_ID, PK_ORDER_NO));
    await expect(page.getByRole("heading", { level: 1, name: "Order Review" })).toBeVisible();

    // Loading state is visible while the readiness check is in flight.
    await expect(page.getByText(/checking payment readiness/i)).toBeVisible();
    releaseReadiness();

    await expect(page.getByText(/payment is not available for this order yet/i)).toBeVisible();
    await expect(page.getByText(/pricing for this order has not been approved/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /pay now/i })).toBeDisabled();

    // Never a fabricated success/paid label anywhere on the page.
    const bodyText = (await page.textContent("body")) || "";
    if (/payment (successful|complete|confirmed)/i.test(bodyText)) {
      throw new Error("Blocked payment state must never show a fabricated success label");
    }

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("provider-unavailable state is shown distinctly from a pricing blocker", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    const order = mockOrder({ items: [{ ...mockOrder().items[0], pricingSource: "approved_live", pricingApproved: true }] });
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: false,
          reasons: ["provider unavailable: No verified Bank Alfalah sandbox or production endpoint URL exists in this repository."],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );

    await page.goto(reviewUrl(PK_DRAFT_ID, PK_ORDER_NO));
    await expect(page.getByText(/payment provider is not yet configured/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /pay now/i })).toBeDisabled();

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  // This test deliberately triggers a real HTTP 500 response, which Chrome
  // itself logs as a "Failed to load resource" console error independent of
  // application behavior -- consistent with the equivalent P1A API-error
  // test (fixed-order-flow.spec.ts, "upload loading, validation, and API
  // error states"), consoleErrors/pageErrors are not asserted clean here.
  test("server error checking readiness shows a retry that recovers", async ({
    page,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    const order = mockOrder();
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );

    let call = 0;
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-readiness`, (route) => {
      call += 1;
      if (call === 1) {
        return route.fulfill({ status: 500, json: { success: false, code: "INTERNAL_ERROR", message: "boom" } });
      }
      return route.fulfill({
        json: {
          ready: false,
          reasons: ['pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing'],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      });
    });

    await page.goto(reviewUrl(PK_DRAFT_ID, PK_ORDER_NO));
    await expect(page.getByText(/unable to check payment readiness/i)).toBeVisible();
    await page.getByRole("button", { name: /^retry$/i }).click();
    await expect(page.getByText(/pricing for this order has not been approved/i)).toBeVisible();
    expect(call).toBe(2);

    await expectNoHorizontalOverflow(page);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("a ready mock adapter allows Pay Now and shows a local checkout link, never a fake paid label", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    const order = mockOrder({ items: [{ ...mockOrder().items[0], pricingSource: "approved_live", pricingApproved: true }] });
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: true,
          reasons: [],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );

    let releaseCreate: () => void = () => undefined;
    const createGate = new Promise<void>((resolve) => { releaseCreate = resolve; });
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-attempts`, async (route) => {
      await createGate;
      await route.fulfill({
        status: 201,
        json: {
          id: "attempt-1",
          fixedOrderId: order.id,
          orderNo: order.orderNo,
          provider: "mock_payment_provider",
          status: "REDIRECT_READY",
          amountMinor: order.totalAmountMinor,
          currency: order.currency,
          providerRef: "mock-ref-1",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          checkoutUrl: `http://localhost/mock-checkout/${order.id}/mock-ref-1`
        }
      });
    });

    await page.goto(reviewUrl(PK_DRAFT_ID, PK_ORDER_NO));
    const payButton = page.getByRole("button", { name: /pay now/i });
    await expect(payButton).toBeEnabled();
    await payButton.click();
    await expect(page.getByRole("button", { name: /starting payment/i })).toBeVisible();
    releaseCreate();

    await expect(page.getByText(/a payment session is ready/i)).toBeVisible();
    const checkoutLink = page.getByRole("link", { name: /continue to payment/i });
    await expect(checkoutLink).toBeVisible();
    await expect(checkoutLink).toHaveAttribute("href", /^http:\/\/localhost\/mock-checkout\//);

    const bodyText = (await page.textContent("body")) || "";
    if (/payment (successful|complete|confirmed)|order paid/i.test(bodyText)) {
      throw new Error("A ready checkout session must never be shown as an already-paid/successful state");
    }

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("International/USD order shows truthful USD blocked state, never PKR", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    const order = mockOrder({
      orderNo: INTL_ORDER_NO,
      market: "INTERNATIONAL",
      currency: "USD",
      totalAmountMinor: "500",
      items: [
        {
          id: "item-intl-1",
          kind: "DIGITAL_TIER",
          tierOrSku: "ORIGINAL",
          quantity: 1,
          unitAmountMinor: "500",
          totalAmountMinor: "500",
          currency: "USD",
          pricingSource: "local_fixture",
          pricingApproved: false
        }
      ]
    });
    await page.route(`**/api/fixed-orders/${INTL_ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${INTL_ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    await page.route(`**/api/fixed-orders/${INTL_ORDER_NO}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: false,
          reasons: ['pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing'],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      })
    );

    await page.goto(reviewUrl(INTL_DRAFT_ID, INTL_ORDER_NO));
    await expect(page.getByRole("heading", { level: 1, name: "Order Review" })).toBeVisible();

    const mainText = (await page.locator("main").innerText()) || "";
    if (/PKR|Rs\.?\s?\d/.test(mainText)) throw new Error("International order must never show PKR pricing");
    if (!/\$/.test(mainText)) throw new Error("Expected USD ($) pricing to be visible");
    await expect(page.getByRole("button", { name: /pay now/i })).toBeDisabled();

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("order review refresh / direct deep link re-checks payment readiness", async ({ page }) => {
    const order = mockOrder();
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}`, (route) => route.fulfill({ json: order }));
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-attempt`, (route) =>
      route.fulfill({ json: { success: true, data: null } })
    );
    let readinessCalls = 0;
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}/payment-readiness`, (route) => {
      readinessCalls += 1;
      return route.fulfill({
        json: {
          ready: false,
          reasons: ['pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing'],
          order: { orderNo: order.orderNo, market: order.market, currency: order.currency, totalAmountMinor: order.totalAmountMinor, status: order.status }
        }
      });
    });

    await page.goto(reviewUrl(PK_DRAFT_ID, PK_ORDER_NO));
    await expect(page.getByText(/pricing for this order has not been approved/i)).toBeVisible();
    expect(readinessCalls).toBe(1);

    await page.reload();
    await expect(page.getByText(/pricing for this order has not been approved/i)).toBeVisible();
    expect(readinessCalls).toBe(2);
  });
});
