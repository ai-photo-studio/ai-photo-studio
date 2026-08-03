import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors
} from "./fixtures";
import type { Page, Route } from "@playwright/test";

/**
 * R9.2-P2R-ADMIN-COMMERCE-FILTER-VALIDATION.
 *
 * Focused coverage for the enum-backed filter validation on
 * `apps/web/src/pages/AdminCommerceOrdersPage.tsx`. Every backend call is
 * mocked via page.route(); no real `apps/api` process is started, and every
 * observed request is asserted to be a GET.
 *
 * The valid-value lists below are deliberately the same literals as the
 * `as const` arrays in `apps/web/src/lib/portal-types.ts` -- restated here on
 * purpose so the test is an independent statement of the contract rather than
 * a tautology against the implementation's own import.
 */

const ADMIN_TOKEN_KEY = "ai-photo-studio-admin-access-token";

const ORDER_STATUSES = ["CREATED", "PAYMENT_PENDING", "PAYMENT_VERIFIED", "LOCKED", "CANCELLED", "EXPIRED"] as const;
const MARKETS = ["PAKISTAN", "INTERNATIONAL"] as const;
const CURRENCIES = ["PKR", "USD"] as const;
const PAYMENT_STATUSES = [
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

type FilterField = {
  /** Visible <label> text. */
  label: RegExp;
  /** Outbound query-string parameter name. */
  param: string;
  /** data-testid of the inline hint element. */
  testId: string;
  /** Wording fragment expected in the hint. */
  hintText: RegExp;
  values: readonly string[];
  invalid: string;
};

const FILTERS: FilterField[] = [
  {
    label: /^status$/i,
    param: "status",
    testId: "filter-hint-status",
    hintText: /no such order status/i,
    values: ORDER_STATUSES,
    invalid: "LOCKEDD"
  },
  {
    label: /^market$/i,
    param: "market",
    testId: "filter-hint-market",
    hintText: /no such market/i,
    values: MARKETS,
    invalid: "PAKISTANI"
  },
  {
    label: /^currency$/i,
    param: "currency",
    testId: "filter-hint-currency",
    hintText: /no such currency/i,
    values: CURRENCIES,
    invalid: "GBP"
  },
  {
    label: /^payment status$/i,
    param: "paymentStatus",
    testId: "filter-hint-paymentStatus",
    hintText: /no such payment status/i,
    values: PAYMENT_STATUSES,
    invalid: "PAIDD"
  }
];

async function seedAdminSession(page: Page) {
  await page.addInitScript(({ key }) => window.localStorage.setItem(key, "fake-admin-token"), { key: ADMIN_TOKEN_KEY });
}

function listOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    orderNo: "FXD-FILTER-1",
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

type Recorded = { url: string; method: string };

/** Mocks the list endpoint and records every request that reaches it. */
async function mockList(page: Page, recorded: Recorded[], body?: (route: Route) => unknown) {
  await page.route("**/api/admin/commerce-orders*", (route) => {
    recorded.push({ url: route.request().url(), method: route.request().method() });
    route.fulfill({
      json: body
        ? (body(route) as Record<string, unknown>)
        : { success: true, data: { items: [listOrder()], total: 1, page: 1, pageSize: 20 } }
    });
  });
}

function paramsOf(url: string) {
  return new URL(url).searchParams;
}

test.describe("admin commerce filter validation: valid values", () => {
  for (const filter of FILTERS) {
    test(`every valid ${filter.param} value is accepted and sent as an uppercase GET param`, async ({ page }) => {
      await seedAdminSession(page);
      const recorded: Recorded[] = [];
      await mockList(page, recorded);
      await page.goto("/admin/commerce-orders");
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

      for (const value of filter.values) {
        recorded.length = 0;
        await page.getByLabel(filter.label).fill(value);
        await page.getByRole("button", { name: /apply filters/i }).click();
        await expect(page.getByTestId(filter.testId)).toHaveCount(0);
        await expect.poll(() => recorded.length).toBeGreaterThan(0);
        expect(paramsOf(recorded[recorded.length - 1].url).get(filter.param)).toBe(value);
        expect(recorded.every((entry) => entry.method === "GET")).toBe(true);
      }
    });

    test(`a whitespace-padded, lower-case ${filter.param} value is trimmed, uppercased, and accepted`, async ({ page }) => {
      await seedAdminSession(page);
      const recorded: Recorded[] = [];
      await mockList(page, recorded);
      await page.goto("/admin/commerce-orders");
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

      const value = filter.values[0];
      recorded.length = 0;
      await page.getByLabel(filter.label).fill(`  ${value.toLowerCase()}  `);
      await page.getByRole("button", { name: /apply filters/i }).click();
      await expect(page.getByTestId(filter.testId)).toHaveCount(0);
      await expect.poll(() => recorded.length).toBeGreaterThan(0);
      // The server itself uppercases this value, so uppercasing client-side
      // cannot change the meaning of the request.
      expect(paramsOf(recorded[recorded.length - 1].url).get(filter.param)).toBe(value);
      expect(recorded.every((entry) => entry.method === "GET")).toBe(true);
    });
  }
});

test.describe("admin commerce filter validation: invalid values", () => {
  for (const filter of FILTERS) {
    test(`an invalid ${filter.param} shows an accessible inline hint and issues ZERO list requests`, async ({ page }) => {
      await seedAdminSession(page);
      const recorded: Recorded[] = [];
      await mockList(page, recorded);
      await page.goto("/admin/commerce-orders");
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

      recorded.length = 0;
      await page.getByLabel(filter.label).fill(filter.invalid);
      const hint = page.getByTestId(filter.testId);
      await expect(hint).toBeVisible();
      await expect(hint).toHaveText(filter.hintText);
      // Visible text, not colour alone, and announced.
      expect((await hint.innerText()).trim().length).toBeGreaterThan(0);
      await expect(hint).toHaveAttribute("role", "alert");

      const input = page.getByLabel(filter.label);
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expect(input).toHaveAttribute("aria-describedby", (await hint.getAttribute("id")) as string);

      // Submitting must still not produce a request.
      await page.getByRole("button", { name: /apply filters/i }).click();
      await page.waitForTimeout(300);
      expect(recorded, `Unexpected list request(s) while the filter was invalid: ${JSON.stringify(recorded)}`).toEqual([]);
    });

    test(`correcting the invalid ${filter.param} clears the hint and resumes normal GET loading`, async ({ page }) => {
      await seedAdminSession(page);
      const recorded: Recorded[] = [];
      await mockList(page, recorded);
      await page.goto("/admin/commerce-orders");
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

      const input = page.getByLabel(filter.label);
      await input.fill(filter.invalid);
      await expect(page.getByTestId(filter.testId)).toBeVisible();

      recorded.length = 0;
      await input.fill(filter.values[0]);
      await expect(page.getByTestId(filter.testId)).toHaveCount(0);
      await page.getByRole("button", { name: /apply filters/i }).click();
      await expect.poll(() => recorded.length).toBeGreaterThan(0);
      expect(paramsOf(recorded[recorded.length - 1].url).get(filter.param)).toBe(filter.values[0]);
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();
    });

    test(`clearing the invalid ${filter.param} removes the hint and restores the unfiltered list`, async ({ page }) => {
      await seedAdminSession(page);
      const recorded: Recorded[] = [];
      await mockList(page, recorded);
      await page.goto("/admin/commerce-orders");
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

      const input = page.getByLabel(filter.label);
      await input.fill(filter.invalid);
      await expect(page.getByTestId(filter.testId)).toBeVisible();

      recorded.length = 0;
      await input.fill("");
      await expect(page.getByTestId(filter.testId)).toHaveCount(0);
      await input.fill("   ");
      await expect(page.getByTestId(filter.testId)).toHaveCount(0);
      await input.fill("");
      await page.getByRole("button", { name: /apply filters/i }).click();
      await expect.poll(() => recorded.length).toBeGreaterThan(0);
      expect(paramsOf(recorded[recorded.length - 1].url).has(filter.param)).toBe(false);
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();
    });
  }

  test("an invalid value supplied in the page URL query string cannot bypass validation or reach the API", async ({
    page,
    blockedRequests
  }) => {
    await seedAdminSession(page);
    const recorded: Recorded[] = [];
    await mockList(page, recorded);
    // The page deliberately reads NO filter value from location.search, so an
    // attacker-controlled query string can neither pre-populate a filter nor
    // be forwarded to the API.
    await page.goto("/admin/commerce-orders?status=LOCKEDD&market=NOWHERE&currency=GBP&paymentStatus=PAIDD&paid=true");
    await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

    for (const filter of FILTERS) {
      await expect(page.getByLabel(filter.label)).toHaveValue("");
      await expect(page.getByTestId(filter.testId)).toHaveCount(0);
    }
    expect(recorded.length).toBeGreaterThan(0);
    for (const entry of recorded) {
      const params = paramsOf(entry.url);
      expect(entry.method).toBe("GET");
      for (const filter of FILTERS) {
        expect(params.has(filter.param)).toBe(false);
      }
      expect(params.has("paid")).toBe(false);
    }
    expectCleanNetwork(blockedRequests);
  });

  test("multiple simultaneously-invalid filters each show their own hint and still produce zero requests", async ({
    page,
    consoleErrors,
    pageErrors
  }) => {
    await seedAdminSession(page);
    const recorded: Recorded[] = [];
    await mockList(page, recorded);
    await page.goto("/admin/commerce-orders");
    await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

    recorded.length = 0;
    for (const filter of FILTERS) {
      await page.getByLabel(filter.label).fill(filter.invalid);
    }
    for (const filter of FILTERS) {
      await expect(page.getByTestId(filter.testId)).toBeVisible();
    }
    await page.getByRole("button", { name: /apply filters/i }).click();
    await page.waitForTimeout(300);
    expect(recorded).toEqual([]);
    expectNoPageErrors(consoleErrors, pageErrors);
  });
});

test.describe("admin commerce filter validation: pagination, retry, and error states are preserved", () => {
  test("pagination still works for valid filters and is not issued while a filter is invalid", async ({ page }) => {
    await seedAdminSession(page);
    const recorded: Recorded[] = [];
    await page.route("**/api/admin/commerce-orders*", (route) => {
      const url = route.request().url();
      recorded.push({ url, method: route.request().method() });
      const requestedPage = Number(paramsOf(url).get("page") || "1");
      route.fulfill({
        json: {
          success: true,
          data: {
            items: [listOrder({ orderNo: `FXD-FILTER-PAGE-${requestedPage}` })],
            total: 45,
            page: requestedPage,
            pageSize: 20
          }
        }
      });
    });

    await page.goto("/admin/commerce-orders");
    await expect(page.getByText("FXD-FILTER-PAGE-1")).toBeVisible();
    await expect(page.getByText(/page 1 of 3/i)).toBeVisible();

    await page.getByRole("button", { name: /^next$/i }).click();
    await expect(page.getByText("FXD-FILTER-PAGE-2")).toBeVisible();

    // Now make a filter invalid: paging must not fire a request at all.
    await page.getByLabel(/^payment status$/i).fill("PAIDD");
    await expect(page.getByTestId("filter-hint-paymentStatus")).toBeVisible();
    recorded.length = 0;
    await page.getByRole("button", { name: /^next$/i }).click();
    await page.waitForTimeout(300);
    expect(recorded).toEqual([]);

    // Correcting it resumes paging from the state it was left in.
    await page.getByLabel(/^payment status$/i).fill("PAID");
    await page.getByRole("button", { name: /apply filters/i }).click();
    await expect.poll(() => recorded.length).toBeGreaterThan(0);
    expect(paramsOf(recorded[recorded.length - 1].url).get("paymentStatus")).toBe("PAID");
  });

  test("the error state and Retry control still work when the filters are valid", async ({ page }) => {
    await seedAdminSession(page);
    let failNext = true;
    const recorded: Recorded[] = [];
    await page.route("**/api/admin/commerce-orders*", (route) => {
      recorded.push({ url: route.request().url(), method: route.request().method() });
      if (failNext) {
        failNext = false;
        route.fulfill({ status: 500, json: { success: false, code: "INTERNAL_ERROR", message: "boom" } });
        return;
      }
      route.fulfill({ json: { success: true, data: { items: [listOrder()], total: 1, page: 1, pageSize: 20 } } });
    });

    await page.goto("/admin/commerce-orders");
    const retry = page.getByRole("button", { name: /retry/i });
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.getByText("FXD-FILTER-1")).toBeVisible();
    expect(recorded.every((entry) => entry.method === "GET")).toBe(true);
  });

  test("Retry does not fire a request while a filter is invalid", async ({ page }) => {
    await seedAdminSession(page);
    const recorded: Recorded[] = [];
    await page.route("**/api/admin/commerce-orders*", (route) => {
      recorded.push({ url: route.request().url(), method: route.request().method() });
      route.fulfill({ status: 500, json: { success: false, code: "INTERNAL_ERROR", message: "boom" } });
    });
    await page.goto("/admin/commerce-orders");
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();

    await page.getByLabel(/^currency$/i).fill("GBP");
    await expect(page.getByTestId("filter-hint-currency")).toBeVisible();
    recorded.length = 0;
    await page.getByRole("button", { name: /retry/i }).click();
    await page.waitForTimeout(300);
    expect(recorded).toEqual([]);
  });
});

test.describe("admin commerce filter validation: accessibility, responsive, and payment truth", () => {
  test("the filter and its error message are fully reachable and operable with the keyboard only", async ({ page }) => {
    await seedAdminSession(page);
    const recorded: Recorded[] = [];
    await mockList(page, recorded);
    await page.goto("/admin/commerce-orders");
    await expect(page.getByText("FXD-FILTER-1")).toBeVisible();

    const input = page.getByLabel(/^payment status$/i);
    await input.focus();
    await expect(input).toBeFocused();
    await page.keyboard.type("PAIDD");
    const hint = page.getByTestId("filter-hint-paymentStatus");
    await expect(hint).toBeVisible();
    await expect(input).toHaveAttribute("aria-describedby", "filter-hint-paymentStatus");

    // The submit button remains in the tab order (it is never disabled), so a
    // keyboard-only operator is not trapped.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /apply filters/i })).toBeFocused();

    // Correct it with the keyboard alone and submit with Enter.
    await input.focus();
    await page.keyboard.press("Control+a");
    await page.keyboard.type("PAID");
    await expect(hint).toHaveCount(0);
    recorded.length = 0;
    await page.keyboard.press("Enter");
    await expect.poll(() => recorded.length).toBeGreaterThan(0);
    expect(paramsOf(recorded[recorded.length - 1].url).get("paymentStatus")).toBe("PAID");
  });

  for (const width of [360, 390, 430]) {
    test(`the inline hint renders without horizontal overflow at ${width}px`, async ({ page }) => {
      await seedAdminSession(page);
      const recorded: Recorded[] = [];
      await mockList(page, recorded);
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/admin/commerce-orders");
      await expect(page.getByText("FXD-FILTER-1")).toBeVisible();
      for (const filter of FILTERS) {
        await page.getByLabel(filter.label).fill(filter.invalid);
      }
      await expect(page.getByTestId("filter-hint-paymentStatus")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("no filter or query manipulation can make a PAID payment status appear", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await seedAdminSession(page);
    const recorded: Recorded[] = [];
    // The API always answers with a non-PAID attempt status, regardless of the
    // requested filter -- payment truth comes only from the server response.
    await mockList(page, recorded, () => ({
      success: true,
      data: {
        items: [listOrder({ orderNo: "FXD-FILTER-TRUTH-1", paymentStatus: "CANCELLED_BY_CUSTOMER" })],
        total: 1,
        page: 1,
        pageSize: 20
      }
    }));

    await page.goto("/admin/commerce-orders?paymentStatus=PAID&paid=true&status=PAID&success=1");
    await expect(page.locator(".payment-status-label")).toContainText("CANCELLED_BY_CUSTOMER");

    // Even typing PAID into the filter (a legitimate, valid enum value that is
    // sent as a query param) cannot change what is displayed.
    await page.getByLabel(/^payment status$/i).fill("PAID");
    await page.getByRole("button", { name: /apply filters/i }).click();
    await expect(page.locator(".payment-status-label")).toContainText("CANCELLED_BY_CUSTOMER");
    const bodyText = (await page.textContent("body")) || "";
    expect(bodyText).not.toMatch(/\bPAID\b/);

    expect(recorded.every((entry) => entry.method === "GET")).toBe(true);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });
});
