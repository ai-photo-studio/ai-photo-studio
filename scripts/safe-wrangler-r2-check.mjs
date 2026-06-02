import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const run = (command, args = []) => execFileSync(command, args, { encoding: "utf8", shell: true }).trim();
const stop = (message, lines = []) => {
  console.error("STOP: WRANGLER R2 CHECK BLOCKED");
  console.error(message);
  for (const line of lines) console.error(line);
  process.exit(1);
};

const tryCommand = (command, args = []) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: true,
    windowsHide: true
  });

  return {
    ok: result.status === 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    error: result.error ? String(result.error) : ""
  };
};

run("node", ["scripts/verify-project-scope.mjs"]);

const identity = JSON.parse(fs.readFileSync(".ai-project/PROJECT_IDENTITY.json", "utf8"));
const expectedAccount = identity.expectedCloudflareAccountId;
const expectedBucket = identity.expectedR2BucketName;

const wranglerCandidates = [
  [path.resolve("node_modules/.bin/wrangler.cmd"), []],
  [path.resolve("node_modules/.bin/wrangler"), []],
  ["wrangler.cmd", []],
  ["wrangler", []],
  ["npx.cmd", ["wrangler"]],
  ["npx", ["wrangler"]]
];

let wranglerRunner = null;
for (const [command, prefixArgs] of wranglerCandidates) {
  if (tryCommand(command, [...prefixArgs, "--version"]).ok) {
    wranglerRunner = { command, prefixArgs };
    break;
  }
}

if (!wranglerRunner) {
  console.log("Wrangler not installed.");
  process.exit(0);
}

let version = "";
try {
  version = run(wranglerRunner.command, [...wranglerRunner.prefixArgs, "--version"]);
} catch (error) {
  stop("Unable to read Wrangler version", [String(error)]);
}

console.log(`Wrangler available: ${version}`);

let whoami = "";
try {
  whoami = run(wranglerRunner.command, [...wranglerRunner.prefixArgs, "whoami"]);
} catch (error) {
  const message = String(error);
  if (/not logged in|authentication|login/i.test(message)) {
    console.log("Wrangler installed but not authenticated.");
    process.exit(0);
  }
  stop("Unable to read Wrangler identity safely", [message]);
}

console.log("Wrangler auth check passed");
if (whoami) {
  const firstLine = whoami.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
  if (firstLine) console.log(firstLine);
}

let rawBuckets = "";
try {
  rawBuckets = run(wranglerRunner.command, [...wranglerRunner.prefixArgs, "r2", "bucket", "list"]);
} catch (error) {
  stop("Unable to list R2 buckets safely", [String(error)]);
}

const bucketNames = rawBuckets
  .split(/\r?\n/)
  .map((line) => line.trim())
  .map((line) => {
    const match = line.match(/^name:\s*(.+)$/i);
    return match ? match[1].trim() : "";
  })
  .filter(Boolean);

const expectedPresent = bucketNames.includes(expectedBucket);
console.log(`Expected account id=${expectedAccount}`);
console.log(`Expected bucket=${expectedBucket}`);
console.log(`Bucket count=${bucketNames.length}`);
console.log(`Expected bucket status=${expectedPresent ? "PRESENT" : "MISSING"}`);
