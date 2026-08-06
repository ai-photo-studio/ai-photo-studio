// R9.2-LAUNCH-CANDIDATE: smallest deterministic local/stub verification gate.
//
// Runs the launch-critical local/stub suites and exits non-zero on any
// failure. Never contacts external services (no Bank Alfalah, Replicate,
// R2, or RunPod network calls).
//
// Root cause this script codifies: `apps/api/src/scripts/p4c2-mpgs-provisioning-config-diagnostic.test.ts`
// imports from `vitest` (uses `vi.mock`) and cannot run under the `node:test`
// runner (`npx tsx --test`) — it fails closed with MODULE_NOT_FOUND when
// wrongly included in that glob. Every other `*.test.ts` file (excluding
// `*.pg-race.test.ts`, which require a disposable PostgreSQL instance and
// are run in isolation elsewhere) runs correctly under `tsx --test`. This
// script routes each file to its correct runner so nothing is silently
// skipped and nothing is mislabeled as passing.
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const apiSrc = path.join(repoRoot, "apps", "api", "src");

const VITEST_ONLY = new Set([
  "p4c2-mpgs-provisioning-config-diagnostic.test.ts",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".test.ts") && !entry.endsWith(".pg-race.test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function run(label, command, args, cwd) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    console.error(`✖ ${label} failed (exit ${result.status})`);
    process.exitCode = 1;
    return false;
  }
  console.log(`✔ ${label} passed`);
  return true;
}

const allTestFiles = walk(apiSrc);
const nodeTestFiles = allTestFiles
  .filter((f) => !VITEST_ONLY.has(path.basename(f)))
  .map((f) => path.relative(path.join(repoRoot, "apps", "api"), f));
const vitestFiles = allTestFiles
  .filter((f) => VITEST_ONLY.has(path.basename(f)))
  .map((f) => path.relative(path.join(repoRoot, "apps", "api"), f));

let ok = true;
ok = run("lint", "npm", ["run", "lint"], repoRoot) && ok;
ok = run(
  `node:test fast suite (${nodeTestFiles.length} files, non-DB)`,
  "npx",
  ["tsx", "--test", ...nodeTestFiles],
  path.join(repoRoot, "apps", "api")
) && ok;
if (vitestFiles.length > 0) {
  ok = run(
    `vitest-only files (${vitestFiles.length} file(s))`,
    "npx",
    ["vitest", "run", ...vitestFiles],
    path.join(repoRoot, "apps", "api")
  ) && ok;
}

console.log(ok ? "\n✔ verify:launch-candidate PASSED" : "\n✖ verify:launch-candidate FAILED");
process.exit(ok ? 0 : 1);
