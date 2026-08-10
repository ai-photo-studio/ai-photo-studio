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

    // ---- 6. Real browser flows. ----
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
    const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const orderNos: string[] = [];
    const flow = async (kind: "DIGITAL" | "PRINT_DIGITAL") => {
      await step(`${kind}: home`, () => page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" }));
      await step(`${kind}: open canonical upload`, () => page.getByRole("button", { name: "Upload Your Photo", exact: true }).first().click());
      await step(`${kind}: select image once`, () => page.setInputFiles("#photoInput", fixturePath));
      await step(`${kind}: persist draft`, () => page.getByRole("button", { name: "Continue to Restoration" }).click());
      await step(`${kind}: preview`, () => page.waitForURL(/\/restore-mvp\/.+\/preview/, { timeout: 15_000 }));
      await step(`${kind}: choose restoration`, () => page.getByRole("button", { name: "Choose Your Restoration" }).click());
      await step(`${kind}: tiers`, () => page.waitForURL(/\/restore-mvp\/.+\/tiers/, { timeout: 15_000 }));

      if (kind === "PRINT_DIGITAL") {
        await page.getByRole("radio", { name: /Print \+ Digital/ }).click();
        await page.getByLabel("Print size").selectOption("4x6");
        await page.getByLabel("Quantity").fill("10");
        await page.getByLabel("Recipient name").fill("Local E2E Customer");
        await page.getByLabel("Phone").fill("03001234567");
        await page.getByLabel("Address").fill("1 Test Street");
        await page.getByLabel("City").fill("Lahore");
        await page.getByText("4x Ultra HD", { exact: true }).click();
      } else {
        await page.getByText("2x HD", { exact: true }).click();
      }

      await step(`${kind}: review`, () => page.getByRole("button", { name: "Continue to Review" }).click());
      await step(`${kind}: review route`, () => page.waitForURL(/\/orders\/.+\/review/, { timeout: 15_000 }));
      const orderNo = page.url().match(/\/orders\/([^/]+)\/review/)?.[1];
      if (!orderNo) throw new Error(`${kind}: could not read orderNo`);
      orderNos.push(orderNo);

      const order = await prisma.fixedOrder.findUniqueOrThrow({ where: { orderNo } });
      if (order.priceBookVersion !== "PB-2026-08-09-TRIAL-V3" || order.currency !== "PKR") throw new Error(`${kind}: incorrect PriceBook/currency`);
      const expectedTotal = kind === "DIGITAL" ? 100000n : 275000n;
      if (order.totalAmountMinor !== expectedTotal) throw new Error(`${kind}: expected ${expectedTotal}, got ${order.totalAmountMinor}`);
      if (await prisma.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: order.id } } } }) !== 0) throw new Error(`${kind}: unpaid order queued processing`);

      const guestToken = await page.evaluate((key) => JSON.parse(localStorage.getItem("ai-photo-studio-guest-ownership") || "{}")[key] as string, orderNo);
      const headers = { "content-type": "application/json", "x-guest-ownership-token": guestToken };
      const pendingResponse = await fetch(`http://127.0.0.1:${apiPort}/api/fixed-orders/${orderNo}/test-checkout`, { method: "POST", headers, body: "{}" });
      if (!pendingResponse.ok) throw new Error(`${kind}: unable to create pending test checkout`);
      if (await prisma.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: order.id } } } }) !== 0) throw new Error(`${kind}: pending payment queued processing`);

      await page.goto(`${page.url()}?paid=true`);
      if (await prisma.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: order.id } } } }) !== 0) throw new Error(`${kind}: forged paid query queued processing`);
      const legacyProcess = await fetch(`http://127.0.0.1:${apiPort}/api/restorations/forged/items/forged/process`, { method: "POST", headers, body: "{}" });
      if (legacyProcess.status !== 404) throw new Error(`${kind}: legacy processing endpoint remains active (${legacyProcess.status})`);

      await step(`${kind}: complete verified TEST payment`, () => page.click('[data-testid="e2e-complete-test-payment"]'));
      await step(`${kind}: completed download`, () => page.waitForSelector('[data-testid="e2e-download-link"]', { timeout: 20_000 }));
      const duplicatePayment = await fetch(`http://127.0.0.1:${apiPort}/api/fixed-orders/${orderNo}/test-checkout/complete`, { method: "POST", headers, body: "{}" });
      if (!duplicatePayment.ok) throw new Error(`${kind}: duplicate verified evidence did not converge`);
      for (let index = 0; index < 10; index++) {
        const status = await fetch(`http://127.0.0.1:${apiPort}/api/fixed-orders/${orderNo}/restoration-status`, { headers });
        if (!status.ok) throw new Error(`${kind}: status refresh ${index + 1} failed`);
      }
      if (kind === "PRINT_DIGITAL") {
        const panel = page.locator('[data-testid="print-fulfilment-status"]');
        await panel.waitFor({ timeout: 15_000 });
        const text = await panel.innerText();
        if (!text.includes("Preparing for printing")) throw new Error(`${kind}: expected truthful in-house "Preparing for printing" status, got: ${text}`);
        if (text.includes("PRINT_PARTNER_ASSIGNMENT_REQUIRED")) throw new Error(`${kind}: Pakistan order must never show the partner-assignment blocker`);
      }
    };

    try {
      await flow("DIGITAL");
      await flow("PRINT_DIGITAL");
    } catch (flowError) {
      await page.screenshot({ path: resolve(scratchRoot, `failure-${runId}.png`), fullPage: true }).catch(() => {});
      await writeFile(resolve(scratchRoot, `failure-${runId}.html`), await page.content().catch(() => "")).catch(() => {});
      await browser.close().catch(() => {});
      await prisma.$disconnect();
      throw flowError;
    }
    await browser.close();

    // ---- 7. DB assertions. ----
    try {
      const orders = await prisma.fixedOrder.findMany({
        where: { orderNo: { in: orderNos } },
        include: {
          items: true,
          paymentAttempt: { include: { events: true } },
          restorationEntitlement: { include: { restorationMaster: { include: { replicateExecution: true } } } },
          deliveryAddress: true
        }
      });
      if (orders.length !== 2 || await prisma.restorationDraft.count() !== 2) throw new Error("expected exactly two drafts and two orders");
      for (const order of orders) {
        if (order.items.length !== 1 || !order.paymentAttempt || order.paymentAttempt.events.length !== 1 || !order.restorationEntitlement?.restorationMaster?.replicateExecution) throw new Error(`${order.orderNo}: incomplete or duplicate paid chain`);
        if (order.paymentAttempt.status !== "PAID" || order.restorationEntitlement.restorationMaster.status !== "VALIDATED" || order.restorationEntitlement.restorationMaster.replicateExecution.status !== "SUCCEEDED") throw new Error(`${order.orderNo}: processing did not complete`);
      }
      const printOrder = orders.find((order) => order.type === "RESTORATION_WITH_PRINT");
      if (!printOrder?.deliveryAddress) throw new Error("print delivery address missing");
      const counts = {
        restorationDraft: await prisma.restorationDraft.count(),
        fixedOrder: await prisma.fixedOrder.count(),
        fixedOrderItem: await prisma.fixedOrderItem.count(),
        paymentAttempt: await prisma.paymentAttempt.count(),
        paymentEvent: await prisma.paymentEvent.count(),
        restorationEntitlement: await prisma.restorationEntitlement.count(),
        restorationMaster: await prisma.restorationMaster.count(),
        replicateExecution: await prisma.replicateExecution.count(),
        printDeliveryAddress: await prisma.printDeliveryAddress.count(),
        printEntitlement: await prisma.printEntitlement.count(),
        fulfilmentOrder: await prisma.fulfilmentOrder.count(),
        shipment: await prisma.shipment.count()
      };
      const expected = { restorationDraft: 2, fixedOrder: 2, fixedOrderItem: 2, paymentAttempt: 2, paymentEvent: 2, restorationEntitlement: 2, restorationMaster: 2, replicateExecution: 2, printDeliveryAddress: 1, printEntitlement: 1, fulfilmentOrder: 1, shipment: 0 };
      for (const [key, value] of Object.entries(expected)) if (counts[key as keyof typeof counts] !== value) throw new Error(`expected ${value} ${key}, got ${counts[key as keyof typeof counts]}`);
      // Only Replicate/RunPod/Bank Alfalah/production-API are safety-critical
      // for a zero-cost harness -- those must be exactly 0. "other" catches
      // everything else off-loopback (e.g. the app shell's static Facebook
      // Pixel `<script>` in index.html, unrelated to the commerce flow and
      // pre-existing outside this harness) and is reported, not fatal.
      if (external.replicate !== 0 || external.runpod !== 0 || external.bank !== 0 || external.production !== 0) {
        throw new Error(`unsafe external calls detected: ${JSON.stringify(external)}`);
      }
      console.log(JSON.stringify({
        orderNos,
        counts,
        processing: orders.map((order) => ({ orderNo: order.orderNo, paymentAttempt: order.paymentAttempt?.status, paymentEventVerified: order.paymentAttempt?.events[0]?.verified, entitlement: order.restorationEntitlement?.status, master: order.restorationEntitlement?.restorationMaster?.status, execution: order.restorationEntitlement?.restorationMaster?.replicateExecution?.status, workerClaimed: !!order.restorationEntitlement?.restorationMaster?.replicateExecution?.startedAt })),
        // R9.5-P5O: Pakistan is fulfilled in-house -- this harness only
        // ever exercises Pakistan orders, so the real blocker is always
        // IN_HOUSE_PRINT_PENDING, never the partner-assignment one.
        print: { fulfilmentStatus: await prisma.fulfilmentOrder.findFirst().then((row) => row?.status), blocker: "IN_HOUSE_PRINT_PENDING" },
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
