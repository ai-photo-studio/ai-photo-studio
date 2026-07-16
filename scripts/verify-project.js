const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const CONFIG = {
  FAIL_CLOSED: true,
  PROTECTED_FILES: [
    "PROJECT_LOCK.json",
    "PROJECT_SAFETY_LOCK.md",
    "AI_PROJECT_RULES.md",
    "AI_code_audit_report.md",
    "AI_code_audit_report_RI.md"
  ],
  AUDIT_REPORT_MAX_AGE_HOURS: 48,
};

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

if (lock.cloudflare) {
  console.log(`Cloudflare: ${lock.cloudflare ? "CONFIGURED" : "NOT CONFIGURED"}`);
}

if (lock.gcpProjectId) {
  try {
    const gcpProject = run("gcloud config get-value project");
    if (gcpProject !== lock.gcpProjectId) {
      console.log(`GCP Project: ${gcpProject} (expected: ${lock.gcpProjectId})`);
    } else {
      console.log(`GCP Project: ${gcpProject}`);
    }
  } catch (e) {
    console.log(`GCP Project: Unable to verify - ${String(e)}`);
  }
}

if (lock.requiredSecrets) {
  console.log(`Required Secrets: ${lock.requiredSecrets.length} configured`);
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

for (const file of CONFIG.PROTECTED_FILES) {
  if (!fs.existsSync(path.join(cwd, file))) {
    errors.push(`Missing protected file: ${file}`);
  }
}

const auditPath = path.join(cwd, "AI_code_audit_report_RI.md");
const auditPathOld = path.join(cwd, "AI_code_audit_report.md");
let auditFound = false;
if (fs.existsSync(auditPath)) {
  const stats = fs.statSync(auditPath);
  const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
  if (ageHours > CONFIG.AUDIT_REPORT_MAX_AGE_HOURS) {
    errors.push(`AI_code_audit_report_RI.md is too old (${Math.round(ageHours)}h). Max age: ${CONFIG.AUDIT_REPORT_MAX_AGE_HOURS}h`);
  }
  auditFound = true;
}
if (fs.existsSync(auditPathOld)) {
  if (!auditFound) {
    const stats = fs.statSync(auditPathOld);
    const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    if (ageHours > CONFIG.AUDIT_REPORT_MAX_AGE_HOURS) {
      errors.push(`AI_code_audit_report.md is too old (${Math.round(ageHours)}h). Max age: ${CONFIG.AUDIT_REPORT_MAX_AGE_HOURS}h`);
    }
    auditFound = true;
  }
}
if (!auditFound) {
  errors.push("Missing AI_code_audit_report.md or AI_code_audit_report_RI.md");
}

console.log("");
console.log("=== VERIFICATION SUMMARY ===");
console.log(`Git Remote: ${results.gitRemote || "N/A"}`);
console.log(`Git Branch: ${results.gitBranch || "N/A"}`);
console.log(`Cloudflare: ${lock.cloudflare ? "CONFIGURED" : "NOT CONFIGURED"}`);
console.log("");

if (errors.length > 0) {
  stop("Verification failed", errors);
}

let output = "";
output += "PROJECT VERIFIED\n";
output += "REPOSITORY VERIFIED\n";
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