// R9.5-P5Y: OWNER-CLICKABLE, protected, zero-charge local dry-run.
//
// `npm run commerce:dryrun` starts the exact same disposable, non-production
// stack `test:e2e:commerce-local` already proves programmatically
// (disposable Postgres, API with COMMERCE_E2E_TEST_MODE=true and
// RESTORATION_PROVIDER=mock, the mock P4B worker, Vite web) -- but instead
// of driving the browser itself and tearing down immediately, it opens one
// VISIBLE Chromium window to the home page and stays running so a human can
// click the entire journey personally: Upload -> Preview -> Configure
// (Product then Quality) -> Review -> "Complete TEST Payment" -> Processing
// -> Result -> Download. This exists because production intentionally and
// correctly refuses the test-payment seam (BANK_ALFALAH_ACCOUNT_ONBOARDING_
// PENDING) -- see rules.md R9.5-P5Y. This script changes nothing about that;
// it is a separate, local-only, never-deployed entrypoint.
//
// Zero external calls: RESTORATION_PROVIDER=mock, STORAGE_PROVIDER=mock,
// AI_PROVIDER=mock, BANK_ALFALAH_MPGS_ENABLED=false -- identical env recipe
// to test-commerce-local.ts. Stop with Ctrl+C (SIGINT); teardown kills every
// spawned process tree, stops Postgres, and deletes the disposable data
// directory -- zero orphan processes, zero leftover state.
import { type ChildProcess, spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium, type Browser } from "playwright";

const root = resolve(process.cwd());
const apiDir = resolve(root, "apps/api");
const webDir = resolve(root, "apps/web");
const scratchRoot = resolve(root, "..", "kilo", "r95-p5y-commerce-dryrun");
const pgBin = process.env.PG_BIN || "C:\\Program Files\\PostgreSQL\\17\\bin";
const isWin = process.platform === "win32";
const npx = isWin ? "npx.cmd" : "npx";

const children: ChildProcess[] = [];
let browser: Browser | undefined;
let tornDown = false;
// Populated as soon as main() computes them, so the fatal-error path below
// can always tear down whatever was already started -- a thrown error
// partway through startup (e.g. the API never becoming healthy) must never
// leave an orphaned disposable Postgres/API/worker/web process behind.
let currentDataDir: string | undefined;
let currentMockStorageDir: string | undefined;

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

// Same rationale as test-commerce-local.ts's identical helper: a ".cmd"
// child (npx.cmd) only forwards kill() to its own cmd.exe wrapper on
// Windows, leaking the real node/tsx/vite grandchild. taskkill /T /F kills
// the whole tree.
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

async function freePort(startPort: number): Promise<number> {
  for (let port = startPort; port < startPort + 200; port++) {
    const free = await new Promise<boolean>((resolvePromise) => {
      const server = createServer();
      server.once("error", () => resolvePromise(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolvePromise(true)));
    });
    if (free) return port;
  }
  throw new Error(`no free port near ${startPort}`);
}

async function teardown(dataDir: string, mockStorageDir: string): Promise<void> {
  if (tornDown) return;
  tornDown = true;
  console.log("\n[commerce:dryrun] Shutting down -- zero orphan processes, zero leftover state...");
  await browser?.close().catch(() => {});
  for (const child of children) {
    if (!child.killed) killTree(child);
  }
  await sleep(1000);
  try {
    await runOnce("pg_ctl-stop", `${pgBin}\\pg_ctl.exe`, ["-D", dataDir, "stop", "-m", "fast"], root, process.env, 30_000, false);
  } catch { /* already down */ }
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  await rm(mockStorageDir, { recursive: true, force: true }).catch(() => {});
  console.log("[commerce:dryrun] Teardown complete.");
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("commerce:dryrun refuses NODE_ENV=production");

  const runId = Date.now().toString(36);
  const dataDir = resolve(scratchRoot, `pg-${runId}`);
  const mockStorageDir = resolve(scratchRoot, `storage-${runId}`);
  currentDataDir = dataDir;
  currentMockStorageDir = mockStorageDir;
  await mkdir(scratchRoot, { recursive: true });

  const pgPort = await freePort(55480);
  const apiPort = await freePort(4540);
  const webPort = await freePort(4240);
  const databaseUrl = `postgresql://postgres@127.0.0.1:${pgPort}/e2e_commerce`;

  process.on("SIGINT", () => { void teardown(dataDir, mockStorageDir).then(() => process.exit(0)); });
  process.on("SIGTERM", () => { void teardown(dataDir, mockStorageDir).then(() => process.exit(0)); });

  console.log("[commerce:dryrun] Starting protected local dry-run stack (never production, never real Bank/Replicate/RunPod)...");

  await runOnce("initdb", `${pgBin}\\initdb.exe`, ["-D", dataDir, "-U", "postgres", "-A", "trust", "--locale=C", "-E", "UTF8"], root, process.env, 60_000, false);
  await runOnce("pg_ctl-start", `${pgBin}\\pg_ctl.exe`, ["-D", dataDir, "-l", resolve(scratchRoot, `pg-${runId}.log`), "-o", `-p ${pgPort} -h 127.0.0.1`, "start"], root, process.env, 60_000, false);
  await runOnce("createdb", `${pgBin}\\createdb.exe`, ["-h", "127.0.0.1", "-p", String(pgPort), "-U", "postgres", "e2e_commerce"], root, process.env, 60_000, false);
  await runOnce("migrate", npx, ["prisma", "migrate", "deploy"], apiDir, { ...process.env, DATABASE_URL: databaseUrl });

  const sharedEnv = {
    ...process.env,
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    REDIS_URL: "redis://127.0.0.1:6399",
    WHATSAPP_VERIFY_TOKEN: "local-dryrun",
    ADMIN_JWT_SECRET: "local-dryrun-admin-secret",
    JWT_SECRET: "local-dryrun-jwt-secret",
    RESTORATION_PROVIDER: "mock",
    STORAGE_PROVIDER: "mock",
    AI_PROVIDER: "mock",
    AI_PROVIDER_NAME: "mock",
    COMMERCE_E2E_TEST_MODE: "true",
    PAYMENT_GATEWAY_NAME: "manual",
    BANK_ALFALAH_MPGS_ENABLED: "false",
    MOCK_STORAGE_DIR: mockStorageDir,
    ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`
  };

  start("api", npx, ["tsx", "src/index.ts"], apiDir, { ...sharedEnv, PORT: String(apiPort), SKIP_MIGRATIONS: "true" });
  // A cold tsx/ts-node JIT compile of the whole API entrypoint can take
  // noticeably longer than the 30s default on a first run -- this is an
  // interactive, one-shot launch (not a tight CI loop), so a generous 90s
  // is worth it rather than a spurious FATAL timeout while the API is
  // still genuinely starting up.
  await waitForHttp(`http://127.0.0.1:${apiPort}/api/health`, 90_000);

  start("worker", npx, ["tsx", "src/scripts/p4b-worker-runner-mock-local.ts"], apiDir, sharedEnv);

  start("web", npx, ["vite", "--host", "127.0.0.1", "--port", String(webPort), "--strictPort"], webDir, {
    ...sharedEnv,
    VITE_API_URL: `http://127.0.0.1:${apiPort}`,
    VITE_COMMERCE_E2E_TEST_MODE: "true"
  });
  await waitForHttp(`http://127.0.0.1:${webPort}/`);

  const url = `http://127.0.0.1:${webPort}/`;
  browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url, { waitUntil: "domcontentloaded" });

  console.log("");
  console.log("========================================================================");
  console.log(" PROTECTED LOCAL DRY-RUN READY -- click the full journey yourself.");
  console.log("========================================================================");
  console.log(` Frontend:  ${url}`);
  console.log(` API:       http://127.0.0.1:${apiPort}`);
  console.log(" Database:  disposable local Postgres (never production)");
  console.log(" Provider:  RESTORATION_PROVIDER=mock (zero real Replicate calls)");
  console.log(" Payment:   COMMERCE_E2E_TEST_MODE=true -- \"Complete TEST Payment\"");
  console.log("            button will appear on the Review page after checkout.");
  console.log("");
  console.log(" Try: Upload -> Preview -> Configure -> Review -> Complete TEST Payment");
  console.log("      -> Processing -> Result -> Download");
  console.log("");
  console.log(" Press Ctrl+C here to stop and tear everything down.");
  console.log("========================================================================");

  // Stay alive until Ctrl+C, or the visible browser window is closed by hand.
  browser.on("disconnected", () => { void teardown(dataDir, mockStorageDir).then(() => process.exit(0)); });
  await new Promise(() => {});
}

main().catch(async (err) => {
  console.error("[commerce:dryrun] FATAL:", err);
  // A failure at any point after Postgres/API/worker/web were started must
  // still tear down what was already started -- never leave an orphaned
  // disposable process behind just because startup itself failed.
  if (currentDataDir && currentMockStorageDir) {
    await teardown(currentDataDir, currentMockStorageDir);
  }
  process.exitCode = 1;
});
