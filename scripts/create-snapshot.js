const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const cwd = process.cwd();
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

const snapshot = {
  timestamp,
  git: {
    remote: run("git remote get-url origin"),
    branch: run("git branch --show-current"),
    commit: run("git rev-parse HEAD"),
    message: run("git log -1 --pretty=%s")
  },
  railway: (() => {
    try {
      const status = run("railway status");
      return { status };
    } catch {
      return { status: "unavailable" };
    }
  })(),
  package: (() => {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    }
    return null;
  })()
};

const snapshotPath = path.join(cwd, "deployment_snapshot.json");
fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

console.log(`Deployment snapshot created: ${snapshotPath}`);
console.log(`Timestamp: ${timestamp}`);
console.log(`Git commit: ${snapshot.git.commit}`);
console.log(`Git branch: ${snapshot.git.branch}`);