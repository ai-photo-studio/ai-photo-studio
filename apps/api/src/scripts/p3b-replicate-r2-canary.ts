/**
 * R9.2-P3B-REPLICATE-R2-CANARY -- credential-safe canary runner for the P3A
 * one-call Replicate execution worker.
 *
 * This script is a STANDALONE OPERATOR TOOL. It is imported by nothing in the
 * running application: no HTTP surface, no controller, no background job
 * processor, no scheduler.
 * It exists so that a single, explicitly-authorized future packet can drive
 * EXACTLY ONE real Replicate call and EXACTLY ONE real R2 master write against
 * a synthetic, non-customer test image, with every gate proven in advance.
 *
 * Three modes, and nothing else:
 *
 *   (no flags)   Prints usage. Zero database work, zero network, zero cost.
 *
 *   --check      Reports PRESENT / ABSENT / PLACEHOLDER_SUSPECTED for each of
 *                the 8 required credential variable NAMES. It never prints a
 *                value, a prefix of a value, or a hash of a value. It makes
 *                ZERO network calls and opens ZERO database connections.
 *
 *   --dry-run    Stands up a REAL disposable local PostgreSQL instance (the
 *                proven R9.2-P3A-VERIFY lifecycle: out-of-repo random temp
 *                dir, random superuser credentials, verified-free random high
 *                port, initdb / pg_ctl / createdb / `prisma migrate deploy`
 *                from empty), seeds ONE eligible paid chain, and drives the
 *                real P3A worker with DETERMINISTIC MOCKED provider and
 *                storage ports. Zero external network calls. Full teardown.
 *
 *   --live-canary --confirm-one-billable-call
 *                The only billable mode. BOTH flags are mandatory. It refuses,
 *                before any network-capable client object is constructed, if
 *                any of the 8 prerequisites is absent, blank, or looks like a
 *                placeholder. It then performs exactly one provider call and
 *                exactly one master upload under an isolated
 *                `canary/r9.2/<run-id>/` prefix, and unconditionally deletes
 *                both canary objects and tears the disposable database down in
 *                a `finally` block.
 *
 * Invariants enforced throughout:
 *   * No secret value, signed URL, image byte, base64 blob, or raw provider
 *     response is ever logged. Only variable NAMES, statuses, counts, and the
 *     run id are printed.
 *   * Credentials are read ONLY from this process's environment, exactly as
 *     the application's own `config/env.ts` does. No new credential-discovery
 *     mechanism, no other worktree, no `.env` file is written or generated.
 *   * No retry and no fallback anywhere. At most ONE provider "create" call is
 *     reachable per invocation.
 *   * Replicate only. This file contains no reference to any other execution
 *     provider and cannot select one.
 *   * Never a production database: the only database it ever touches is one it
 *     created itself on 127.0.0.1 and destroys before it exits.
 *   * Never customer data: the only image it ever sends is generated in-process
 *     by `sharp`.
 */
import assert from "node:assert";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import sharp from "sharp";
import type { PipelineResult } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { ProviderExecutionPort } from "../restoration-providers/pipeline/RestorationExecutionPorts";
import type {
  MasterPersistencePort,
  MasterUploadResult,
  ReplicateExecutionRepositoryPort,
  ReplicateExecutionWorkerResult
} from "../services/replicate-execution.worker";

// ---------------------------------------------------------------------------
// 1. Credential prerequisites (NAMES ONLY -- values are never read into output)
// ---------------------------------------------------------------------------

/**
 * Exactly the 8 variables a live canary needs. These names are copied verbatim
 * from `apps/api/src/config/env.ts` and must stay in sync with it.
 */
export const REQUIRED_LIVE_CREDENTIALS = [
  "REPLICATE_API_TOKEN",
  "REPLICATE_RESTORATION_MODEL_SLUG",
  "REPLICATE_RESTORATION_MODEL_VERSION",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_ENDPOINT"
] as const;

export type RequiredCredentialName = (typeof REQUIRED_LIVE_CREDENTIALS)[number];
export type CredentialStatus = "PRESENT" | "ABSENT" | "PLACEHOLDER_SUSPECTED";
export type EnvLike = Record<string, string | undefined>;

/**
 * Placeholder-detection heuristic (documented deliberately, since it is a
 * safety gate, not a convenience):
 *
 *   - `replace_me` / `replace-me` / `replaceme`  -- the marker this repo's own
 *     `env.ts` already special-cases for `R2_ACCESS_KEY_ID`.
 *   - `changeme`, `placeholder`, `dummy`, `sample`, `example` anywhere.
 *   - a leading `your-` / `your_` (e.g. `your-account-id`).
 *   - the whole value being exactly `test` / `testing` / `todo` / `tbd` /
 *     `none` / `null` / `undefined` / `0`, or containing `test_token`-style
 *     compounds. A bare substring `test` is deliberately NOT matched, because
 *     legitimate values ("latest", host names) can contain it.
 *   - four or more consecutive `x` characters (`xxxx...`).
 *   - an angle-bracketed template such as `<set via environment>`.
 *
 * The heuristic errs toward rejecting: a false PLACEHOLDER_SUSPECTED costs a
 * refused run, while a false PRESENT could spend money on a junk request.
 */
const PLACEHOLDER_PATTERNS: readonly RegExp[] = [
  /replace[-_ ]?me/i,
  /change[-_ ]?me/i,
  /placeholder/i,
  /\bdummy\b/i,
  /sample/i,
  /example/i,
  /^your[-_]/i,
  /^(test|testing|todo|tbd|none|null|undefined|0)$/i,
  /(test|fake|mock)[-_](token|key|secret|id|value|bucket|endpoint)/i,
  /x{4,}/i,
  /^<.*>$/
];

export function classifyCredentialValue(value: string | undefined): CredentialStatus {
  if (value === undefined || value === null) return "ABSENT";
  const trimmed = String(value).trim();
  if (trimmed.length === 0) return "ABSENT";
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed))) return "PLACEHOLDER_SUSPECTED";
  return "PRESENT";
}

export interface CredentialReportEntry {
  name: RequiredCredentialName;
  status: CredentialStatus;
}

export interface CredentialReport {
  entries: CredentialReportEntry[];
  ok: boolean;
  /** Names (never values) of the variables that failed the gate. */
  failing: RequiredCredentialName[];
}

/**
 * Pure, side-effect-free, network-free. Reads only the supplied env map (the
 * real `process.env` by default) -- never a file, never another worktree.
 *
 * This deliberately introduces NO new credential-discovery mechanism: like
 * `config/env.ts`, it reads `process.env` and nothing else. An operator running
 * the live canary must therefore place the 8 variables in the invoking shell's
 * environment (or let the application's own `dotenv/config` entry point do it);
 * this script will never go looking for a `.env` file on its own, and it never
 * writes or generates one.
 */
export function checkRequiredCredentials(env: EnvLike): CredentialReport {
  const entries = REQUIRED_LIVE_CREDENTIALS.map((name) => ({
    name,
    status: classifyCredentialValue(env[name])
  }));
  const failing = entries.filter((e) => e.status !== "PRESENT").map((e) => e.name);
  return { entries, ok: failing.length === 0, failing };
}

// ---------------------------------------------------------------------------
// 2. Canary object key layout (deterministic, isolated, self-cleaning)
// ---------------------------------------------------------------------------

export interface CanaryKeys {
  runId: string;
  prefix: string;
  sourceKey: string;
  masterKey: string;
  /** Exactly the objects a live run must delete in its `finally` block. */
  cleanupKeys: string[];
}

/**
 * Every live-canary object lives under one throwaway prefix so cleanup is a
 * closed, enumerable set -- never a wildcard delete, never a shared namespace
 * with customer originals (`originals/`) or real masters (`finals/`).
 */
export function computeCanaryKeys(runId: string): CanaryKeys {
  const safeRunId = String(runId).trim().replace(/[^A-Za-z0-9._-]/g, "-");
  if (!safeRunId) throw new TypeError("runId is required");
  const prefix = `canary/r9.2/${safeRunId}/`;
  const sourceKey = `${prefix}source.png`;
  const masterKey = `${prefix}master.png`;
  return { runId: safeRunId, prefix, sourceKey, masterKey, cleanupKeys: [sourceKey, masterKey] };
}

// ---------------------------------------------------------------------------
// 3. CLI parsing
// ---------------------------------------------------------------------------

export type CanaryMode = "usage" | "check" | "dry-run" | "live-canary";

export interface ParsedArgs {
  mode: CanaryMode;
  confirmBillable: boolean;
  unknown: string[];
}

export const USAGE_LINES: readonly string[] = [
  "R9.2-P3B Replicate/R2 canary runner",
  "",
  "  --check       report PRESENT/ABSENT/PLACEHOLDER_SUSPECTED for the 8 required",
  "                credential variable names. No network, no database.",
  "  --dry-run     full P3A worker flow on a disposable local PostgreSQL with mocked",
  "                Replicate and R2 ports. No external network call.",
  "  --live-canary --confirm-one-billable-call",
  "                ONE real Replicate call and ONE real R2 master write. Both flags",
  "                are mandatory. Refused unless all 8 prerequisites pass.",
  "",
  "No flags: nothing happens (this message)."
];

export function parseCanaryArgs(argv: readonly string[]): ParsedArgs {
  const args = argv.map((a) => String(a));
  const known = new Set(["--check", "--dry-run", "--live-canary", "--confirm-one-billable-call"]);
  const unknown = args.filter((a) => !known.has(a));
  const confirmBillable = args.includes("--confirm-one-billable-call");

  let mode: CanaryMode = "usage";
  if (args.includes("--live-canary")) mode = "live-canary";
  else if (args.includes("--dry-run")) mode = "dry-run";
  else if (args.includes("--check")) mode = "check";

  return { mode, confirmBillable, unknown };
}

// ---------------------------------------------------------------------------
// 4. Result shape
// ---------------------------------------------------------------------------

export interface CanaryCounts {
  claims: number;
  providerCalls: number;
  sourceDownloads: number;
  uploads: number;
  commits: number;
  deletes: number;
}

export interface CanaryCleanupReport {
  /** Storage keys the run deleted (dry-run: from the mock; live: real deletes). */
  deletedKeys: string[];
  databaseDropped: boolean;
  postgresStopped: boolean;
  tempDirRemoved: boolean;
  portFreed: boolean;
  /** Residual ReplicateExecution rows after teardown; must be 0. */
  residualExecutionRows: number;
}

export interface CanaryResult {
  mode: CanaryMode;
  exitCode: number;
  /** Sanitized, secret-free lines. Safe to print and to assert on in tests. */
  output: string[];
  counts: CanaryCounts;
  credentials?: CredentialReport;
  keys?: CanaryKeys;
  /** The worker outcome of the first invocation, when a flow actually ran. */
  outcome?: ReplicateExecutionWorkerResult["outcome"];
  /** The worker outcome of the replay invocation (dry-run only). */
  replayOutcome?: ReplicateExecutionWorkerResult["outcome"];
  cleanup?: CanaryCleanupReport;
}

const zeroCounts = (): CanaryCounts => ({
  claims: 0,
  providerCalls: 0,
  sourceDownloads: 0,
  uploads: 0,
  commits: 0,
  deletes: 0
});

// ---------------------------------------------------------------------------
// 5. Harness seam (so tests never need a real PostgreSQL, and the real CLI
//    always uses one)
// ---------------------------------------------------------------------------

export interface CanaryHarnessSetup {
  repository: ReplicateExecutionRepositoryPort;
  executionId: string;
  restorationMasterId: string;
  sourceStorageKey: string;
  /** Sanitized description of what was stood up. Never a URL or a password. */
  describe: string;
}

export interface CanaryHarness {
  setup(): Promise<CanaryHarnessSetup>;
  teardown(): Promise<Omit<CanaryCleanupReport, "deletedKeys">>;
}

/** Fault injection for dry-run failure-path rehearsal. Never used live. */
export type CanaryFault = "provider" | "upload" | "commit";

export interface CanaryOptions {
  argv?: readonly string[];
  env?: EnvLike;
  /** Fixed run id, so key layout is assertable. Defaults to a random UUID. */
  runId?: string;
  /** Injected in tests; the CLI always uses the disposable-PostgreSQL harness. */
  harness?: CanaryHarness;
  /**
   * Injected in tests with counting mocks. In live mode the default factory
   * constructs the REAL Replicate/R2 clients -- and is only ever reached after
   * every gate has already passed.
   */
  portsFactory?: (keys: CanaryKeys) => Promise<{ provider: ProviderExecutionPort; persistence: MasterPersistencePort }>;
  /** Dry-run only: rehearse a failure path. */
  fault?: CanaryFault;
  /** Sink for sanitized output. Defaults to collecting only. */
  log?: (line: string) => void;
}

// ---------------------------------------------------------------------------
// 6. Deterministic mocked ports (dry-run only -- never constructed in live mode)
// ---------------------------------------------------------------------------

class CountingProviderPort implements ProviderExecutionPort {
  calls = 0;
  constructor(
    private readonly output: Buffer,
    private readonly fail: boolean
  ) {}

  async execute(): Promise<PipelineResult> {
    this.calls++;
    if (this.fail) throw new Error("simulated provider failure (dry-run fault injection)");
    const final = {
      image: this.output,
      contentType: "image/png",
      fileName: "canary-master.png",
      providerName: "replicate-pipeline",
      providerVersion: "dry-run",
      stages: ["restore"],
      processingTimeMs: 1,
      creditsUsed: 0,
      estimatedCost: 0,
      actualCost: 0,
      requestId: "canary_dryrun_request"
    };
    return {
      final,
      intermediateResults: [final],
      totalProcessingTimeMs: 1,
      totalEstimatedCost: 0,
      totalActualCost: 0,
      tier: "replicate"
    };
  }
}

class CountingPersistencePort implements MasterPersistencePort {
  downloads = 0;
  uploads: string[] = [];
  deletes: string[] = [];

  constructor(
    private readonly source: Buffer,
    private readonly keys: CanaryKeys,
    private readonly failUpload: boolean
  ) {}

  async downloadSource(storageKey: string): Promise<Buffer> {
    void storageKey;
    this.downloads++;
    return this.source;
  }

  async uploadMaster(params: { restorationMasterId: string; body: Buffer; contentType: string }): Promise<MasterUploadResult> {
    void params;
    if (this.failUpload) throw new Error("simulated upload failure (dry-run fault injection)");
    this.uploads.push(this.keys.masterKey);
    return { key: this.keys.masterKey };
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.deletes.push(storageKey);
  }
}

/** Wraps a repository so a commit can be made to fail without touching the real one. */
class CommitFaultRepository implements ReplicateExecutionRepositoryPort {
  constructor(private readonly inner: ReplicateExecutionRepositoryPort) {}
  loadContext(executionId: string) {
    return this.inner.loadContext(executionId);
  }
  claimQueued(executionId: string, startedAt: Date) {
    return this.inner.claimQueued(executionId, startedAt);
  }
  async commitSuccess(): Promise<void> {
    throw new Error("simulated commit failure (dry-run fault injection)");
  }
  markFailed(executionId: string, restorationMasterId: string, code: Parameters<ReplicateExecutionRepositoryPort["markFailed"]>[2]) {
    return this.inner.markFailed(executionId, restorationMasterId, code);
  }
}

/** Counts claims/commits without changing behaviour. */
class CountingRepository implements ReplicateExecutionRepositoryPort {
  claims = 0;
  commits = 0;
  constructor(private readonly inner: ReplicateExecutionRepositoryPort) {}
  loadContext(executionId: string) {
    return this.inner.loadContext(executionId);
  }
  async claimQueued(executionId: string, startedAt: Date) {
    const count = await this.inner.claimQueued(executionId, startedAt);
    this.claims += count;
    return count;
  }
  async commitSuccess(params: Parameters<ReplicateExecutionRepositoryPort["commitSuccess"]>[0]) {
    await this.inner.commitSuccess(params);
    this.commits++;
  }
  markFailed(executionId: string, restorationMasterId: string, code: Parameters<ReplicateExecutionRepositoryPort["markFailed"]>[2]) {
    return this.inner.markFailed(executionId, restorationMasterId, code);
  }
}

// ---------------------------------------------------------------------------
// 7. Disposable local PostgreSQL harness (the proven R9.2-P3A-VERIFY lifecycle)
// ---------------------------------------------------------------------------

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; detachOutput?: boolean; useShell?: boolean } = {}
): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    // `pg_ctl start` leaves a long-lived `postgres` server behind that INHERITS
    // whatever stdio it was given. If we hand it pipes, those pipes stay open
    // for the life of the cluster and the `close` event never fires -- the
    // runner would hang forever. For those commands stdio is discarded entirely
    // (the cluster writes to its own `-l` log file instead).
    // With `shell: true`, Node deprecates passing a separate argv (DEP0190).
    // Every shell-invoked command here is a fixed literal, so collapsing it to
    // a single command line is both safe and warning-free.
    const spawnCommand = options.useShell === true ? [command, ...args].join(" ") : command;
    const spawnArgs = options.useShell === true ? [] : args;
    const child = spawn(spawnCommand, spawnArgs, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: options.useShell === true,
      windowsHide: true,
      stdio: options.detachOutput ? "ignore" : ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => resolvePromise({ code: -1, stdout, stderr: stderr + String(err.message) }));
    child.on("close", (code) => resolvePromise({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * PATH alone is not sufficient evidence that local PostgreSQL tooling is
 * absent (learned in R9.2-P3A-VERIFY): a full installation commonly exists
 * outside PATH under `C:\Program Files\PostgreSQL\<major>\bin`.
 */
export function discoverPostgresBinDir(): string | null {
  const roots = ["C:\\Program Files\\PostgreSQL", "C:\\Program Files (x86)\\PostgreSQL"];
  const candidates: string[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (let major = 20; major >= 12; major--) {
      const bin = join(root, String(major), "bin");
      if (existsSync(join(bin, "pg_ctl.exe")) && existsSync(join(bin, "initdb.exe"))) candidates.push(bin);
    }
  }
  return candidates[0] ?? null;
}

function pgBinary(binDir: string | null, name: string): string {
  return binDir ? join(binDir, name) : name;
}

async function probeFreePort(): Promise<number> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const candidate = 40000 + Math.floor(Math.random() * 20000);
    const free = await new Promise<boolean>((resolvePromise) => {
      const server = createServer();
      server.once("error", () => resolvePromise(false));
      server.once("listening", () => server.close(() => resolvePromise(true)));
      server.listen(candidate, "127.0.0.1");
    });
    if (free) return candidate;
  }
  throw new Error("could not find a free loopback port for the disposable database");
}

async function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.once("listening", () => server.close(() => resolvePromise(true)));
    server.listen(port, "127.0.0.1");
  });
}

const API_ROOT = resolve(__dirname, "..", "..");

/**
 * Stands up a throwaway PostgreSQL cluster on 127.0.0.1, migrates it from
 * empty, seeds one eligible paid chain, and destroys everything afterwards.
 * It never connects to, reads, or reconfigures any pre-existing database.
 */
export class DisposablePostgresHarness implements CanaryHarness {
  private tempRoot: string | null = null;
  private port = 0;
  private binDir: string | null = null;
  private databaseUrl: string | null = null;
  private readonly dbName = `p3b_canary_${randomBytes(4).toString("hex")}`;
  private readonly superuser = "p3bowner";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private createdOrderIds: string[] = [];
  private createdDraftIds: string[] = [];

  constructor(private readonly log: (line: string) => void) {}

  /** Never returns or logs the connection URL; callers only get a redacted form. */
  private redacted(): string {
    return `postgresql://<disposable>@127.0.0.1:${this.port}/${this.dbName}`;
  }

  /**
   * A partially-completed setup must never leak a running cluster or a temp
   * directory, so any failure tears down whatever was already created before
   * the error is rethrown.
   */
  async setup(): Promise<CanaryHarnessSetup> {
    try {
      return await this.setupUnguarded();
    } catch (err) {
      await this.teardown().catch(() => null);
      throw err;
    }
  }

  private async setupUnguarded(): Promise<CanaryHarnessSetup> {
    this.binDir = discoverPostgresBinDir();
    this.tempRoot = await mkdtemp(join(tmpdir(), "r92p3b_"));
    const dataDir = join(this.tempRoot, "data");
    const logFile = join(this.tempRoot, "pg.log");
    const pwFile = join(this.tempRoot, "pw");
    const password = randomBytes(21).toString("base64url").slice(0, 28);
    await writeFile(pwFile, password, "utf8");

    this.port = await probeFreePort();
    this.log(`  disposable postgres: temp root created, random port ${this.port} verified free`);

    const initdb = await runCommand(pgBinary(this.binDir, "initdb"), [
      "-D",
      dataDir,
      "-U",
      this.superuser,
      "-A",
      "password",
      `--pwfile=${pwFile}`,
      "-E",
      "UTF8"
    ]);
    if (initdb.code !== 0) throw new Error(`initdb failed with exit ${initdb.code}`);
    await rm(pwFile, { force: true });
    this.log("  disposable postgres: initdb exit 0 (password file deleted immediately)");

    const start = await runCommand(pgBinary(this.binDir, "pg_ctl"), [
      "-D",
      dataDir,
      "-l",
      logFile,
      "-o",
      `-p ${this.port} -h 127.0.0.1 -c listen_addresses=127.0.0.1`,
      "-w",
      "start"
    ], { detachOutput: true });
    if (start.code !== 0) throw new Error(`pg_ctl start failed with exit ${start.code}`);

    // Identity verification: the cluster we talk to must be the one we made.
    const pidFile = join(dataDir, "postmaster.pid");
    if (!existsSync(pidFile)) throw new Error("postmaster.pid is missing; refusing to continue");
    const pidLines = readFileSync(pidFile, "utf8").split(/\r?\n/);
    const reportedDataDir = (pidLines[1] ?? "").trim();
    const reportedPort = Number((pidLines[3] ?? "").trim());
    assert.equal(reportedPort, this.port, "postmaster.pid port must match the port we selected");
    assert.ok(reportedDataDir.length > 0, "postmaster.pid must report our data directory");
    this.log(`  disposable postgres: started and identity-verified on 127.0.0.1:${this.port}`);

    const create = await runCommand(
      pgBinary(this.binDir, "createdb"),
      ["-h", "127.0.0.1", "-p", String(this.port), "-U", this.superuser, this.dbName],
      { env: { PGPASSWORD: password } }
    );
    if (create.code !== 0) throw new Error(`createdb failed with exit ${create.code}`);

    this.databaseUrl = `postgresql://${this.superuser}:${encodeURIComponent(password)}@127.0.0.1:${this.port}/${this.dbName}`;

    // `npx` is a `.cmd` shim on Windows, which modern Node refuses to spawn
    // without a shell. The argument vector is entirely literal and contains no
    // interpolated user input, so shell invocation is safe here.
    const migrate = await runCommand("npx", ["prisma", "migrate", "deploy"], {
      cwd: API_ROOT,
      env: { DATABASE_URL: this.databaseUrl },
      useShell: true
    });
    if (migrate.code !== 0) throw new Error(`prisma migrate deploy failed with exit ${migrate.code}`);
    this.log("  disposable postgres: createdb + prisma migrate deploy from empty, exit 0");

    // The production repository reads DATABASE_URL at import time.
    process.env.DATABASE_URL = this.databaseUrl;

    const { PrismaClient } = await import("@prisma/client");
    this.client = new PrismaClient({ datasources: { db: { url: this.databaseUrl } } });

    const seeded = await this.seedEligibleChain();

    const { PrismaReplicateExecutionRepository } = await import("../services/replicate-execution.worker");
    return {
      repository: new PrismaReplicateExecutionRepository(),
      executionId: seeded.executionId,
      restorationMasterId: seeded.masterId,
      sourceStorageKey: seeded.sourceStorageKey,
      describe: `real disposable PostgreSQL at ${this.redacted()}`
    };
  }

  /** Exactly the P3A-VERIFY chain shape, with synthetic ids only. */
  private async seedEligibleChain() {
    const tag = `p3b-canary-${randomUUID()}`;
    const sourceStorageKey = `originals/${tag}-source.png`;

    const draft = await this.client.restorationDraft.create({
      data: {
        originalStorageKey: sourceStorageKey,
        originalMimeType: "image/png",
        market: "PAKISTAN",
        currency: "PKR",
        status: "ORDER_SELECTION"
      }
    });
    this.createdDraftIds.push(draft.id);

    const order = await this.client.fixedOrder.create({
      data: {
        orderNo: `${tag}-order`,
        type: "RESTORATION_DIGITAL",
        market: "PAKISTAN",
        currency: "PKR",
        sourceDraftId: draft.id,
        totalAmountMinor: 150000n,
        status: "PAYMENT_VERIFIED"
      }
    });
    this.createdOrderIds.push(order.id);

    await this.client.paymentAttempt.create({
      data: { fixedOrderId: order.id, amountMinor: 150000n, currency: "PKR", idempotencyKey: `${tag}-pay`, status: "PAID" }
    });

    const entitlement = await this.client.restorationEntitlement.create({
      data: { fixedOrderId: order.id, draftId: draft.id, status: "GRANTED" }
    });

    const master = await this.client.restorationMaster.create({
      data: { restorationEntitlementId: entitlement.id, status: "NOT_STARTED" }
    });

    const execution = await this.client.replicateExecution.create({
      data: { restorationMasterId: master.id, idempotencyKey: `restoration-execution:${master.id}`, status: "QUEUED" }
    });

    return { masterId: master.id, executionId: execution.id, sourceStorageKey };
  }

  async teardown(): Promise<Omit<CanaryCleanupReport, "deletedKeys">> {
    let residualExecutionRows = -1;
    let databaseDropped = false;
    let postgresStopped = false;
    let tempDirRemoved = false;
    let portFreed = false;

    if (this.client) {
      try {
        await this.client.fixedOrder.deleteMany({ where: { id: { in: this.createdOrderIds } } });
        await this.client.restorationDraft.deleteMany({ where: { id: { in: this.createdDraftIds } } });
        residualExecutionRows = await this.client.replicateExecution.count();
      } catch {
        residualExecutionRows = -1;
      }
      try {
        await this.client.$disconnect();
      } catch {
        /* teardown is best-effort but always attempted */
      }
      try {
        const { prisma } = await import("../db/prisma");
        await prisma.$disconnect();
      } catch {
        /* the shared singleton may never have connected */
      }
      this.client = null;
    }

    if (this.tempRoot) {
      const dataDir = join(this.tempRoot, "data");
      const stop = await runCommand(pgBinary(this.binDir, "pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
      postgresStopped = stop.code === 0;
      // The whole cluster (and with it the disposable database) is destroyed
      // when the temp root is removed, which is strictly stronger than DROP.
      databaseDropped = postgresStopped;
      await rm(this.tempRoot, { recursive: true, force: true, maxRetries: 5 });
      tempDirRemoved = !existsSync(this.tempRoot);
      this.tempRoot = null;
    }

    portFreed = this.port === 0 ? true : await portIsFree(this.port);
    delete process.env.DATABASE_URL;
    this.databaseUrl = null;

    return { databaseDropped, postgresStopped, tempDirRemoved, portFreed, residualExecutionRows };
  }
}

// ---------------------------------------------------------------------------
// 8. Live ports factory -- the ONLY place a network-capable object is built
// ---------------------------------------------------------------------------

/**
 * Constructs the real Replicate execution seam and the real R2 storage
 * service. It is unreachable until every gate in `runCanary` has passed, and
 * it is never invoked by `--check` or `--dry-run`.
 *
 * The provider seam used here is the Replicate-only
 * `PipelineOrchestratorProviderExecutor`. This runner deliberately does NOT go
 * through the multi-provider router, so no other execution backend is even
 * importable from this file.
 */
export async function createLiveCanaryPorts(
  keys: CanaryKeys
): Promise<{ provider: ProviderExecutionPort; persistence: MasterPersistencePort }> {
  const { loadConfig } = await import("../config/env");
  const { StorageService } = await import("../services/storage.service");
  const { PipelineOrchestrator } = await import("../restoration-providers/pipeline/PipelineOrchestrator");
  const { PipelineOrchestratorProviderExecutor } = await import(
    "../restoration-providers/pipeline/DefaultRestorationExecutionPorts"
  );

  const config = loadConfig();
  const storage = new StorageService(config);
  const provider = new PipelineOrchestratorProviderExecutor(new PipelineOrchestrator(config));

  const persistence: MasterPersistencePort = {
    async downloadSource(storageKey: string): Promise<Buffer> {
      const result = await storage.downloadFile(storageKey);
      return result.body;
    },
    async uploadMaster(params: { restorationMasterId: string; body: Buffer; contentType: string }): Promise<MasterUploadResult> {
      void params.restorationMasterId;
      const result = await storage.uploadFile({
        keyPrefix: keys.prefix.replace(/\/$/, ""),
        fileName: "master.png",
        body: params.body,
        contentType: params.contentType
      });
      return { key: result.key };
    },
    async deleteObject(storageKey: string): Promise<void> {
      await storage.deleteFile(storageKey);
    }
  };

  return { provider, persistence };
}

// ---------------------------------------------------------------------------
// 9. Synthetic, non-customer canary image
// ---------------------------------------------------------------------------

/** Generated in-process. No customer image is ever read by this runner. */
export async function buildSyntheticCanaryImage(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 12, g: 34, b: 56 } } })
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// 10. Modes
// ---------------------------------------------------------------------------

function renderCredentialReport(report: CredentialReport): string[] {
  // NAMES and STATUSES only. No value, prefix, length, or hash is emitted.
  return report.entries.map((e) => `  ${e.status.padEnd(22)} ${e.name}`);
}

async function runCheckMode(env: EnvLike): Promise<CanaryResult> {
  const credentials = checkRequiredCredentials(env);
  const output = [
    "--check: credential prerequisites (names and statuses only; no values are read into output)",
    ...renderCredentialReport(credentials),
    credentials.ok
      ? "  RESULT: all 8 prerequisites PRESENT"
      : `  RESULT: FAILED CLOSED -- ${credentials.failing.length} variable(s) unusable: ${credentials.failing.join(", ")}`
  ];
  return { mode: "check", exitCode: credentials.ok ? 0 : 2, output, counts: zeroCounts(), credentials };
}

async function runDryRunMode(options: CanaryOptions, log: (line: string) => void): Promise<CanaryResult> {
  const runId = options.runId ?? randomUUID();
  const keys = computeCanaryKeys(runId);
  const output: string[] = [];
  const emit = (line: string) => {
    output.push(line);
    log(line);
  };

  emit(`--dry-run: mocked Replicate + mocked R2, real disposable PostgreSQL. run-id ${keys.runId}`);

  const harness = options.harness ?? new DisposablePostgresHarness(emit);
  const source = await buildSyntheticCanaryImage();
  const masterBytes = await buildSyntheticCanaryImage();

  const provider = new CountingProviderPort(masterBytes, options.fault === "provider");
  const persistence = new CountingPersistencePort(source, keys, options.fault === "upload");

  let counting: CountingRepository | null = null;
  let outcome: ReplicateExecutionWorkerResult["outcome"] | undefined;
  let replayOutcome: ReplicateExecutionWorkerResult["outcome"] | undefined;
  let setupDone = false;

  try {
    const setup = await harness.setup();
    setupDone = true;
    emit(`  seeded ONE eligible paid chain on ${setup.describe}`);

    const base = options.fault === "commit" ? new CommitFaultRepository(setup.repository) : setup.repository;
    counting = new CountingRepository(base);

    const { ReplicateExecutionWorker } = await import("../services/replicate-execution.worker");
    const worker = new ReplicateExecutionWorker({
      repository: counting,
      persistence,
      providerExecutor: provider,
      providerSelection: "replicate"
    });

    const first = await worker.processReplicateExecution(setup.executionId);
    outcome = first.outcome;
    emit(`  first invocation outcome: ${first.outcome}`);

    const before = { provider: provider.calls, uploads: persistence.uploads.length, commits: counting.commits };
    const replay = await worker.processReplicateExecution(setup.executionId);
    replayOutcome = replay.outcome;
    emit(`  replay invocation outcome: ${replay.outcome}`);

    const replaySafe =
      provider.calls === before.provider && persistence.uploads.length === before.uploads && counting.commits === before.commits;
    emit(`  replay safety: ${replaySafe ? "PROVEN (zero additional provider/storage/commit calls)" : "VIOLATED"}`);

    const counts: CanaryCounts = {
      claims: counting.claims,
      providerCalls: provider.calls,
      sourceDownloads: persistence.downloads,
      uploads: persistence.uploads.length,
      commits: counting.commits,
      deletes: persistence.deletes.length
    };
    emit(
      `  counts: claims=${counts.claims} providerCalls=${counts.providerCalls} downloads=${counts.sourceDownloads} ` +
        `uploads=${counts.uploads} commits=${counts.commits} deletes=${counts.deletes}`
    );

    const expectedSuccess = options.fault === undefined;
    const ok =
      replaySafe &&
      (expectedSuccess
        ? first.outcome === "SUCCEEDED" &&
          replay.outcome === "INELIGIBLE" &&
          counts.claims === 1 &&
          counts.providerCalls === 1 &&
          counts.uploads === 1 &&
          counts.commits === 1
        : counts.providerCalls <= 1 && counts.uploads <= 1 && counts.commits === 0);

    const cleanupBase = await harness.teardown();
    const cleanup: CanaryCleanupReport = { deletedKeys: persistence.deletes.slice(), ...cleanupBase };
    emit(
      `  cleanup: postgresStopped=${cleanup.postgresStopped} tempDirRemoved=${cleanup.tempDirRemoved} ` +
        `portFreed=${cleanup.portFreed} residualExecutionRows=${cleanup.residualExecutionRows}`
    );
    emit(`  canary key layout (not written in dry-run): ${keys.cleanupKeys.join(", ")}`);
    emit(ok ? "  RESULT: dry-run PASSED" : "  RESULT: dry-run FAILED");

    return { mode: "dry-run", exitCode: ok ? 0 : 1, output, counts, keys, outcome, replayOutcome, cleanup };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    emit(`  RESULT: dry-run ABORTED -- ${message}`);
    let cleanup: CanaryCleanupReport | undefined;
    if (setupDone) {
      const cleanupBase = await harness.teardown().catch(() => null);
      if (cleanupBase) cleanup = { deletedKeys: persistence.deletes.slice(), ...cleanupBase };
    }
    return {
      mode: "dry-run",
      exitCode: 1,
      output,
      counts: {
        claims: counting?.claims ?? 0,
        providerCalls: provider.calls,
        sourceDownloads: persistence.downloads,
        uploads: persistence.uploads.length,
        commits: counting?.commits ?? 0,
        deletes: persistence.deletes.length
      },
      keys,
      outcome,
      replayOutcome,
      cleanup
    };
  }
}

async function runLiveCanaryMode(
  options: CanaryOptions,
  parsed: ParsedArgs,
  env: EnvLike,
  log: (line: string) => void
): Promise<CanaryResult> {
  const output: string[] = [];
  const emit = (line: string) => {
    output.push(line);
    log(line);
  };

  // ---- GATE 1: explicit billable confirmation. Checked first, before any
  // credential is even read and long before any client could be constructed.
  if (!parsed.confirmBillable) {
    emit("--live-canary REFUSED: --confirm-one-billable-call is mandatory and was not supplied.");
    emit("  No credential was read, no client was constructed, no request was made.");
    return { mode: "live-canary", exitCode: 2, output, counts: zeroCounts() };
  }

  // ---- GATE 2: all 8 prerequisites must be PRESENT (not absent, not blank,
  // not placeholder-shaped). Still no network-capable object exists here.
  const credentials = checkRequiredCredentials(env);
  if (!credentials.ok) {
    emit("--live-canary REFUSED: prerequisite credentials are unusable.");
    output.push(...renderCredentialReport(credentials));
    for (const line of renderCredentialReport(credentials)) log(line);
    emit(`  Unusable: ${credentials.failing.join(", ")}`);
    emit("  Rejected BEFORE any Replicate or R2 client object was constructed.");
    return { mode: "live-canary", exitCode: 2, output, counts: zeroCounts(), credentials };
  }

  const runId = options.runId ?? randomUUID();
  const keys = computeCanaryKeys(runId);
  emit(`--live-canary ARMED. run-id ${keys.runId}; isolated prefix ${keys.prefix}`);

  // ---- Only now may a network-capable object exist.
  const ports = await (options.portsFactory ?? createLiveCanaryPorts)(keys);
  const provider = ports.provider;
  const persistence = ports.persistence;

  let providerCalls = 0;
  const countingProvider: ProviderExecutionPort = {
    async execute(request, tier) {
      providerCalls++;
      // Hard stop: the one-call rule is enforced here as well as by the worker.
      if (providerCalls > 1) throw new Error("refusing a second provider call in a single canary invocation");
      return provider.execute(request, tier);
    }
  };

  let downloads = 0;
  const uploaded: string[] = [];
  const deleted: string[] = [];
  const countingPersistence: MasterPersistencePort = {
    async downloadSource(key) {
      downloads++;
      return persistence.downloadSource(key);
    },
    async uploadMaster(params) {
      const result = await persistence.uploadMaster(params);
      uploaded.push(result.key);
      return result;
    },
    async deleteObject(key) {
      await persistence.deleteObject(key);
      deleted.push(key);
    }
  };

  const harness = options.harness ?? new DisposablePostgresHarness(emit);
  let setupDone = false;
  let counting: CountingRepository | null = null;
  let outcome: ReplicateExecutionWorkerResult["outcome"] | undefined;
  // Built inside `try` and completed by `finally`, so the returned report
  // always reflects the cleanup that actually happened.
  let finalResult: CanaryResult | null = null;

  try {
    const setup = await harness.setup();
    setupDone = true;
    counting = new CountingRepository(setup.repository);

    const { ReplicateExecutionWorker } = await import("../services/replicate-execution.worker");
    const result = await new ReplicateExecutionWorker({
      repository: counting,
      persistence: countingPersistence,
      providerExecutor: countingProvider,
      providerSelection: "replicate"
    }).processReplicateExecution(setup.executionId);

    outcome = result.outcome;
    emit(`  live outcome: ${result.outcome}`);
    emit(`  counts: providerCalls=${providerCalls} downloads=${downloads} uploads=${uploaded.length} commits=${counting.commits}`);
    finalResult = {
      mode: "live-canary",
      exitCode: result.outcome === "SUCCEEDED" ? 0 : 1,
      output,
      counts: {
        claims: counting.claims,
        providerCalls,
        sourceDownloads: downloads,
        uploads: uploaded.length,
        commits: counting.commits,
        deletes: deleted.length
      },
      credentials,
      keys,
      outcome
    };
    return finalResult;
  } finally {
    // Unconditional cleanup: every canary object under this run's prefix, then
    // the disposable database. Exactly one delete attempt per key, no retry.
    for (const key of keys.cleanupKeys) {
      try {
        await countingPersistence.deleteObject(key);
      } catch {
        emit(`  cleanup: delete attempt failed for one canary object (key not logged)`);
      }
    }
    if (setupDone) {
      const base = await harness.teardown().catch(() => null);
      if (base) {
        const cleanup: CanaryCleanupReport = { deletedKeys: deleted.slice(), ...base };
        emit(`  cleanup: canaryObjectsDeleted=${deleted.length} postgresStopped=${cleanup.postgresStopped}`);
        if (finalResult) {
          finalResult.cleanup = cleanup;
          finalResult.counts.deletes = deleted.length;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 11. Entry point
// ---------------------------------------------------------------------------

export async function runCanary(options: CanaryOptions = {}): Promise<CanaryResult> {
  const argv = options.argv ?? process.argv.slice(2);
  const env = options.env ?? process.env;
  const log = options.log ?? (() => undefined);
  const parsed = parseCanaryArgs(argv);

  if (parsed.unknown.length > 0) {
    const output = [`unrecognized argument(s): ${parsed.unknown.join(", ")}`, ...USAGE_LINES];
    for (const line of output) log(line);
    return { mode: "usage", exitCode: 2, output, counts: zeroCounts() };
  }

  if (parsed.mode === "usage") {
    // Default invocation: no database, no network, no cost. Usage only.
    for (const line of USAGE_LINES) log(line);
    return { mode: "usage", exitCode: 0, output: [...USAGE_LINES], counts: zeroCounts() };
  }

  if (parsed.mode === "check") {
    const result = await runCheckMode(env);
    for (const line of result.output) log(line);
    return result;
  }

  if (parsed.mode === "dry-run") {
    return runDryRunMode(options, log);
  }

  return runLiveCanaryMode(options, parsed, env, log);
}

/* istanbul ignore next -- CLI wiring only */
if (require.main === module) {
  runCanary({ log: (line) => console.log(line) })
    .then((result) => {
      process.exitCode = result.exitCode;
    })
    .catch((err) => {
      console.error(`canary runner aborted: ${err instanceof Error ? err.message : "unknown error"}`);
      process.exitCode = 1;
    });
}
