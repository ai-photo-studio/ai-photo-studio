const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const cwd = process.cwd();
const snapshotPath = path.join(cwd, "deployment_snapshot.json");

if (!fs.existsSync(snapshotPath)) {
  console.error("No deployment snapshot found at deployment_snapshot.json");
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

console.log("========================================");
console.log("ROLLBACK HELPER");
console.log("========================================");
console.log("");
console.log("Snapshot found:");
console.log(`  Timestamp: ${snapshot.timestamp}`);
console.log(`  Git commit: ${snapshot.git.commit}`);
console.log(`  Git branch: ${snapshot.git.branch}`);
console.log(`  Git message: ${snapshot.git.message}`);
console.log("");

console.log("To rollback:");
console.log(`  git reset --hard ${snapshot.git.commit}`);
console.log(`  git push --force-with-lease origin ${snapshot.git.branch}`);
console.log("");

console.log("Or restore previous state:");
console.log(`  git checkout ${snapshot.git.commit}`);
console.log("");

const confirm = process.argv[2];
if (confirm !== "--execute") {
  console.log("Run with --execute to perform rollback");
  process.exit(0);
}

console.log("Performing rollback...");
execSync(`git reset --hard ${snapshot.git.commit}`);
execSync(`git push --force-with-lease origin ${snapshot.git.branch}`);
console.log("Rollback complete.");