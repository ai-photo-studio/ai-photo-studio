const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

const cwd = process.cwd();
const lockPath = path.join(cwd, "PROJECT_LOCK.json");

if (!fs.existsSync(lockPath)) {
  console.error("Missing PROJECT_LOCK.json");
  process.exit(1);
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

console.log("");
console.log("========================================");
console.log("PROJECT IDENTITY");
console.log("========================================");
console.log("");
console.log(`Project Name: ${lock.projectName}`);
console.log(`Repository ID: ${lock.repositoryId || "N/A"}`);
console.log(`GitHub Repo: ${lock.expectedGitHubRepositoryUrl}`);
console.log(`Branch: ${lock.expectedBranch}`);
console.log(`Railway Project: ${lock.expectedRailwayProjectName}`);
console.log(`Railway Project ID: ${lock.expectedRailwayProjectId || "N/A"}`);
console.log(`Railway Environment: ${lock.expectedRailwayEnvironment}`);
console.log(`Railway Service: ${lock.expectedRailwayService}`);
console.log(`Deployment URL: ${lock.expectedDeploymentUrl || "N/A"}`);
console.log(`Cloudflare Account: ${lock.cloudflare?.accountName || "N/A"}`);
console.log("");
console.log("========================================");
console.log("DEPLOYMENT URL");
console.log("========================================");
console.log("");

const railwayStatus = run("railway status");
const urlMatch = railwayStatus.match(/https?:\/\/[^\s]+/g);
if (urlMatch) {
  for (const url of urlMatch) {
    console.log(`Deployment: ${url}`);
  }
} else {
  console.log("No deployment URL found (Railway may not be authenticated)");
}
console.log("");