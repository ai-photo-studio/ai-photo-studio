import fs from "node:fs";
import path from "node:path";

const manifestPath = path.join(__dirname, "runpod-invalid-json-stdout-fix.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

assert(manifest.runReconciled === "30702245089", "must reconcile against the exact failed run");
assert(manifest.classification === "ROOT_CAUSE_CONFIRMED", "classification must be ROOT_CAUSE_CONFIRMED");

const protocol = (manifest.stdoutProtocol ?? {}) as Record<string, unknown>;
assert(String(protocol.protocolLine).includes("json.loads(proc.stdout)"), "must record the exact stdout protocol line, not a paraphrase");
assert(Array.isArray(protocol.verifiedSourceReferences) && (protocol.verifiedSourceReferences as string[]).length >= 6, "must cite verified source references for both handler/worker and the pinned third-party libraries, not memory");
const refs = (protocol.verifiedSourceReferences as string[]).join(" ");
assert(refs.includes("gfpgan==1.3.8"), "must cite the exact pinned gfpgan version inspected");
assert(refs.includes("facexlib==0.3.0"), "must cite the exact pinned facexlib version inspected");

const rootCause = (manifest.confirmedRootCause ?? {}) as Record<string, unknown>;
assert(String(rootCause.mechanism).includes("cwd="), "root cause mechanism must name the missing cwd= as the cause");
assert(String(rootCause.reproductionMethod).toLowerCase().includes("empirical"), "reproduction must be empirical, not merely theorized");
assert(String(rootCause.reproductionMethod).includes("real subprocess"), "reproduction must state it used the real subprocess boundary");
assert(rootCause.exactObservedErrorReproduced === "worker produced invalid non-JSON output", "must reproduce the exact observed error string, not a paraphrase");
assert(String(rootCause.distinctFromPriorUnpackDefect).length > 0, "must explicitly distinguish this defect from the already-fixed unpack defect");

const chain = (manifest.correctionCandidateChain ?? {}) as Record<string, unknown>;
assert(chain.fixScope === "handler-only", "fix scope must be recorded as handler-only");

const cli = (chain.cliCandidateUnchanged ?? {}) as Record<string, unknown>;
assert(cli.modified === false, "the published CLI candidate must remain unmodified");
assert(cli.path === "apps/api/runpod-worker-gpu-dev-restore-unpack-fix/", "must reference the existing published CLI candidate path");

const handlerCandidate = (chain.serverlessHandlerCandidate ?? {}) as Record<string, unknown>;
assert(handlerCandidate.path === "apps/api/runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/", "handler candidate must live in a new, separate directory");
assert(String(handlerCandidate.change).includes("cwd=WORKER_DIR"), "handler candidate change must be the cwd= fix, nothing broader");
assert(handlerCandidate.published === false, "handler candidate must not be published");
assert(handlerCandidate.built === false, "handler candidate must not be built");
assert(handlerCandidate.deployed === false, "handler candidate must not be deployed");
assert(handlerCandidate.productionRoutingAllowed === false, "handler candidate must not allow production routing");
assert(typeof handlerCandidate.gate2ReviewStatus === "string" && (handlerCandidate.gate2ReviewStatus as string).includes("fresh"), "handler candidate must require a fresh Gate 2 review before publication");
assert(Array.isArray(handlerCandidate.newTests) && (handlerCandidate.newTests as string[]).length >= 6, "must record the new regression tests added");
assert((handlerCandidate.newTests as string[]).includes("test_subprocess_run_passes_cwd_matching_worker_dir"), "must include the cwd-assertion regression test");
assert((handlerCandidate.newTests as string[]).includes("test_old_unfixed_contaminated_stdout_reproduces_the_real_observed_failure"), "must include the old-behavior reproduction regression test");
assert((handlerCandidate.newTests as string[]).includes("test_corrected_clean_stdout_parses_deterministically"), "must include the corrected-success regression test");

const volumeCandidate = (chain.volumeMappedCandidate ?? {}) as Record<string, unknown>;
assert(volumeCandidate.path === "apps/api/runpod-worker-gpu-serverless-volume-restore-unpack-fix-cwd-dev/", "volume-mapped candidate must live in a new, separate directory");
assert(volumeCandidate.published === false, "volume-mapped candidate must not be published");
assert(volumeCandidate.built === false, "volume-mapped candidate must not be built");
assert(volumeCandidate.deployed === false, "volume-mapped candidate must not be deployed");
assert(volumeCandidate.testsUnchanged === true, "volume-mapped candidate's mount-contract tests must be unchanged, since the fix does not touch mount logic");

assert(manifest.gpuInferenceExecuted === false, "gpu_inference_executed must be recorded false for this offline/build-only task");
assert(manifest.runpodS3CallsMade === 0, "no RunPod/S3 call may have been made");
assert(manifest.publicationOccurred === false, "no publication may have occurred");
assert(manifest.buildOccurred === false, "no build may have occurred");
assert(manifest.deploymentOccurred === false, "no deployment may have occurred");

assert(Array.isArray(manifest.gate3ApprovalsConsumed) && (manifest.gate3ApprovalsConsumed as string[]).length === 4, "all four prior Gate 3 approvals must be recorded as consumed");
assert(String(manifest.gate3Status).includes("approved=false"), "Gate 3 must remain unapproved");
assert(String(manifest.gate2Status).includes("fresh, separate Gate 2 review"), "Gate 2 status must state a fresh review is required for the new candidates");
assert(String(manifest.gate4Status).toLowerCase().includes("prohibited"), "Gate 4 must remain prohibited");
assert(String(manifest.replicateStatus).toLowerCase().includes("production"), "Replicate must remain recorded as production");

console.log("runpod invalid-json-stdout-fix evidence validator passed");
