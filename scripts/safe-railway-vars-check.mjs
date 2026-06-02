import fs from "node:fs";
import { execSync } from "node:child_process";

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
const paymentGatewayName = String(vars.PAYMENT_GATEWAY_NAME || "").toLowerCase();
const storageProvider = String(vars.STORAGE_PROVIDER || "").toLowerCase();
const aiProviderName = String(vars.AI_PROVIDER_NAME || "").toLowerCase();

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
const report = (key, required = true) => {
  const present = isPresent(key);
  console.log(`${key}=${present ? "PRESENT" : required ? "MISSING" : "SKIPPED"}`);
  return present;
};

console.log(`Railway variables check passed for project=${expectedProjectName}, environment=${expectedEnvironment}, service=${expectedService}`);

const alwaysRequired = ["NODE_ENV", "DATABASE_URL", "REDIS_URL", "WHATSAPP_VERIFY_TOKEN", "PAYMENT_GATEWAY_NAME", "STORAGE_PROVIDER", "AI_PROVIDER_NAME", "ADMIN_JWT_SECRET"];
for (const key of alwaysRequired) report(key, true);

if (paymentGatewayName !== "manual") {
  report("PAYMENT_GATEWAY_BASE_URL", true);
  report("PAYMENT_GATEWAY_SECRET", true);
} else {
  report("PAYMENT_GATEWAY_BASE_URL", false);
  report("PAYMENT_GATEWAY_SECRET", false);
}

if (storageProvider !== "mock") {
  report("R2_ACCOUNT_ID", true);
  report("R2_ACCESS_KEY_ID", true);
  report("R2_SECRET_ACCESS_KEY", true);
  report("R2_BUCKET_NAME", true);
  report("R2_PUBLIC_BASE_URL", true);
} else {
  report("R2_ACCOUNT_ID", false);
  report("R2_ACCESS_KEY_ID", false);
  report("R2_SECRET_ACCESS_KEY", false);
  report("R2_BUCKET_NAME", false);
  report("R2_PUBLIC_BASE_URL", false);
}

if (aiProviderName !== "mock") {
  report("AI_PROVIDER_API_KEY", true);
} else {
  report("AI_PROVIDER_API_KEY", false);
}
