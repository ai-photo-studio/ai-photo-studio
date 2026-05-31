import { execSync } from "node:child_process";
import path from "node:path";

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const stop = (message, lines = []) => {
  console.error("STOP: PUSH GUARD BLOCKED");
  console.error(message);
  for (const line of lines) console.error(line);
  process.exit(1);
};

run("node scripts/verify-project-scope.mjs");

const remote = run("git remote get-url origin");
const branch = run("git branch --show-current");
const changed = run("git diff --name-only");
const staged = run("git diff --cached --name-only");

const files = [...new Set([...changed.split("\n"), ...staged.split("\n")].map((x) => x.trim()).filter(Boolean))];
const blocked = [];

const isBlocked = (f) => {
  const normalized = f.replace(/\\/g, "/").toLowerCase();
  if (normalized === ".env") return true;
  if (normalized.startsWith(".env.") && normalized !== ".env.project.example" && normalized !== ".env.example") return true;
  if (normalized.endsWith(".pem") || normalized.endsWith(".key")) return true;
  if (normalized.includes("secret") || normalized.includes("credential")) return true;
  if (normalized === "readme.md" || normalized.startsWith("docs/")) return true;
  if (normalized.endsWith(".md") && normalized !== ".ai-project/push_guard.md" && normalized !== ".ai-project/safe_commands.md") return true;
  if (normalized.startsWith("node_modules/") || normalized.includes("/node_modules/")) return true;
  if (normalized.startsWith("dist/") || normalized.includes("/dist/")) return true;
  if (normalized.startsWith("build/") || normalized.includes("/build/")) return true;
  if (normalized.startsWith("coverage/") || normalized.includes("/coverage/")) return true;
  if (normalized.startsWith("../") || path.isAbsolute(f)) return true;
  return false;
};

for (const file of files) {
  if (isBlocked(file)) blocked.push(file);
}

console.log(`remote=${remote}`);
console.log(`branch=${branch}`);
console.log("changedFiles=");
console.log(changed || "(none)");
console.log("stagedFiles=");
console.log(staged || "(none)");

if (blocked.length) stop("Blocked files detected", blocked.map((f) => `blocked=${f}`));
console.log("SAFE TO PUSH. Run git push manually or continue if user explicitly requested.");
