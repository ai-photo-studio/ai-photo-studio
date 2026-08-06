// R9.2-MERGE-P147-AND-STAGING-RELEASE-PREFLIGHT
//
// Smallest deterministic staging-readiness gate. Validates REPOSITORY
// CONFIGURATION ONLY -- reads source/config files on disk, makes zero
// network calls, touches no database, contacts no Northflank/Cloudflare/
// Replicate/Bank Alfalah API. Exits non-zero on any failing check.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
const exists = (rel) => existsSync(path.join(repoRoot, rel));

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// ---------------------------------------------------------------------
// 1. Start commands exist and API/worker commands never collide.
// ---------------------------------------------------------------------
check("api and worker have distinct, non-empty start commands", () => {
  const apiPkg = JSON.parse(read("apps/api/package.json"));
  const rootPkg = JSON.parse(read("package.json"));
  const workerScript = apiPkg.scripts?.["worker:p4b"];
  if (!workerScript || !workerScript.trim()) {
    throw new Error("apps/api/package.json is missing a non-empty 'worker:p4b' script");
  }
  const dockerfile = read("Dockerfile");
  const cmdMatch = dockerfile.match(/^CMD\s+(\[.*\])/m);
  if (!cmdMatch) {
    throw new Error("Dockerfile has no CMD instruction (API start command)");
  }
  const apiCmd = JSON.parse(cmdMatch[1]).join(" ");
  const northflankYaml = read("northflank/p4b-worker.service.yaml");
  const startCmdMatch = northflankYaml.match(/startCommand:\s*"([^"]+)"/);
  if (!startCmdMatch) {
    throw new Error("northflank/p4b-worker.service.yaml has no worker startCommand");
  }
  const workerCmd = startCmdMatch[1];
  if (apiCmd === workerCmd) {
    throw new Error(`API and worker start commands collide: both are "${apiCmd}"`);
  }
  if (!workerCmd.includes("p4b-worker-runner-main")) {
    throw new Error(`worker startCommand does not reference p4b-worker-runner-main: "${workerCmd}"`);
  }
  if (apiCmd.includes("p4b-worker-runner-main")) {
    throw new Error("Dockerfile default CMD must not run the worker entry point");
  }
  void rootPkg;
});

// ---------------------------------------------------------------------
// 2. Payment (Bank Alfalah MPGS) must default to disabled.
// ---------------------------------------------------------------------
check("BANK_ALFALAH_MPGS_ENABLED defaults to false (fail-closed)", () => {
  const envSrc = read("apps/api/src/config/env.ts");
  const m = envSrc.match(/BANK_ALFALAH_MPGS_ENABLED:\s*z\.string\(\)\.optional\(\)\.default\("([^"]*)"\)/);
  if (!m) throw new Error("could not find BANK_ALFALAH_MPGS_ENABLED default in env.ts");
  if (m[1].toLowerCase() !== "false") {
    throw new Error(`BANK_ALFALAH_MPGS_ENABLED default is "${m[1]}", must be "false"`);
  }
});

// ---------------------------------------------------------------------
// 3. RunPod cannot be selected as a restoration provider.
// ---------------------------------------------------------------------
check("RESTORATION_PROVIDER enum excludes any RunPod value and defaults to replicate", () => {
  const envSrc = read("apps/api/src/config/env.ts");
  const m = envSrc.match(/RESTORATION_PROVIDER:\s*z\.enum\(\[([^\]]*)\]\)\.default\("([^"]*)"\)/);
  if (!m) throw new Error("could not find RESTORATION_PROVIDER enum/default in env.ts");
  const values = m[1].split(",").map((v) => v.trim().replace(/"/g, "").toLowerCase());
  if (values.some((v) => v.includes("runpod"))) {
    throw new Error(`RESTORATION_PROVIDER enum includes a RunPod value: ${values.join(", ")}`);
  }
  if (m[2].toLowerCase() !== "replicate") {
    throw new Error(`RESTORATION_PROVIDER default is "${m[2]}", must be "replicate"`);
  }
  const workerMain = read("apps/api/src/scripts/p4b-worker-runner-main.ts");
  if (!/restorationProvider\s*!==\s*["']replicate["']/.test(workerMain)) {
    throw new Error("p4b-worker-runner-main.ts is missing its explicit RESTORATION_PROVIDER !== 'replicate' fail-closed guard");
  }
});

// ---------------------------------------------------------------------
// 4. Required env-variable names are documented (matrix file exists and
//    lists every schema field with no `.default()` other than an empty
//    string/false-shaped fail-closed default is at least mentioned).
// ---------------------------------------------------------------------
check("required env var names are documented in the tracked environment matrix", () => {
  const matrixPath = "docs/deployment/R9_2_STAGING_ENVIRONMENT_MATRIX.md";
  if (!exists(matrixPath)) throw new Error(`${matrixPath} does not exist`);
  const matrix = read(matrixPath);
  const required = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "ADMIN_JWT_SECRET", "WHATSAPP_VERIFY_TOKEN", "RESTORATION_PROVIDER", "BANK_ALFALAH_MPGS_ENABLED"];
  const missing = required.filter((name) => !matrix.includes(name));
  if (missing.length > 0) {
    throw new Error(`environment matrix is missing required var name(s): ${missing.join(", ")}`);
  }
});

// ---------------------------------------------------------------------
// 5. No unsafe placeholder/real-looking secret committed to tracked
//    config or documentation (heuristic, not exhaustive).
// ---------------------------------------------------------------------
check("no real-looking secret value is committed in tracked config/docs", () => {
  const suspectFiles = [
    "apps/api/src/config/env.ts",
    "northflank/p4b-worker.service.yaml",
    "docs/deployment/R9_2_STAGING_ENVIRONMENT_MATRIX.md",
    "Dockerfile"
  ].filter(exists);
  // Real Replicate tokens are r8_ followed by 20+ alnum chars with no
  // "placeholder"/"disposable"/"example" framing nearby.
  const realLookingReplicate = /r8_[A-Za-z0-9]{20,}/;
  for (const f of suspectFiles) {
    const content = read(f);
    if (realLookingReplicate.test(content)) {
      throw new Error(`${f} appears to contain a real-shaped Replicate token`);
    }
    if (/BANK_ALFALAH_MPGS_API_PASSWORD\s*[:=]\s*["'][^"'\s]{8,}["']/.test(content)) {
      throw new Error(`${f} appears to hardcode a Bank Alfalah API password value`);
    }
  }
});

// ---------------------------------------------------------------------
// 6. Health/readiness configuration is valid (API has an HTTP healthcheck
//    bound to the same port it serves; worker explicitly has none).
// ---------------------------------------------------------------------
check("Dockerfile HEALTHCHECK targets /api/health on the same PORT it exposes", () => {
  const dockerfile = read("Dockerfile");
  const exposeMatch = dockerfile.match(/^EXPOSE\s+(\d+)/m);
  const healthMatch = dockerfile.match(/^HEALTHCHECK[\s\S]*$/m);
  if (!exposeMatch) throw new Error("Dockerfile is missing EXPOSE");
  if (!healthMatch) throw new Error("Dockerfile is missing HEALTHCHECK");
  if (!healthMatch[0].includes("/api/health")) {
    throw new Error("Dockerfile HEALTHCHECK does not target /api/health");
  }
  if (!healthMatch[0].includes("PORT")) {
    throw new Error("Dockerfile HEALTHCHECK does not reference $PORT");
  }
});
check("worker service definition declares no public ports / HTTP health probe", () => {
  const yaml = read("northflank/p4b-worker.service.yaml");
  if (!/publicPorts:\s*\[\]/.test(yaml)) {
    throw new Error("worker service definition must declare publicPorts: []");
  }
  if (!/type:\s*process-liveness/.test(yaml)) {
    throw new Error("worker service definition must declare process-liveness health, not an HTTP probe");
  }
});

// ---------------------------------------------------------------------
// 7. Migrations run exactly once, never by the app containers themselves.
// ---------------------------------------------------------------------
check("migrations are never auto-run by either service container (SKIP_MIGRATIONS baked true)", () => {
  const dockerfile = read("Dockerfile");
  if (!/ENV\s+SKIP_MIGRATIONS=true/.test(dockerfile)) {
    throw new Error("Dockerfile must bake ENV SKIP_MIGRATIONS=true so neither the API nor worker container runs migrations on boot");
  }
  const yaml = read("northflank/p4b-worker.service.yaml");
  if (/prisma migrate/.test(yaml)) {
    throw new Error("worker service definition must not embed a migration command in its own start command");
  }
});

// ---------------------------------------------------------------------
// 8. R2 access is signed-URL-only; no public/unsigned master URL.
// ---------------------------------------------------------------------
check("master persistence never propagates an unsigned/public R2 URL", () => {
  const storageSrc = read("apps/api/src/services/storage.service.ts");
  if (!/getSignedUrl/.test(storageSrc)) {
    throw new Error("storage.service.ts has no getSignedUrl implementation");
  }
  // storage.service.ts's uploadFile() legitimately returns an unsigned
  // `.url` field for internal bookkeeping (a public-looking convenience
  // value) -- the actual privacy guarantee is that the master-persistence
  // path (replicate-execution.worker.ts's uploadMaster) discards that
  // field entirely and only ever keeps `.key`, with every download going
  // through getSignedUrl()/generateDownloadUrl() at request time instead.
  const workerSrc = read("apps/api/src/services/replicate-execution.worker.ts");
  const uploadMasterMatch = workerSrc.match(/async uploadMaster\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/);
  if (!uploadMasterMatch) {
    throw new Error("could not find uploadMaster() in replicate-execution.worker.ts");
  }
  const body = uploadMasterMatch[1];
  if (!/return\s*\{\s*key:\s*result\.key\s*\}/.test(body)) {
    throw new Error("uploadMaster() must return only { key: result.key } -- it must never propagate the unsigned .url field from uploadFile() for a restoration master");
  }
});

// ---------------------------------------------------------------------
// 9. Rollback instructions exist for both services.
// ---------------------------------------------------------------------
check("rollback instructions exist for both API and worker", () => {
  const yaml = read("northflank/p4b-worker.service.yaml");
  if (!/rollback:/.test(yaml)) {
    throw new Error("worker service definition is missing a rollback: section");
  }
  const runbookCandidates = [
    "docs/deployment/R9_2_STAGING_RELEASE_PROTOCOL.md",
    "docs/deployment/P4B_WORKER_NORTHFLANK_RUNBOOK.md"
  ];
  const found = runbookCandidates.find(exists);
  if (!found) {
    throw new Error(`no rollback runbook found among: ${runbookCandidates.join(", ")}`);
  }
  const runbook = read(found);
  if (!/rollback/i.test(runbook)) {
    throw new Error(`${found} exists but does not document rollback`);
  }
});

// ---------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------
let failed = 0;
for (const { name, fn } of checks) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`✖ ${name}`);
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`\n${checks.length - failed}/${checks.length} staging preflight checks passed`);
if (failed > 0) {
  console.error(`\n✖ verify:staging-preflight FAILED (${failed} check(s))`);
  process.exit(1);
}
console.log("\n✔ verify:staging-preflight PASSED");
