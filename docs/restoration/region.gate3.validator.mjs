import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const evidencePath = path.join(__dirname, "runpod-region-evidence.json");
const assert = (cond, msg) => { if (!cond) throw new Error("region-evidence validator: " + msg); };

if (!fs.existsSync(evidencePath)) {
  console.log("runpod-region-evidence.json not present -> regionCompatibilityResolved remains false");
  // No evidence file is the "not resolved" state; this validator FAILS closed below.
  throw new Error("region evidence missing; regionCompatibilityResolved must be false");
}

const ev = JSON.parse(fs.readFileSync(evidencePath, "utf8"));

// Required fields
assert(ev.dataCenterId != null && String(ev.dataCenterId) !== "", "dataCenterId missing");
assert(ev.gpuPoolAvailable === true, "selected GPU pool availability not confirmed");
assert(ev.networkVolumeSameDc === true, "Network Volume availability in same DC not confirmed");
assert(ev.gpuRateUsdPerSecond != null && Number(ev.gpuRateUsdPerSecond) > 0, "selected GPU rate missing");
assert(ev.regionCompatibilityResolved === true, "region compatibility not resolved");

console.log("runpod region evidence validator passed");
