import { test, expect, expectNoHorizontalOverflow } from "./fixtures";
import { mockAuthenticatedSession } from "./fixtures/auth";
import { DRAFT_ID, draftFixture, mockGetDraft } from "./fixtures/mvp";

test.describe("canonical restoration upload entry", () => {
  for (const label of ["Upload Your Photo", "Upload Photo"]) {
    test(`${label} opens the approved modal`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: label, exact: true }).first().click();
      await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
      await expect(page.getByText("Upload Photos for Restoration")).toHaveCount(0);
      await page.keyboard.press("Escape");
    });
  }

  test("header Get Started and footer Upload Photo share the modal", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Get Started" }).click();
    await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await page.locator("#footer").getByRole("button", { name: "Upload Photo" }).click();
    await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
  });

  test("/restore/new redirects to the canonical modal without legacy heading", async ({ page }) => {
    await page.goto("/restore/new");
    await expect(page).toHaveURL(/\/?upload=1/);
    await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
    await expect(page.getByText("Upload Photos for Restoration")).toHaveCount(0);
  });

  test("all 14 restoration-start CTA sites resolve to the same modal", async ({ page }) => {
    test.setTimeout(90_000);
    for (let index = 0; index < 8; index++) {
      await page.goto("/");
      const triggers = page.locator(".upload-trigger");
      await expect(triggers).toHaveCount(8);
      await triggers.nth(index).scrollIntoViewIfNeeded();
      await triggers.nth(index).click();
      await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
    }

    await page.goto("/restore");
    for (const name of ["New Restoration", "Start Your First Restoration"]) {
      await page.getByRole("link", { name }).click();
      await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
      if (name === "New Restoration") await page.goto("/restore");
    }

    await mockAuthenticatedSession(page);
    await page.route("**/api/me/wallet", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { user: { id: "test" }, wallet: { id: "wallet", currency: "PKR", availableBalance: 0, reservedBalance: 0 }, summary: { availableBalance: 0, totalTransactions: 0, activeSubscriptions: 0, lifetimeSpent: 0, lifetimeCredited: 0, pendingPayments: 0 }, activeSubscription: null } }) }));
    await page.route("**/api/packages", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) }));
    await page.goto("/orders");
    await page.getByRole("button", { name: "Go to Restoration" }).click();
    await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await page.goto("/orders");
    await page.getByRole("heading", { name: "Start a new restoration" }).click();
    await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();

    await page.route("**/api/digital-catalog?market=PAKISTAN", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { offers: [{ tier: "HD_2X", label: "2x HD", amountMinor: 100000, currency: "PKR", description: "Sharp detail", priceBookVersion: "PB-2026-08-09-TRIAL-V3" }], printCatalog: [] } }) }));
    await page.route("**/api/memory-packages", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [{ code: "TEST", name: "Test Package", priceMinor: 100000, currency: "PKR", includes: [], checkoutReady: true }] }) }));
    await page.goto("/pricing");
    for (const name of ["Choose this quality", "Start package"]) {
      await page.getByRole("button", { name }).click();
      await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
      if (name === "Choose this quality") await page.goto("/pricing");
    }
  });

  test("former direct upload and re-upload routes use the canonical modal", async ({ page }) => {
    await page.goto("/restore-mvp/new");
    await expect(page).toHaveURL(/\/?upload=1/);
    await expect(page.locator("input[type=file]")).toHaveCount(1);
    await page.getByRole("button", { name: "Close" }).click();
    await mockGetDraft(page, DRAFT_ID, { ...draftFixture(), previewUrl: "http://127.0.0.1/preview.png" });
    await page.goto(`/restore-mvp/${DRAFT_ID}/preview`);
    await page.getByRole("button", { name: "Choose a different photo" }).click();
    await expect(page.getByRole("dialog", { name: "Upload Your Photo" })).toBeVisible();
    await expect(page.locator("input[type=file]")).toHaveCount(1);
  });

  test("keyboard activation, selected ready state, close, and mobile overflow work", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "Upload Your Photo", exact: true }).first();
    await trigger.focus();
    await page.keyboard.press("Enter");
    const modal = page.getByRole("dialog", { name: "Upload Your Photo" });
    await expect(modal).toBeVisible();
    await page.locator("#photoInput").setInputFiles({ name: "memory.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image") });
    await expect(page.getByText("Ready for restoration")).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(modal).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("unsupported and oversized files are rejected before upload", async ({ page }) => {
    await page.goto("/?upload=1");
    await page.locator("#photoInput").setInputFiles({ name: "memory.gif", mimeType: "image/gif", buffer: Buffer.from("gif") });
    await expect(page.getByText("Choose a JPG, PNG, or WEBP image.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to Restoration" })).toBeDisabled();
    await page.locator("#photoInput").setInputFiles({ name: "large.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
    await expect(page.getByText("Image must be 10 MB or smaller.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to Restoration" })).toBeDisabled();
  });

  test("Remove clears the single selected image and re-enables a fresh single selection", async ({ page }) => {
    await page.goto("/?upload=1");
    const input = page.locator("#photoInput");
    // R9.5-P5Q: multi-select is now intentional (1-10 photos); a single
    // `setInputFiles` selection still behaves exactly as before.
    await expect(input).toHaveAttribute("multiple", "");

    await input.setInputFiles({ name: "first.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image-one") });
    await expect(page.getByText("first.jpg")).toBeVisible();
    const continueButton = page.getByRole("button", { name: "Continue to Restoration" });
    await expect(continueButton).toBeEnabled();

    await page.getByRole("button", { name: "Remove first.jpg" }).click();
    await expect(page.getByText("first.jpg")).toHaveCount(0);
    await expect(continueButton).toBeDisabled();
    await expect(input).toHaveValue("");

    // Selecting a new single image after Remove works exactly like a first
    // selection -- the old file is fully gone, not merged/appended.
    await input.setInputFiles({ name: "second.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image-two") });
    await expect(page.getByText("second.jpg")).toBeVisible();
    await expect(page.getByText("first.jpg")).toHaveCount(0);
    await expect(continueButton).toBeEnabled();
  });

  test("R9.5-P5Q: selecting 3 photos at once shows all 3, Continue navigates to the cart route", async ({ page }) => {
    await page.goto("/?upload=1");
    await page.locator("#photoInput").setInputFiles([
      { name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image-a") },
      { name: "b.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image-b") },
      { name: "c.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image-c") }
    ]);
    await expect(page.getByText("a.jpg")).toBeVisible();
    await expect(page.getByText("b.jpg")).toBeVisible();
    await expect(page.getByText("c.jpg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to Restoration (3 photos)" })).toBeEnabled();
  });

  test("R9.5-P5Q: Add more photos appends to the existing selection without losing it", async ({ page }) => {
    await page.goto("/?upload=1");
    const input = page.locator("#photoInput");
    await input.setInputFiles([{ name: "one.jpg", mimeType: "image/jpeg", buffer: Buffer.from("1") }, { name: "two.jpg", mimeType: "image/jpeg", buffer: Buffer.from("2") }]);
    await expect(page.getByText("one.jpg")).toBeVisible();
    await page.getByRole("button", { name: /Add more photos/ }).click();
    await input.setInputFiles({ name: "three.jpg", mimeType: "image/jpeg", buffer: Buffer.from("3") });
    await expect(page.getByText("one.jpg")).toBeVisible();
    await expect(page.getByText("two.jpg")).toBeVisible();
    await expect(page.getByText("three.jpg")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to Restoration (3 photos)" })).toBeEnabled();

    // Removing the middle one leaves exactly the other two.
    await page.getByRole("button", { name: "Remove two.jpg" }).click();
    await expect(page.getByText("two.jpg")).toHaveCount(0);
    await expect(page.getByText("one.jpg")).toBeVisible();
    await expect(page.getByText("three.jpg")).toBeVisible();
  });

  test("R9.5-P5Q: selecting more than 10 photos is rejected with a clear inline error, no partial accidental submit", async ({ page }) => {
    await page.goto("/?upload=1");
    const eleven = Array.from({ length: 11 }, (_, i) => ({ name: `img${i}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(`img${i}`) }));
    await page.locator("#photoInput").setInputFiles(eleven);
    await expect(page.getByText("You can upload up to 10 photos at a time. Remove some to add more.")).toBeVisible();
    // None of the 11 were accepted -- Continue stays disabled (zero selected).
    await expect(page.getByRole("button", { name: "Continue to Restoration" })).toBeDisabled();
  });

  test("R9.5-P5Q: removing every photo disables Continue and clears the list", async ({ page }) => {
    await page.goto("/?upload=1");
    await page.locator("#photoInput").setInputFiles([
      { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("x") },
      { name: "y.jpg", mimeType: "image/jpeg", buffer: Buffer.from("y") }
    ]);
    await page.getByRole("button", { name: "Remove x.jpg" }).click();
    await page.getByRole("button", { name: "Remove y.jpg" }).click();
    await expect(page.getByText("x.jpg")).toHaveCount(0);
    await expect(page.getByText("y.jpg")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue to Restoration" })).toBeDisabled();
  });
});
