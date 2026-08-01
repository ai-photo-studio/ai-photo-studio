import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-restore-unpack-fix-chain-gate2-readiness.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

// Fail-closed executable state: this is a readiness review, not an approval.
assert(manifest.approved === false, "approved must remain false (readiness review only)");
assert(manifest.publicationAllowed === false, "publicationAllowed must remain false");
assert(manifest.gate3ExecutionAllowed === false, "gate3ExecutionAllowed must remain false");
assert(manifest.productionRoutingAllowed === false, "productionRoutingAllowed must remain false");
assert(manifest.gpuInferenceExecuted === false, "gpuInferenceExecuted must be false (build-only)");
assert(manifest.runpodApiCalls === 0, "runpodApiCalls must be 0");
assert(manifest.runpodResourcesCreated === "none", "runpodResourcesCreated must be none");
assert(manifest.imagesPublished === "none", "imagesPublished must be none");

// Root cause fix
const fix = (manifest.rootCauseFix ?? {}) as Record<string, unknown>;
assert(String(fix.fix).includes("_, _, out = model.enhance"), "must record the exact one-line fix");
assert(Array.isArray(fix.affectedCanaries) && (fix.affectedCanaries as string[]).length === 2, "must record both affected canary runs");

// Chain: exactly 3 images, each derived from the previous by LOCAL reference, each unpublished
const chain = manifest.chain as Array<Record<string, unknown>>;
assert(Array.isArray(chain) && chain.length === 3, "chain must contain exactly three images");
assert(chain[0].role === "1-cli-worker", "first chain link must be the CLI worker");
assert(chain[1].role === "2-serverless-handler", "second chain link must be the Serverless handler");
assert(chain[2].role === "3-volume-mapped-handler", "third chain link must be the volume-mapped handler");

assert(typeof chain[0].parentImage === "string" && (chain[0].parentImage as string).includes("ubuntu:22.04@sha256:"), "CLI worker must derive from the pinned ubuntu base");
assert(typeof chain[1].parentImage === "string" && (chain[1].parentImage as string).includes("gfpgan-cli-restore-fix:local"), "Serverless handler must derive from the CLI worker by local reference");
assert(typeof chain[2].parentImage === "string" && (chain[2].parentImage as string).includes("gfpgan-serverless-restore-fix:local"), "volume-mapped handler must derive from the Serverless handler by local reference");

for (const link of chain) {
  assert(link.runtimeUser === "workeruser", `${link.role}: runtime user must be workeruser`);
  assert(link.zeroCritical === true, `${link.role}: must have zero CRITICAL vulnerabilities`);
  assert(link.cve202532434Absent === true, `${link.role}: CVE-2025-32434 must be absent`);
  assert(typeof link.localBuildImageId === "string" && (link.localBuildImageId as string).startsWith("sha256:"), `${link.role}: must record a local build image ID`);
  assert(typeof link.sbomComponents === "number" && (link.sbomComponents as number) > 0, `${link.role}: must record SBOM component count`);
  const proposed = (link.proposedPublication ?? {}) as Record<string, unknown>;
  assert(proposed.expectedDigest === "", `${link.role}: expected digest must remain empty until publication`);
  assert(proposed.floatingTagAllowed === false, `${link.role}: floating tags must not be allowed`);
}

assert(chain[0].oneLineFixVerified === true, "CLI worker readiness must confirm the one-line fix");
assert(chain[2].correctedWorkerVerifiedEndToEnd === true, "volume-mapped handler must verify the corrected worker end to end");
assert(chain[2].oldBuggyDigestRejected === true, "volume-mapped handler must confirm the old buggy digest is not inherited");

const mountTests = (chain[2].mountContractTests ?? {}) as Record<string, unknown>;
for (const key of ["testAValidMapping", "testBMissingVolumeFailsClosed", "testInvalidWeightFailsClosed", "testDSecurity", "symlinkNotRuntimeWritable"]) {
  assert(String(mountTests[key]).startsWith("PASS"), `mount contract test ${key} must PASS`);
}

// Build-only workflow runs: first failed (workflow bug, zero cost), second succeeded
const runs = manifest.buildOnlyWorkflowRuns as Array<Record<string, unknown>>;
assert(Array.isArray(runs) && runs.length === 2, "must record both build-only workflow dispatch attempts");
assert(runs[0].conclusion === "failure" && runs[0].fixedByPr === 89, "first run must record the buildx-driver failure and its fix PR");
assert(runs[1].conclusion === "success", "second run must record success");

// Approval packet statement must cover the required disclosures
const statement = String(manifest.approvalPacketStatement);
assert(statement.includes("must be published consistently"), "approval packet must require consistent publication of all chain images");
assert(statement.toLowerCase().includes("publishing only the cli image is insufficient"), "approval packet must state publishing only the CLI image is insufficient");
assert(statement.toLowerCase().includes("invalidates"), "approval packet must state any source/base/dependency change invalidates readiness");
assert(statement.toLowerCase().includes("separate, explicit gate 2 approval"), "approval packet must require a separate explicit Gate 2 approval for publication");
assert(statement.toLowerCase().includes("does not") || statement.toLowerCase().includes("not itself authorize"), "approval packet must state publication does not authorize Gate 3");

assert(Array.isArray(manifest.priorGate3ApprovalsConsumed) && (manifest.priorGate3ApprovalsConsumed as string[]).length === 2, "both prior Gate 3 approvals must be recorded as consumed");
assert(String(manifest.gate4Status).toLowerCase().includes("prohibited"), "Gate 4 must remain prohibited");
assert(String(manifest.replicateStatus).toLowerCase().includes("production"), "Replicate must remain recorded as production");

console.log("runpod restore-unpack-fix chain Gate 2 readiness validator passed");
