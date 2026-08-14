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
import sharp from "sharp";

const root = resolve(process.cwd());
const apiDir = resolve(root, "apps/api");
const webDir = resolve(root, "apps/web");
const scratchRoot = resolve(root, "..", "kilo", "r95-p4b7b-local-e2e");
const isWin = process.platform === "win32";
const pgBin = process.env.PG_BIN || (isWin ? "C:\\Program Files\\PostgreSQL\\17\\bin" : "");
const pgTool = (name: string): string => pgBin ? resolve(pgBin, isWin ? `${name}.exe` : name) : name;
const npx = isWin ? "npx.cmd" : "npx";
const node = process.execPath;
const tsxCli = resolve(root, "node_modules", "tsx", "dist", "cli.mjs");
const viteCli = resolve(root, "node_modules", "vite", "bin", "vite.js");

const children: ChildProcess[] = [];
const processStartCounts = { postgres: 0, api: 0, web: 0, worker: 0 };
const external = { replicate: 0, runpod: 0, bank: 0, production: 0, other: 0 };
let shuttingDown = false;

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
  child.once("exit", (code, signal) => {
    if (code !== 0 && !child.killed && !shuttingDown) {
      console.error(`[${label}] exited before readiness: code=${code ?? "null"} signal=${signal ?? "none"}`);
    }
  });
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
  shuttingDown = true;
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
   const fixturePath = resolve(scratchRoot, "e2e-3x2.png");
   // 3:2 matches the protected 4x6 print ratio so the fixture exercises the
   // paid print flow rather than being rejected by the real crop guard.
   await writeFile(fixturePath, await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 240, g: 240, b: 240 } } }).png().toBuffer());

  const pgPort = await freePort(55440);
  const apiPort = await freePort(4520);
  const webPort = await freePort(4220);

  // ---- 1. Disposable Postgres: fresh initdb, started exactly once. ----
   await runOnce("initdb", pgTool("initdb"), ["-D", dataDir, "-U", "postgres", "-A", "trust", "--locale=C", "-E", "UTF8"], root, process.env, 60_000, false);
   await runOnce("pg_ctl-start", pgTool("pg_ctl"), ["-D", dataDir, "-l", resolve(scratchRoot, `pg-${runId}.log`), "-o", `-p ${pgPort} -h 127.0.0.1 -k ${dataDir}`, "start"], root, process.env, 60_000, false);
  processStartCounts.postgres = 1;
   await runOnce("createdb", pgTool("createdb"), ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", "e2e_commerce"], root, process.env, 60_000, false);

  const databaseUrl = `postgresql://postgres@127.0.0.1:${pgPort}/e2e_commerce`;

  // ---- 2. Migrate from empty. ----
  await runOnce("migrate", npx, ["prisma", "migrate", "deploy"], apiDir, { ...process.env, DATABASE_URL: databaseUrl });
  await runOnce("migrate-noop", npx, ["prisma", "migrate", "deploy"], apiDir, { ...process.env, DATABASE_URL: databaseUrl });
  await runOnce("migrate-status", npx, ["prisma", "migrate", "status"], apiDir, { ...process.env, DATABASE_URL: databaseUrl });

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
    start("api", node, [tsxCli, "src/index.ts"], apiDir, { ...sharedEnv, PORT: String(apiPort), SKIP_MIGRATIONS: "true" }, false);
    processStartCounts.api = 1;
    await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`);

    // ---- 4. Start mock P4B worker exactly once. ----
    start("worker", node, [tsxCli, "src/scripts/p4b-worker-runner-mock-local.ts"], apiDir, sharedEnv, false);
    processStartCounts.worker = 1;

    // ---- 5. Start web exactly once. ----
    start("web", node, [viteCli, "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], webDir, {
      ...sharedEnv,
      VITE_API_URL: `http://127.0.0.1:${apiPort}`,
      VITE_COMMERCE_E2E_TEST_MODE: "true"
    }, false);
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
    const authenticateCartCustomer = async () => {
      const email = `commerce-e2e-${Date.now()}@example.test`;
      const response = await page.request.post(`http://127.0.0.1:${apiPort}/api/auth/register`, { data: { email, password: "CommerceE2E!123", name: "Commerce E2E Customer" } });
      if (!response.ok()) throw new Error(`cart: disposable customer registration failed (${response.status()})`);
      const body = await response.json() as { data: { token: string; refreshToken: string; user: unknown } };
      await page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" });
      await page.evaluate((session) => localStorage.setItem("ai-photo-studio-web-auth", JSON.stringify(session)), { token: body.data.token, refreshToken: body.data.refreshToken, user: body.data.user });
      await page.reload({ waitUntil: "domcontentloaded" });
    };
    const flow = async (kind: "DIGITAL" | "PRINT_DIGITAL") => {
      await step(`${kind}: home`, () => page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" }));
      await step(`${kind}: open canonical upload`, () => page.getByRole("button", { name: "Upload Your Photo", exact: true }).first().click());
      await step(`${kind}: select image once`, () => page.setInputFiles("#photoInput", fixturePath));
      await step(`${kind}: persist draft`, () => page.getByRole("button", { name: "Continue to Restoration" }).click());
      await step(`${kind}: preview`, () => page.waitForURL(/\/restore-mvp\/.+\/preview/, { timeout: 15_000 }));
       await step(`${kind}: choose product`, () => page.getByRole("button", { name: /Choose Product & Image Quality|Continue to Product/ }).click());
       await step(`${kind}: tiers`, () => page.waitForURL(/\/restore-mvp\/.+\/tiers/, { timeout: 15_000 }));
       await page.locator(kind === "PRINT_DIGITAL" ? ".tn-product-card--print" : ".tn-product-card--digital").click();
       await page.getByRole("heading", { name: "Choose image quality" }).waitFor({ state: "visible" });
       await step(`${kind}: browser back returns to product`, async () => {
         await page.goBack();
         await page.getByRole("heading", { name: "Choose your product" }).waitFor({ state: "visible" });
       });
       await step(`${kind}: reopen quality`, async () => {
         await page.locator(kind === "PRINT_DIGITAL" ? ".tn-product-card--print" : ".tn-product-card--digital").click();
         await page.getByRole("heading", { name: "Choose image quality" }).waitFor({ state: "visible" });
       });

       if (kind === "PRINT_DIGITAL") {
         await page.getByRole("button", { name: /Small Print/ }).click().catch(() => undefined);
         await page.getByText("4x Ultra HD", { exact: true }).click();
        await page.getByLabel("Print size").selectOption("4x6");
        await page.getByLabel("Quantity").fill("10");
        await page.getByLabel("Recipient name").fill("Local E2E Customer");
        await page.getByLabel("Phone").fill("03001234567");
        await page.getByLabel("Address").fill("1 Test Street");
        await page.getByLabel("City").fill("Lahore");
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
       const duplicatePayment = await fetch(`http://127.0.0.1:${apiPort}/api/fixed-orders/${orderNo}/test-checkout/complete`, { method: "POST", headers: { ...headers, "x-forwarded-for": "127.0.0.2" }, body: "{}" });
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

    let cartOrderNo = "";
    const cartFlow = async () => {
      const kind = "CART";
      await authenticateCartCustomer();
      await step(`${kind}: home`, () => page.goto(`http://127.0.0.1:${webPort}/`, { waitUntil: "domcontentloaded" }));
      await step(`${kind}: open canonical upload`, () => page.getByRole("button", { name: "Upload Your Photo", exact: true }).first().click());
      await step(`${kind}: select 3 images once`, () => page.setInputFiles("#photoInput", [fixturePath, fixturePath, fixturePath]));
      await step(`${kind}: continue (3 photos)`, () => page.getByRole("button", { name: "Continue to Restoration" }).click());
      await step(`${kind}: cart preview`, () => page.waitForURL(/\/restore-cart\/.+\/preview/, { timeout: 15_000 }));
      await step(`${kind}: configure photos`, () => page.getByRole("button", { name: "Configure Photos" }).click());
      await step(`${kind}: cart configure`, () => page.waitForURL(/\/restore-cart\/.+\/configure/, { timeout: 15_000 }));

      const photoCard = (n: number) => page.locator(".card").filter({ has: page.getByText(`Photo ${n} of 3`, { exact: true }) });

      // Photo 1: Digital, 2x HD.
      await photoCard(1).getByText("Digital Download", { exact: true }).click();
      await photoCard(1).getByText("2x HD", { exact: true }).click();

      // Apply-to-all from photo 1 propagates 2x HD + Digital to all 3.
      await photoCard(1).getByRole("button", { name: "Apply these settings to all photos" }).click();
      await step(`${kind}: apply-to-all propagated`, async () => {
        for (const n of [2, 3]) {
          const applied = await photoCard(n).getByRole("radiogroup", { name: `Image quality for photo ${n}` }).getByRole("radio", { checked: true }).textContent();
          if (!applied || !applied.includes("2x HD")) throw new Error(`${kind}: Apply-to-all did not propagate to photo ${n}`);
        }
      });

      // Override photo 2: 4x Ultra HD, Print+Digital, 4x6 qty 10.
      await photoCard(2).getByText("Print + Digital", { exact: true }).click();
      await photoCard(2).getByText("Small Print", { exact: true }).click();
      await photoCard(2).getByText("4x Ultra HD", { exact: true }).click();
      await photoCard(2).getByLabel("Print size").nth(0).selectOption("4x6");
      await photoCard(2).getByLabel("Quantity").nth(0).fill("10");
      await photoCard(2).getByRole("button", { name: "Add another print size" }).click();
       await photoCard(2).getByLabel("Print size").nth(1).selectOption("4x6");
       await photoCard(2).getByLabel("Quantity").nth(1).fill("10");

      // Override photo 3: 8x, Print+Digital, a different valid print size/qty.
      await photoCard(3).getByText("Print + Digital", { exact: true }).click();
       await photoCard(3).getByText("Small Print", { exact: true }).click();
      await photoCard(3).getByText("8x", { exact: true }).click();
       await photoCard(3).getByLabel("Print size").selectOption("4x6");
       await photoCard(3).getByLabel("Quantity").fill("10");

      // Photo 2/3 are individually overridden after Apply-to-all -- prove
      // photo 1 stayed untouched (2x HD, Digital), never silently changed.
      const photo1Text = await photoCard(1).innerText();
      if (!photo1Text.includes("2x HD")) throw new Error(`${kind}: photo 1 setting changed unexpectedly after overriding photos 2/3`);

      // One shared delivery address for the whole cart (any print item).
      await page.getByLabel("Recipient name").fill("Local E2E Cart Customer");
      await page.getByLabel("Phone").fill("03001234567");
      await page.getByLabel("Address").fill("1 Test Street");
       await page.getByLabel("City").fill("Lahore");
       await step(`${kind}: continue to review`, () => page.getByRole("button", { name: "Continue to Review" }).click());
      await step(`${kind}: cart review route`, () => page.waitForURL(/\/orders\/.+\/cart/, { timeout: 15_000 }));
      const orderNo = page.url().match(/\/orders\/([^/]+)\/cart/)?.[1];
      if (!orderNo) throw new Error(`${kind}: could not read orderNo`);
      cartOrderNo = orderNo;

      const order = await prisma.fixedOrder.findUniqueOrThrow({ where: { orderNo }, include: { items: true } });
      if (order.items.length !== 3) throw new Error(`${kind}: expected 3 items, got ${order.items.length}`);
      if (order.priceBookVersion !== "PB-2026-08-09-TRIAL-V3" || order.currency !== "PKR") throw new Error(`${kind}: incorrect PriceBook/currency`);
      // restoration: 1000 (2x) + 1500 (4x) + 3500 (8x) = 6000
       // print: 4x6x10 (1000) + 4x6x10 (1000) + 4x6x10 (1000) = 3000; delivery once
       const expectedTotal = 600000n + 300000n + 25000n;
      if (order.totalAmountMinor !== expectedTotal) throw new Error(`${kind}: expected total ${expectedTotal}, got ${order.totalAmountMinor}`);
      if (await prisma.replicateExecution.count({ where: { restorationMaster: { restorationEntitlement: { fixedOrderId: order.id } } } }) !== 0) throw new Error(`${kind}: unpaid cart queued processing`);

      const guestToken = await page.evaluate((key) => JSON.parse(localStorage.getItem("ai-photo-studio-guest-ownership") || "{}")[key] as string, orderNo);
      const headers = { "content-type": "application/json", "x-guest-ownership-token": guestToken };

      await step(`${kind}: complete verified TEST payment (once for whole cart)`, () => page.click('[data-testid="e2e-complete-test-payment"]'));
      for (let i = 0; i < 3; i++) {
        await step(`${kind}: item ${i} download`, () => page.waitForSelector(`[data-testid="e2e-download-link-${i}"]`, { timeout: 20_000 }));
      }
       const duplicatePayment = await fetch(`http://127.0.0.1:${apiPort}/api/fixed-orders/${orderNo}/test-checkout/complete`, { method: "POST", headers: { ...headers, "x-forwarded-for": "127.0.0.2" }, body: "{}" });
      if (!duplicatePayment.ok) throw new Error(`${kind}: duplicate verified evidence did not converge`);

      for (let i = 1; i <= 2; i++) {
        const panel = page.locator(`[data-testid="print-status-${i}"]`);
        await panel.waitFor({ timeout: 15_000 });
        const text = await panel.innerText();
        if (!text.includes("Preparing for printing")) throw new Error(`${kind}: item ${i} expected truthful in-house print status, got: ${text}`);
      }
      const digitalOnlyPrintPanel = page.locator('[data-testid="print-status-0"]');
      if (await digitalOnlyPrintPanel.count() !== 0) throw new Error(`${kind}: digital-only photo 1 must never show a print status`);
    };

    try {
      await flow("DIGITAL");
      await flow("PRINT_DIGITAL");
      await cartFlow();
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
          // R9.5-P5P: entitlements are item-scoped now (one per item, not
          // one per order); this harness still creates exactly one item per
          // order, so `[0]` is still "the" entitlement for each order here.
          restorationEntitlements: { include: { restorationMaster: { include: { replicateExecution: true } } } },
          deliveryAddress: true
        }
      });
      // Single-item DIGITAL + PRINT_DIGITAL flows create 2 drafts/2 orders;
      // the cart flow (checked separately below) adds 3 more drafts and 1
      // more order -- 5 drafts/3 orders total, asserted via `expected` below.
      if (orders.length !== 2) throw new Error("expected exactly two single-item orders");
      for (const order of orders) {
        const entitlement = order.restorationEntitlements[0];
        if (order.items.length !== 1 || !order.paymentAttempt || order.paymentAttempt.events.length !== 1 || !entitlement?.restorationMaster?.replicateExecution) throw new Error(`${order.orderNo}: incomplete or duplicate paid chain`);
        if (order.paymentAttempt.status !== "PAID" || entitlement.restorationMaster.status !== "VALIDATED" || entitlement.restorationMaster.replicateExecution.status !== "SUCCEEDED") throw new Error(`${order.orderNo}: processing did not complete`);
      }
      const printOrder = orders.find((order) => order.type === "RESTORATION_WITH_PRINT");
      if (!printOrder?.deliveryAddress) throw new Error("print delivery address missing");

      // ---- Cart order (3 items, mixed Digital/Print+Digital) assertions. ----
      const cartOrder = await prisma.fixedOrder.findUniqueOrThrow({
        where: { orderNo: cartOrderNo },
        include: {
          items: true,
          paymentAttempt: true,
          restorationEntitlements: { include: { restorationMaster: { include: { replicateExecution: true } } } },
          deliveryAddress: true
        }
      });
      if (cartOrder.items.length !== 3) throw new Error(`cart: expected 3 FixedOrderItems, got ${cartOrder.items.length}`);
      if (cartOrder.paymentAttempt?.status !== "PAID") throw new Error("cart: payment did not complete");
      if (await prisma.paymentAttempt.count({ where: { fixedOrderId: cartOrder.id } }) !== 1) throw new Error("cart: expected exactly one order-level PaymentAttempt, never one per item");
      if (cartOrder.restorationEntitlements.length !== 3) throw new Error(`cart: expected 3 RestorationEntitlements, got ${cartOrder.restorationEntitlements.length}`);
      const cartMasters = cartOrder.restorationEntitlements.map((e) => e.restorationMaster).filter(Boolean);
      if (cartMasters.length !== 3 || cartMasters.some((m) => m!.status !== "VALIDATED")) throw new Error("cart: expected 3 VALIDATED RestorationMasters");
      const cartExecutions = cartMasters.map((m) => m!.replicateExecution).filter(Boolean);
      if (cartExecutions.length !== 3 || cartExecutions.some((x) => x!.status !== "SUCCEEDED")) throw new Error("cart: expected exactly 3 SUCCEEDED ReplicateExecutions, never 1 and never 9");
      const cartPrintEntitlements = await prisma.printEntitlement.count({ where: { fixedOrderItemId: { in: cartOrder.items.map((i) => i.id) } } });
      const cartPrintLines = await prisma.printOrderLine.findMany({ where: { fixedOrderId: cartOrder.id }, orderBy: { createdAt: "asc" } });
      if (cartPrintEntitlements !== 3 || cartPrintLines.length !== 3) throw new Error(`cart: expected 3 print records/lines for 2 print items, got ${cartPrintEntitlements}/${cartPrintLines.length}`);
      if (cartPrintLines.filter((line) => line.fixedOrderItemId === cartOrder.items[1]!.id).length !== 2) throw new Error("cart: multiple print lines were not attached to one source item");

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
      // Single-item flows (2 orders, 1 item each) + cart flow (1 order, 3 items).
      const expected = { restorationDraft: 5, fixedOrder: 3, fixedOrderItem: 5, paymentAttempt: 3, paymentEvent: 3, restorationEntitlement: 5, restorationMaster: 5, replicateExecution: 5, printDeliveryAddress: 2, printEntitlement: 4, fulfilmentOrder: 4, shipment: 0 };
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
        cartOrderNo,
        cart: {
          items: cartOrder.items.length,
          paymentAttempts: 1,
          entitlements: cartOrder.restorationEntitlements.length,
          masters: cartMasters.length,
          executions: cartExecutions.length,
          printEntitlements: cartPrintEntitlements
        },
        counts,
        processing: orders.map((order) => { const entitlement = order.restorationEntitlements[0]; return { orderNo: order.orderNo, paymentAttempt: order.paymentAttempt?.status, paymentEventVerified: order.paymentAttempt?.events[0]?.verified, entitlement: entitlement?.status, master: entitlement?.restorationMaster?.status, execution: entitlement?.restorationMaster?.replicateExecution?.status, workerClaimed: !!entitlement?.restorationMaster?.replicateExecution?.startedAt }; }),
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
