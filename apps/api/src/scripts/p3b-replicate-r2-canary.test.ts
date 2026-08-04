/**
 * R9.2-P3B-REPLICATE-R2-CANARY — gate, redaction, and call-count proof for
 * `p3b-replicate-r2-canary.ts`.
 *
 * NOTHING in this file makes a real Replicate request, a real R2 write, or any
 * network call at all: `globalThis.fetch` is replaced with a throwing spy for
 * the entire file, and every mode under test is driven with an INJECTED
 * in-memory harness and INJECTED mock ports. No real Replicate or R2 client
 * object is ever constructed.
 *
 *   npx tsx --test src/scripts/p3b-replicate-r2-canary.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_LIVE_CREDENTIALS,
  USAGE_LINES,
  buildSyntheticCanaryImage,
  checkRequiredCredentials,
  classifyCredentialValue,
  computeCanaryKeys,
  parseCanaryArgs,
  runCanary,
  type CanaryHarness,
  type CanaryHarnessSetup,
  type CanaryKeys,
  type CanaryResult
} from "./p3b-replicate-r2-canary";
import type { PipelineResult } from "../restoration-providers/pipeline/PipelineOrchestrator";
import type { ProviderExecutionPort } from "../restoration-providers/pipeline/RestorationExecutionPorts";
import type {
  CommitMasterParams,
  MasterPersistencePort,
  MasterUploadResult,
  ReplicateExecutionContext,
  ReplicateExecutionFailureCode,
  ReplicateExecutionRepositoryPort
} from "../services/replicate-execution.worker";

// ---------------------------------------------------------------------------
// Zero-network guard for the whole file
// ---------------------------------------------------------------------------

let externalCallAttempts = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = (...args: unknown[]) => {
  externalCallAttempts++;
  throw new Error(`no network call is permitted in this test file (attempted ${String(args[0]).slice(0, 32)})`);
};

/** A value that LOOKS like a credential but is not one, and must never surface in output. */
const FAKE_SECRET = "sk-live-zzq7hab7cd12ef34gh56";
const fullyConfiguredEnv = Object.fromEntries(
  REQUIRED_LIVE_CREDENTIALS.map((name) => [name, `${FAKE_SECRET}-${name.length}`])
) as Record<string, string>;

// ---------------------------------------------------------------------------
// Injected in-memory harness (no PostgreSQL, no filesystem, no network)
// ---------------------------------------------------------------------------

const EXECUTION_ID = "canary-exec-1";
const MASTER_ID = "canary-master-1";

function eligibleContext(): ReplicateExecutionContext {
  return {
    executionId: EXECUTION_ID,
    executionStatus: "QUEUED",
    idempotencyKey: `restoration-execution:${MASTER_ID}`,
    restorationMasterId: MASTER_ID,
    masterStatus: "NOT_STARTED",
    masterStorageKey: null,
    restorationEntitlementId: "canary-entitlement-1",
    entitlementStatus: "GRANTED",
    order: { id: "canary-order-1", type: "RESTORATION_DIGITAL", status: "PAYMENT_VERIFIED", market: "PAKISTAN", currency: "PKR" },
    paymentAttemptStatus: "PAID",
    draft: { id: "canary-draft-1", originalStorageKey: "originals/canary-source.png", originalMimeType: "image/png" }
  };
}

class InMemoryRepository implements ReplicateExecutionRepositoryPort {
  row = eligibleContext();
  async loadContext(executionId: string) {
    return executionId === this.row.executionId ? { ...this.row } : null;
  }
  async claimQueued(_executionId: string, _startedAt: Date) {
    if (this.row.executionStatus !== "QUEUED") return 0;
    this.row.executionStatus = "PROCESSING";
    this.row.masterStatus = "PROCESSING";
    return 1;
  }
  async commitSuccess(params: CommitMasterParams) {
    this.row.executionStatus = "SUCCEEDED";
    this.row.masterStatus = "VALIDATED";
    this.row.masterStorageKey = params.storageKey;
  }
  async markFailed(_executionId: string, _masterId: string, _code: ReplicateExecutionFailureCode) {
    this.row.executionStatus = "FAILED";
    this.row.masterStatus = "FAILED";
  }
}

class InMemoryHarness implements CanaryHarness {
  setups = 0;
  teardowns = 0;
  repository = new InMemoryRepository();
  async setup(): Promise<CanaryHarnessSetup> {
    this.setups++;
    return {
      repository: this.repository,
      executionId: EXECUTION_ID,
      restorationMasterId: MASTER_ID,
      sourceStorageKey: "originals/canary-source.png",
      describe: "injected in-memory harness (no PostgreSQL stood up in this test)"
    };
  }
  async teardown() {
    this.teardowns++;
    // A real teardown would drop the disposable DB; the in-memory stand-in
    // reports the same shape so cleanup accounting is assertable.
    this.repository = new InMemoryRepository();
    return { databaseDropped: true, postgresStopped: true, tempDirRemoved: true, portFreed: true, residualExecutionRows: 0 };
  }
}

// ---------------------------------------------------------------------------
// Injected mock live ports (never a real Replicate/R2 client)
// ---------------------------------------------------------------------------

class MockLivePorts {
  providerCalls = 0;
  uploads: string[] = [];
  deletes: string[] = [];
  downloads = 0;
  clientConstructions = 0;

  constructor(private readonly image: Buffer) {}

  factory = async (keys: CanaryKeys): Promise<{ provider: ProviderExecutionPort; persistence: MasterPersistencePort }> => {
    this.clientConstructions++;
    const provider: ProviderExecutionPort = {
      execute: async (): Promise<PipelineResult> => {
        this.providerCalls++;
        const final = {
          image: this.image,
          contentType: "image/png",
          fileName: "master.png",
          providerName: "replicate-pipeline",
          providerVersion: "mock",
          stages: ["restore"],
          processingTimeMs: 1,
          creditsUsed: 0,
          estimatedCost: 0,
          actualCost: 0,
          requestId: "mock_live_request"
        };
        return { final, intermediateResults: [final], totalProcessingTimeMs: 1, totalEstimatedCost: 0, totalActualCost: 0, tier: "replicate" };
      }
    };
    const persistence: MasterPersistencePort = {
      downloadSource: async (): Promise<Buffer> => {
        this.downloads++;
        return this.image;
      },
      uploadMaster: async (): Promise<MasterUploadResult> => {
        this.uploads.push(keys.masterKey);
        return { key: keys.masterKey };
      },
      deleteObject: async (key: string): Promise<void> => {
        this.deletes.push(key);
      }
    };
    return { provider, persistence };
  };
}

/** Collects everything the runner would print, so redaction can be asserted. */
function collector() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

function allText(result: CanaryResult, extra: string[] = []): string {
  return [...result.output, ...extra].join("\n");
}

// ---------------------------------------------------------------------------
// 1. Argument parsing / default invocation
// ---------------------------------------------------------------------------

test("(c1) default invocation with no flags performs zero actions and prints usage", async () => {
  const sink = collector();
  const harness = new InMemoryHarness();
  const result = await runCanary({ argv: [], env: {}, harness, log: sink.log });

  assert.equal(result.mode, "usage");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.counts, { claims: 0, providerCalls: 0, sourceDownloads: 0, uploads: 0, commits: 0, deletes: 0 });
  assert.equal(harness.setups, 0, "no database harness was stood up");
  assert.equal(harness.teardowns, 0);
  assert.equal(externalCallAttempts, 0, "no network call was attempted");
  assert.deepEqual(result.output, [...USAGE_LINES]);
  assert.ok(sink.lines.some((l) => l.includes("--live-canary")), "usage names the live flag");
});

test("(c2) unrecognized arguments fail closed with usage and no action", async () => {
  const harness = new InMemoryHarness();
  const result = await runCanary({ argv: ["--force", "--yes"], env: fullyConfiguredEnv, harness });
  assert.equal(result.exitCode, 2);
  assert.equal(result.mode, "usage");
  assert.equal(harness.setups, 0);
  assert.ok(result.output[0].includes("--force"));
});

test("(c3) argument parsing maps exactly the four supported shapes", () => {
  assert.equal(parseCanaryArgs([]).mode, "usage");
  assert.equal(parseCanaryArgs(["--check"]).mode, "check");
  assert.equal(parseCanaryArgs(["--dry-run"]).mode, "dry-run");
  assert.equal(parseCanaryArgs(["--live-canary"]).mode, "live-canary");
  assert.equal(parseCanaryArgs(["--live-canary"]).confirmBillable, false);
  assert.equal(parseCanaryArgs(["--live-canary", "--confirm-one-billable-call"]).confirmBillable, true);
  // The confirmation flag ALONE never selects the billable mode.
  assert.equal(parseCanaryArgs(["--confirm-one-billable-call"]).mode, "usage");
});

// ---------------------------------------------------------------------------
// 2. --check mode
// ---------------------------------------------------------------------------

test("(c4) --check fails closed when a required variable is absent, naming it exactly", async () => {
  const env = { ...fullyConfiguredEnv };
  delete (env as Record<string, string | undefined>).R2_BUCKET_NAME;
  const sink = collector();
  const result = await runCanary({ argv: ["--check"], env, harness: new InMemoryHarness(), log: sink.log });

  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.credentials?.failing, ["R2_BUCKET_NAME"]);
  assert.ok(allText(result).includes("ABSENT"), "the absent status is reported");
  assert.ok(allText(result).includes("R2_BUCKET_NAME"), "the failing variable is named");
  assert.equal(result.counts.providerCalls, 0);
});

test("(c5) --check fails closed on blank and placeholder-shaped values", async () => {
  const placeholders = ["replace_me", "your-token-here", "CHANGEME", "<set via environment>", "xxxxxxxx", "example-key", "   ", "test"];
  for (const value of placeholders) {
    const env = { ...fullyConfiguredEnv, REPLICATE_API_TOKEN: value };
    const result = await runCanary({ argv: ["--check"], env, harness: new InMemoryHarness() });
    assert.equal(result.exitCode, 2, `"${value}" must be rejected`);
    assert.deepEqual(result.credentials?.failing, ["REPLICATE_API_TOKEN"]);
  }
  assert.equal(classifyCredentialValue("replace_me"), "PLACEHOLDER_SUSPECTED");
  assert.equal(classifyCredentialValue("your-token-here"), "PLACEHOLDER_SUSPECTED");
  assert.equal(classifyCredentialValue(""), "ABSENT");
  assert.equal(classifyCredentialValue(undefined), "ABSENT");
  assert.equal(classifyCredentialValue(FAKE_SECRET), "PRESENT");
});

test("(c6) --check reports all 8 variables by name and passes only when every one is PRESENT", async () => {
  const result = await runCanary({ argv: ["--check"], env: fullyConfiguredEnv, harness: new InMemoryHarness() });
  assert.equal(result.exitCode, 0);
  assert.equal(result.credentials?.entries.length, 8);
  assert.deepEqual(
    result.credentials?.entries.map((e) => e.name),
    [...REQUIRED_LIVE_CREDENTIALS]
  );
  for (const name of REQUIRED_LIVE_CREDENTIALS) assert.ok(allText(result).includes(name));
});

test("(c7) --check makes zero network calls and stands up zero databases", async () => {
  const before = externalCallAttempts;
  const harness = new InMemoryHarness();
  await runCanary({ argv: ["--check"], env: fullyConfiguredEnv, harness });
  await runCanary({ argv: ["--check"], env: {}, harness });
  assert.equal(externalCallAttempts, before, "fetch was never touched by --check");
  assert.equal(harness.setups, 0, "--check never opens a database connection");
});

test("(c8) no output line anywhere ever contains a credential VALUE", async () => {
  const sink = collector();
  const env = { ...fullyConfiguredEnv, REPLICATE_API_TOKEN: `${FAKE_SECRET}-primary` };
  const ok = await runCanary({ argv: ["--check"], env, harness: new InMemoryHarness(), log: sink.log });

  const badEnv = { ...env, R2_SECRET_ACCESS_KEY: "replace_me" };
  const bad = await runCanary({ argv: ["--check"], env: badEnv, harness: new InMemoryHarness(), log: sink.log });

  const live = await runCanary({
    argv: ["--live-canary"],
    env,
    harness: new InMemoryHarness(),
    log: sink.log
  });

  const everything = [allText(ok), allText(bad), allText(live), sink.lines.join("\n")].join("\n");
  assert.ok(!everything.includes(FAKE_SECRET), "the fake secret value never appears in any captured output");
  assert.ok(!everything.includes("replace_me"), "even a placeholder VALUE is never echoed back");
  // Names and statuses, however, must be present — that is the whole point.
  assert.ok(everything.includes("R2_SECRET_ACCESS_KEY"));
  assert.ok(everything.includes("PLACEHOLDER_SUSPECTED"));
});

// ---------------------------------------------------------------------------
// 3. --dry-run mode (injected harness; the real CLI uses real PostgreSQL)
// ---------------------------------------------------------------------------

test("(c9) --dry-run performs exactly one claim, one provider call, one upload, one commit", async () => {
  const harness = new InMemoryHarness();
  const result = await runCanary({ argv: ["--dry-run"], env: {}, harness, runId: "fixed-run-id" });

  assert.equal(result.exitCode, 0);
  assert.equal(result.outcome, "SUCCEEDED");
  assert.equal(result.counts.claims, 1);
  assert.equal(result.counts.providerCalls, 1);
  assert.equal(result.counts.sourceDownloads, 1);
  assert.equal(result.counts.uploads, 1);
  assert.equal(result.counts.commits, 1);
  assert.equal(result.counts.deletes, 0);
  assert.equal(externalCallAttempts, 0, "the mocked ports made zero real network calls");
  assert.equal(harness.setups, 1);
  assert.equal(harness.teardowns, 1, "the harness is always torn down");
});

test("(c10) replaying the same execution in --dry-run produces zero additional provider/storage calls", async () => {
  const harness = new InMemoryHarness();
  const result = await runCanary({ argv: ["--dry-run"], env: {}, harness, runId: "fixed-run-id" });
  assert.equal(result.replayOutcome, "INELIGIBLE", "a completed execution is never re-claimed");
  // The counts below are the TOTAL across both invocations.
  assert.equal(result.counts.providerCalls, 1, "the replay added no provider call");
  assert.equal(result.counts.uploads, 1, "the replay added no upload");
  assert.equal(result.counts.commits, 1, "the replay added no commit");
  assert.ok(result.output.some((l) => l.includes("replay safety: PROVEN")));
});

test("(c11) simulated provider failure in --dry-run: no upload, no commit, full teardown", async () => {
  const harness = new InMemoryHarness();
  const result = await runCanary({ argv: ["--dry-run"], env: {}, harness, runId: "fault-provider", fault: "provider" });
  assert.equal(result.outcome, "PROVIDER_FAILED");
  assert.equal(result.counts.providerCalls, 1, "exactly one attempt — never retried");
  assert.equal(result.counts.uploads, 0);
  assert.equal(result.counts.commits, 0);
  assert.equal(harness.teardowns, 1);
  assert.equal(result.cleanup?.postgresStopped, true);
  assert.equal(result.cleanup?.tempDirRemoved, true);
  assert.equal(result.cleanup?.residualExecutionRows, 0, "no orphaned disposable-DB rows survive teardown");
});

test("(c12) simulated upload failure in --dry-run: no commit, full teardown", async () => {
  const harness = new InMemoryHarness();
  const result = await runCanary({ argv: ["--dry-run"], env: {}, harness, runId: "fault-upload", fault: "upload" });
  assert.equal(result.outcome, "UPLOAD_FAILED");
  assert.equal(result.counts.providerCalls, 1);
  assert.equal(result.counts.uploads, 0);
  assert.equal(result.counts.commits, 0);
  assert.equal(harness.teardowns, 1);
  assert.equal(result.cleanup?.residualExecutionRows, 0);
  assert.equal(result.cleanup?.portFreed, true);
});

test("(c13) simulated post-upload commit failure in --dry-run: orphan compensated, full teardown", async () => {
  const harness = new InMemoryHarness();
  const result = await runCanary({ argv: ["--dry-run"], env: {}, harness, runId: "fault-commit", fault: "commit" });
  assert.equal(result.outcome, "COMMIT_FAILED_COMPENSATED");
  assert.equal(result.counts.providerCalls, 1);
  assert.equal(result.counts.uploads, 1);
  assert.equal(result.counts.commits, 0, "no commit was recorded");
  assert.equal(result.counts.deletes, 1, "exactly one bounded compensation delete, never retried");
  assert.equal(harness.teardowns, 1);
  assert.equal(result.cleanup?.residualExecutionRows, 0);
});

// ---------------------------------------------------------------------------
// 4. --live-canary gating
// ---------------------------------------------------------------------------

test("(c14) --live-canary WITHOUT --confirm-one-billable-call is rejected before any client is constructed", async () => {
  const ports = new MockLivePorts(await buildSyntheticCanaryImage());
  const harness = new InMemoryHarness();
  const result = await runCanary({
    argv: ["--live-canary"],
    env: fullyConfiguredEnv,
    harness,
    portsFactory: ports.factory
  });

  assert.equal(result.exitCode, 2);
  assert.equal(ports.clientConstructions, 0, "no provider/storage client object was constructed");
  assert.equal(ports.providerCalls, 0);
  assert.equal(harness.setups, 0, "no database was stood up");
  assert.equal(externalCallAttempts, 0);
  assert.ok(result.output.some((l) => l.includes("--confirm-one-billable-call is mandatory")));
});

test("(c15) --live-canary --confirm-one-billable-call is rejected when ANY prerequisite is missing or placeholder", async () => {
  const image = await buildSyntheticCanaryImage();
  for (const name of REQUIRED_LIVE_CREDENTIALS) {
    for (const bad of [undefined, "", "replace_me"]) {
      const ports = new MockLivePorts(image);
      const harness = new InMemoryHarness();
      const env: Record<string, string | undefined> = { ...fullyConfiguredEnv };
      env[name] = bad;
      const result = await runCanary({
        argv: ["--live-canary", "--confirm-one-billable-call"],
        env,
        harness,
        portsFactory: ports.factory
      });
      assert.equal(result.exitCode, 2, `${name}=${String(bad)} must be refused`);
      assert.deepEqual(result.credentials?.failing, [name]);
      assert.equal(ports.clientConstructions, 0, "rejected BEFORE any network-capable object existed");
      assert.equal(harness.setups, 0, "rejected before any database was stood up");
    }
  }
  assert.equal(externalCallAttempts, 0);
});

test("(c16) with all gates passing and INJECTED mock ports, the flow reaches the provider exactly once", async () => {
  const ports = new MockLivePorts(await buildSyntheticCanaryImage());
  const harness = new InMemoryHarness();
  const result = await runCanary({
    argv: ["--live-canary", "--confirm-one-billable-call"],
    env: fullyConfiguredEnv,
    harness,
    portsFactory: ports.factory,
    runId: "gate-proof"
  });

  assert.equal(ports.clientConstructions, 1, "the ports factory is invoked exactly once, only after every gate");
  assert.equal(ports.providerCalls, 1, "EXACTLY ONE provider call — the one-call rule");
  assert.equal(result.counts.providerCalls, 1);
  assert.equal(result.counts.uploads, 1);
  assert.equal(result.outcome, "SUCCEEDED");
  assert.equal(harness.teardowns, 1, "the disposable harness is torn down in the finally block");
  assert.equal(externalCallAttempts, 0, "no real Replicate or R2 request was made by this test");
});

test("(c17) a live run always deletes exactly the source and master objects under its own prefix", async () => {
  const ports = new MockLivePorts(await buildSyntheticCanaryImage());
  const result = await runCanary({
    argv: ["--live-canary", "--confirm-one-billable-call"],
    env: fullyConfiguredEnv,
    harness: new InMemoryHarness(),
    portsFactory: ports.factory,
    runId: "cleanup-proof"
  });
  assert.deepEqual(ports.deletes, ["canary/r9.2/cleanup-proof/source.png", "canary/r9.2/cleanup-proof/master.png"]);
  assert.deepEqual(result.keys?.cleanupKeys, ports.deletes);
});

// ---------------------------------------------------------------------------
// 5. Key layout and static scope assertions
// ---------------------------------------------------------------------------

test("(c18) the canary key prefix is deterministic and isolated under canary/r9.2/<run-id>/", () => {
  const keys = computeCanaryKeys("run-abc-123");
  assert.equal(keys.prefix, "canary/r9.2/run-abc-123/");
  assert.equal(keys.sourceKey, "canary/r9.2/run-abc-123/source.png");
  assert.equal(keys.masterKey, "canary/r9.2/run-abc-123/master.png");
  assert.deepEqual(keys.cleanupKeys, [keys.sourceKey, keys.masterKey]);
  // Deterministic for a fixed run id, and never collides with customer space.
  assert.deepEqual(computeCanaryKeys("run-abc-123"), keys);
  assert.ok(!keys.prefix.startsWith("originals/"));
  assert.ok(!keys.prefix.startsWith("finals/"));
  // Hostile run ids cannot escape the prefix.
  assert.equal(computeCanaryKeys("../../etc").prefix, "canary/r9.2/..-..-etc/");
  assert.ok(!computeCanaryKeys("../../etc").prefix.includes("/../"), "path traversal cannot escape the canary prefix");
  assert.throws(() => computeCanaryKeys("   "), /runId is required/);
});

test("(c19) the runner file reaches no other provider, payment-verification, variant, route, or deployment code", () => {
  const source = readFileSync(join(__dirname, "p3b-replicate-r2-canary.ts"), "utf8");
  const forbidden = [
    "RunPod",
    "runpod",
    "RestorationProviderRouter",
    "restoration.service",
    "bank-alfalah",
    "bankAlfalah",
    "PaymentEvent",
    "paymentEvent",
    "verifyPayment",
    "ImageVariant",
    "imageVariant",
    "buildVariants",
    "FulfilmentOrder",
    "express",
    "Router",
    "app.use",
    "image.queue",
    "bullmq",
    "BullMQ",
    "node-cron",
    "registerRoutes"
  ];
  for (const token of forbidden) {
    assert.ok(!source.includes(token), `the canary runner must not reference "${token}"`);
  }
  // It must select Replicate and nothing else.
  assert.ok(source.includes('providerSelection: "replicate"'));
});

test("(c20) the credential list is exactly the 8 documented variable names", () => {
  assert.deepEqual(
    [...REQUIRED_LIVE_CREDENTIALS],
    [
      "REPLICATE_API_TOKEN",
      "REPLICATE_RESTORATION_MODEL_SLUG",
      "REPLICATE_RESTORATION_MODEL_VERSION",
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
      "R2_ENDPOINT"
    ]
  );
  assert.equal(checkRequiredCredentials({}).failing.length, 8);
  assert.equal(checkRequiredCredentials(fullyConfiguredEnv).ok, true);
});

test("(c21) no network call was attempted anywhere in this file", () => {
  assert.equal(externalCallAttempts, 0, "zero Replicate requests and zero R2 writes were made by this test suite");
});
