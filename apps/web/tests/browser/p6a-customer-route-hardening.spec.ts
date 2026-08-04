// R9.2-P6A minimal browser harness: customer route authority hardening.
//
// Every test blocks all non-local network traffic and mocks only the exact
// endpoints exercised (auth/me plus each page's own read endpoint). No real
// API server, MPGS, Replicate, R2, RunPod, or Local provider is ever
// contacted.
import { test, expect, blockExternalNetwork } from "./fixtures/index";
import { mockAuthenticatedSession, ensureAnonymous, TEST_USER } from "./fixtures/auth";

const PROTECTED_ROUTES = ["/orders", "/wallet", "/payments", "/subscription"];

test.describe("P6A protected customer routes reject anonymous access", () => {
  for (const path of PROTECTED_ROUTES) {
    test(`${path} redirects anonymous visitors to /login and preserves destination`, async ({ page }) => {
      await blockExternalNetwork(page);
      await ensureAnonymous(page);
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
      // Intended destination preserved via router location state, consumed
      // by LoginPage's `from` -- not observable via URL, so assert via a
      // successful post-login navigation back to the original path.
    });
  }

  test("forged success/payment query parameters cannot bypass the auth gate", async ({ page }) => {
    await blockExternalNetwork(page);
    await ensureAnonymous(page);
    await page.goto("/payments?status=success&paid=true&forced=true");
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("P6A intended destination is preserved through login", () => {
  test("logging in after an anonymous /wallet visit returns the user to /wallet", async ({ page }) => {
    await blockExternalNetwork(page);
    await ensureAnonymous(page);
    await page.goto("/wallet");
    await expect(page).toHaveURL(/\/login$/);

    await page.route("**/api/auth/login", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: { user: TEST_USER, token: "p6a-login-token", refreshToken: "p6a-login-refresh" }
        })
      });
    });
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: TEST_USER }) });
    });
    await page.route("**/api/me/wallet", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: TEST_USER,
            wallet: { id: "wallet-1", currency: "PKR", availableBalance: 0, reservedBalance: 0 },
            summary: { availableBalance: 0, totalTransactions: 0, activeSubscriptions: 0, lifetimeSpent: 0, lifetimeCredited: 0, pendingPayments: 0 },
            activeSubscription: null
          }
        })
      });
    });

    await page.getByLabel("Email").fill(TEST_USER.email);
    await page.getByLabel("Password").fill("correct-horse-battery-staple");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page).toHaveURL(/\/wallet$/, { timeout: 5000 });
  });
});

test.describe("P6A protected customer routes allow authenticated access", () => {
  test("/orders renders for an authenticated user without redirecting", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockAuthenticatedSession(page);
    await page.route("**/api/me/wallet", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            user: TEST_USER,
            wallet: { id: "wallet-1", currency: "PKR", availableBalance: 0, reservedBalance: 0 },
            summary: {
              availableBalance: 0,
              totalTransactions: 0,
              activeSubscriptions: 0,
              lifetimeSpent: 0,
              lifetimeCredited: 0,
              pendingPayments: 0
            },
            activeSubscription: null
          }
        })
      });
    });
    await page.route("**/api/packages", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.goto("/orders");
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByText("Track credits, uploads, and downloads in one place.")).toBeVisible();
  });

  for (const path of ["/wallet", "/payments", "/subscription"]) {
    test(`${path} does not redirect to /login for an authenticated user (deep link)`, async ({ page }) => {
      await blockExternalNetwork(page);
      await mockAuthenticatedSession(page);
      // Any page-specific data GET is allowed to fail naturally (no real API
      // server in this harness) -- the assertion is scoped to the auth gate,
      // not full page data rendering.
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}$`));
      await expect(page).not.toHaveURL(/\/login$/);
    });
  }

  test("refresh (reload) on a protected route keeps the authenticated user on the same route", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockAuthenticatedSession(page);
    await page.goto("/wallet");
    await expect(page).not.toHaveURL(/\/login$/);
    await page.reload();
    await expect(page).toHaveURL(/\/wallet$/);
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test("no redirect loop: authenticated deep link to /subscription settles once", async ({ page }) => {
    await blockExternalNetwork(page);
    await mockAuthenticatedSession(page);
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
    });
    await page.goto("/subscription");
    await page.waitForTimeout(300);
    const loginHits = navigations.filter((p) => p === "/login").length;
    expect(loginHits).toBe(0);
  });
});

test.describe("P6A guest restoration routes remain available", () => {
  test("guest restoration history route stays reachable without a login redirect", async ({ page }) => {
    await blockExternalNetwork(page);
    await ensureAnonymous(page);
    await page.goto("/restore");
    await expect(page).not.toHaveURL(/\/login$/);
  });

  test("guest restoration upload route stays reachable without a login redirect", async ({ page }) => {
    await blockExternalNetwork(page);
    await ensureAnonymous(page);
    await page.goto("/restore/new");
    await expect(page).not.toHaveURL(/\/login$/);
  });
});

test.describe("P6A admin routes remain unchanged", () => {
  test("admin route still uses its own portal gate, not RequireAuth's /login", async ({ page }) => {
    await blockExternalNetwork(page);
    await ensureAnonymous(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe("P6A restoration order page issues GET requests only on load and refresh", () => {
  const orderId = "order-p6a-legacy-0001";
  const legacyOrderUrl = `**/api/restorations/${orderId}`;

  test("page load and manual reload never dispatch a processing POST", async ({ page }) => {
    await blockExternalNetwork(page);
    const methodsSeen: string[] = [];
    const processCalls: string[] = [];
    await page.route(legacyOrderUrl, async (route) => {
      methodsSeen.push(route.request().method());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            id: orderId,
            orderNo: "ORD-P6A-0001",
            title: null,
            status: "PROCESSING",
            totalItems: 1,
            completedItems: 0,
            failedItems: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            entitlement: "PREVIEW_ONLY",
            items: [
              {
                id: "item-p6a-0001",
                status: "QUEUED",
                processingStage: null,
                errorMessage: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                imageCategory: null,
                totalDurationMs: null,
                beforeQualityScore: null,
                afterQualityScore: null,
                damageSeverity: null,
                damageScore: null,
                originalStorageKey: null,
                finalStorageKey: null,
                originalUrl: null,
                finalUrl: null,
                availableTiers: []
              }
            ]
          }
        })
      });
    });
    await page.route(`**/api/restorations/${orderId}/items/*/process`, async (route) => {
      processCalls.push(route.request().url());
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { message: "should never be called" } }) });
    });

    await page.goto(`/restore/${orderId}`);
    await page.waitForTimeout(500);
    await page.reload();
    await page.waitForTimeout(500);

    expect(processCalls).toEqual([]);
    expect(methodsSeen.every((m) => m === "GET")).toBe(true);
    expect(methodsSeen.length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("P6A zero external network calls across the hardened routes", () => {
  test("authenticated /orders visit makes zero external network calls", async ({ page }) => {
    const externalCompleted: string[] = [];
    const isExternal = (url: string) => {
      const hostname = new URL(url).hostname;
      return hostname !== "127.0.0.1" && hostname !== "localhost";
    };
    page.on("requestfinished", (request) => {
      if (isExternal(request.url())) externalCompleted.push(request.url());
    });
    await blockExternalNetwork(page);
    await mockAuthenticatedSession(page);
    await page.route("**/api/me/wallet", async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, message: "no fixture needed for this assertion" }) });
    });
    await page.route("**/api/packages", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.goto("/orders");
    await page.waitForTimeout(300);
    expect(externalCompleted).toEqual([]);
  });
});

test.describe("P6A protected routes remain usable at small viewports", () => {
  for (const width of [360, 390, 430]) {
    test(`/orders renders correctly at ${width}px width (authenticated)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await blockExternalNetwork(page);
      await mockAuthenticatedSession(page);
      await page.route("**/api/me/wallet", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              user: TEST_USER,
              wallet: { id: "wallet-1", currency: "PKR", availableBalance: 0, reservedBalance: 0 },
              summary: {
                availableBalance: 0,
                totalTransactions: 0,
                activeSubscriptions: 0,
                lifetimeSpent: 0,
                lifetimeCredited: 0,
                pendingPayments: 0
              },
              activeSubscription: null
            }
          })
        });
      });
      await page.route("**/api/packages", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: [] }) });
      });
      await page.goto("/orders");
      await expect(page.getByText("Track credits, uploads, and downloads in one place.")).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });

    test(`/login (redirected from a protected route) renders correctly at ${width}px width`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await blockExternalNetwork(page);
      await ensureAnonymous(page);
      await page.goto("/wallet");
      await expect(page).toHaveURL(/\/login$/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
