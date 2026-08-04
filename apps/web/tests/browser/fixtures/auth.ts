// R9.2-P6A customer-route-hardening browser-test auth fixtures.
//
// Mirrors apps/web/src/lib/auth.tsx exactly: a stored session lives under
// localStorage key "ai-photo-studio-web-auth" as { token, refreshToken, user },
// and is re-validated via GET /api/auth/me on every page load/hydrate. These
// helpers never touch a real backend -- GET /api/auth/me is always mocked.
import type { Page } from "@playwright/test";

const STORAGE_KEY = "ai-photo-studio-web-auth";

export const TEST_USER = {
  id: "user-p6a-test-0001",
  email: "p6a-customer@example.test",
  name: "P6A Test Customer",
  customerId: "customer-p6a-test-0001"
};

export const TEST_TOKEN = "p6a-mock-access-token";
export const TEST_REFRESH_TOKEN = "p6a-mock-refresh-token";

/**
 * Installs a valid stored session before first navigation and mocks
 * GET /api/auth/me so AuthProvider's hydrate() resolves to an authenticated,
 * "ready" state without ever contacting a real backend.
 */
export async function mockAuthenticatedSession(page: Page, user = TEST_USER) {
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key as string, JSON.stringify(session));
    },
    [STORAGE_KEY, { token: TEST_TOKEN, refreshToken: TEST_REFRESH_TOKEN, user }] as const
  );
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: user })
    });
  });
}

/** Ensures no stored session exists -- AuthProvider resolves to anonymous "ready" with zero network calls. */
export async function ensureAnonymous(page: Page) {
  await page.addInitScript(
    (key) => {
      window.localStorage.removeItem(key as string);
    },
    STORAGE_KEY
  );
}
