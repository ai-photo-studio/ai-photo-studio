import { test, expect } from "@playwright/test";

test.describe("product and quality are separate customer decisions", () => {
  test("product stage uses supplied visuals and digital proceeds directly to quality", async ({ page }) => {
    await page.route("**/api/restoration-drafts/*/offers", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [{ tier: "ORIGINAL", label: "Restored Original", amountMinor: 50000, currency: "PKR" }, { tier: "HD_2X", label: "2x HD", amountMinor: 100000, currency: "PKR" }] }) }));
    await page.route("**/api/restoration-drafts/*", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { id: "draft-product-test", market: "PAKISTAN", currency: "PKR", originalWidth: 1200, originalHeight: 800, previewUrl: "/assets/logo2-display.png" } }) }));
    await page.goto("/restore-mvp/draft-product-test/tiers");
    await expect(page.getByRole("heading", { name: "Choose your product" })).toBeVisible();
    await expect(page.getByRole("img", { name: /mobile phone, tablet and laptop/i })).toBeVisible();
     await expect(page.getByRole("img", { name: /printer, frames and home delivery/i })).toBeVisible();
     await expect(page.getByText("Choose your product and image quality", { exact: true })).toHaveCount(0);
     await expect(page.getByText("Where would you like to use this photo?", { exact: true })).toHaveCount(0);
     await page.locator(".tn-product-card--digital").click();
     await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Choose image quality" })).toBeVisible();
    await expect(page.getByText("Where would you like to use this photo?", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Restored Original", { exact: true })).toBeVisible();
  });
});
