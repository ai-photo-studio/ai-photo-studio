import { expect, test, expectNoFailedFirstPartyRequests, expectNoPageErrors, expectNoHorizontalOverflow } from "./fixtures";

const PUBLIC_ROUTES = [
  "/",
  "/faq",
  "/terms",
  "/privacy-policy",
  "/payment-policy",
  "/refund-exchange-policy",
  "/delivery-policy",
  "/contact",
  "/background-removal",
  "/enhancement",
  "/flat-lay",
  "/lifestyle",
  "/virtual-model",
  "/videos",
  "/pricing",
  "/login",
  "/register"
];

for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
  test.describe(`public routes at ${viewport.width}px`, () => {
    test.use({ viewport });
    test.setTimeout(90000);

    test("load with canonical logo, no overflow, and clean first-party runtime", async ({ page, consoleErrors, pageErrors, failedFirstPartyRequests }) => {
      await page.route("**/api/digital-catalog?market=PAKISTAN", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { offers: [], printCatalog: [] } }) }));
      await page.route("**/api/memory-packages", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) }));

      for (const route of PUBLIC_ROUTES) {
        await page.goto(route);
        await expect(page.locator(".brand-logo").first()).toHaveAttribute("src", "/assets/logo2.png");
        await expect(page.locator(".brand-logo").first()).toHaveJSProperty("complete", true);
        await expect.poll(() => page.locator(".brand-logo").first().evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await expectNoHorizontalOverflow(page);
        if (route === "/contact") {
          await expect.poll(() => page.locator("body").textContent()).toContain("28-E, Gulshan-e-Ali Sahiwal");
        } else {
          await expect.poll(() => page.locator("body").textContent()).not.toContain("28-E, Gulshan-e-Ali Sahiwal");
        }
      }

      expectNoPageErrors(consoleErrors, pageErrors);
      expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    });
  });
}
