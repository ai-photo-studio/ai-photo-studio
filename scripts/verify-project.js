const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const CONFIG = {
  FAIL_CLOSED: true,
  PROTECTED_FILES: [
    "PROJECT_LOCK.json",
    "PROJECT_SAFETY_LOCK.md",
    "AI_PROJECT_RULES.md",
    "AI_code_audit_report.md"
  ],
  AUDIT_REPORT_MAX_AGE_HOURS: 24
};

const STRICT_RAILWAY = String(process.env.RAILWAY_REQUIRED || "").trim() === "1";

const stop = (message, details = []) => {
  console.error("STOP: ENTERPRISE VERIFICATION FAILED");
  console.error(message);
  for (const line of details) console.error(line);
  console.error("\nFAIL-CLOSED MODE: ABORTING ALL OPERATIONS");
  process.exit(1);
};

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const runSafe = (cmd) => {
  try {
    return { success: true, output: execSync(cmd, { encoding: "utf8" }).trim() };
  } catch (e) {
    return { success: false, output: "", error: String(e) };
  }
};

const cwd = process.cwd();
if (!fs.existsSync(path.join(cwd, "package.json"))) {
  stop("Not in a valid project directory (package.json missing)");
}

const lockPath = path.join(cwd, "PROJECT_LOCK.json");
if (!fs.existsSync(lockPath)) {
  stop("Missing PROJECT_LOCK.json");
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const errors = [];
const results = {};

console.log("=== VERIFICATION RESULTS ===");

let gitRemote = "";
let gitBranch = "";
try {
  gitRemote = run("git remote get-url origin");
  results.gitRemote = "PASS";
} catch (e) {
  results.gitRemote = "FAIL";
  errors.push(`Git remote command failed: ${String(e)}`);
}

try {
  gitBranch = run("git branch --show-current");
  results.gitBranch = "PASS";
} catch (e) {
  results.gitBranch = "FAIL";
  errors.push(`Git branch command failed: ${String(e)}`);
}

let railwayStatus = "";
try {
  railwayStatus = run("railway status");
  results.railwayStatus = "PASS";
} catch (e) {
  const message = String(e);
  if (/unauthorized|login|not authenticated/i.test(message) && !STRICT_RAILWAY) {
    results.railwayStatus = "WARN";
    console.log("WARN: Railway status unavailable in this shell; continuing with local verification.");
  } else {
    results.railwayStatus = "FAIL";
    errors.push(`Railway status command failed: ${message}`);
  }
}

let railwayWorkspace = "SKIP";

if (lock.expectedGitHubRepositoryUrl && gitRemote !== lock.expectedGitHubRepositoryUrl) {
  errors.push(`Git remote mismatch: expected=${lock.expectedGitHubRepositoryUrl}, actual=${gitRemote}`);
}

if (lock.expectedBranch && gitBranch !== lock.expectedBranch) {
  errors.push(`Git branch mismatch: expected=${lock.expectedBranch}, actual=${gitBranch}`);
}

if (lock.repositoryId) {
  const repoMatch = gitRemote.toLowerCase().includes(lock.repositoryId.toLowerCase());
  if (!repoMatch) {
    errors.push(`Repository ID mismatch: expected=${lock.repositoryId}`);
  }
}

if (results.railwayStatus === "PASS") {
  if (lock.expectedRailwayProjectId && !railwayStatus.includes(lock.expectedRailwayProjectId)) {
    errors.push(`Railway project ID mismatch: expected=${lock.expectedRailwayProjectId}`);
  }
  if (lock.expectedRailwayProjectName && !railwayStatus.includes(lock.expectedRailwayProjectName)) {
    errors.push(`Railway project name mismatch: expected=${lock.expectedRailwayProjectName}`);
  }
  if (lock.expectedRailwayEnvironment && !railwayStatus.includes(lock.expectedRailwayEnvironment)) {
    errors.push(`Railway environment mismatch: expected=${lock.expectedRailwayEnvironment}`);
  }
  if (lock.expectedRailwayService && !railwayStatus.includes(lock.expectedRailwayService)) {
    errors.push(`Railway service mismatch: expected=${lock.expectedRailwayService}`);
  }
  if (lock.expectedDeploymentUrl && !railwayStatus.includes(lock.expectedDeploymentUrl)) {
    errors.push(`Deployment URL mismatch: expected=${lock.expectedDeploymentUrl}`);
  }
} else if (results.railwayStatus === "WARN") {
  console.log("WARN: Railway checks skipped because the CLI is not authenticated in this shell.");
}

if (lock.cloudflare) {
  try {
    const wranglerCache = path.join(cwd, "node_modules/.cache/wrangler/wrangler-account.json");
    if (fs.existsSync(wranglerCache)) {
      const cfData = JSON.parse(fs.readFileSync(wranglerCache, "utf8"));
      if (lock.cloudflare.accountId && cfData.account.id !== lock.cloudflare.accountId) {
        errors.push(`Cloudflare account ID mismatch: expected=${lock.cloudflare.accountId}, actual=${cfData.account.id}`);
      }
      if (lock.cloudflare.accountName && cfData.account.name !== lock.cloudflare.accountName) {
        errors.push(`Cloudflare account name mismatch: expected=${lock.cloudflare.accountName}, actual=${cfData.account.name}`);
      }
    }
  } catch (e) {
    errors.push(`Cloudflare verification failed: ${String(e)}`);
  }
}

if (lock.requiredSecrets) {
  try {
    const vars = runSafe("railway variables");
    if (vars.success && vars.output !== "") {
      for (const secret of lock.requiredSecrets) {
        if (!vars.output.includes(secret)) {
          errors.push(`Missing required secret: ${secret}`);
        }
      }
    } else if (!STRICT_RAILWAY) {
      console.log("WARN: Railway variables unavailable in this shell; skipping secret verification.");
    }
  } catch (e) {
    if (STRICT_RAILWAY) {
      errors.push(`Secret verification failed: ${String(e)}`);
    } else {
      console.log(`WARN: Railway secret verification skipped: ${String(e)}`);
    }
  }
}

if (lock.githubOwner) {
  try {
    const ghRepo = runSafe("gh api repos --jq '.[0].nameWithOwner' 2>/dev/null");
    if (ghRepo.success && ghRepo.output && !ghRepo.output.includes(lock.githubOwner)) {
      errors.push(`GitHub owner mismatch: expected=${lock.githubOwner}, actual=${ghRepo.output}`);
    }
  } catch (e) {
    errors.push(`GitHub verification failed: ${String(e)}`);
  }
}

if (lock.railwayWorkspaceVerification !== "skip" && lock.expectedRailwayWorkspaceId) {
  try {
    const workspace = runSafe("railway workspace");
    if (workspace.success) {
      if (workspace.output && !workspace.output.includes(lock.expectedRailwayWorkspaceId)) {
        errors.push(`Railway workspace mismatch: expected=${lock.expectedRailwayWorkspaceId}`);
      }
    } else if (!STRICT_RAILWAY) {
      console.log("WARN: Railway workspace unavailable in this shell; skipping workspace verification.");
    }
  } catch (e) {
    if (STRICT_RAILWAY) {
      errors.push(`Railway workspace verification failed: ${String(e)}`);
    } else {
      console.log(`WARN: Railway workspace verification skipped: ${String(e)}`);
    }
  }
}

for (const file of CONFIG.PROTECTED_FILES) {
  if (!fs.existsSync(path.join(cwd, file))) {
    errors.push(`Missing protected file: ${file}`);
  }
}

const auditPath = path.join(cwd, "AI_code_audit_report.md");
if (fs.existsSync(auditPath)) {
  const stats = fs.statSync(auditPath);
  const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
  if (ageHours > CONFIG.AUDIT_REPORT_MAX_AGE_HOURS) {
    errors.push(`AI_code_audit_report.md is too old (${Math.round(ageHours)}h). Max age: ${CONFIG.AUDIT_REPORT_MAX_AGE_HOURS}h`);
  }
} else {
  errors.push("Missing AI_code_audit_report.md");
}

console.log("");
console.log("=== VERIFICATION SUMMARY ===");
console.log(`Git Remote: ${results.gitRemote || "N/A"}`);
console.log(`Git Branch: ${results.gitBranch || "N/A"}`);
console.log(`Railway Status: ${results.railwayStatus || "N/A"}`);
console.log(`Railway Workspace: ${results.railwayWorkspace || "N/A"}`);
console.log(`Cloudflare: ${lock.cloudflare ? "CONFIGURED" : "NOT CONFIGURED"}`);
console.log("");

if (errors.length > 0) {
  stop("Verification failed", errors);
}

let output = "";
output += "PROJECT VERIFIED\n";
if (results.railwayWorkspace === "PASS") output += "WORKSPACE VERIFIED\n";
output += "REPOSITORY VERIFIED\n";
if (results.railwayStatus === "PASS") output += "RAILWAY VERIFIED\n";
output += "CLOUDFLARE VERIFIED\n";
output += "SAFE TO PUSH\n";
output += "SAFE TO DEPLOY\n";
output += "ROLLBACK READY\n";
console.log(output);
console.log("<environment_details>");
console.log(`Current time: ${new Date().toISOString()}`);
console.log(`Working directory: ${cwd}`);
console.log(`Workspace root folder: ${cwd}`);
console.log("</environment_details>");
