import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-gate3-readiness.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const expectedDigest = "sha256:1a74aefec1a7f77ebdbf7fd19ba2b9a816600f1e3d43ac7ce10b3b87367a3895";
const expectedSourceSha = "21e292103979f0450dffafe09844fac3b435031b";
const expectedSubtree = "b9402fa975e59ddc245985712b426ae63019761b";
const tagPrefix = "ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-dev:";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

// Executable fail-closed state
assert(manifest.approved === false, "readiness must remain unapproved");
assert(manifest.endpointId === "" && manifest.templateId === "", "endpoint/template must be missing");
assert(manifest.gpuType === "", "gpu type must be missing");
assert(manifest.verifiedRateUsdPerSecond == null && manifest.budgetUsd == null, "rate and budget must be missing");
assert(manifest.maxJobs === 0, "maxJobs must be zero (executable)");
assert(manifest.maxRetries === 0, "retries must be zero");
assert(manifest.timeoutSeconds === 120, "timeout must be 120 seconds");
assert(manifest.concurrency === 1, "concurrency must be one");
assert(manifest.productionRoutingAllowed === false, "production routing must be disabled");

// Immutable image: tag AND digest must both be present and match (reject tag-without-digest)
assert(typeof manifest.immutableImageTag === "string" && String(manifest.immutableImageTag).startsWith(tagPrefix), "immutable image tag missing/wrong");
assert(typeof manifest.immutableImageDigest === "string" && String(manifest.immutableImageDigest).startsWith("sha256:"), "immutable image digest missing");
assert(String(manifest.immutableImageDigest) === expectedDigest, "immutable digest mismatch");
assert(String(manifest.immutableImageTag).endsWith(`:${expectedSourceSha}`), "tag must be pinned to the approved source SHA");

// Source/subtree must match
assert(String(manifest.sourceSha) === expectedSourceSha, "source SHA mismatch");
assert(String(manifest.candidateSubtree) === expectedSubtree, "candidate subtree mismatch");

// Registry access decision must be present (reject missing/unresolved)
assert(typeof manifest.registryAccessDecision === "string" && manifest.registryAccessDecision !== "", "registry-access decision missing");
assert(manifest.registryAccessDecision !== "unverified", "registry access must be resolved (public or credentialed)");

// GPU/volume region compatibility decision must be present
assert(typeof manifest.gpuVolumeRegionCompatibility === "string" && manifest.gpuVolumeRegionCompatibility !== "", "GPU/volume region compatibility missing");
assert(manifest.gpuVolumeRegionCompatibility !== "unverified", "GPU/volume region compatibility must be resolved");

// Proposed one-job limits must be bounded
const proposed = (manifest.proposed ?? {}) as Record<string, unknown>;
assert(Number(proposed.maxRetries) <= 0, "proposed retries above 0 rejected");
assert(Number(proposed.maxJobs) <= 1, "proposed jobs above 1 rejected");
assert(typeof proposed.weightsMounted === "boolean" && proposed.weightsMounted === true, "proposed weights must be externally mounted");

console.log("runpod gate3 readiness manifest passed");
