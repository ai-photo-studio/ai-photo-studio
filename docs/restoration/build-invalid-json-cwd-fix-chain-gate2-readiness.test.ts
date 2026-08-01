import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "build-invalid-json-cwd-fix-chain-gate2-readiness.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

// Fail-closed top-level fields, exactly as required by this task
assert(manifest.approved === false, "approved must be false");
assert(manifest.publicationAllowed === false, "publicationAllowed must be false");
assert(manifest.expectedDigest === "", 'expectedDigest must be ""');
assert(manifest.gate3ExecutionAllowed === false, "gate3ExecutionAllowed must be false");
assert(manifest.productionRoutingAllowed === false, "productionRoutingAllowed must be false");

const chain = manifest.chain as Array<Record<string, unknown>>;
assert(Array.isArray(chain) && chain.length === 3, "chain must have exactly 3 entries (CLI reused + 2 new candidates)");

const cli = chain[0];
assert(cli.role === "1-cli-worker", "first chain entry must be the reused CLI worker");
const cliPublished = cli.publishedImage as Record<string, unknown>;
assert(cliPublished.digest === "sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052", "CLI digest must match the exact expected published, unchanged digest");
assert(cliPublished.anonymousPullConfirmed === true, "CLI anonymous pull must be confirmed");

const handler = chain[1];
assert(handler.role === "2-serverless-handler-cwd-fix", "second chain entry must be the cwd-fix handler candidate");
assert(handler.path === "apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/", "handler candidate path must match");
assert(typeof handler.localBuildImageId === "string" && (handler.localBuildImageId as string).startsWith("sha256:"), "handler image ID must be recorded");
assert(typeof handler.localBuildSizeBytes === "number" && (handler.localBuildSizeBytes as number) > 0, "handler image size must be recorded");
assert(handler.runtimeUser === "workeruser", "handler runtime user must be workeruser");
assert(handler.cwdFixVerified === true, "handler cwd fix must be verified");
assert(handler.zeroCritical === true && handler.cve202532434Absent === true, "handler must have zero CRITICAL and CVE-2025-32434 absent");
const handlerTests = handler.contractTests as Record<string, unknown>;
assert(handlerTests.totalTests === 34, "handler contract suite must have run all 34 tests");
assert(handlerTests.result === "OK", "handler contract suite must have passed");
assert(handlerTests.includesReproducedContaminationRegression === true, "handler tests must include the reproduced-contamination regression");
assert(handlerTests.includesCleanStdoutRegression === true, "handler tests must include the clean-stdout regression");
const handlerProposed = handler.proposedPublication as Record<string, unknown>;
assert(handlerProposed.expectedDigest === "", "handler proposed publication must not fabricate a digest before it exists");
assert(handlerProposed.floatingTagAllowed === false, "handler proposed publication must forbid floating tags");

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
assert(mountTests.missingVolumeFailsClosed === "PASS (EXIT_WEIGHT=4, no network access needed)", "missing volume must fail closed with EXIT_WEIGHT=4");

// Build-only workflow provenance
assert(manifest.buildOnlyWorkflow === ".github/workflows/build-invalid-json-cwd-fix-chain.yml", "must reference the exact build-only workflow path");
const runs = manifest.buildOnlyWorkflowRuns as Array<Record<string, unknown>>;
assert(Array.isArray(runs) && runs.length === 1, "must record exactly one build-only dispatch");
assert(runs[0].run === "30704284355", "must record the exact real run ID");
assert(runs[0].conclusion === "success", "the single dispatch must have succeeded");

// No publication, no RunPod/S3, no registry credentials
assert(manifest.imagesPublished === "none", "no image may have been published");
assert(manifest.gpuInferenceExecuted === false, "gpu_inference_executed must be false");
assert(manifest.runpodApiCalls === 0 && manifest.s3Calls === 0, "zero RunPod/S3 calls");
assert(manifest.registryLogin === false && manifest.packagesWritePermission === false, "no registry login, no packages:write");

// Permanent statements required by this task
assert(String(manifest.approvalPacketStatement).includes("must be published together"), "must state both images must be published together");
assert(String(manifest.approvalPacketStatement).includes("insufficient"), "must state publishing only one image is insufficient");
assert(String(manifest.approvalPacketStatement).includes("invalidates this entire readiness record"), "must state any source/base/dependency change invalidates readiness");
assert(String(manifest.approvalPacketStatement).includes("separate, explicit Gate 2 approval"), "must state publication requires a separate explicit Gate 2 approval");
assert(String(manifest.approvalPacketStatement).includes("does NOT itself authorize Gate 3"), "must state publication never authorizes Gate 3");
assert(String(manifest.gate4Status).toLowerCase().includes("prohibited"), "Gate 4 must remain prohibited");
assert(String(manifest.replicateStatus).toLowerCase().includes("production"), "Replicate must remain recorded as production");

assert(Array.isArray(manifest.priorGate3ApprovalsConsumed) && (manifest.priorGate3ApprovalsConsumed as string[]).length === 4, "all four prior Gate 3 approvals must be recorded as consumed");

console.log("build-invalid-json-cwd-fix-chain Gate 2 readiness validator passed");
