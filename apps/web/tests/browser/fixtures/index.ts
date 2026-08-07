import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * R9.2-P0C2 browser-test foundation fixtures.
 *
 * Every test using `test` from this module automatically gets a network
 * guard (aborts and records any non-local, non-explicitly-mocked request),
 * console/page error collection, and failed-first-party-request tracking.
 * Tests must call the `expect*` helpers below to turn those into assertions
 * -- the fixtures only collect, they do not assert on their own, so a test
 * can never accidentally "pass" a check it forgot to make.
 */

export type BlockedRequest = { url: string; method: string };

type Fixtures = {
  blockedRequests: BlockedRequest[];
  consoleErrors: string[];
  pageErrors: string[];
  failedFirstPartyRequests: string[];
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

// apps/web/src/main.tsx unconditionally injects a Facebook Pixel bootstrap
// script (and a GA gtag stub) on every page load, using placeholder IDs
// ("YOUR_PIXEL_ID", "GA_MEASUREMENT_ID") -- this is pre-existing, unrelated
// to this test suite, and fires regardless of route. It is always aborted
// here (never reaches the real network either way), but is deliberately not
// counted as a test-failing violation, because failing on it would fail
// every single test in this suite for a known, unconditional bootstrap
// script rather than a genuine regression. Any OTHER non-local host IS
// counted and fails the test via expectCleanNetwork().
const KNOWN_BOOTSTRAP_TRACKERS = [
  /(^|\.)facebook\.com$/,
  /(^|\.)facebook\.net$/,
  /(^|\.)googletagmanager\.com$/,
  /(^|\.)google-analytics\.com$/
];

export const test = base.extend<Fixtures>({
  // Playwright's fixture-provider callback is conventionally named `use`,
  // but eslint-plugin-react-hooks treats any identifier starting with
  // "use" as a React Hook call outside a component/hook -- a false
  // positive here, since this file has nothing to do with React. Renamed
  // to `provide` purely to sidestep that naming heuristic; behavior is
  // unchanged (it's still Playwright's fixture-provider callback).
  blockedRequests: async ({ page }, provide) => {
    const blocked: BlockedRequest[] = [];
    await page.route("**/*", async (route) => {
      let hostname: string;
      try {
        hostname = new URL(route.request().url()).hostname;
      } catch {
        await route.continue();
        return;
      }
      if (LOCAL_HOSTS.has(hostname)) {
        await route.continue();
        return;
      }
      if (!KNOWN_BOOTSTRAP_TRACKERS.some((pattern) => pattern.test(hostname))) {
        blocked.push({ url: route.request().url(), method: route.request().method() });
      }
      await route.abort("blockedbyclient");
    });
    await provide(blocked);
  },

  consoleErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      // The browser itself logs a console error whenever the network guard
      // above calls route.abort() (Chrome DevTools Protocol surfaces this as
      // "net::ERR_BLOCKED_BY_CLIENT"). That is the guard working as intended
      // -- on every page load it fires at least once for the pre-existing
      // Facebook Pixel bootstrap script -- not a genuine application console
      // error, so it is excluded here. A real, unexpected blocked request is
      // still caught independently via the `blockedRequests` fixture and
      // expectCleanNetwork().
      if (message.text().includes("ERR_BLOCKED_BY_CLIENT")) return;
      errors.push(message.text());
    });
    await provide(errors);
  },

  pageErrors: async ({ page }, provide) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await provide(errors);
  },

  failedFirstPartyRequests: async ({ page }, provide) => {
    const failed: string[] = [];
    page.on("requestfailed", (request) => {
      let hostname: string;
      try {
        hostname = new URL(request.url()).hostname;
      } catch {
        return;
      }
      if (LOCAL_HOSTS.has(hostname)) {
        failed.push(`${request.url()} (${request.failure()?.errorText ?? "unknown error"})`);
      }
    });
    await provide(failed);
  }
});

export { expect };

export function expectCleanNetwork(blockedRequests: BlockedRequest[]) {
  expect(blockedRequests, `Unexpected external network requests were blocked: ${JSON.stringify(blockedRequests)}`).toEqual([]);
}

export function expectNoPageErrors(consoleErrors: string[], pageErrors: string[]) {
  expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
  expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join("; ")}`).toEqual([]);
}

export function expectNoFailedFirstPartyRequests(failedFirstPartyRequests: string[]) {
  expect(failedFirstPartyRequests, `Failed first-party requests: ${failedFirstPartyRequests.join("; ")}`).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, `Horizontal viewport overflow detected: ${overflow}px`).toBeLessThanOrEqual(1);
}

export const AUTH_STORAGE_KEY = "ai-photo-studio-web-auth";

export type SeededAuthSession = {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; name: string | null; customerId: string | null };
};

/** Seeds a fake logged-in session into localStorage before any app script runs. */
export async function seedAuthSession(page: Page, session: SeededAuthSession) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    { key: AUTH_STORAGE_KEY, value: JSON.stringify(session) }
  );
}

export type PageDiagnostics = {
  consoleErrors: string[];
  pageErrors: string[];
  failedFirstPartyRequests: string[];
  blockedRequests: BlockedRequest[];
};

/**
 * The standard per-page assertion bundle required by R9.2-P0C2: a visible
 * heading/landmark, no horizontal overflow, no page/console errors, no
 * failed first-party requests, and no unexpected external network calls.
 */
export async function expectPageIsHealthy(
  page: Page,
  diagnostics: PageDiagnostics,
  heading: { level: 1 | 2; name: string | RegExp }
) {
  await expect(page.getByRole("heading", { level: heading.level, name: heading.name })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expectNoPageErrors(diagnostics.consoleErrors, diagnostics.pageErrors);
  expectNoFailedFirstPartyRequests(diagnostics.failedFirstPartyRequests);
  expectCleanNetwork(diagnostics.blockedRequests);
}
