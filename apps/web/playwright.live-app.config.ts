// R9.2-MPGS-CI-LIVE-PROOF live-sandbox config.
//
// UNLIKE playwright.actual-app-dryrun.config.ts, the API server this points
// at is itself configured (by the CI workflow only, manual workflow_dispatch
// with an explicit confirm_live input) with the REAL bank sandbox host and
// REAL MERCHANT_ID/API_PASSWORD secrets -- the one real live request this
// suite makes goes out from the server for real. This config file itself
// carries no credential and makes no request of its own; it only points
// Playwright at the already-running local web app.
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5173;

export default defineConfig({
  testDir: "./tests/browser-live-app",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report-live", open: "never" }]],
  outputDir: "test-results-live",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on",
    screenshot: "off" // this suite takes its own explicit named screenshots
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: {
    command: `npx vite --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${WEB_PORT}`,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
