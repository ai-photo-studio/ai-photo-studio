import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors
} from "./fixtures";

/**
 * R9.2-P1A: free upload -> original preview -> tier selection -> immutable
 * fixed-order review. Every backend call is mocked (page.route) -- no real
 * `apps/api` process is started for this spec file. The preview image is a
 * data: URI so the <img> makes zero network requests of its own.
 */

// A well-known minimal valid 1x1 transparent PNG, used only as upload/preview fixture bytes.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

const tinyPngPath = join(mkdtempSync(join(tmpdir(), "p1a-playwright-")), "sample.png");
writeFileSync(tinyPngPath, Buffer.from(TINY_PNG_BASE64, "base64"));

const PK_DRAFT_ID = "draft-pk-1";
const INTL_DRAFT_ID = "draft-intl-1";
const PK_ORDER_NO = "FXD-TESTPK01";

function mockDraft(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PK_DRAFT_ID,
    status: "PREVIEW_READY",
    market: "PAKISTAN",
    country: "PK",
    currency: "PKR",
    originalMimeType: "image/png",
    originalWidth: 1,
    originalHeight: 1,
    originalFileSizeBytes: 68,
    previewUrl: TINY_PNG_DATA_URL,
    previewExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    guestOwnershipToken: "guest-token-pk",
    ...overrides
  };
}

const PK_OFFERS = {
  market: "PAKISTAN",
  currency: "PKR",
  offers: [
    { tier: "ORIGINAL", label: "Original", market: "PAKISTAN", currency: "PKR", amountMinor: 25000, description: "Source resolution", source: "local_fixture" },
    { tier: "HD_2X", label: "2HD", market: "PAKISTAN", currency: "PKR", amountMinor: 35000, description: "2x enhanced", source: "local_fixture" },
    { tier: "HD_4X", label: "4HD", market: "PAKISTAN", currency: "PKR", amountMinor: 50000, description: "4x enhanced", source: "local_fixture" }
  ]
};

const INTL_OFFERS = {
  market: "INTERNATIONAL",
  currency: "USD",
  offers: { available: false, reason: "USD pricing has not been approved yet; International digital offers are unavailable." }
};

function mockOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "order-1",
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
        id: "item-1",
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

// R9.2-P1B: local_fixture pricing is always payment-ineligible -- every P1A
// mockOrder() above is blocked by design. These two routes are required by
// FixedOrderReviewPage's payment panel on every order-review page load;
// dedicated payment-flow scenarios live in payment-attempt-flow.spec.ts.
function mockBlockedReadiness(order: ReturnType<typeof mockOrder>) {
  return {
    ready: false,
    reasons: [
      'pricing source "local_fixture" is not owner-approved/live; payment is not permitted for unapproved pricing',
      "provider unavailable: No verified Bank Alfalah sandbox or production endpoint URL exists in this repository."
    ],
    order: {
      orderNo: order.orderNo,
      market: order.market,
      currency: order.currency,
      totalAmountMinor: order.totalAmountMinor,
      status: order.status
    }
  };
}

async function mockPaymentRoutesForOrder(page: Page, order: ReturnType<typeof mockOrder>) {
  await page.route(`**/api/fixed-orders/${order.orderNo}/payment-readiness`, (route) =>
    route.fulfill({ json: mockBlockedReadiness(order) })
  );
  await page.route(`**/api/fixed-orders/${order.orderNo}/payment-attempt`, (route) =>
    route.fulfill({ json: { success: true, data: null } })
  );
}

async function performUpload(page: Page) {
  await page.goto("/restore/new");
  await page.getByRole("checkbox", { name: /confirm market/i }).check();
  await page.setInputFiles("#restore-file-input", tinyPngPath);
  await page.getByRole("button", { name: /upload for free preview/i }).click();
}

test.describe("fixed-order flow: upload -> preview -> select -> review", () => {
  test("Pakistan flow shows PKR only end to end, never USD", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await page.route("**/api/restoration-drafts", (route) => route.fulfill({ status: 201, json: mockDraft() }));
    await page.route(`**/api/restoration-drafts/${PK_DRAFT_ID}/offers`, (route) => route.fulfill({ json: PK_OFFERS }));
    await page.route(`**/api/restoration-drafts/${PK_DRAFT_ID}`, (route) => route.fulfill({ json: mockDraft() }));
    await page.route("**/api/fixed-orders/restoration-digital", (route) => route.fulfill({ status: 201, json: mockOrder() }));
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}`, (route) => route.fulfill({ json: mockOrder() }));
    await mockPaymentRoutesForOrder(page, mockOrder());

    await performUpload(page);
    await expect(page).toHaveURL(new RegExp(`/restore/drafts/${PK_DRAFT_ID}/preview$`));

    // Original-preview label accuracy: this is the upload, never a
    // restored/enhanced/processed result.
    await expect(page.getByRole("heading", { level: 1, name: "Original Uploaded Image" })).toBeVisible();
    const bodyText = (await page.textContent("body")) || "";
    for (const forbidden of ["restored", "enhanced", "processed"]) {
      if (new RegExp(forbidden, "i").test(bodyText)) {
        throw new Error(`Preview page must never say "${forbidden}"`);
      }
    }

    await page.getByRole("button", { name: /choose resolution/i }).click();
    await expect(page).toHaveURL(new RegExp(`/restore/drafts/${PK_DRAFT_ID}/select$`));
    await expect(page.getByRole("heading", { level: 1, name: "Choose Your Resolution" })).toBeVisible();

    // Scoped to <main> (not the whole body): the site-wide footer includes
    // unrelated marketing copy that mentions PKR/Pakistan regardless of the
    // active flow, so checking currency isolation must look only at the
    // actual pricing content, not global page chrome.
    const pageTextAtSelect = (await page.locator("main").innerText()) || "";
    if (/\bUSD\b|\$/.test(pageTextAtSelect)) throw new Error("Pakistan market must show PKR only, no USD");
    if (!/PKR|Rs/.test(pageTextAtSelect)) throw new Error("Expected PKR pricing to be visible");

    await page.getByRole("button", { name: /select original/i }).click();
    await expect(page).toHaveURL(new RegExp(`/restore/drafts/${PK_DRAFT_ID}/review\\?orderNo=${PK_ORDER_NO}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Order Review" })).toBeVisible();
    await expect(page.getByText(PK_ORDER_NO)).toBeVisible();
    // local_fixture pricing is always payment-ineligible -- the CTA stays
    // disabled and the truthful blocker reason is shown, never a fake
    // "payment setup pending" placeholder.
    await expect(page.getByRole("button", { name: /pay now/i })).toBeDisabled();
    await expect(page.getByText(/pricing for this order has not been approved/i)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("International market shows a truthful USD-unavailable state, never fabricated pricing or PKR", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await page.route("**/api/restoration-drafts", (route) =>
      route.fulfill({ status: 201, json: mockDraft({ id: INTL_DRAFT_ID, market: "INTERNATIONAL", country: "US", currency: "USD" }) })
    );
    await page.route(`**/api/restoration-drafts/${INTL_DRAFT_ID}/offers`, (route) => route.fulfill({ json: INTL_OFFERS }));
    await page.route(`**/api/restoration-drafts/${INTL_DRAFT_ID}`, (route) =>
      route.fulfill({ json: mockDraft({ id: INTL_DRAFT_ID, market: "INTERNATIONAL", country: "US", currency: "USD" }) })
    );

    await page.goto("/restore/new");
    await page.getByLabel("Country").selectOption("US");
    await page.getByRole("checkbox", { name: /confirm market/i }).check();
    await page.setInputFiles("#restore-file-input", tinyPngPath);
    await page.getByRole("button", { name: /upload for free preview/i }).click();
    await expect(page).toHaveURL(new RegExp(`/restore/drafts/${INTL_DRAFT_ID}/preview$`));

    await page.goto(`/restore/drafts/${INTL_DRAFT_ID}/select`);
    await expect(page.getByRole("heading", { level: 1, name: "Choose Your Resolution" })).toBeVisible();
    await expect(page.getByText(/USD pricing has not been approved/i)).toBeVisible();

    // Scoped to <main>: the site-wide footer mentions PKR/Pakistan as
    // general marketing copy regardless of the active flow -- currency
    // isolation must be checked against the actual pricing content only.
    const pageText = (await page.locator("main").innerText()) || "";
    if (/PKR|Rs\.?\s?\d/.test(pageText)) throw new Error("International market must never show PKR pricing");

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("upload loading, validation, and API error states", async ({ page }) => {
    // Validation: selecting an unsupported file type shows an error without
    // ever calling the API.
    let createDraftCalls = 0;
    await page.route("**/api/restoration-drafts", (route) => {
      createDraftCalls += 1;
      return route.fulfill({ status: 201, json: mockDraft() });
    });

    await page.goto("/restore/new");
    await page.getByRole("checkbox", { name: /confirm market/i }).check();

    const textFilePath = join(mkdtempSync(join(tmpdir(), "p1a-playwright-bad-")), "not-a-photo.txt");
    writeFileSync(textFilePath, "definitely not an image");
    await page.setInputFiles("#restore-file-input", textFilePath);
    await expect(page.getByText(/unsupported format/i)).toBeVisible();
    expect(createDraftCalls).toBe(0);

    // Loading state: a deliberately delayed response keeps the button in its
    // "Uploading..." state until it resolves.
    let releaseUpload: () => void = () => undefined;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    await page.unroute("**/api/restoration-drafts");
    await page.route("**/api/restoration-drafts", async (route) => {
      await uploadGate;
      await route.fulfill({ status: 201, json: mockDraft() });
    });

    await page.setInputFiles("#restore-file-input", tinyPngPath);
    await page.getByRole("button", { name: /upload for free preview/i }).click();
    await expect(page.getByRole("button", { name: /uploading/i })).toBeVisible();
    releaseUpload();
    await expect(page).toHaveURL(new RegExp(`/restore/drafts/${PK_DRAFT_ID}/preview$`));

    // API error state: a failing create-order call surfaces a visible error
    // and does not navigate away.
    await page.route(`**/api/restoration-drafts/${PK_DRAFT_ID}/offers`, (route) => route.fulfill({ json: PK_OFFERS }));
    await page.route(`**/api/restoration-drafts/${PK_DRAFT_ID}`, (route) => route.fulfill({ json: mockDraft() }));
    await page.route("**/api/fixed-orders/restoration-digital", (route) =>
      route.fulfill({ status: 409, json: { success: false, code: "PRICING_UNAVAILABLE", message: "Pricing is not available for this market." } })
    );

    await page.goto(`/restore/drafts/${PK_DRAFT_ID}/select`);
    await page.getByRole("button", { name: /select original/i }).click();
    await expect(page.getByText(/pricing is not available/i)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/restore/drafts/${PK_DRAFT_ID}/select$`));
  });

  test("order review supports refresh / direct deep link", async ({ page }) => {
    await page.route(`**/api/fixed-orders/${PK_ORDER_NO}`, (route) => route.fulfill({ json: mockOrder() }));
    await mockPaymentRoutesForOrder(page, mockOrder());

    // Direct navigation (as if the user bookmarked or refreshed the URL),
    // with no prior in-session steps.
    await page.goto(`/restore/drafts/${PK_DRAFT_ID}/review?orderNo=${PK_ORDER_NO}`);
    await expect(page.getByRole("heading", { level: 1, name: "Order Review" })).toBeVisible();
    await expect(page.getByText(PK_ORDER_NO)).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Order Review" })).toBeVisible();
    await expect(page.getByText(PK_ORDER_NO)).toBeVisible();
  });
});

const FLOW_VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 }
] as const;

for (const viewport of FLOW_VIEWPORTS) {
  test.describe(`fixed-order flow responsive @ ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("preview and select pages render without overflow", async ({
      page,
      consoleErrors,
      pageErrors,
      failedFirstPartyRequests,
      blockedRequests
    }) => {
      await page.route(`**/api/restoration-drafts/${PK_DRAFT_ID}/offers`, (route) => route.fulfill({ json: PK_OFFERS }));
      await page.route(`**/api/restoration-drafts/${PK_DRAFT_ID}`, (route) => route.fulfill({ json: mockDraft() }));

      await page.goto(`/restore/drafts/${PK_DRAFT_ID}/preview`);
      await expect(page.getByRole("heading", { level: 1, name: "Original Uploaded Image" })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto(`/restore/drafts/${PK_DRAFT_ID}/select`);
      await expect(page.getByRole("heading", { level: 1, name: "Choose Your Resolution" })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      expectNoPageErrors(consoleErrors, pageErrors);
      expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
      expectCleanNetwork(blockedRequests);
    });
  });
}
