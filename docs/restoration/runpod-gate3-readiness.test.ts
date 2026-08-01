import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-gate3-readiness.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const expectedDigest = "sha256:29ca5aa0aae46ab03719c52ae25fa98a61830adbbc8b317bd244ffb7ff837d9b";
const expectedSourceSha = "158bbbcb82b02db0ca0a2e66bc88a2ccfdb6e374";
const expectedSubtree = "716fc09fc35bb966637bef26f3d4840a7088891b";
const tagPrefix = "ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-dev:";
const expectedPngSha = "f4368b08487cfc366f049becbcbc63c7e2345808902021639e051b9c3e08cc1f";

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
assert(manifest.weightsPresent === false, "weightsPresent must remain false");
assert(manifest.weightsVerified === false, "weightsVerified must remain false");

// Immutable image: tag AND digest both present and match
assert(typeof manifest.immutableImageTag === "string" && String(manifest.immutableImageTag).startsWith(tagPrefix), "immutable image tag missing/wrong");
assert(String(manifest.immutableImageDigest) === expectedDigest, "immutable digest mismatch");
assert(String(manifest.immutableImageTag).endsWith(`:${expectedSourceSha}`), "tag must be pinned to the approved source SHA");

// Source/subtree must match
assert(String(manifest.sourceSha) === expectedSourceSha, "source SHA mismatch");
assert(String(manifest.candidateSubtree) === expectedSubtree, "candidate subtree mismatch");

// Registry access must be resolved (now public)
assert(manifest.registryAccessDecision !== "" && manifest.registryAccessDecision !== "unverified", "registry access must be resolved");
assert(manifest.registryAccessDecision === "public", "registry access must be public (anonymous pull had succeeded)");

// Region compatibility must be resolved (remaining blocker)
assert(typeof manifest.regionCompatibilityResolved === "boolean", "regionCompatibilityResolved missing");
assert(manifest.regionCompatibilityResolved === true, "region/volume compatibility not resolved");

// Canary fixture evidence must be present and verified
const fx = (manifest.canaryFixture ?? {}) as Record<string, unknown>;
assert(typeof fx.generator === "string" && String(fx.generator).endsWith("gen_canary_face_fixture.py"), "fixture generator missing");
assert(String(fx.pngSha256) === expectedPngSha, "fixture PNG checksum drift");
assert(Number(fx.verifiedOffline) === true || fx.verifiedOffline === true, "fixture offline verification missing");
assert(Number(fx.faces) >= 1, "fixture must produce a face-processing result");

// Proposed one-job limits bounded
const proposed = (manifest.proposed ?? {}) as Record<string, unknown>;
assert(Number(proposed.maxRetries) <= 0, "proposed retries above 0 rejected");
assert(Number(proposed.maxJobs) <= 1, "proposed jobs above 1 rejected");
assert(proposed.weightsMounted === true, "proposed weights must be externally mounted");

console.log("runpod gate3 readiness manifest passed");
