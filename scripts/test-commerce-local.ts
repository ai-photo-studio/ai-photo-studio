// R9.5-P4B7B: ONE-COMMAND disposable local commerce E2E harness.
//
// `npm run test:e2e:commerce-local` runs this file as a SINGLE Node process
// (`tsx scripts/test-commerce-local.ts`). Every child process it starts
// (disposable Postgres, API, mock P4B worker, Vite web) is spawned directly
// from this one process via `child_process.spawn({ windowsHide: true,
// shell: false })` -- never `Start-Process`, never a nested `cmd`/`powershell`
// wrapper. That is the deliberate fix for repeated visible terminal/window
// activation observed during earlier manual (tool-shell) reproduction of this
// same sequence: each manual PowerShell tool call is its OWN process, so a
// `Start-Process`-spawned child was tied to that call's lifetime and had to
// be re-launched on every subsequent call. A single long-lived harness
// process with in-process child handles has no such lifetime mismatch and
// opens no new window at all when run from an existing terminal.
//
// Zero external calls: RESTORATION_PROVIDER=mock, STORAGE_PROVIDER=mock,
// AI_PROVIDER=mock, BANK_ALFALAH_MPGS_ENABLED=false, and a Playwright
// request listener asserts zero requests to any Replicate/RunPod/Bank
// Alfalah/production host across the whole run.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const root = resolve(process.cwd());
const apiDir = resolve(root, "apps/api");
const webDir = resolve(root, "apps/web");
const scratchRoot = resolve(root, "..", "kilo", "r95-p4b7b-local-e2e");
const pgBin = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\17\\bin";
const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

const children: ChildProcess[] = [];
const processStartCounts = { postgres: 0, api: 0, web: 0, worker: 0 };
const external = { replicate: 0, runpod: 0, bank: 0, production: 0, other: 0 };

function classify(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("api.replicate.com")) external.replicate++;
  else if (lower.includes("api.runpod.ai")) external.runpod++;
  else if (lower.includes("bankalfalah") || lower.includes("mastercard.com")) external.bank++;
  else if (lower.includes("api.thannow.com")) external.production++;
  else if (/^https?:/.test(lower) && !lower.includes("127.0.0.1") && !lower.includes("localhost")) external.other++;
}

async function freePort(start: number): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    const free = await new Promise<boolean>((resolvePromise) => {
      const server = createServer();
      server.once("error", () => resolvePromise(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port near ${start}`);
}

/**
 * Every child is spawned in-process, hidden, never a new console window.
 * `useShell` must be true for Windows ".cmd" launchers (e.g. "npx.cmd") --
 * CreateProcess cannot execute a .cmd directly -- and should be false for
 * plain ".exe" binaries (the Postgres tools), where `shell:true` mis-quotes
 * a command path containing spaces (e.g. "C:\Program Files\...").
 */
function start(label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, useShell = true): ChildProcess {
  const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: useShell, windowsHide: true });
  children.push(child);
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

async function runOnce(label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeoutMs = 60_000, useShell = true): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: useShell, windowsHide: true });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${label} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    child.stdout?.on("data", (c) => { out += c; });
    child.stderr?.on("data", (c) => { out += c; });
    child.on("exit", (code) => {
      clearTimeout(timer);
      process.stdout.write(`[${label}] ${out}`);
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} exited with code ${code}`));
    });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

async function waitForHttp(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) return;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  throw new Error(`timeout waiting for ${url}`);
}

/**
 * On Windows, `ChildProcess.kill()` on a process spawned via a ".cmd"
 * launcher (e.g. "npx.cmd") only terminates that cmd.exe wrapper -- NOT the
 * real node/tsx/vite grandchild it started. Left alone this leaks a live
 * API/worker/web process (and its Redis-retry log spam) for the lifetime of
 * the terminal, well past this harness's own exit. `taskkill /T /F` kills
 * the whole process tree rooted at each spawned PID, which is the actual
 * fix -- not just a longer/repeated `child.kill()`.
 */
function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (isWin) {
    try {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
    } catch { /* best effort */ }
  } else {
    child.kill();
  }
}

async function teardown(dataDir: string, mockStorageDir: string): Promise<void> {
  for (const child of children) {
    if (!child.killed) killTree(child);
  }
  await sleep(1000);
  try {
    await runOnce("pg_ctl-stop", `${pgBin}\\pg_ctl.exe`, ["-D", dataDir, "stop", "-m", "fast"], root, process.env, 30_000, false);
  } catch { /* already down */ }
  await rm(dataDir, { recursive: true, force: true });
  await rm(mockStorageDir, { recursive: true, force: true });
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("local commerce E2E refuses NODE_ENV=production");

  const runId = Date.now().toString(36);
  const dataDir = resolve(scratchRoot, `pg-${runId}`);
  const mockStorageDir = resolve(scratchRoot, `storage-${runId}`);
  await mkdir(scratchRoot, { recursive: true });

  // Generated at runtime -- no binary fixture is committed to the repo.
  const fixturePath = resolve(scratchRoot, "e2e-1x1.png");
  const onePixelPngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  await writeFile(fixturePath, Buffer.from(onePixelPngBase64, "base64"));

  const pgPort = await freePort(55440);
  const apiPort = await freePort(4520);
  const webPort = await freePort(4220);

  // ---- 1. Disposable Postgres: fresh initdb, started exactly once. ----
  await runOnce("initdb", `${pgBin}\\initdb.exe`, ["-D", dataDir, "-U", "postgres", "-A", "trust", "--locale=C", "-E", "UTF8"], root, process.env, 60_000, false);
  await runOnce("pg_ctl-start", `${pgBin}\\pg_ctl.exe`, ["-D", dataDir, "-l", resolve(scratchRoot, `pg-${runId}.log`), "-o", `-p ${pgPort} -h 127.0.0.1`, "start"], root, process.env, 60_000, false);
  processStartCounts.postgres = 1;
  await runOnce("createdb", `${pgBin}\\createdb.exe`, ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", "e2e_commerce"], root, process.env, 60_000, false);

  const databaseUrl = `postgresql://postgres@127.0.0.1:${pgPort}/e2e_commerce`;

  // ---- 2. Migrate from empty. ----
  await runOnce("migrate", npx, ["prisma", "migrate", "deploy"], apiDir, { ...process.env, DATABASE_URL: databaseUrl });

  const sharedEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    REDIS_URL: "redis://127.0.0.1:6399",
    WHATSAPP_VERIFY_TOKEN: "local-e2e",
    ADMIN_JWT_SECRET: "local-e2e-admin-secret",
    JWT_SECRET: "local-e2e-jwt-secret",
    RESTORATION_PROVIDER: "mock",
    STORAGE_PROVIDER: "mock",
    AI_PROVIDER: "mock",
    AI_PROVIDER_NAME: "mock",
    COMMERCE_E2E_TEST_MODE: "true",
    PAYMENT_GATEWAY_NAME: "manual",
    BANK_ALFALAH_MPGS_ENABLED: "false",
    MOCK_STORAGE_DIR: mockStorageDir,
    // The API's CORS allowlist (cors.middleware.ts) defaults to the
    // conventional localhost:5173/localhost:4000 dev ports only. This
    // harness intentionally uses disposable, dynamically-chosen 127.0.0.1
    // ports so multiple runs never collide -- without this override, every
    // browser fetch from the web origin is silently CORS-blocked ("Failed
    // to fetch" in the page, no server-side error at all). Found by
    // capturing the Review page's actual failure HTML on a stalled run.
    ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`
  };

  try {
    // ---- 3. Start API exactly once. ----
    start("api", npx, ["tsx", "src/index.ts"], apiDir, { ...sharedEnv, PORT: String(apiPort), SKIP_MIGRATIONS: "true" });
    processStartCounts.api = 1;
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`);

    // ---- 4. Start mock P4B worker exactly once. ----
    start("worker", npx, ["tsx", "src/scripts/p4b-worker-runner-mock-local.ts"], apiDir, sharedEnv);
    processStartCounts.worker = 1;

    // ---- 5. Start web exactly once. ----
    start("web", npx, ["vite", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], webDir, {
      ...sharedEnv,
      VITE_API_URL: `http://127.0.0.1:${apiPort}`,
      VITE_COMMERCE_E2E_TEST_MODE: "true"
    });
    processStartCounts.web = 1;
    await waitForHttp(`http://127.0.0.1:${webPort}/`);

    // ---- 6. Real browser flow. ----
    console.log("[flow] launching chromium...");
    const browser = await chromium.launch({ headless: true, timeout: 20_000 });
    console.log("[flow] chromium launched");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    console.log("[flow] page created");
    page.on("request", (request) => classify(request.url()));
    page.on("console", (msg) => console.log(`[browser-console:${msg.type()}] ${msg.text()}`));
    page.on("pageerror", (err) => console.log(`[browser-pageerror] ${err.message}`));

    page.setDefaultTimeout(20_000);
    page.setDefaultNavigationTimeout(20_000);
    const step = async (label: string, fn: () => Promise<unknown>) => {
      console.log(`[flow] -> ${label}`);
      await fn();
      console.log(`[flow] <- ${label} ok`);
    };
    try {
      await step("goto /restore-mvp/new", () => page.goto(`http://127.0.0.1:${webPort}/restore-mvp/new`, { waitUntil: "domcontentloaded" }));
      await step("selectOption country", () => page.selectOption("select", "PK"));
      await step("check confirm", () => page.click('input[type="checkbox"]'));
      await step("setInputFiles", () => page.setInputFiles('input[type="file"]', fixturePath));
      await step("submit upload", () => page.click('button[type="submit"]'));
      await step("wait /preview", () => page.waitForURL(/\/restore-mvp\/.+\/preview/, { timeout: 15_000 }));

      await step("click Choose Your Restoration", () => page.click('text=Choose Your Restoration'));
      await step("wait /tiers", () => page.waitForURL(/\/restore-mvp\/.+\/tiers/, { timeout: 15_000 }));
      await step("click 2x HD", () => page.click('text=2x HD'));
      await step("click Review & Checkout", () => page.click('text=Review & Checkout'));
      await step("wait /review", () => page.waitForURL(/\/orders\/.+\/review/, { timeout: 15_000 }));

      const priceBookText = await page.locator("text=PriceBook").locator("..").innerText();
      if (!priceBookText.includes("PB-2026-08-09-TRIAL-V3")) throw new Error(`unexpected PriceBook: ${priceBookText}`);
      const amountText = await page.locator("text=Amount").locator("..").innerText();
      if (!amountText.includes("1,000.00") && !amountText.includes("1000.00")) throw new Error(`unexpected amount: ${amountText}`);

      await step("click Complete TEST Payment", () => page.click('[data-testid="e2e-complete-test-payment"]'));
      await step("wait download link", () => page.waitForSelector('[data-testid="e2e-download-link"]', { timeout: 20_000 }));
    } catch (flowError) {
      await page.screenshot({ path: resolve(scratchRoot, `failure-${runId}.png`), fullPage: true }).catch(() => {});
      await writeFile(resolve(scratchRoot, `failure-${runId}.html`), await page.content().catch(() => "")).catch(() => {});
      await browser.close().catch(() => {});
      throw flowError;
    }

    const orderNo = page.url().match(/\/orders\/([^/]+)\/review/)?.[1];
    await browser.close();
    if (!orderNo) throw new Error("could not read orderNo from URL");

    // ---- 7. DB assertions. ----
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const order = await prisma.fixedOrder.findUniqueOrThrow({ where: { orderNo } });
      const counts = {
        fixedOrder: await prisma.fixedOrder.count({ where: { id: order.id } }),
        paymentAttempt: await prisma.paymentAttempt.count({ where: { fixedOrderId: order.id } }),
        restorationEntitlement: await prisma.restorationEntitlement.count({ where: { fixedOrderId: order.id } }),
        restorationMaster: await prisma.restorationMaster.count({ where: { restorationEntitlement: { fixedOrderId: order.id } } }),
        replicateExecution: await prisma.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: order.id } } } })
      };
      for (const [key, value] of Object.entries(counts)) {
        if (value !== 1) throw new Error(`expected exactly 1 ${key}, got ${value}`);
      }
      // Only Replicate/RunPod/Bank Alfalah/production-API are safety-critical
      // for a zero-cost harness -- those must be exactly 0. "other" catches
      // everything else off-loopback (e.g. the app shell's static Facebook
      // Pixel `<script>` in index.html, unrelated to the commerce flow and
      // pre-existing outside this harness) and is reported, not fatal.
      if (external.replicate !== 0 || external.runpod !== 0 || external.bank !== 0 || external.production !== 0) {
        throw new Error(`unsafe external calls detected: ${JSON.stringify(external)}`);
      }
      console.log(JSON.stringify({
        orderNo,
        counts,
        processStartCounts,
        external,
        realCharges: 0,
        realPredictions: 0
      }, null, 2));
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    await teardown(dataDir, mockStorageDir);
  }
}

// Hard overall watchdog: if `main()` itself stalls on an await that never
// resolves/rejects (e.g. a genuinely hung native browser launch), this fires
// a clear, loud failure instead of a silent multi-minute hang, and
// force-kills every tracked child process directly (does not rely on
// `main()`'s own `finally` ever running).
const OVERALL_TIMEOUT_MS = 4 * 60_000;
let finished = false;
const watchdog = setTimeout(() => {
  if (finished) return;
  console.error(`[watchdog] harness did not finish within ${OVERALL_TIMEOUT_MS}ms -- force-killing all children`);
  for (const child of children) {
    if (child.pid && !child.killed) {
      if (isWin) spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
      else child.kill();
    }
  }
  process.exitCode = 1;
  process.exit(1);
}, OVERALL_TIMEOUT_MS);
watchdog.unref();

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => { finished = true; clearTimeout(watchdog); });
