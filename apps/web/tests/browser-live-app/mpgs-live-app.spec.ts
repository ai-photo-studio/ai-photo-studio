// R9.2-MPGS-CI-LIVE-PROOF live-sandbox spec.
//
// Runs ONLY via the "live" job of bank-alfalah-mpgs-actual-app-e2e.yml,
// which is itself gated to a manual workflow_dispatch with mode=live and an
// exact confirm_live input match. The real API server this test's web app
// talks to is configured (by that job only) with the real bank sandbox host
// and real MERCHANT_ID/API_PASSWORD secrets -- clicking "Pay securely" here
// makes exactly one real HTTP request to Bank Alfalah's MPGS sandbox.
//
// This test never enters card data, never retries, never submits USD, and
// never clicks Pay a second time. blockRealBankNavigation below keeps the
// BROWSER itself on the local/test URL throughout (screenshots show the
// actual app on its local URL, per this task's requirement) while still
// letting the one real server-side request go out for real -- the browser
// never renders or interacts with any bank-hosted page.
import { test, expect } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

function tinyPngPath(): string {
  const buf = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const file = path.join(os.tmpdir(), `mpgs-live-tiny-${Date.now()}.png`);
  fs.writeFileSync(file, buf);
  return file;
}

/** Aborts only navigation/requests to the real bank host -- everything else
 * (the local app, and the local API's own outgoing server-side request,
 * which this never sees since it never goes through the browser) proceeds
 * normally. This is NOT gateway/route mocking: the one real MPGS request
 * still happens for real, server-side; this only stops the BROWSER from
 * ever leaving the local/test URL to render a bank-hosted page. */
async function blockRealBankNavigation(page: import("@playwright/test").Page) {
  await page.route("**://test-bankalfalah.gateway.mastercard.com/**", async (route) => {
    await route.abort("blockedbyclient");
  });
}

test.describe("R9.2-MPGS-CI-LIVE-PROOF: one real click against the real Bank Alfalah MPGS sandbox", () => {
  test("create one real PKR FixedOrder, screenshot before, click Pay securely exactly once, screenshot the result", async ({ page }) => {
    await blockRealBankNavigation(page);

    await page.goto("/restore-mvp/new");
    await page.setInputFiles('input[type="file"]', tinyPngPath());
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Upload photo" }).click();

    await expect(page).toHaveURL(/\/restore-mvp\/[^/]+\/preview$/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Choose resolution" }).click();

    await expect(page).toHaveURL(/\/restore-mvp\/[^/]+\/tiers$/, { timeout: 20_000 });
    await page.getByText("Original", { exact: true }).click();
    await page.getByRole("button", { name: "Create order" }).click();

    await expect(page).toHaveURL(/\/orders\/[^/]+\/review$/, { timeout: 20_000 });
    const match = page.url().match(/\/orders\/([^/]+)\/review$/);
    if (!match) throw new Error("could not extract real orderNo from URL");
    const orderNo = match[1];

    await expect(page.getByText(orderNo)).toBeVisible();
    await expect(page.getByText(/PKR 250\.00/)).toBeVisible();
    await expect(page.getByText("Original", { exact: true })).toBeVisible();
    const payButton = page.getByRole("button", { name: "Pay securely" });
    await expect(payButton).toBeVisible();

    await page.screenshot({ path: "/tmp/baf-live-before-click.png", fullPage: true });

    // Exactly one click. No retry, no second click, no card data, no USD.
    await payButton.click();

    // Wait for the request to settle -- either a real gateway response
    // (REDIRECT_READY + attempted bank navigation, blocked above) or a
    // truthfully-surfaced error (400/401/404/other). Never a fabricated
    // paid/success state either way.
    await expect(async () => {
      const busy = await page.getByRole("button", { name: "Starting checkout..." }).isVisible();
      expect(busy).toBe(false);
    }).toPass({ timeout: 20_000 });

    await expect(page.getByText(/payment successful|payment complete|paid in full/i)).toHaveCount(0);

    await page.screenshot({ path: "/tmp/baf-live-after-click.png", fullPage: true });

    // Never a second click in this test -- the assertion that only one real
    // gateway call occurred is made from the API server's own log by the
    // workflow (grep count), not from here.
  });
});
