import { expect, test } from "./fixtures";

const APPROVED_NAV = ["Home", "Restoration", "Upscaling", "Printing", "How It Works", "Pricing"];

test.describe("ThanNow production UI baseline", () => {
  test("home page keeps the locked visual signature", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "ThanNow home" }).first()).toBeVisible();
    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    for (const label of APPROVED_NAV) {
      await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    const actions = page.locator(".header-actions");
    await expect(actions.getByRole("link", { name: "Login", exact: true })).toBeVisible();
    await expect(actions.getByRole("link", { name: "Sign Up", exact: true })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Get Started", exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Upload Photo and View Pricing" })).toHaveCount(1);
    for (const section of ["Memories We Restore", "Upscale and Display Anywhere", "Print and Preserve Forever", "How It Works", "Choose Your Print Size"]) {
      await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    await expect(page.getByText("1. Choose")).toHaveCount(0);
    await expect(page.getByText("2. Process")).toHaveCount(0);
    await expect(page.getByText("3. Download")).toHaveCount(0);

    await expect(navigation.getByText("Remove BG")).toHaveCount(0);
    await expect(navigation.getByText("Services")).toHaveCount(0);
    await expect(navigation.getByText("Restore Photos")).toHaveCount(0);

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
