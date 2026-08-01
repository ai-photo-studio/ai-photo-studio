// Workflow security test: validate that build-invalid-json-cwd-fix-chain.yml
// is build-only (no push, no registry login, no packages:write), makes no
// RunPod/S3/API call, pins the immutable published CLI digest, builds the
// two cwd-fix candidates in strict local-image-store dependency order, and
// asserts the required contract/security invariants for both.

import fs from "node:fs";
import yaml from "js-yaml";

const workflowPath = ".github/workflows/build-invalid-json-cwd-fix-chain.yml";
const raw = fs.readFileSync(workflowPath, "utf8");
const workflow = yaml.load(raw);

const assert = (cond, msg) => {
  if (!cond) throw new Error(`[SECURITY] ${msg}`);
};

const job = workflow.jobs["build-test-chain"];
assert(job !== undefined, "must have build-test-chain job");
const allSteps = job.steps;
const source = allSteps.map((s) => s.run || "").join("\n");

// Trigger / confirmation
assert(workflow.on.workflow_dispatch !== undefined, "must use workflow_dispatch trigger");
assert(!workflow.on.push && !workflow.on.pull_request && !workflow.on.schedule, "must not have automatic triggers");
const confirmationInput = workflow.on.workflow_dispatch.inputs?.confirmation;
assert(confirmationInput?.required === true, "confirmation must be required");
assert(confirmationInput.description.includes("BUILD_CWD_FIX_CHAIN_ONLY"), "description must state the exact confirmation value");
const confirmStep = allSteps.find((s) => s.name && s.name.includes("confirmation"));
assert(confirmStep && confirmStep.run.includes("BUILD_CWD_FIX_CHAIN_ONLY"), "must check the exact confirmation value");

// Permissions: contents:read only, no packages:write
assert(workflow.permissions.contents === "read", "permissions must be contents:read only");
assert(Object.keys(workflow.permissions).length === 1, "no extra permissions allowed");
assert(workflow.permissions.packages === undefined, "must never request a packages permission of any kind");

// No registry login, no push, build-only everywhere
assert(!/docker\/login-action/.test(raw), "must never use docker/login-action (no registry login)");
assert(!/docker\s+login/.test(source), "must never call docker login");
assert(!/docker\s+push/.test(source), "must never call docker push");
assert(!/--push\b/.test(source), "must never pass --push to any build command");

// No RunPod/S3/API calls anywhere (the handler-source leak check legitimately
// greps FOR the literal string "RUNPOD_API_KEY" inside handler.py as a
// defense-in-depth assertion that handler.py itself never embeds it; that is
// not a credential reference by the workflow, so it is excluded here).
assert(!/secrets\.RUNPOD_API_KEY|secrets\.AWS_ACCESS_KEY_ID|secrets\.AWS_SECRET_ACCESS_KEY|api\.runpod\.ai|rest\.runpod\.io|s3api-/.test(raw), "must never reference RunPod/S3 credentials or live endpoints");
assert(job.env === undefined, "job must declare no env block at all (no secrets of any kind)");

// No Gate 3/Gate 4/production-routing activation (referencing the Gate 3
// canary run that motivated this fix, in prose/comments, is expected and
// fine; the workflow must simply never itself create/activate anything)
assert(!/curl.*runpod\.ai|curl.*rest\.runpod\.io|endpoint.*POST|-X\s+POST.*runpod/i.test(source), "must never create/activate a RunPod endpoint, template, or job");
assert(!/productionRoutingAllowed["']?\s*[:=]\s*true/i.test(raw), "must never set productionRoutingAllowed to true");

// Immutable published CLI digest pinned, no floating base
const digestCheckStep = allSteps.find((s) => s.name && s.name.includes("Prove Dockerfile parent is the exact immutable published CLI digest"));
assert(digestCheckStep !== undefined, "must have an explicit step proving the Dockerfile FROM pins the expected immutable digest");
assert(digestCheckStep.run.includes("sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052"), "must pin the exact expected published CLI digest");
assert(!/:latest['"]?\s*$/m.test(source), "must never use a floating :latest tag");

// Two-stage build, strict dependency order, local image store, no CLI rebuild
const stage1Build = allSteps.find((s) => s.name && s.name.includes("Stage 1 - Build cwd-fixed Serverless handler"));
assert(stage1Build !== undefined, "must have an explicit Stage 1 handler build step");
assert(stage1Build.run.includes("gfpgan-serverless-restore-fix-cwd:local"), "Stage 1 must tag the local handler image with the fixed name");
assert(stage1Build.run.includes("runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev/Dockerfile"), "Stage 1 must build from the new handler candidate's Dockerfile");
assert(!/docker\s+build.*runpod-worker-gpu-dev-restore-unpack-fix\//.test(source), "must NOT rebuild the CLI from source; it is reused by immutable published digest only");

const stage2Build = allSteps.find((s) => s.name && s.name.includes("Stage 2 - Build cwd-fixed volume-mapped"));
assert(stage2Build !== undefined, "must have an explicit Stage 2 volume-mapped build step");
assert(stage2Build.run.includes("gfpgan-serverless-volume-restore-fix-cwd:local"), "Stage 2 must tag the local volume image with the fixed name");
assert(stage2Build.run.includes("runpod-worker-gpu-serverless-volume-restore-unpack-fix-cwd-dev/Dockerfile"), "Stage 2 must build from the new volume candidate's Dockerfile");

const stage1Index = allSteps.indexOf(stage1Build);
const stage2Index = allSteps.indexOf(stage2Build);
assert(stage1Index < stage2Index, "Stage 1 (handler) must build before Stage 2 (volume-mapped)");
assert(!allSteps.some((s) => s.uses && s.uses.includes("setup-buildx-action")), "must use plain docker build (shared host image store), not an isolated buildx builder, so Stage 2's local FROM reference resolves");

// Source/subtree provenance recorded
const provenanceStep = allSteps.find((s) => s.name && s.name.includes("Record source commit and candidate subtree hashes"));
assert(provenanceStep !== undefined, "must record source commit and subtree hashes");
assert(provenanceStep.run.includes("runpod-worker-gpu-serverless-restore-unpack-fix-cwd-dev") && provenanceStep.run.includes("runpod-worker-gpu-serverless-volume-restore-unpack-fix-cwd-dev"), "must compute subtree hashes for both candidate directories");

// Contract-test coverage: handler
assert(source.includes("h.WORKER_DIR == '/srv/worker'"), "must assert WORKER_DIR equals /srv/worker inside the built image");
assert(source.includes("EXECUTION_TIMEOUT_SECONDS == 120"), "must assert the 120s timeout is unchanged");
assert(source.includes("EXIT_INPUT == 2") && source.includes("EXIT_WEIGHT == 4") && source.includes("EXIT_CUDA == 5"), "must assert exit codes 2/4/5 are unchanged");
const handlerTestStep = allSteps.find((s) => s.name && s.name.includes("Run cwd-fix regression + full handler contract test suite"));
assert(handlerTestStep !== undefined, "must run the full handler test suite (including the reproduced-contamination and clean-stdout regression tests) inside the built image");
assert(handlerTestStep.run.includes("--network none"), "handler contract tests must run with no network access");
const noLeakStep = allSteps.find((s) => s.name && s.name.includes("No base64/path/secret leakage"));
assert(noLeakStep !== undefined, "must have an explicit no-secret-leakage source check for the handler");

// Contract-test coverage: volume handler
const symlinkStep = allSteps.find((s) => s.name && s.name.includes("Verify /models symlink contract"));
assert(symlinkStep !== undefined, "must verify the /models symlink contract");
assert(symlinkStep.run.includes("/runpod-volume/models"), "must assert the exact symlink target");
assert(symlinkStep.run.includes("rm -f /models") && symlinkStep.run.includes("workeruser was able to remove"), "must prove the symlink is not runtime-writable by workeruser");
assert(symlinkStep.run.includes("workeruser"), "must assert the runtime user is workeruser");

const missingVolumeStep = allSteps.find((s) => s.name && s.name.includes("Test: missing volume fails closed"));
assert(missingVolumeStep !== undefined, "must test that a missing volume fails closed");
assert(missingVolumeStep.run.includes("-eq 4"), "missing volume must fail with EXIT_WEIGHT=4");
assert(missingVolumeStep.run.includes("--network none"), "missing-volume test must run with no network access");

const invalidWeightStep = allSteps.find((s) => s.name && s.name.includes("Test: invalid weights"));
assert(invalidWeightStep !== undefined, "must test that invalid weights are rejected before model construction");
assert(invalidWeightStep.run.includes("-eq 4"), "invalid weight must fail with EXIT_WEIGHT=4");

const noWeightsStep = allSteps.find((s) => s.name && s.name.includes("Verify no weights bundled"));
assert(noWeightsStep !== undefined, "must verify no weights are bundled in the volume image");

const endToEndStep = allSteps.find((s) => s.name && s.name.includes("Prove the cwd fix carries through end to end"));
assert(endToEndStep !== undefined, "must prove the cwd fix and the unpack fix both carry through to the volume-mapped image");
assert(endToEndStep.run.includes("cwd=WORKER_DIR"), "must grep for the exact cwd=WORKER_DIR fix inside the built volume image");
assert(endToEndStep.run.includes("_, _, out = model.enhance"), "must re-verify the corrected unpack fix is still present");
assert(endToEndStep.run.includes("TORCH_FORCE_WEIGHTS_ONLY_LOAD"), "must re-verify the safe-load env is still present");

const mountContractStep = allSteps.find((s) => s.name && s.name.includes("Run mount-contract tests unchanged"));
assert(mountContractStep !== undefined, "must run the mount-contract test suite");
assert(mountContractStep.run.includes("--network none"), "mount-contract tests must run with no network access");

// SBOM + vulnerability scans for both images, zero CRITICAL, CVE-2025-32434 absent
const trivySteps = allSteps.filter((s) => s.uses && s.uses.includes("aquasecurity/trivy-action"));
assert(trivySteps.length === 4, "must run exactly 4 Trivy invocations (SBOM + CRITICAL scan, per image, for 2 images)");
const cyclonedxSteps = trivySteps.filter((s) => s.with?.format === "cyclonedx");
assert(cyclonedxSteps.length === 2, "must generate an SBOM for both images");
const criticalScanSteps = trivySteps.filter((s) => s.with?.severity === "CRITICAL");
assert(criticalScanSteps.length === 2, "must scan both images for CRITICAL severity");
assert((raw.match(/CVE-2025-32434/g) || []).length >= 2, "must assert CVE-2025-32434 absent for both images");
assert((raw.match(/CRITICAL PRESENT/g) || []).length === 2, "must fail closed on any CRITICAL finding for both images");

// Chain summary records gpu_inference_executed=false and zero external calls
const summaryStep = allSteps.find((s) => s.name === "Chain summary");
assert(summaryStep !== undefined, "must have a chain summary step");
assert(summaryStep.if === "always()", "chain summary must run with if: always()");
assert(summaryStep.run.includes("gpu_inference_executed=false"), "summary must record gpu_inference_executed=false");
assert(summaryStep.run.includes("published=false") && summaryStep.run.includes("registry_login=false") && summaryStep.run.includes("packages_write=false"), "summary must record published=false, registry_login=false, packages_write=false");
assert(summaryStep.run.includes("runpod_api_calls=0") && summaryStep.run.includes("s3_calls=0"), "summary must record zero RunPod/S3 calls");

// This is a static file/YAML/regex test only: it reads the workflow file
// from local disk and makes no network or RunPod/registry API call of any kind.

console.log("build-invalid-json-cwd-fix-chain workflow security validator PASSED");
console.log("  - workflow_dispatch only, BUILD_CWD_FIX_CHAIN_ONLY confirmation required");
console.log("  - contents:read only; no packages:write; no registry login; no push anywhere");
console.log("  - no RunPod/S3/API references; no Gate 3/Gate 4 activation; productionRoutingAllowed never set true");
console.log("  - Dockerfile FROM pinned to the exact immutable published CLI digest; CLI never rebuilt from source");
console.log("  - two-stage build in strict dependency order via shared local Docker image store (plain docker build)");
console.log("  - handler contract tests: WORKER_DIR, timeout, exit codes 2/4/5, no secret leakage, network none");
console.log("  - volume-handler contract tests: symlink target/non-writability/workeruser, EXIT_WEIGHT=4 fail-closed, network none");
console.log("  - SBOM + zero-CRITICAL + CVE-2025-32434-absent scans for both images");
