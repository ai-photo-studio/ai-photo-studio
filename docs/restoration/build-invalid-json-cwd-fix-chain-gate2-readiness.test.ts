import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "build-invalid-json-cwd-fix-chain-gate2-readiness.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

// Fail-closed top-level fields after publication
assert(manifest.approved === true, "approved must be true (Gate 2 publication approval was given and consumed)");
assert(manifest.publicationAllowed === false, "publicationAllowed must be false -- this approval is one-time, already consumed, not reusable");
assert(manifest.publicationConsumed === true, "publicationConsumed must be true");
assert(manifest.expectedDigest === "sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d", "expectedDigest must be the exact real published volume-mapped digest");
assert(manifest.gate3ExecutionAllowed === false, "gate3ExecutionAllowed must be false");
assert(manifest.productionRoutingAllowed === false, "productionRoutingAllowed must be false");

const chain = manifest.chain as Array<Record<string, unknown>>;
assert(Array.isArray(chain) && chain.length === 3, "chain must have exactly 3 entries (CLI reused + 2 published candidates)");

const cli = chain[0];
assert(cli.role === "1-cli-worker", "first chain entry must be the reused CLI worker");
const cliPublished = cli.publishedImage as Record<string, unknown>;
assert(cliPublished.digest === "sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052", "CLI digest must match the exact expected published, unchanged digest");
assert(cliPublished.anonymousPullConfirmed === true, "CLI anonymous pull must be confirmed");

const handler = chain[1];
assert(handler.role === "2-serverless-handler-cwd-fix", "second chain entry must be the cwd-fix handler candidate");
assert(handler.path === "apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/", "handler candidate path must match");
assert(handler.runtimeUser === "workeruser", "handler runtime user must be workeruser");
assert(handler.cwdFixVerified === true, "handler cwd fix must be verified");
assert(handler.zeroCritical === true && handler.cve202532434Absent === true, "handler must have zero CRITICAL and CVE-2025-32434 absent");
const handlerTests = handler.contractTests as Record<string, unknown>;
assert(handlerTests.totalTests === 34, "handler contract suite must have run all 34 tests");
assert(handlerTests.result === "OK", "handler contract suite must have passed");
const handlerPublished = handler.publishedImage as Record<string, unknown>;
assert(handlerPublished.digest === "sha256:af09003de27bbdfd1c7ef5bf83139dbbb7de2cee33dd015e900dee8a2b5d87d5", "handler must record the exact real published digest");
assert(handlerPublished.immutableTag === "38e313fc54d87ebfa8b8ab9be9e224ad20f2dab6", "handler must record the exact real immutable source-SHA tag");
assert(handlerPublished.floatingTagUsed === false, "handler must never use a floating tag");
assert(handlerPublished.anonymousPullConfirmed === true, "handler published digest must be confirmed anonymously pullable");

const volume = chain[2];
assert(volume.role === "3-volume-mapped-handler-cwd-fix", "third chain entry must be the cwd-fix volume-mapped candidate");
assert(volume.path === "apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-cwd-dev/", "volume candidate path must match");
assert(volume.runtimeUser === "workeruser", "volume runtime user must be workeruser");
assert(volume.cwdFixCarriesThroughEndToEnd === true, "volume image must carry the cwd fix end to end");
assert(volume.unpackFixCarriesThroughEndToEnd === true, "volume image must carry the unpack fix end to end");
assert(volume.noWeightsBundled === true && volume.noRuntimeDownload === true, "volume image must bundle no weights and perform no runtime download");
const mountTests = volume.mountContractTests as Record<string, unknown>;
assert(mountTests.totalTests === 9, "volume mount-contract suite must have run 9 tests");
assert(String(mountTests.result).startsWith("OK"), "volume mount-contract suite must have passed");
const volumePublished = volume.publishedImage as Record<string, unknown>;
assert(volumePublished.digest === "sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d", "volume image must record the exact real published digest");
assert(volumePublished.immutableTag === "38e313fc54d87ebfa8b8ab9be9e224ad20f2dab6", "volume image must share the exact same immutable tag as the handler");
assert(volumePublished.parentImageActual === "ghcr.io/ai-photo-studio/ai-photo-studio/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev@sha256:af09003de27bbdfd1c7ef5bf83139dbbb7de2cee33dd015e900dee8a2b5d87d5", "volume image parent must be the exact published handler digest, not a stale/local reference");

// Build-only workflow provenance (unchanged from the earlier readiness review)
assert(manifest.buildOnlyWorkflow === ".github/workflows/build-invalid-json-cwd-fix-chain.yml", "must reference the exact build-only workflow path");
const buildRuns = manifest.buildOnlyWorkflowRuns as Array<Record<string, unknown>>;
assert(Array.isArray(buildRuns) && buildRuns.length === 1, "must record exactly one build-only dispatch");
assert(buildRuns[0].run === "30704284355", "must record the exact real build-only run ID");

// Publication record
const pub = manifest.publicationRecord as Record<string, unknown>;
assert(pub !== undefined, "must have a publicationRecord");
assert(pub.publicationWorkflow === ".github/workflows/publish-invalid-json-cwd-fix-chain.yml", "must reference the exact publication workflow path");
assert(pub.publicationWorkflowRun === "30706738102", "must record the exact real publication run ID");
assert(pub.dispatchConclusion === "success", "the publication dispatch must have succeeded");
assert(pub.sourceShaTag === "38e313fc54d87ebfa8b8ab9be9e224ad20f2dab6", "must record the exact shared source-SHA tag");
assert(pub.sourceShaTagIdenticalAcrossBoth === true, "both images must share the identical tag");
assert(pub.noExistingTagConfirmedBeforePublication === true, "must confirm no pre-existing tag before publication");
const publishedImages = pub.publishedImages as Array<Record<string, unknown>>;
assert(Array.isArray(publishedImages) && publishedImages.length === 2, "must record exactly 2 published images");
const postVerify = pub.postPublicationVerification as Record<string, unknown>;
assert(postVerify.allPassed === true, "post-publication verification must have passed");
assert(postVerify.gpuInferenceExecuted === false, "post-publication verification must record gpu_inference_executed=false");
assert(String(pub.gate2Status).includes("APPROVED") && String(pub.gate2Status).includes("PUBLISHED") && String(pub.gate2Status).includes("CONSUMED"), "gate2Status must state APPROVED/PUBLISHED/CONSUMED");
assert(String(pub.gate3Note).includes("approved=false"), "gate3Note must state Gate 3 remains approved=false");
assert(String(pub.gate3Note).includes("sha256:91052a538454d2996b6f27b561a8b9f7d07636d396f7dd8d1713baf9f9a5ea0d"), "gate3Note must reference the exact new volume digest for any future Gate 3 approval");
assert(String(pub.oldHandlerChainNote).includes("sha256:cd57e507aad2e2230b10784f13a51cb1fd860720037a3c280a5ff7ebfe6db286"), "must note the old, currently-deployed digest lacks this fix and remains historical/current-production only");

// No RunPod/S3 calls; publication used GHCR + GITHUB_TOKEN only
assert(manifest.imagesPublished === "both, together, in this single dispatch", "both images must be recorded as published together");
assert(manifest.gpuInferenceExecuted === false, "gpu_inference_executed must be false");
assert(manifest.runpodApiCalls === 0 && manifest.s3Calls === 0, "zero RunPod/S3 calls");

assert(manifest.anyFutureSourceBaseOrDependencyChangeInvalidatesThisRecord === true, "any future source/base/dependency change must invalidate this record");

// Permanent statements required by this task
assert(String(manifest.approvalPacketStatement).includes("published together"), "must state both images were published together");
assert(String(manifest.approvalPacketStatement).includes("insufficient"), "must state publishing only one image would have been insufficient");
assert(String(manifest.approvalPacketStatement).includes("invalidates this entire publication record"), "must state any source/base/dependency change invalidates the publication record");
assert(String(manifest.approvalPacketStatement).includes("fresh, separate, explicit Gate 2 approval"), "must state any future change requires a fresh, separate, explicit Gate 2 approval");
assert(String(manifest.approvalPacketStatement).includes("does NOT itself authorize Gate 3"), "must state publication never authorizes Gate 3");
assert(String(manifest.gate4Status).toLowerCase().includes("prohibited"), "Gate 4 must remain prohibited");
assert(String(manifest.replicateStatus).toLowerCase().includes("production"), "Replicate must remain recorded as production");

assert(Array.isArray(manifest.priorGate3ApprovalsConsumed) && (manifest.priorGate3ApprovalsConsumed as string[]).length === 4, "all four prior Gate 3 approvals must be recorded as consumed");

console.log("build-invalid-json-cwd-fix-chain Gate 2 readiness/publication validator passed");
