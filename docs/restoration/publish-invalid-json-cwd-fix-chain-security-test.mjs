// Workflow security test: validate that publish-invalid-json-cwd-fix-chain.yml
// publishes the two cwd-fix images correctly: workflow_dispatch-only, exact
// confirmation, contents:read + packages:write only, GHCR login via
// GITHUB_TOKEN, no RunPod/S3 credentials or calls, one shared immutable
// full-source-SHA tag (never floating), the CLI reused unchanged by exact
// digest (never rebuilt/republished), the volume image built from the
// just-published handler's resolved registry digest (never a stale/local
// reference), and every required test/SBOM/vulnerability gate before push.

import fs from "node:fs";
import yaml from "js-yaml";

const workflowPath = ".github/workflows/publish-invalid-json-cwd-fix-chain.yml";
const raw = fs.readFileSync(workflowPath, "utf8");
const workflow = yaml.load(raw);

const assert = (cond, msg) => {
  if (!cond) throw new Error(`[SECURITY] ${msg}`);
};

const job = workflow.jobs["publish-chain"];
assert(job !== undefined, "must have publish-chain job");
const allSteps = job.steps;
const source = allSteps.map((s) => s.run || "").join("\n");

// Trigger / confirmation
assert(workflow.on.workflow_dispatch !== undefined, "must use workflow_dispatch trigger");
assert(!workflow.on.push && !workflow.on.pull_request && !workflow.on.schedule, "must not have automatic triggers");
const confirmationInput = workflow.on.workflow_dispatch.inputs?.confirmation;
assert(confirmationInput?.required === true, "confirmation must be required");
assert(confirmationInput.description.includes("PUBLISH_CWD_FIX_CHAIN"), "description must state the exact confirmation value");
const confirmStep = allSteps.find((s) => s.name && s.name.includes("confirmation"));
assert(confirmStep && confirmStep.run.includes("PUBLISH_CWD_FIX_CHAIN"), "must check the exact confirmation value");

// Permissions: exactly contents:read + packages:write
assert(workflow.permissions.contents === "read", "permissions must include contents:read");
assert(workflow.permissions.packages === "write", "permissions must include packages:write");
assert(Object.keys(workflow.permissions).length === 2, "no extra permissions allowed beyond contents:read and packages:write");

// GHCR login via GITHUB_TOKEN only
const loginStep = allSteps.find((s) => s.uses && s.uses.includes("docker/login-action"));
assert(loginStep !== undefined, "must log in to GHCR via docker/login-action");
assert(loginStep.with.registry === "ghcr.io", "must log in to ghcr.io specifically");
assert(loginStep.with.password === "${{ secrets.GITHUB_TOKEN }}", "must authenticate with GITHUB_TOKEN only, not a PAT or RunPod/S3 secret");
assert(!/secrets\.RUNPOD|secrets\.AWS_/.test(raw), "must never reference RunPod/S3 secrets");
assert(job.env === undefined, "job must declare no env block (no secrets beyond the login step's GITHUB_TOKEN)");

// No RunPod/S3 API calls anywhere
assert(!/api\.runpod\.ai|rest\.runpod\.io|s3api-/.test(raw), "must never reference RunPod/S3 live endpoints");

// Only runs from main
assert(job.if === "github.ref == 'refs/heads/main'", "must only run from the default branch");

// Exactly one shared immutable full-40-char-SHA tag, never floating
const shaStep = allSteps.find((s) => s.name && s.name.includes("Resolve immutable source SHA tag"));
assert(shaStep !== undefined, "must have an explicit step resolving the shared source SHA tag");
assert(shaStep.run.includes("${#SOURCE_SHA}") && shaStep.run.includes("-ne 40"), "must assert the tag is a full 40-character commit hash");
assert(!/:latest['"]?/.test(source) && !/:main['"]?/.test(source) && !/:stable['"]?/.test(source), "must never use a latest/main/stable floating tag");
const handlerTagRefs = (source.match(/HANDLER_REPO\}:\$\{\{ steps\.sha\.outputs\.source_sha \}\}/g) || []).length;
const volumeTagRefs = (source.match(/VOLUME_REPO\}:\$\{\{ steps\.sha\.outputs\.source_sha \}\}/g) || []).length;
assert(handlerTagRefs >= 1 && volumeTagRefs >= 1, "both images must be tagged with the same resolved source_sha output, not separately computed tags");

// CLI reused unchanged by exact digest, never rebuilt/republished
assert(workflow.env.CLI_DIGEST === "sha256:f97245866394310c3aed065e48ebac63555e8f451480b79eebea98f437cb4052", "CLI digest must be pinned to the exact expected published digest");
const cliParentCheck = allSteps.find((s) => s.name && s.name.includes("handler Dockerfile pins the exact reused CLI digest"));
assert(cliParentCheck !== undefined, "must verify the handler Dockerfile pins the exact reused CLI digest");
assert(!/docker\/build-push-action.*runpod-worker-gpu-dev-restore-unpack-fix\/Dockerfile/.test(source.replace(/\n/g, " ")), "must not rebuild the CLI from its own Dockerfile");
assert(!source.includes("basicsr-v142-functional-tensor-fix.patch"), "must not rebuild the CLI (no BasicSR patch copy needed -- CLI is reused, not built)");

// Exactly two build-push stages, handler first then volume, in dependency order
const buildSteps = allSteps.filter((s) => s.uses && s.uses.includes("docker/build-push-action"));
assert(buildSteps.length === 2, "must have exactly two build-push-action invocations (handler, volume)");
assert(buildSteps[0].with.tags.includes("HANDLER_REPO"), "first build must be the handler");
assert(buildSteps[1].with.tags.includes("VOLUME_REPO"), "second build must be the volume-mapped handler");
assert(buildSteps[0].with.push === false && buildSteps[0].with.load === true, "handler build must load-only, push happens in a separate gated step");
assert(buildSteps[1].with.push === false && buildSteps[1].with.load === true, "volume build must load-only, push happens in a separate gated step");

// Volume derives from the just-published handler by resolved digest, not a stale/local reference
const rewriteStep = allSteps.find((s) => s.name && s.name.includes("Generate publish Dockerfile pinned to the published handler digest"));
assert(rewriteStep !== undefined, "must rewrite the volume Dockerfile's FROM to the just-published handler's resolved digest");
assert(rewriteStep.run.includes("steps.push-handler.outputs.digest"), "volume FROM rewrite must use the handler push step's resolved digest output");
assert(buildSteps[1].with.file === "/tmp/Dockerfile.volume.publish", "volume build must use the digest-rewritten Dockerfile");

// Push only after tests + SBOM + vuln gates, in this exact order
const pushHandlerStep = allSteps.find((s) => s.id === "push-handler");
const pushVolumeStep = allSteps.find((s) => s.id === "push-volume");
assert(pushHandlerStep !== undefined && pushVolumeStep !== undefined, "must have explicit gated push steps for both images");
const handlerScanIndex = allSteps.findIndex((s) => s.name && s.name.includes("Stage 1 - Assert zero CRITICAL"));
const pushHandlerIndex = allSteps.indexOf(pushHandlerStep);
assert(handlerScanIndex !== -1 && handlerScanIndex < pushHandlerIndex, "handler vulnerability gate must run before handler push");
const volumeScanIndex = allSteps.findIndex((s) => s.name && s.name.includes("Stage 2 - Assert zero CRITICAL"));
const pushVolumeIndex = allSteps.indexOf(pushVolumeStep);
assert(volumeScanIndex !== -1 && volumeScanIndex < pushVolumeIndex, "volume vulnerability gate must run before volume push");

// SBOM + vulnerability scans for both images, zero CRITICAL, CVE-2025-32434 absent
const trivySteps = allSteps.filter((s) => s.uses && s.uses.includes("aquasecurity/trivy-action"));
assert(trivySteps.length === 4, "must run exactly 4 Trivy invocations (SBOM + CRITICAL scan, per image, for 2 images)");
assert((raw.match(/CVE-2025-32434/g) || []).length >= 2, "must assert CVE-2025-32434 absent for both images");
assert((raw.match(/STOPPING BEFORE PUBLICATION/g) || []).length >= 4, "must fail closed (stopping before publication) on any CRITICAL/CVE finding for both images");

// Handler contract-test coverage required by this task
const cwdProofStep = allSteps.find((s) => s.name && s.name.includes("Prove cwd fix, timeout=120s, exit codes 2/4/5"));
assert(cwdProofStep !== undefined, "must explicitly prove cwd=/srv/worker, timeout=120s, exit codes 2/4/5 on the built handler image");
assert(cwdProofStep.run.includes("h.WORKER_DIR == '/srv/worker'"), "must assert WORKER_DIR equals /srv/worker");
assert(cwdProofStep.run.includes("EXECUTION_TIMEOUT_SECONDS == 120"), "must assert the 120s timeout is unchanged");
assert(cwdProofStep.run.includes("EXIT_INPUT == 2") && cwdProofStep.run.includes("EXIT_WEIGHT == 4") && cwdProofStep.run.includes("EXIT_CUDA == 5"), "must assert exit codes 2/4/5 are unchanged");
const handlerSuiteStep = allSteps.find((s) => s.name && s.name.includes("Full contract test suite"));
assert(handlerSuiteStep !== undefined && handlerSuiteStep.run.includes("--network none"), "must run the full handler contract suite (contaminated-stdout regression, clean-stdout, malformed-output fail-closed) with no network access");

// Volume contract-test coverage required by this task
const volumeWeightStep = allSteps.find((s) => s.name && s.name.includes("Missing/invalid weights fail EXIT_WEIGHT=4"));
assert(volumeWeightStep !== undefined, "must test that both missing and invalid weights fail with EXIT_WEIGHT=4");
assert((volumeWeightStep.run.match(/-eq 4/g) || []).length >= 2, "must assert EXIT_WEIGHT=4 for both the missing-volume and invalid-weight cases");
assert(volumeWeightStep.run.includes("cwd=WORKER_DIR"), "must re-verify the cwd fix inside the built volume image");
assert(volumeWeightStep.run.includes("_, _, out = model.enhance"), "must re-verify the prior unpack fix inside the built volume image");
assert(volumeWeightStep.run.includes("--network none"), "weight fail-closed tests must run with no network access (proves no runtime download occurs)");
const symlinkStep = allSteps.find((s) => s.name && s.name.includes("symlink contract, runtime user"));
assert(symlinkStep !== undefined && symlinkStep.run.includes("rm -f /models") && symlinkStep.run.includes("symlink is runtime-writable"), "must prove the symlink is not runtime-writable");

// Post-publication verification pulls fresh by digest and re-checks everything
const postVerifyStep = allSteps.find((s) => s.name && s.name.includes("Post-publication - pull both by digest"));
assert(postVerifyStep !== undefined, "must have an explicit post-publication verification step");
assert(postVerifyStep.run.includes("docker pull") , "post-publication verification must pull fresh, not reuse the local build cache");
assert(postVerifyStep.run.includes("HANDLER_REPO}@") && postVerifyStep.run.includes("VOLUME_REPO}@"), "post-publication verification must reference both images strictly by digest");
assert(postVerifyStep.run.includes("gpu_inference_executed=false"), "post-publication verification must record gpu_inference_executed=false");

console.log("publish-invalid-json-cwd-fix-chain workflow security validator PASSED");
console.log("  - workflow_dispatch only, PUBLISH_CWD_FIX_CHAIN confirmation required");
console.log("  - contents:read + packages:write only; GHCR login via GITHUB_TOKEN; no RunPod/S3 credentials or calls");
console.log("  - one shared immutable full-40-char-SHA tag for both images, never floating");
console.log("  - CLI reused unchanged by exact digest, never rebuilt/republished");
console.log("  - volume image derives from the just-published handler's resolved registry digest");
console.log("  - handler: cwd fix, timeout=120s, exit codes 2/4/5, full contract suite, no secret leakage");
console.log("  - volume: symlink contract, EXIT_WEIGHT=4 fail-closed (missing+invalid), cwd+unpack fixes re-verified");
console.log("  - SBOM + zero-CRITICAL + CVE-2025-32434-absent gates before every push");
console.log("  - post-publication verification pulls fresh by digest and re-checks everything");
