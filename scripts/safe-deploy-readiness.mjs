import { execSync } from "node:child_process";

const run = (cmd) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

run("node scripts/verify-project-scope.mjs");
run("node scripts/safe-railway-check.mjs");
run("node scripts/safe-r2-check.mjs");
run("node scripts/safe-git-push.mjs");
run("npm.cmd run build");

console.log("\nDEPLOY READINESS CHECK PASSED (NO DEPLOY ACTIONS PERFORMED)");
