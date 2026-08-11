import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const MEMORY_LABELS = [
  "Parents and Grandparents",
  "Wedding Memories",
  "Childhood Photos",
  "Family Portraits",
  "Honoring Loved Ones"
];

async function assertHomepageImages(page: Page, screenshotPath: string) {
  const firstParty404s: string[] = [];
  page.on("response", (response: any) => {
    if (response.status() === 404 && new URL(response.url()).pathname.startsWith("/assets/")) firstParty404s.push(response.url());
  });
  await page.goto("/", { waitUntil: "networkidle" });
  const images = page.locator('img[src^="/assets/"]');
  await expect(images).toHaveCount(19);
  for (let index = 0; index < await images.count(); index++) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => {
      const imageElement = element as HTMLImageElement;
      return imageElement.complete && imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0;
    })).toBe(true);
  }
  for (const label of MEMORY_LABELS) {
    const card = page.getByRole("article").filter({ hasText: label });
    await expect(card.locator("img")).toHaveCount(1);
    await expect(card.locator("img")).toBeVisible();
  }
  const backgroundUrls = await page.evaluate(() => Array.from(document.querySelectorAll("*"), (element) => getComputedStyle(element).backgroundImage).flatMap((value) => Array.from(value.matchAll(/url\(["']?([^"')]+)["']?\)/g), (match) => match[1])).filter((url) => url.startsWith("/assets/")));
  expect(backgroundUrls).toEqual([]);
  expect(firstParty404s).toEqual([]);
  await page.screenshot({ path: screenshotPath, fullPage: true });
}

test.describe("homepage production image integrity", () => {
  test("desktop assets resolve with no first-party 404s", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await assertHomepageImages(page, testInfo.outputPath("homepage-memory-1440.png"));
  });

  test("mobile assets resolve with no first-party 404s", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await assertHomepageImages(page, testInfo.outputPath("homepage-memory-390.png"));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
