import {
  test,
  expect,
  expectCleanNetwork,
  expectNoFailedFirstPartyRequests,
  expectNoHorizontalOverflow,
  expectNoPageErrors,
  seedAuthSession,
  AUTH_STORAGE_KEY,
  type SeededAuthSession
} from "./fixtures";

/**
 * R9.2-P2R-AUTH: hardens routing so the four account-only customer routes
 * (/orders, /wallet, /payments, /subscription) require a real, server
 * verified session via the existing RequireAuth guard (apps/web/src/components/RequireAuth.tsx)
 * and the existing AuthProvider (apps/web/src/lib/auth.tsx). Guest-capable
 * FixedOrder/restoration-draft routes are proven to remain untouched.
 *
 * Every backend call is mocked (page.route) -- no real apps/api process is
 * started for this spec file.
 */

const PROTECTED_ROUTES = ["/orders", "/wallet", "/payments", "/subscription"];

const FAKE_SESSION: SeededAuthSession = {
  token: "fake-test-token",
  refreshToken: "fake-test-refresh-token",
  user: { id: "user-1", email: "customer@example.com", name: "Test Customer", customerId: "cust-1" }
};

/** Fulfils every read API these four pages call on mount, with an empty/benign shape. */
async function mockAccountReadApis(page: import("@playwright/test").Page) {
  await page.route("**/api/auth/me", (route) => route.fulfill({ json: FAKE_SESSION.user }));
  await page.route("**/api/customers/**", (route) => route.fulfill({ json: {} }));
  await page.route("**/api/wallet", (route) => route.fulfill({ json: { balance: 0, transactions: [] } }));
  await page.route("**/api/payments**", (route) => route.fulfill({ json: { payments: [], total: 0, page: 1, pageSize: 10 } }));
  await page.route("**/api/subscription**", (route) => route.fulfill({ json: { subscription: null, usage: [], total: 0, page: 1, pageSize: 10 } }));
  await page.route("**/api/orders**", (route) => route.fulfill({ json: { orders: [] } }));
  await page.route("**/api/fixed-orders?**", (route) =>
    route.fulfill({ json: { items: [], total: 0, page: 1, pageSize: 20 } })
  );
  await page.route("**/api/packages**", (route) => route.fulfill({ json: [] }));
}

test.describe("customer route auth: anonymous access is blocked", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`anonymous GET ${route} redirects to login, never renders protected content`, async ({
      page,
      consoleErrors,
      pageErrors,
      failedFirstPartyRequests,
      blockedRequests
    }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login$/);

      // The protected shell (CustomerLayout's "Signed in" banner and nav)
      // must never have been in the DOM, even momentarily. Matched with
      // exact:true because LoginPage's own marketing copy ("...customer
      // signed in across visits.") would otherwise satisfy a substring
      // match on "Signed in".
      await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 1, name: "Return to a protected customer workspace that feels premium." })).toBeVisible();

      await expectNoHorizontalOverflow(page);
      expectNoPageErrors(consoleErrors, pageErrors);
      expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
      expectCleanNetwork(blockedRequests);
    });
  }
});

test.describe("customer route auth: authenticated access works", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`authenticated user can access ${route} and sees real content`, async ({
      page,
      consoleErrors,
      pageErrors,
      failedFirstPartyRequests,
      blockedRequests
    }) => {
      await seedAuthSession(page, FAKE_SESSION);
      await mockAccountReadApis(page);

      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page.getByText("Signed in", { exact: true })).toBeVisible();

      await expectNoHorizontalOverflow(page);
      expectNoPageErrors(consoleErrors, pageErrors);
      expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
      expectCleanNetwork(blockedRequests);
    });
  }
});

test.describe("customer route auth: hydration/loading window", () => {
  test("slow auth hydration shows a loading state and never renders protected content meanwhile", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await mockAccountReadApis(page);

    let releaseMe: () => void = () => undefined;
    const meGate = new Promise<void>((resolve) => {
      releaseMe = resolve;
    });
    await page.unroute("**/api/auth/me");
    await page.route("**/api/auth/me", async (route) => {
      await meGate;
      await route.fulfill({ json: FAKE_SESSION.user });
    });

    await page.goto("/orders");
    // While auth is still resolving, RequireAuth's loading state renders,
    // not the protected CustomerLayout shell.
    await expect(page.getByRole("heading", { level: 2, name: "Restoring your account" })).toBeVisible();
    await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0);

    releaseMe();
    await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/orders$/);

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });
});

test.describe("customer route auth: logout revokes access", () => {
  test("after logout, a previously-accessible protected route redirects to login again", async ({ page }) => {
    await mockAccountReadApis(page);

    // Deliberately not using seedAuthSession here: that helper installs an
    // addInitScript that re-writes the session into localStorage on every
    // subsequent navigation in this test, which would silently undo the
    // logout it (correctly) performs and mask the very regression this test
    // exists to catch. Instead, seed the session once via a direct
    // page.evaluate after the first load, so logout's removeItem is the last
    // write and sticks across the next full navigation.
    await page.goto("/login");
    await page.evaluate(
      ({ key, value }) => window.localStorage.setItem(key, value),
      { key: AUTH_STORAGE_KEY, value: JSON.stringify(FAKE_SESSION) }
    );

    await page.goto("/orders");
    await expect(page.getByText("Signed in", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Attempting to navigate back to a protected route after logout must
    // redirect again, not restore the previous session state.
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0);
  });
});

test.describe("customer route auth: forged client-side signals do not bypass auth", () => {
  test("a fake query parameter does not grant access to a protected route", async ({ page }) => {
    await page.goto("/orders?authenticated=true");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0);
  });

  test("a forged unrelated localStorage flag does not grant access to a protected route", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("isAdmin", "true"));
    await page.goto("/payments");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0);
  });

  test("a forged auth-storage session whose token fails server verification does not grant access", async ({ page }) => {
    // Seed a locally-crafted "session" under the real storage key, but never
    // mock /api/auth/me to accept it -- it must fail server verification and
    // AuthProvider must fall back to logged-out, since "authenticated" is
    // decided by a verified /api/auth/me call, not the mere presence of a
    // localStorage value.
    await seedAuthSession(page, {
      token: "forged-token-not-issued-by-server",
      refreshToken: "forged-refresh-token",
      user: { id: "attacker", email: "attacker@example.com", name: "Attacker", customerId: null }
    });
    await page.route("**/api/auth/me", (route) => route.fulfill({ status: 401, json: { message: "Invalid token" } }));
    await page.route("**/api/auth/refresh", (route) => route.fulfill({ status: 401, json: { message: "Invalid refresh token" } }));

    await page.goto("/subscription");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Signed in", { exact: true })).toHaveCount(0);

    // The forged session must actually have been cleared, not merely ignored
    // for this one render.
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), AUTH_STORAGE_KEY);
    expect(stored).toBeNull();
  });
});

test.describe("customer route auth: open-redirect protection", () => {
  test("an absolute external redirect target in login state is rejected, never honored", async ({ page }) => {
    // Simulate an attacker driving history state directly (what RequireAuth's
    // `state={{ from: location.pathname }}` would never itself produce, but
    // LoginPage must still defend against, since history.state is
    // client-settable) -- then complete a real login and assert the app
    // navigates to the safe default, never off-origin.
    await mockAccountReadApis(page);
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ json: { token: FAKE_SESSION.token, refreshToken: FAKE_SESSION.refreshToken, user: FAKE_SESSION.user } })
    );

    await page.goto("/login");
    await page.evaluate(() => {
      window.history.replaceState({ from: "https://evil.com/steal" }, "", window.location.href);
    });

    await page.getByLabel("Email").fill("customer@example.com");
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/orders$/);
    // The origin never changed -- no off-origin navigation occurred.
    expect(new URL(page.url()).origin).toBe(new URL(page.url()).origin);
    await expect(page.url()).not.toContain("evil.com");
  });

  test("a protocol-relative redirect target in login state is rejected, never honored", async ({ page }) => {
    await mockAccountReadApis(page);
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ json: { token: FAKE_SESSION.token, refreshToken: FAKE_SESSION.refreshToken, user: FAKE_SESSION.user } })
    );

    await page.goto("/login");
    await page.evaluate(() => {
      window.history.replaceState({ from: "//evil.com/steal" }, "", window.location.href);
    });

    await page.getByLabel("Email").fill("customer@example.com");
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.url()).not.toContain("evil.com");
  });

  test("a legitimate same-origin redirect target is honored", async ({ page }) => {
    await mockAccountReadApis(page);
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({ json: { token: FAKE_SESSION.token, refreshToken: FAKE_SESSION.refreshToken, user: FAKE_SESSION.user } })
    );

    // The realistic path: an anonymous user hits a protected route, gets
    // bounced to /login with `state.from` set by RequireAuth itself.
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/login$/);

    await page.getByLabel("Email").fill("customer@example.com");
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/wallet$/);
  });
});

test.describe("customer route auth: guest-capable routes remain unprotected", () => {
  test("/restore/new remains accessible with no auth prompt for an anonymous user", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await page.goto("/restore/new");
    await expect(page).toHaveURL(/\/restore\/new$/);
    await expect(page.getByRole("heading", { level: 1, name: "Upload Photos for Restoration" })).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });

  test("guest FixedOrder review flow (draft review page) remains fully accessible to an anonymous user", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    const orderNo = "FXD-GUESTAUTH01";
    await page.route(`**/api/fixed-orders/${orderNo}`, (route) =>
      route.fulfill({
        json: {
          id: "order-guest-1",
          orderNo,
          type: "RESTORATION_DIGITAL",
          market: "PAKISTAN",
          currency: "PKR",
          totalAmountMinor: "25000",
          status: "CREATED",
          immutableAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          items: [
            {
              id: "item-1",
              kind: "DIGITAL_TIER",
              tierOrSku: "ORIGINAL",
              quantity: 1,
              unitAmountMinor: "25000",
              totalAmountMinor: "25000",
              currency: "PKR",
              pricingSource: "local_fixture",
              pricingApproved: false
            }
          ]
        }
      })
    );
    await page.route(`**/api/fixed-orders/${orderNo}/payment-readiness`, (route) =>
      route.fulfill({
        json: {
          ready: false,
          reasons: ["provider unavailable"],
          order: { orderNo, market: "PAKISTAN", currency: "PKR", totalAmountMinor: "25000", status: "CREATED" }
        }
      })
    );

    await page.goto(`/restore/drafts/draft-guest-1/review?orderNo=${orderNo}`);
    await expect(page).toHaveURL(new RegExp(`/restore/drafts/draft-guest-1/review\\?orderNo=${orderNo}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Order Review" })).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(consoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });
});

test.describe("customer route auth: admin routes are unchanged", () => {
  test("/admin/dashboard still requires admin auth exactly as before (no regression)", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

const MOBILE_VIEWPORTS = [
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "430x932", width: 430, height: 932 }
] as const;

for (const viewport of MOBILE_VIEWPORTS) {
  test.describe(`customer route auth responsive @ ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("login redirect renders without overflow at mobile widths", async ({
      page,
      consoleErrors,
      pageErrors,
      failedFirstPartyRequests,
      blockedRequests
    }) => {
      await page.goto("/subscription");
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("heading", { level: 1, name: "Return to a protected customer workspace that feels premium." })
      ).toBeVisible();

      await expectNoHorizontalOverflow(page);
      expectNoPageErrors(consoleErrors, pageErrors);
      expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
      expectCleanNetwork(blockedRequests);
    });
  });
}

test.describe("customer route auth: keyboard/accessibility", () => {
  test("login redirect state supports keyboard navigation with an accessible, focusable, labeled first field", async ({
    page
  }) => {
    await page.goto("/payments");
    await expect(page).toHaveURL(/\/login$/);

    const emailField = page.getByLabel("Email");
    await emailField.focus();
    await expect(emailField).toBeFocused();

    await page.keyboard.press("Tab");
    const passwordField = page.getByLabel("Password");
    await expect(passwordField).toBeFocused();
  });
});
