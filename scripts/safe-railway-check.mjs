import fs from "node:fs";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const stop = (message, lines = []) => {
  console.error("STOP: RAILWAY GUARD BLOCKED");
  console.error(message);
  for (const line of lines) console.error(line);
  process.exit(1);
};

run("node scripts/verify-project-scope.mjs");

let hasRailway = true;
try {
  run("railway.cmd --version");
} catch {
  hasRailway = false;
}

if (!hasRailway) {
  console.log("Railway CLI not found");
  process.exit(0);
}

let status = "";
try {
  status = run("railway.cmd status");
} catch (error) {
  console.log("Railway CLI available but status unavailable");
  console.log(String(error));
  process.exit(0);
}

const identity = JSON.parse(fs.readFileSync(".ai-project/PROJECT_IDENTITY.json", "utf8"));
const expectedId = identity.expectedRailwayProjectId;
const expectedName = identity.expectedRailwayProjectName;
const expectedEnv = identity.expectedRailwayEnvironment;
const expectedService = identity.expectedRailwayService;

console.log("Railway status (read-only):");
console.log(status);

const checks = [
  ["projectId", expectedId],
  ["projectName", expectedName],
  ["environment", expectedEnv],
  ["service", expectedService]
];

for (const [label, expected] of checks) {
  if (typeof expected !== "string" || expected.startsWith("REPLACE_WITH_")) continue;
  if (!status.toLowerCase().includes(expected.toLowerCase())) {
    stop("Railway target mismatch", [`expected ${label}=${expected}`, "actual=not found in railway status output"]);
  }
}

console.log("Railway scope check passed");
