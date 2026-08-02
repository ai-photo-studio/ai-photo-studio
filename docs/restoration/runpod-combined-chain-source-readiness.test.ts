import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const exists = (relative: string) => fs.existsSync(path.join(root, relative));

const manifest = JSON.parse(read("docs/restoration/runpod-combined-chain-source-readiness.json")) as Record<string, any>;
const gate3Readiness = JSON.parse(read("docs/restoration/runpod-gate3-readiness.json")) as Record<string, any>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const REJECTED_DIGEST = "sha256:44a42808c0ebdef72ea5b2914325016170701e489a6835f8433507566969781b";
const PROTECTED_DIGEST = "sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d";

// ---- Manifest-level executable state -------------------------------------
assert(manifest.sourceOnly === true, "combined chain must be recorded as source-only");
assert(manifest.built === false && manifest.published === false && manifest.deployed === false, "combined chain must not be built, published, or deployed");
assert(manifest.endpointCreated === false, "combined chain must not have created an endpoint");
assert(manifest.gate2Status === "NOT_STARTED", "combined chain Gate 2 status must be NOT_STARTED");
assert(manifest.gate3Status === "NOT_REVIEWED", "combined chain Gate 3 status must be NOT_REVIEWED");
assert(manifest.approved === false, "combined chain must remain unapproved");
assert(manifest.newDigestExists === false, "no new digest may exist for the combined chain");
assert(manifest.buildOrPublishDispatchedInThisTask === false, "no build or publish may have been dispatched");
assert(manifest.runpodRoutingAuthorizedEnvFlag === false, "RUNPOD_ROUTING_AUTHORIZED must remain false");
assert(manifest.gate4Status === "prohibited; not touched", "Gate 4 boundary missing");
assert(manifest.replicateStatus === "production; unaffected; no call made", "Replicate boundary missing");

// ---- Chain: exactly three roles, source verified to exist and contain the fix ----
const chain = manifest.chain as Array<Record<string, unknown>>;
assert(Array.isArray(chain) && chain.length === 3, "combined chain must record exactly three roles");
assert(chain[0].role === "1-cli-worker" && chain[1].role === "2-serverless-handler-combined" && chain[2].role === "3-volume-mapped-handler-combined", "chain role order mismatch");

for (const link of chain) {
  const dirPath = link.path as string;
  assert(exists(dirPath), `${link.role}: directory must exist: ${dirPath}`);
}

// CLI worker (reused, unchanged) must carry the outputSha256 fix.
const cliWorkerSrc = read(path.posix.join(chain[0].path as string, "worker.py"));
assert(cliWorkerSrc.includes('"outputSha256": output_sha256'), "CLI worker must carry the outputSha256 fix");
assert((chain[0] as any).reusedUnchanged === true, "CLI worker must be recorded as reused unchanged");

// Combined Serverless handler must carry the cwd fix and derive from the local CLI tag.
const combinedHandlerSrc = read(path.posix.join(chain[1].path as string, "handler.py"));
assert(combinedHandlerSrc.includes("cwd=WORKER_DIR"), "combined Serverless handler must carry the cwd=WORKER_DIR fix");
assert(combinedHandlerSrc.includes("WORKER_DIR = os.path.dirname(WORKER[1])"), "combined Serverless handler must derive WORKER_DIR, not hardcode it");
const combinedServerlessDockerfile = read(path.posix.join(chain[1].path as string, "Dockerfile"));
assert(combinedServerlessDockerfile.includes("FROM gfpgan-cli-restore-fix:local"), "combined Serverless Dockerfile must build from the local CLI worker tag");
assert(!combinedServerlessDockerfile.includes("ghcr.io"), "combined Serverless Dockerfile must not reference any published registry digest");

// Combined volume-mapped Dockerfile must derive from the combined Serverless local tag.
const combinedVolumeDockerfile = read(path.posix.join(chain[2].path as string, "Dockerfile"));
assert(combinedVolumeDockerfile.includes("FROM gfpgan-serverless-restore-fix-combined:local"), "combined volume-mapped Dockerfile must build from the combined Serverless local tag");
assert(combinedVolumeDockerfile.includes("/models -> /runpod-volume/models") || combinedVolumeDockerfile.includes("ln -s /runpod-volume/models /models"), "combined volume-mapped Dockerfile must carry the symlink contract");

// Plain (non-cwd) handler must remain the known-regressed baseline (never itself patched by this task).
const plainHandlerSrc = read("apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-dev/handler.py");
assert(!plainHandlerSrc.includes("cwd=WORKER_DIR"), "the plain (rejected-candidate) handler must remain unpatched -- it is superseded by the combined candidate, not edited in place");

// ---- Rejected Gate 3 candidate: exact, unambiguous, and consistent with the Gate 2 record ----
const rejected = manifest.rejectedGate3Candidate as Record<string, unknown>;
assert(rejected.digest === REJECTED_DIGEST, "rejected candidate digest mismatch");
assert(rejected.gate3Eligible === false, "rejected candidate must be marked Gate 3 ineligible");
assert(String(rejected.reason).toLowerCase().includes("cwd=worker_dir"), "rejection reason must cite the missing cwd=WORKER_DIR fix");
assert(rejected.gate2StatusUnchanged === "PUBLISHED_AND_VERIFIED", "rejected candidate's Gate 2 status must remain unchanged");

const gate2Candidate = (gate3Readiness.gate2CandidateOutputSha256Fix ?? {}) as Record<string, unknown>;
assert(gate2Candidate.finalCandidateDigest === REJECTED_DIGEST, "rejected candidate digest must match the recorded Gate 2 candidate digest");
assert(gate2Candidate.gate2Status === "PUBLISHED_AND_VERIFIED", "existing Gate 2 record for the rejected candidate must remain unchanged");
assert(gate2Candidate.gate3Status === "NOT_REVIEWED", "existing Gate 3 status for the rejected candidate must remain unchanged (NOT_REVIEWED, not now marked ineligible in that record)");

// ---- Protected digest: untouched ----
const protectedRecord = manifest.protectedDigestUnchanged as Record<string, unknown>;
assert(protectedRecord.digest === PROTECTED_DIGEST, "protected digest reference mismatch");
assert(gate3Readiness.immutableImageDigest === PROTECTED_DIGEST, "the canonical readiness record's protected digest must remain unchanged");
assert(gate3Readiness.approved === false, "the protected digest's Gate 3 approved flag must remain false");
assert(REJECTED_DIGEST !== PROTECTED_DIGEST, "rejected and protected digests must never be conflated");

// ---- Test evidence recorded matches what this task actually ran ----
assert((chain[0] as any).testResults.totalTests === 25 && (chain[0] as any).testResults.passed === 25, "CLI worker test evidence mismatch");
assert((chain[1] as any).testResults.totalTests === 40 && (chain[1] as any).testResults.passed === 40, "combined handler test evidence mismatch");

console.log("runpod combined-chain source-only readiness validator passed");
