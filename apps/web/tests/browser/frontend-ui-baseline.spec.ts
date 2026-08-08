import { expect, test } from "./fixtures";

const APPROVED_NAV = ["Home", "Restoration", "Upscaling", "Printing", "How It Works", "Pricing", "Login", "Sign Up", "Get Started"];

test.describe("ThanNow production UI baseline", () => {
  test("home page keeps the locked visual signature", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "ThanNow home" })).toBeVisible();
    for (const label of APPROVED_NAV) {
      await expect(page.getByRole("link", { name: label })).toBeVisible();
    }

    await expect(page.getByRole("link", { name: "Upload Photo and View Pricing" })).toHaveCount(1);
    await expect(page.getByText("1. Choose")).toBeVisible();
    await expect(page.getByText("2. Process")).toBeVisible();
    await expect(page.getByText("3. Download")).toBeVisible();

    await expect(page.getByText("Remove BG")).toHaveCount(0);
    await expect(page.getByText("Services")).toHaveCount(0);
    await expect(page.getByText("Restore Photos")).toHaveCount(0);

    const frame = page.locator(".hero-compare-frame");
    await expect(frame).toBeVisible();
    const box = await frame.boundingBox();
    expect(box?.width).toBeGreaterThan(500);
    expect(box?.width).toBeLessThanOrEqual(640);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("hero baseline keeps protected assets and one frame only", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".hero-bg")).toHaveCount(0);
    await expect(page.locator(".hero-compare-frame")).toHaveCount(1);
    await expect(page.locator(".hero-layer-then")).toHaveCount(1);
    await expect(page.locator(".hero-layer-now")).toHaveCount(1);
    await expect(page.locator(".hero-handle")).toBeVisible();
  });
});
