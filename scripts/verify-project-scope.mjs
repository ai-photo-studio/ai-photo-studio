import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const stop = (message, details = []) => {
  console.error("STOP: PROJECT SCOPE CHECK FAILED");
  console.error(message);
  for (const line of details) console.error(line);
  process.exit(1);
};

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const cwd = process.cwd();
if (!fs.existsSync(cwd)) stop("Current working directory does not exist", [`actual=${cwd}`]);
if (!fs.existsSync(path.join(cwd, "package.json"))) stop("package.json is missing");

const identityPath = path.join(cwd, ".ai-project", "PROJECT_IDENTITY.json");
if (!fs.existsSync(identityPath)) stop("Missing .ai-project/PROJECT_IDENTITY.json");

const identity = JSON.parse(fs.readFileSync(identityPath, "utf8"));
const expectedSignature = "AI_PHOTO_STUDIO_WHATSAPP__GARDENSHOP__MAIN";
if (!identity.projectSignature || identity.projectSignature !== expectedSignature) {
  stop("Project signature mismatch", [`expected=${expectedSignature}`, `actual=${identity.projectSignature || ""}`]);
}

let remote = "";
let branch = "";
let status = "";
try {
  remote = run("git remote get-url origin");
  branch = run("git branch --show-current");
  status = run("git status --short");
} catch (error) {
  stop("Git command failed", [String(error)]);
}

if (remote !== identity.expectedGitRemote) {
  stop("Git remote mismatch", [`expected=${identity.expectedGitRemote}`, `actual=${remote}`]);
}
if (branch !== identity.expectedGitBranch) {
  stop("Git branch mismatch", [`expected=${identity.expectedGitBranch}`, `actual=${branch}`]);
}

const match = remote.match(/\/([^/]+)\.git$/);
const repo = match ? match[1] : "";
if (repo !== identity.expectedRepoName) {
  stop("Repository name mismatch", [`expected=${identity.expectedRepoName}`, `actual=${repo}`]);
}

console.log("PROJECT SCOPE VERIFIED");
console.log(`remote=${remote}`);
console.log(`branch=${branch}`);
console.log(`statusEntries=${status ? status.split("\n").length : 0}`);
