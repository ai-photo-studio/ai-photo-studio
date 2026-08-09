import { test, expect, expectNoHorizontalOverflow } from "./fixtures";

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
});
