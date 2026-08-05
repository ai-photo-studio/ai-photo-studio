// R9.2-MPGS-ACTUAL-APP-E2E dry-run harness config.
//
// UNLIKE playwright.config.ts (the mock-only P4E/P5A/P6A/P6C suite), this
// config drives the REAL web app against a REAL API server and a REAL
// disposable PostgreSQL instance -- the only thing not real is the Bank
// Alfalah MPGS gateway itself, which is replaced by a local stub server
// (mpgs-local-stub-server.ts) so this harness never makes a network call to
// the actual bank. The API/web/stub processes are started and stopped by the
// orchestrating session, not by this config's `webServer` (both are already
// running by the time this config runs -- `reuseExistingServer` no-ops the
// start if so, and would only start them itself if run standalone).
import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5173;

export default defineConfig({
  testDir: "./tests/browser-actual-app-dryrun",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results-dryrun",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
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
