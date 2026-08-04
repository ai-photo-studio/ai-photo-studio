// R9.2-P5A minimal browser harness: restoration status + download flow.
//
// Every test blocks all non-local network traffic and mocks the exact
// customer DTO contract served by RestorationCustomerController. No real
// API server, MPGS, Replicate, R2, RunPod, or Local provider is ever
// contacted.
import {
  test,
  expect,
  blockExternalNetwork,
  mockRestorationStatus,
  mockRestorationDownload,
  buildStatusFixture,
  buildDownloadFixture,
  ORDER_ID,
  ITEM_ID_QUEUED,
  ITEM_ID_FAILED,
  ITEM_ID_SUCCEEDED
} from "./fixtures/index";

const statusUrl = (orderId = ORDER_ID) => `/restore/${orderId}/status`;

test.describe("P5A restoration status page", () => {
  test("renders QUEUED order state read-only", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockRestorationStatus(
      page,
      buildStatusFixture({
        status: "QUEUED",
        items: [{ id: ITEM_ID_QUEUED, status: "QUEUED", processingStage: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      })
    );
    await page.goto(statusUrl());
    await expect(page.getByText("Queued", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  });

  test("renders PROCESSING order state read-only", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockRestorationStatus(page, buildStatusFixture({ status: "PROCESSING" }));
    await page.goto(statusUrl());
    await expect(page.getByText("Processing", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  });

  test("renders FAILED order state with error surfaced, no download", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockRestorationStatus(
      page,
      buildStatusFixture({
        status: "FAILED",
        items: [{ id: ITEM_ID_FAILED, status: "FAILED", processingStage: null, errorMessage: "Provider error", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      })
    );
    await page.goto(statusUrl());
    await expect(page.getByText("Failed", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Provider error")).toBeVisible();
    await expect(page.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  });

  test("SUCCEEDED with VALIDATED master: download hidden before request, visible after", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockRestorationStatus(
      page,
      buildStatusFixture({
        status: "SUCCEEDED",
        hasDownload: true,
        items: [{ id: ITEM_ID_SUCCEEDED, status: "COMPLETED", processingStage: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      })
    );
    await mockRestorationDownload(page, buildDownloadFixture());
    await page.goto(statusUrl());

    // Download hidden before the signed download has been requested.
    await expect(page.getByText("Signed download ready.")).toHaveCount(0);

    const downloadButton = page.getByRole("button", { name: "Download" });
    await expect(downloadButton).toBeEnabled();
    await downloadButton.click();

    // Download visible only after the mocked, VALIDATED-master response.
    await expect(page.getByText("Signed download ready.")).toBeVisible();
    const link = page.getByRole("link", { name: "Open secure download" });
    await expect(link).toHaveAttribute("href", /mock-signed-download/);
  });

  test("forged query parameters cannot fabricate success", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockRestorationStatus(page, buildStatusFixture({ status: "PROCESSING" }));
    await page.goto(`${statusUrl()}?status=SUCCEEDED&forced=true&downloadUrl=https://evil.example/file.jpg`);
    // The page ignores query params entirely and renders exactly what the
    // (mocked) server returned.
    await expect(page.getByText("Processing", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Signed download ready.")).toHaveCount(0);
    await expect(page.getByText("evil.example")).toHaveCount(0);
  });

  test("refresh issues a status read only (no write, no new network route hit besides GET status)", async ({ page }) => {
    await blockExternalNetwork(page);
    let getCount = 0;
    await page.route(`**/api/customer/restorations/${ORDER_ID}`, async (route) => {
      expect(route.request().method()).toBe("GET");
      getCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, data: buildStatusFixture({ status: "PROCESSING" }) })
      });
    });
    await page.goto(statusUrl());
    await expect(page.getByText("Processing", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
    expect(getCount).toBeGreaterThanOrEqual(2);
  });

  test("wrong owner / not-found renders a uniform not-found state", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockRestorationStatus(page, null, { status: 404 });
    await page.goto(statusUrl());
    await expect(page.getByText(/not found/i)).toBeVisible();
  });

  test("no storage key appears in rendered text or the mocked response contract", async ({ page }) => {
    await blockExternalNetwork(page);
    const fixture = buildStatusFixture({
      status: "SUCCEEDED",
      hasDownload: true,
      items: [{ id: ITEM_ID_SUCCEEDED, status: "COMPLETED", processingStage: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
    });
    const download = buildDownloadFixture();
    expect(JSON.stringify(fixture)).not.toMatch(/storageKey/i);
    expect(JSON.stringify(download)).not.toMatch(/storageKey/i);

    await mockRestorationStatus(page, fixture);
    await mockRestorationDownload(page, download);
    await page.goto(statusUrl());
    await page.getByRole("button", { name: "Download" }).click();
    await expect(page.getByText("Signed download ready.")).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/storageKey/i);
  });

  test("keyboard operation: refresh and download reachable via Tab + Enter", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockRestorationStatus(
      page,
      buildStatusFixture({
        status: "SUCCEEDED",
        hasDownload: true,
        items: [{ id: ITEM_ID_SUCCEEDED, status: "COMPLETED", processingStage: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      })
    );
    await mockRestorationDownload(page, buildDownloadFixture());
    await page.goto(statusUrl());

    const refreshButton = page.getByRole("button", { name: "Refresh" });
    await refreshButton.focus();
    await expect(refreshButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(refreshButton).toBeEnabled();

    const downloadButton = page.getByRole("button", { name: "Download" });
    await downloadButton.focus();
    await expect(downloadButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Signed download ready.")).toBeVisible();
  });

  for (const width of [360, 390, 430]) {
    test(`renders correctly at ${width}px width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await blockExternalNetwork(page);
      await mockRestorationStatus(page, buildStatusFixture({ status: "PROCESSING" }));
      await page.goto(statusUrl());
      await expect(page.getByText("Processing", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test("zero external network calls across the full status + download flow", async ({ page }) => {
    // Any non-local request (e.g. the app's own analytics beacons) must be
    // aborted by blockExternalNetwork before it ever completes -- track
    // completions/failures rather than raw "request" events, since a
    // blocked request still fires "request" the instant it is initiated.
    const externalCompleted: string[] = [];
    const externalBlocked: string[] = [];
    const isExternal = (url: string) => {
      const hostname = new URL(url).hostname;
      return hostname !== "127.0.0.1" && hostname !== "localhost";
    };
    page.on("requestfinished", (request) => {
      if (isExternal(request.url())) externalCompleted.push(request.url());
    });
    page.on("requestfailed", (request) => {
      if (isExternal(request.url())) externalBlocked.push(request.url());
    });
    await blockExternalNetwork(page);
    await mockRestorationStatus(
      page,
      buildStatusFixture({
        status: "SUCCEEDED",
        hasDownload: true,
        items: [{ id: ITEM_ID_SUCCEEDED, status: "COMPLETED", processingStage: null, errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      })
    );
    await mockRestorationDownload(page, buildDownloadFixture());
    await page.goto(statusUrl());
    await page.getByRole("button", { name: "Refresh" }).click();
    await page.getByRole("button", { name: "Download" }).click();
    await expect(page.getByText("Signed download ready.")).toBeVisible();
    // Zero external calls ever completed. Any attempted external request
    // (e.g. a third-party analytics beacon) was aborted, never fulfilled.
    expect(externalCompleted).toEqual([]);
    for (const url of externalBlocked) {
      expect(isExternal(url)).toBe(true);
    }
  });
});
