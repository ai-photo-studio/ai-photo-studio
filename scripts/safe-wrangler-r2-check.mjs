import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const run = (command, args = []) => execFileSync(command, args, { encoding: "utf8" }).trim();
const stop = (message, lines = []) => {
  console.error("STOP: WRANGLER R2 CHECK BLOCKED");
  console.error(message);
  for (const line of lines) console.error(line);
  process.exit(1);
};

const tryCommand = (command, args = []) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
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

let wranglerCommand = "";
if (tryCommand("wrangler.cmd", ["--version"]).ok) {
  wranglerCommand = "wrangler.cmd";
} else if (tryCommand("wrangler", ["--version"]).ok) {
  wranglerCommand = "wrangler";
} else {
  console.log("Wrangler not installed.");
  process.exit(0);
}

let version = "";
try {
  version = run(wranglerCommand, ["--version"]);
} catch (error) {
  stop("Unable to read Wrangler version", [String(error)]);
}

console.log(`Wrangler available: ${version}`);

let whoami = "";
try {
  whoami = run(wranglerCommand, ["whoami"]);
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
  rawBuckets = run(wranglerCommand, ["r2", "bucket", "list", "--json"]);
} catch (error) {
  stop("Unable to list R2 buckets safely", [String(error)]);
}

let buckets = [];
try {
  buckets = JSON.parse(rawBuckets);
} catch (error) {
  stop("Wrangler R2 bucket output was not valid JSON", [String(error)]);
}

if (!Array.isArray(buckets)) {
  stop("Wrangler R2 bucket output was not an array");
}

const bucketNames = buckets
  .map((bucket) => String(bucket?.name || ""))
  .filter(Boolean);

const expectedPresent = bucketNames.includes(expectedBucket);
console.log(`Expected account id=${expectedAccount}`);
console.log(`Expected bucket=${expectedBucket}`);
console.log(`Bucket count=${bucketNames.length}`);
console.log(`Expected bucket status=${expectedPresent ? "PRESENT" : "MISSING"}`);
