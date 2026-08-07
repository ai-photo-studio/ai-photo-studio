import {
  test,
  expect,
  expectPageIsHealthy,
  expectNoHorizontalOverflow,
  expectNoPageErrors,
  expectNoFailedFirstPartyRequests,
  expectCleanNetwork,
  seedAuthSession,
  type SeededAuthSession
} from "./fixtures";

const FAKE_SESSION: SeededAuthSession = {
  token: "fake-test-token",
  refreshToken: "fake-test-refresh-token",
  user: { id: "user-1", email: "customer@example.com", name: "Test Customer", customerId: "cust-1" }
};

test.describe("smoke: currently implemented public/customer routes", () => {
  test("homepage loads", async ({ page, consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests }) => {
    await page.goto("/");
    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: /Bring Your Precious Memories Back to Life/ }
    );

    const primaryAction = page.getByRole("button", { name: "Upload Your Photo", exact: true }).first();
    await primaryAction.focus();
    await expect(primaryAction).toBeFocused();
  });

  test("primary navigation works", async ({ page, consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Login" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: "Return to a protected customer workspace that feels premium." }
    );
  });

  test("restoration upload/start page loads", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    // R9.2-P1A: this page makes zero API calls on load (market confirmation
    // and upload only happen on explicit user action), so no mock is needed
    // here -- that absence is itself part of what "no failed first-party
    // request" proves for this page.
    await page.goto("/restore/new");
    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: "Upload Photos for Restoration" }
    );

    // Country/market confirmation must exist and require explicit action.
    await expect(page.getByLabel("Country")).toBeVisible();
    const confirmCheckbox = page.getByRole("checkbox", { name: /confirm market/i });
    await expect(confirmCheckbox).toBeVisible();
    await expect(confirmCheckbox).not.toBeChecked();

    const dropzone = page.getByRole("button", { name: /drag and drop your image here/i });
    await expect(dropzone).toBeVisible();
    await dropzone.focus();
    await expect(dropzone).toBeFocused();
  });

  test("login page loads", async ({ page, consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests }) => {
    await page.goto("/login");
    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: "Return to a protected customer workspace that feels premium." }
    );

    // The submit button starts disabled until the form is valid (real,
    // correct behavior -- a disabled control cannot receive focus in any
    // browser), so the primary keyboard-reachable control on initial load is
    // the first form field, not the submit button.
    const emailField = page.getByLabel("Email");
    await emailField.focus();
    await expect(emailField).toBeFocused();
  });

  test("signup page loads", async ({ page, consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests }) => {
    await page.goto("/signup");
    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: "A polished signup flow for the web launch." }
    );

    // Same reasoning as the login page: the submit button starts disabled
    // until the form is valid, so the first (enabled) form field is the
    // primary keyboard-reachable control on initial load.
    const nameField = page.getByLabel("Name");
    await nameField.focus();
    await expect(nameField).toBeFocused();
  });

  test("direct route/deep-link reload works", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.reload();

    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: "Return to a protected customer workspace that feels premium." }
    );
  });

  test("unknown route behavior is truthful (redirects home, no fake 404 content)", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await page.goto("/this-route-does-not-exist-in-app-tsx");
    await expect(page).toHaveURL(/\/$/);
    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: /Bring Your Precious Memories Back to Life/ }
    );
  });

  test("mocked restoration history: loading state then empty state", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: FAKE_SESSION.user }));

    let releaseOrders: () => void = () => undefined;
    const ordersGate = new Promise<void>((resolve) => {
      releaseOrders = resolve;
    });
    await page.route("**/api/restorations", async (route) => {
      await ordersGate;
      await route.fulfill({ json: [] });
    });

    await page.goto("/restore");
    await expect(page.getByText("Loading orders...")).toBeVisible();

    releaseOrders();
    await expect(page.getByText("No restoration orders yet.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Start Your First Restoration" })).toBeVisible();

    await expectPageIsHealthy(
      page,
      { consoleErrors, pageErrors, failedFirstPartyRequests, blockedRequests },
      { level: 1, name: "My Restorations" }
    );
  });

  test("mocked restoration history: error state", async ({
    page,
    consoleErrors,
    pageErrors,
    failedFirstPartyRequests,
    blockedRequests
  }) => {
    await seedAuthSession(page, FAKE_SESSION);
    await page.route("**/api/auth/me", (route) => route.fulfill({ json: FAKE_SESSION.user }));
    await page.route("**/api/restorations", (route) =>
      route.fulfill({ status: 500, json: { success: false, message: "Unable to load orders right now" } })
    );

    await page.goto("/restore");
    await expect(page.getByText("Unable to load orders right now")).toBeVisible();

    // This test deliberately mocks an HTTP 500 to exercise the error state,
    // so the browser's own "responded with a status of 500" console log is
    // expected here (not a genuine bug) and is excluded before asserting --
    // every other console error still fails the test. The error path is a
    // mocked failure response, not a network-level failure, so it does not
    // appear in failedFirstPartyRequests (transport-level failures only),
    // and that check still applies unmodified.
    const unexpectedConsoleErrors = consoleErrors.filter((text) => !text.includes("status of 500"));
    await expect(page.getByRole("heading", { level: 1, name: "My Restorations" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expectNoPageErrors(unexpectedConsoleErrors, pageErrors);
    expectNoFailedFirstPartyRequests(failedFirstPartyRequests);
    expectCleanNetwork(blockedRequests);
  });
});
