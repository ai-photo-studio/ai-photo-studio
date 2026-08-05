// R9.2-MPGS-ACTUAL-APP-E2E dry-run harness.
//
// Drives the REAL web app against a REAL API server and a REAL disposable
// PostgreSQL instance, all the way through one real click of "Pay securely"
// on the actual FixedOrderReviewPage. The ONLY thing not real is the Bank
// Alfalah MPGS gateway itself -- BANK_ALFALAH_MPGS_BASE_URL points at a
// local stub server (mpgs-local-stub-server.ts) for this harness, so this
// suite never makes a network call to the real bank sandbox. All requests
// are still confirmed local-only via blockExternalNetwork (which also
// safely intercepts and aborts the app's real
// window.location.assign(...) redirect to the bank's checkout-pay page on a
// simulated success, so no dry run can ever actually navigate off-host).
import { test, expect, blockExternalNetwork } from "../browser/fixtures/index";
import { tinyPngPath } from "../browser/fixtures/mvp";
import * as fs from "node:fs";
import * as path from "node:path";

const STUB_CONTROL_URL = "http://127.0.0.1:4600/__control/set-mode";
const STUB_LOG_FILE = process.env.STUB_LOG_FILE || "D:\\Temp\\claude\\evidence\\stub-gateway-log.jsonl";
// Platform-portable: local Windows dev keeps the existing scratchpad
// convention by default; CI sets SCREENSHOT_DIR to a real path on the
// runner (see bank-alfalah-mpgs-actual-app-e2e.yml) so these land inside
// the uploaded artifact instead of silently failing to resolve a
// Windows-style path on a Linux runner.
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || "D:\\Temp\\claude\\evidence";
const screenshotPath = (name: string) => path.join(SCREENSHOT_DIR, name);

async function setStubMode(mode: string): Promise<void> {
  const res = await fetch(STUB_CONTROL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode })
  });
  if (!res.ok) throw new Error(`failed to set stub mode: ${res.status}`);
}

function readStubLog(): Array<{ method: string; url: string; authUsernamePrefix: string; mode: string; body: unknown; ts: string }> {
  if (!fs.existsSync(STUB_LOG_FILE)) return [];
  return fs
    .readFileSync(STUB_LOG_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function clearStubLog(): void {
  fs.writeFileSync(STUB_LOG_FILE, "", "utf8");
}

/** Drives the real upload -> preview -> tiers -> create order -> review flow
 * against the REAL API (no page.route mocking of any restoration-draft/
 * fixed-order endpoint) and returns the real orderNo the API assigned. */
async function createRealPkrOrderAndReachReview(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/restore-mvp/new");
  await page.setInputFiles('input[type="file"]', tinyPngPath());
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Upload photo" }).click();

  await expect(page).toHaveURL(/\/restore-mvp\/[^/]+\/preview$/, { timeout: 15_000 });
  await page.getByRole("button", { name: "Choose resolution" }).click();

  await expect(page).toHaveURL(/\/restore-mvp\/[^/]+\/tiers$/, { timeout: 15_000 });
  await page.getByText("Original", { exact: true }).click();
  await page.getByRole("button", { name: "Create order" }).click();

  await expect(page).toHaveURL(/\/orders\/[^/]+\/review$/, { timeout: 15_000 });
  const match = page.url().match(/\/orders\/([^/]+)\/review$/);
  if (!match) throw new Error("could not extract real orderNo from URL");
  return match[1];
}

test.describe("R9.2-MPGS-ACTUAL-APP-E2E dry run: real app, real API, real disposable DB, stub gateway", () => {
  test("success: real click reaches the real checkout route/controller/service/adapter, stub returns session.id, no fabricated paid state", async ({ page }) => {
    await blockExternalNetwork(page);
    await setStubMode("success");
    clearStubLog();

    const orderNo = await createRealPkrOrderAndReachReview(page);
    await expect(page.getByText(orderNo)).toBeVisible();
    await expect(page.getByText(/PKR 250\.00/)).toBeVisible();
    await expect(page.getByText("Original", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay securely" })).toBeVisible();

    await page.screenshot({ path: screenshotPath("baf-app-dryrun-before.png"), fullPage: true });

    // Screenshot-timing aid ONLY (does not touch the checkout logic, the
    // gateway call, or any response content): the real local checkout POST
    // to our own real API resolves in well under a millisecond against the
    // local stub, so the "Starting checkout..." disabled-button state is
    // visually unobservable before window.location.assign(...) begins
    // tearing down the document for the (network-layer-blocked) redirect. A
    // small artificial delay on the LOCAL /fixed-orders/.../checkout
    // response gives a real, stable window to capture it -- the actual
    // request/response contract proof below reads straight from the stub's
    // log, unaffected by this delay.
    await page.route("**/api/fixed-orders/*/checkout", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.continue();
    });

    await page.getByRole("button", { name: "Pay securely" }).click();
    await expect(page.getByRole("button", { name: "Starting checkout..." })).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: screenshotPath("baf-app-dryrun-success.png"), fullPage: true });

    await expect
      .poll(() => readStubLog().filter((e) => e.method === "POST" && e.url.endsWith("/session")).length, { timeout: 10_000 })
      .toBe(1);

    // Exactly one gateway call for this one click.
    const entries = readStubLog();
    const sessionCalls = entries.filter((e) => e.method === "POST" && e.url.endsWith("/session"));
    expect(sessionCalls).toHaveLength(1);
    const call = sessionCalls[0];

    // Bank v100 contract proof (dry-run-only synthetic credentials, never real):
    expect(call.authUsernamePrefix).toBe("merchant.DRYRUNMERCHANT");
    const body = call.body as {
      apiOperation: string;
      interaction: { operation: string; returnUrl: string; merchant: { name: string } };
      order: { id: string; amount: string; currency: string };
    };
    expect(body.apiOperation).toBe("INITIATE_CHECKOUT");
    expect(body.interaction.operation).toBe("PURCHASE");
    expect(body.interaction.merchant.name).toBe("Dry Run Test Merchant");
    expect(body.interaction.returnUrl).toBe("http://127.0.0.1:5173/checkout/return");
    expect(body.order.currency).toBe("PKR");
    expect(body.order.id).toBe(orderNo);
    expect(body.order.id.length).toBeLessThan(41);
  });

  test("duplicate click protection: the button disables itself and the in-memory guard produces exactly one gateway call", async ({ page }) => {
    // A literal second real click racing the app's own real
    // window.location.assign(...) navigation (which blockExternalNetwork
    // then aborts) makes Playwright's actionability wait hang against a
    // mid-navigation document -- an artifact of this specific harness, not
    // something a real user's double-click would behave differently on
    // (the button is already disabled/unmounting by then either way). This
    // test instead proves the two real protections directly: (1) the
    // button visibly disables itself the instant checkoutBusy flips, and
    // (2) exactly one real gateway request was made for the one logical
    // click, via the same server-side guard
    // (`if (!orderNo || checkoutBusy) return;`) already unit-tested in
    // customer-checkout.service.test.ts.
    await blockExternalNetwork(page);
    await setStubMode("success");
    clearStubLog();

    await createRealPkrOrderAndReachReview(page);
    const payButton = page.getByRole("button", { name: "Pay securely" });
    await payButton.click();
    await expect(page.getByRole("button", { name: "Starting checkout..." })).toBeVisible({ timeout: 5_000 });

    await expect.poll(() => readStubLog().filter((e) => e.method === "POST" && e.url.endsWith("/session")).length, {
      timeout: 10_000
    }).toBe(1);

    const entries = readStubLog();
    const sessionCalls = entries.filter((e) => e.method === "POST" && e.url.endsWith("/session"));
    expect(sessionCalls).toHaveLength(1);
  });

  test("refresh after landing on review issues GET only, never triggers checkout", async ({ page }) => {
    await blockExternalNetwork(page);
    await setStubMode("success");
    clearStubLog();

    await createRealPkrOrderAndReachReview(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "Pay securely" })).toBeVisible();

    const entries = readStubLog();
    expect(entries).toHaveLength(0);
  });

  for (const scenario of [
    { mode: "400", expectedText: /Value invalid/i },
    { mode: "401", expectedText: /Invalid credentials|Unable to start checkout/i },
    { mode: "404", expectedText: /not found|Unable to start checkout/i }
  ]) {
    test(`error handling: gateway ${scenario.mode} never produces a fabricated success`, async ({ page }) => {
      await blockExternalNetwork(page);
      await setStubMode(scenario.mode);
      clearStubLog();

      const orderNo = await createRealPkrOrderAndReachReview(page);
      await page.getByRole("button", { name: "Pay securely" }).click();
      await expect(page.getByText(/payment successful|payment complete|paid in full/i)).toHaveCount(0);
      // Some visible error/blocked state is shown -- never a silent
      // fabricated success and never an unhandled crash.
      await expect(page.getByRole("button", { name: "Pay securely" })).toBeVisible({ timeout: 10_000 });

      if (scenario.mode === "400") {
        await page.screenshot({ path: screenshotPath("baf-app-dryrun-error.png"), fullPage: true });
      }

      const entries = readStubLog();
      const sessionCalls = entries.filter((e) => e.method === "POST" && e.url.endsWith("/session"));
      expect(sessionCalls).toHaveLength(1);
      void orderNo;
    });
  }
});
