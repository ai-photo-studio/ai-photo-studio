import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-gate3-readiness.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const expectedDigest = "sha256:2ae480156b955e10d5c678aa5600e23ae22139bf8cba78b9bf2144c1f96d1278";
const expectedSourceSha = "9926ae6d1ff87e64c805e86c6d66e9c8ca6c2eb7";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(manifest.approved === false, "readiness must remain unapproved");
assert(manifest.endpointId === "" && manifest.templateId === "", "endpoint/template must be missing");
assert(manifest.gpuType === "", "gpu type must be missing");
assert(manifest.verifiedRateUsdPerSecond == null && manifest.budgetUsd == null, "rate and budget must be missing");
assert(manifest.maxJobs === 0, "maxJobs must be zero");
assert(manifest.maxRetries === 0, "retries must be zero");
assert(manifest.timeoutSeconds === 120, "timeout must be 120 seconds");
assert(manifest.concurrency === 1, "concurrency must be one");
assert(manifest.productionRoutingAllowed === false, "production routing must be disabled");
assert(manifest.immutableImageDigest === expectedDigest, "immutable digest mismatch");
assert(manifest.sourceSha === expectedSourceSha, "source SHA mismatch");

if (manifest.approved !== false) throw new Error("approval flag must be false");
if (manifest.approved === true && (!manifest.endpointId || !manifest.templateId)) throw new Error("endpoint/template required for approval");
if (manifest.approved === true && !manifest.gpuType) throw new Error("gpu type required for approval");
if (manifest.approved === true && (manifest.verifiedRateUsdPerSecond == null || manifest.budgetUsd == null)) throw new Error("rate and budget required for approval");
if (manifest.maxJobs !== 0) throw new Error("maxJobs must remain zero");
if (manifest.maxRetries !== 0) throw new Error("retries must remain zero");
if (manifest.productionRoutingAllowed !== false) throw new Error("production routing must stay disabled");
if (manifest.immutableImageDigest !== expectedDigest) throw new Error("digest mismatch");

console.log("runpod gate3 readiness manifest passed");
