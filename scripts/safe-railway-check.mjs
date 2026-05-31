import fs from "node:fs";
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { encoding: "utf8" }).trim();
const runOptional = (cmd) => {
  try {
    return run(cmd);
  } catch {
    return null;
  }
};
const stop = (message, lines = []) => {
  console.error("STOP: RAILWAY GUARD BLOCKED");
  console.error(message);
  for (const line of lines) console.error(line);
  process.exit(1);
};

const isConfiguredValue = (value) => typeof value === "string" && value.length > 0 && !value.startsWith("REPLACE_WITH_");

const parseLinkedService = (statusOutput) => {
  const lines = statusOutput.split(/\r?\n/);
  const linkedSectionIndex = lines.findIndex((line) => line.trim().toLowerCase() === "linked service");
  if (linkedSectionIndex === -1) return "";

  for (let i = linkedSectionIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^[-\u2500\u2501\u2502]+$/.test(line)) break;
    if (/^all resources$/i.test(line)) break;
    if (/^service\s*:/i.test(line)) return line.replace(/^service\s*:/i, "").trim();
    return line;
  }

  return "";
};

run("node scripts/verify-project-scope.mjs");

let hasRailway = true;
try {
  run("railway.cmd --version");
} catch {
  hasRailway = false;
}

if (!hasRailway) {
  console.log("Railway CLI not found");
  process.exit(0);
}

let status = "";
try {
  status = run("railway.cmd status");
} catch (error) {
  const message = String(error);
  if (/unauthorized|login/i.test(message)) {
    console.log("Railway CLI is installed but not authenticated. Run: railway login");
    process.exit(0);
  }
  console.log("Railway CLI available but status unavailable");
  console.log(message);
  process.exit(0);
}

const identity = JSON.parse(fs.readFileSync(".ai-project/PROJECT_IDENTITY.json", "utf8"));
const expectedId = identity.expectedRailwayProjectId;
const expectedName = identity.expectedRailwayProjectName;
const expectedEnv = identity.expectedRailwayEnvironment;
const expectedService = identity.expectedRailwayService;
const deployTargets = JSON.parse(fs.readFileSync(".ai-project/DEPLOY_TARGETS.json", "utf8"));
const requiredServices = Array.isArray(deployTargets?.railway?.requiredServices)
  ? deployTargets.railway.requiredServices.filter((service) => typeof service === "string" && service.trim().length > 0)
  : [];

console.log("Railway status (read-only):");
console.log(status);

const checks = [
  ["projectId", expectedId],
  ["projectName", expectedName],
  ["environment", expectedEnv]
];

for (const [label, expected] of checks) {
  if (!isConfiguredValue(expected)) continue;
  if (!status.toLowerCase().includes(expected.toLowerCase())) {
    stop("Railway target mismatch", [`expected ${label}=${expected}`, "actual=not found in railway status output"]);
  }
}

const linkedService = parseLinkedService(status);

if (isConfiguredValue(expectedService)) {
  if (!linkedService) {
    stop("Unable to determine linked Railway service", ["actual=not found in railway status output"]);
  }
  if (linkedService.toLowerCase() !== expectedService.toLowerCase()) {
    stop("Railway service mismatch", [`expected service=${expectedService}`, `actual service=${linkedService}`]);
  }
} else {
  console.log("Warning: Railway service placeholder is not configured yet");
}

if (/^none$/i.test(linkedService) || /service:\s*none/i.test(status)) {
  console.log("Warning: Railway service is currently None in linked context");
}

if (requiredServices.length > 0) {
  const serviceListJson = runOptional("railway.cmd service list --json");
  if (!serviceListJson) {
    console.log("Warning: Unable to read Railway service list; required service verification skipped");
  } else {
    let listedServices = [];
    try {
      listedServices = JSON.parse(serviceListJson);
    } catch {
      console.log("Warning: Railway service list was not valid JSON; required service verification skipped");
      listedServices = [];
    }

    if (Array.isArray(listedServices) && listedServices.length > 0) {
      const available = listedServices
        .map((service) => String(service?.name || "").toLowerCase())
        .filter(Boolean);

      const missing = requiredServices.filter((required) => !available.includes(required.toLowerCase()));
      if (missing.length > 0) {
        stop("Required Railway services missing", [
          `required=${requiredServices.join(",")}`,
          `missing=${missing.join(",")}`
        ]);
      }
      console.log(`Railway required services check passed (${requiredServices.join(", ")})`);
    } else if (Array.isArray(listedServices)) {
      stop("Required Railway services missing", [
        `required=${requiredServices.join(",")}`,
        "available=(none)"
      ]);
    }
  }
}

console.log("Railway scope check passed");
