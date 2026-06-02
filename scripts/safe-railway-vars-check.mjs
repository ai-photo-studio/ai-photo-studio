import fs from "node:fs";
import { execSync } from "node:child_process";

const REQUIRED_VARS = [
  "NODE_ENV",
  "PORT",
  "DATABASE_URL",
  "REDIS_URL",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "PAYMENT_GATEWAY_NAME",
  "PAYMENT_GATEWAY_BASE_URL",
  "PAYMENT_GATEWAY_SECRET",
  "STORAGE_PROVIDER",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_BASE_URL",
  "AI_PROVIDER_NAME",
  "AI_PROVIDER_API_KEY",
  "ADMIN_JWT_SECRET"
];

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const stop = (message, lines = []) => {
  console.error("STOP: RAILWAY VARS CHECK BLOCKED");
  console.error(message);
  for (const line of lines) console.error(line);
  process.exit(1);
};

const hasCommand = (cmd) => {
  try {
    run(cmd);
    return true;
  } catch {
    return false;
  }
};

run("node scripts/verify-project-scope.mjs");
run("node scripts/safe-railway-check.mjs");

if (!hasCommand("railway.cmd --version")) {
  console.log("Railway CLI not found");
  process.exit(0);
}

const identity = JSON.parse(fs.readFileSync(".ai-project/PROJECT_IDENTITY.json", "utf8"));
const deployTargets = JSON.parse(fs.readFileSync(".ai-project/DEPLOY_TARGETS.json", "utf8"));
const expectedProjectId = identity.expectedRailwayProjectId;
const expectedProjectName = identity.expectedRailwayProjectName;
const expectedEnvironment = deployTargets?.railway?.environment || identity.expectedRailwayEnvironment;
const expectedService = deployTargets?.railway?.service || identity.expectedRailwayService;

let rawJson = "";
try {
  rawJson = run(
    `railway.cmd variable list --service "${expectedService}" --environment "${expectedEnvironment}" --json`
  );
} catch (error) {
  const message = String(error);
  if (/unauthorized|login/i.test(message)) {
    console.log("Railway CLI is installed but not authenticated. Run: railway login");
    process.exit(0);
  }
  stop("Unable to read Railway variables safely", [message]);
}

let vars = {};
try {
  vars = JSON.parse(rawJson);
} catch (error) {
  stop("Railway variable output was not valid JSON", [String(error)]);
}

if (!vars || typeof vars !== "object" || Array.isArray(vars)) {
  stop("Railway variable output was not a key/value object");
}

const projectId = String(vars.RAILWAY_PROJECT_ID || "");
const projectName = String(vars.RAILWAY_PROJECT_NAME || "");
const environmentName = String(vars.RAILWAY_ENVIRONMENT_NAME || vars.RAILWAY_ENVIRONMENT || "");
const serviceName = String(vars.RAILWAY_SERVICE_NAME || "");

if (expectedProjectId && projectId && projectId.toLowerCase() !== expectedProjectId.toLowerCase()) {
  stop("Railway project mismatch", [`expected projectId=${expectedProjectId}`, `actual projectId=${projectId}`]);
}

if (expectedProjectName && projectName && projectName.toLowerCase() !== expectedProjectName.toLowerCase()) {
  stop("Railway project name mismatch", [`expected projectName=${expectedProjectName}`, `actual projectName=${projectName}`]);
}

if (expectedEnvironment && environmentName && environmentName.toLowerCase() !== expectedEnvironment.toLowerCase()) {
  stop("Railway environment mismatch", [`expected environment=${expectedEnvironment}`, `actual environment=${environmentName}`]);
}

if (expectedService && serviceName && serviceName.toLowerCase() !== expectedService.toLowerCase()) {
  stop("Railway service mismatch", [`expected service=${expectedService}`, `actual service=${serviceName}`]);
}

const isPresent = (key) => Object.prototype.hasOwnProperty.call(vars, key) && String(vars[key] ?? "").length > 0;
console.log(`Railway variables check passed for project=${expectedProjectName}, environment=${expectedEnvironment}, service=${expectedService}`);
for (const key of REQUIRED_VARS) {
  console.log(`${key}=${isPresent(key) ? "PRESENT" : "MISSING"}`);
}
