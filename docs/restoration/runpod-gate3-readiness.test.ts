import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-gate3-readiness.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const expectedDigest = "sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d";
const expectedSourceSha = "d664dcedf1b5278650e918b87bf504b3291a5f4b";
const expectedSubtree = "2a26bfcd06d6ba628ba58f89d979c024f9ee3962";
const tagPrefix = "ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-volume-restore-unpack-fix-cwd-dev:";
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
assert(manifest.weightsPresent === true, "weightsPresent must be true after remote verification");
assert(manifest.weightsVerified === true, "weightsVerified must be true after remote verification");
const remote = (manifest.remoteWeightVerification ?? {}) as Record<string, unknown>;
assert(String(remote.workflow) === "runpod-upload-gate3-weights.yml", "remote verification workflow mismatch");
assert(String(remote.run) === "30690211053", "remote verification run mismatch");
assert(Array.isArray(remote.objects) && remote.objects.length === 3, "three remote weight objects required");
for (const object of remote.objects as Array<Record<string, unknown>>) {
  assert(object.status === "uploaded-and-verified", "every remote weight must be uploaded and verified");
}

// Immutable image: tag AND digest both present and match
assert(typeof manifest.immutableImageTag === "string" && String(manifest.immutableImageTag).startsWith(tagPrefix), "immutable image tag missing/wrong");
assert(String(manifest.immutableImageDigest) === expectedDigest, "immutable digest mismatch");
assert(String(manifest.immutableImageTag).endsWith(":38e313fc54d87ebfa8b8ab9be9e224ad20f2dab6"), "tag must be pinned to the immutable publication tag");

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

const chain = manifest.immutableParentChain as Record<string, unknown>;
assert(chain.volumeMappedHandlerDigest === expectedDigest, "final parent-chain digest mismatch");
assert(chain.serverlessHandlerDigest === "sha256:af09003de27bbdfd1c7ef5bf83139dbbb7de2cee33dd015e900dee8a2b5d87d5", "handler parent digest mismatch");
assert(chain.cliWorkerDigest === "sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052", "CLI parent digest mismatch");
assert(manifest.publicationTag === "38e313fc54d87ebfa8b8ab9be9e224ad20f2dab6", "publication tag mismatch");

// Proposed one-job limits bounded and settled evidence controls
const proposed = (manifest.proposed ?? {}) as Record<string, unknown>;
assert(Number(proposed.maxRetries) <= 0, "proposed retries above 0 rejected");
assert(Number(proposed.maxJobs) <= 1, "proposed jobs above 1 rejected");
assert(proposed.weightsMounted === true, "proposed weights must be externally mounted");
assert(proposed.workersMin === 1 && proposed.workersMax === 1, "warm-worker bounds mismatch");
assert(proposed.gpuCount === 1 && proposed.flashboot === true, "GPU/FlashBoot controls mismatch");
assert(proposed.warmupTimeoutSeconds === 180 && proposed.executionTimeoutMs === 120000, "timeout controls mismatch");
assert(proposed.totalLifecycleSeconds === 295 && proposed.cleanupReserveSeconds === 10, "lifecycle controls mismatch");
assert(proposed.rateCeilingUsdPerSecond === 0.00016 && proposed.maximumLifecycleEstimateUsd === 0.0472, "cost ceiling mismatch");
assert(proposed.nonRootRuntime === true && proposed.safeLoading === true, "security controls missing");
assert(proposed.noBundledWeights === true && proposed.noRuntimeWeightDownload === true, "weight isolation controls missing");
assert(proposed.failClosedCleanup === true, "fail-closed cleanup missing");

const decision = (manifest.currentDecision ?? {}) as Record<string, unknown>;
assert(decision.classification === "READY_FOR_OWNER_APPROVAL", "current classification mismatch");
assert(decision.ownerApprovalGranted === true && decision.ownerDecisionRequired === false, "owner decision state mismatch");
assert(decision.ownerDecision === "APPROVE_GATE_3", "owner decision mismatch");
assert(decision.ownerDecisionDigest === expectedDigest, "owner decision digest mismatch");
assert(decision.technicalCanaryTrackBlocker === false, "technical blocker must be closed");
assert(decision.successfulCanaryRun === "30713365669", "successful canary mismatch");
assert(decision.seventhCanaryAuthorizationConsumed === true && decision.eighthDispatchAuthorized === false, "dispatch state mismatch");
assert(String(decision.gate2Status).includes("APPROVED/PUBLISHED/CONSUMED"), "Gate 2 status missing");
assert(decision.gate4Status === "prohibited", "Gate 4 must remain prohibited");
assert(decision.replicateStatus === "production", "Replicate must remain production");
assert(decision.routingActivationAuthorized === false, "routing activation must remain unauthorized");
assert(Array.isArray(decision.rollbackConditions) && decision.rollbackConditions.length >= 3, "rollback conditions missing");
assert(String(manifest.historicalStateNote).includes("append-only historical evidence"), "historical state boundary missing");

// New, separate Gate 2 candidate (outputSha256 contract fix) -- must never be
// confused with, or read as replacing, the Gate 3-approved candidate above.
const gate2Candidate = (manifest.gate2CandidateOutputSha256Fix ?? {}) as Record<string, unknown>;
assert(gate2Candidate.gate2Status === "PUBLISHED_AND_VERIFIED", "new candidate Gate 2 status mismatch");
assert(gate2Candidate.gate3Status === "NOT_REVIEWED", "new candidate must not claim Gate 3 review");
assert(gate2Candidate.approved === false, "new candidate must remain approved=false");
assert(gate2Candidate.productionEligible === false, "new candidate must not be production eligible");
assert(gate2Candidate.deployed === false && gate2Candidate.routed === false && gate2Candidate.endpointAuthorized === false, "new candidate must not be deployed, routed, or endpoint-authorized");
assert(gate2Candidate.runpodRoutingAuthorizedEnvFlag === false, "RUNPOD_ROUTING_AUTHORIZED must remain false for the new candidate");
assert(gate2Candidate.sourceCommit === "66b49028109351a9596b1170044ca15a1de8cd6c", "new candidate source commit mismatch");
assert(gate2Candidate.finalCandidateDigest === "sha256:44a42808c0ebdef72ea5b2914325016170701e489a6835f8433507566969781b", "new candidate final digest mismatch");
assert(gate2Candidate.finalCandidateDigest !== expectedDigest, "new candidate digest must differ from the protected Gate 3-approved digest");
const gate2WorkerTests = (gate2Candidate.workerTestResults ?? {}) as Record<string, unknown>;
assert(gate2WorkerTests.totalTests === 25 && gate2WorkerTests.passed === 25, "new candidate must record 25/25 worker tests passed");
assert(gate2WorkerTests.outputSha256TestsIncluded === true, "new candidate must confirm outputSha256 tests were included");
const gate2Images = gate2Candidate.publishedImages as Array<Record<string, unknown>>;
assert(Array.isArray(gate2Images) && gate2Images.length === 3, "new candidate must record exactly three published images");
for (const img of gate2Images) {
  assert(typeof img.digest === "string" && (img.digest as string).startsWith("sha256:"), "new candidate image must record a real digest");
  assert((img.repoTag as string).includes(":66b49028109351a9596b1170044ca15a1de8cd6c"), "new candidate repoTag must use the immutable source SHA tag");
}
assert(gate2Candidate.floatingTagUsed === false && gate2Candidate.latestTagCreatedOrChanged === false, "new candidate must not use a floating or latest tag");
assert(gate2Candidate.childStagesPinnedToParentDigest === true, "new candidate child stages must be pinned to parent digests");
const gate2Security = (gate2Candidate.securityScans ?? {}) as Record<string, unknown>;
assert(gate2Security.zeroCriticalAllThreeImages === true && gate2Security.cve202532434AbsentAllThreeImages === true, "new candidate security scan results missing or failing");
assert(gate2Candidate.noBundledWeights === true && gate2Candidate.noRuntimeWeightDownload === true, "new candidate weight isolation controls missing");
assert(gate2Candidate.noSecretsFound === true, "new candidate must confirm no secrets found");
assert(gate2Candidate.platform === "linux/amd64", "new candidate platform mismatch");
assert(gate2Candidate.deploymentOrRoutingAction === "none", "new candidate must record no deployment or routing action");
assert(gate2Candidate.gate4Status === "prohibited; not touched" && gate2Candidate.replicateStatus === "production; unaffected; no call made", "new candidate protected-state boundary missing");

console.log("runpod gate3 readiness manifest passed");
