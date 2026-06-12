const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const stop = (message, details = []) => {
  console.error("STOP: DATABASE PROTECTION BLOCKED");
  console.error(message);
  for (const line of details) console.error(line);
  process.exit(1);
};

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();

const cwd = process.cwd();
const lockPath = path.join(cwd, "PROJECT_LOCK.json");

if (!fs.existsSync(lockPath)) {
  stop("Missing PROJECT_LOCK.json");
}

const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));

if (!lock.databaseProtection || !lock.databaseProtection.enabled) {
  console.log("Database protection not enabled. Proceeding.");
  process.exit(0);
}

const dbProtection = lock.databaseProtection;
const command = process.argv[2] || "";

const blockedCommands = ["migrate", "db", "prisma", "schema", "seed"];
const isBlocked = blockedCommands.some(cmd => command.includes(cmd));

if (!isBlocked) {
  console.log("Non-database command. Proceeding.");
  process.exit(0);
}

if (dbProtection.requireUnlock) {
  const unlockFlag = process.argv.includes("--unlock");
  if (!unlockFlag && dbProtection.blockMigrations) {
    stop(
      "Database migration/blocker active",
      ["To proceed, use --unlock flag", `Command: ${command}`]
    );
  }
}

console.log("Database operation allowed with current protection settings.");