// R9.2-MERGE-P150-AND-PAYMENT-FREE-STAGING-RC
//
// Smallest deterministic payment-free staging release-candidate gate.
// Combines the existing repository-configuration-only validators plus a
// small number of additional static checks not already covered by any of
// them. Zero network calls, zero database access, zero external service
// contact -- everything here is a source/config read.
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (rel) => readFileSync(path.join(repoRoot, rel), "utf8");
const exists = (rel) => existsSync(path.join(repoRoot, rel));

let failed = 0;
function runSubValidator(label, scriptRel) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [path.join(repoRoot, scriptRel)], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`✖ ${label} failed`);
    failed += 1;
  } else {
    console.log(`✔ ${label} passed`);
  }
}

const checks = [];
function check(name, fn) {
  checks.push({ name, fn });
}

// ---------------------------------------------------------------------
// Additional checks not already covered by an existing sub-validator.
// ---------------------------------------------------------------------

check("no disposable/local Postgres data artifacts are tracked in git", () => {
  const result = spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error("git ls-files failed -- cannot verify no disposable DB artifacts are tracked");
  }
  const trackedFiles = result.stdout.split(/\r?\n/);
  const suspicious = trackedFiles.filter(
    (f) => /postmaster\.pid$/.test(f) || /pg_hba\.conf$/.test(f) || /^base\/\d+\//.test(f)
  );
  if (suspicious.length > 0) {
    throw new Error(`tracked disposable-Postgres-shaped file(s) found (must never be committed): ${suspicious.join(", ")}`);
  }
});

check("the P4B worker entry point imports no HTTP server framework", () => {
  const workerMainPath = "apps/api/src/scripts/p4b-worker-runner-main.ts";
  if (!exists(workerMainPath)) throw new Error(`${workerMainPath} does not exist`);
  const content = read(workerMainPath);
  if (/from ["']express["']|createServer\(/.test(content)) {
    throw new Error(`${workerMainPath} imports an HTTP server framework -- the worker must never expose a port`);
  }
});

check("no tracked .pid or *.lock file left over from a local run", () => {
  const result = spawnSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
  const trackedFiles = result.stdout.split(/\r?\n/);
  const suspicious = trackedFiles.filter((f) => /\.pid$/.test(f) || /\.lock$/.test(f));
  // A package-lock.json / npm-shrinkwrap style file is fine; only flag
  // process/db lock-shaped names.
  const trulySuspicious = suspicious.filter((f) => !/package-lock\.json$/.test(f));
  if (trulySuspicious.length > 0) {
    throw new Error(`tracked .pid/.lock file(s) found, suggesting a local run's leftovers were committed: ${trulySuspicious.join(", ")}`);
  }
});

// ---------------------------------------------------------------------
// Run the additional checks first.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// Compose the existing validators. Each already covers a named failure
// condition from this task:
//   - APG/MPGS enabled by default          -> verify:apg-url-contract, verify:payment-freeze
//   - checkout fabricates payment success  -> verify:payment-freeze, verify:apg-url-contract
//   - Return/IPN routes missing/unsafe     -> verify:apg-url-contract
//   - listener can fetch an arbitrary URL  -> verify:apg-url-contract
//   - API/worker command collision         -> verify:staging-preflight
//   - worker exposes an unintended port    -> verify:staging-preflight (+ the check above)
//   - Replicate not selected / RunPod selectable -> verify:staging-preflight, verify:payment-freeze
//   - migrations from multiple services    -> verify:staging-preflight
// ---------------------------------------------------------------------
runSubValidator("verify:apg-url-contract", "scripts/verify-apg-url-contract.mjs");
runSubValidator("verify:payment-freeze", "scripts/verify-payment-freeze.mjs");
runSubValidator("verify:launch-candidate", "scripts/verify-launch-candidate.mjs");
runSubValidator("verify:staging-preflight", "scripts/verify-staging-preflight.mjs");

console.log(failed === 0 ? "\n✔ verify:payment-free-staging-rc PASSED" : `\n✖ verify:payment-free-staging-rc FAILED (${failed} failing check/validator)`);
process.exit(failed === 0 ? 0 : 1);
