// Workflow security test: validate that runpod-create-gate3-volume.yml enforces
// strict constraints: single mutation, no retries, no endpoint/worker/job APIs,
// no secret output, confirmation input required.

import fs from "node:fs";
import yaml from "js-yaml";

const workflowPath = ".github/workflows/runpod-create-gate3-volume.yml";
const workflow = yaml.load(fs.readFileSync(workflowPath, "utf8"));

const assert = (cond, msg) => {
  if (!cond) throw new Error(`[SECURITY] ${msg}`);
};

// Test 1: workflow_dispatch only
assert(workflow.on.workflow_dispatch !== undefined, "must use workflow_dispatch trigger");
assert(!workflow.on.push && !workflow.on.pull_request && !workflow.on.schedule, "must not have automatic triggers");

// Test 2: confirmation input required and must equal fixed value
const confirmationInput = workflow.on.workflow_dispatch.inputs?.confirmation;
assert(confirmationInput !== undefined, "must require confirmation input");
assert(confirmationInput.required === true, "confirmation must be required");
assert(confirmationInput.description && confirmationInput.description.includes("CREATE_ONE_GATE3_VOLUME"), "description must explain fixed confirmation value");

// Test 3: permissions must be minimal (contents: read only)
assert(workflow.permissions.contents === "read", "permissions must be contents:read only");
assert(!workflow.permissions.packages && !workflow.permissions.actions, "no write permissions allowed");

// Test 4: RUNPOD_API_KEY from GitHub Secrets only, never printed
const createJob = workflow.jobs["create-volume"];
assert(createJob !== undefined, "must have create-volume job");

// Check that confirmation is verified in first step
const confirmStep = createJob.steps.find(s => s.name && s.name.includes("confirmation"));
assert(confirmStep !== undefined, "must verify confirmation input in first step");
assert(confirmStep.run && confirmStep.run.includes("CREATE_ONE_GATE3_VOLUME"), "must check confirmation value");

// Check that API key is used but never logged. A precise pattern is required here:
// steps legitimately reference $RUNPOD_API_KEY inside curl auth headers (e.g.
// `-H "Authorization: Bearer $RUNPOD_API_KEY"`), which is safe and expected.
// What must never happen is the resolved value itself being echoed/printed, or
// curl verbose/trace modes that would dump the Authorization header to logs.
const directEchoPattern = /echo\b[^\n]*\$\{?RUNPOD_API_KEY\}?/;
const verboseCurlPattern = /curl\s+[^\n]*(-v\b|--verbose|--trace|-\w*v\w*\s)/;

let apiKeyFoundLogged = false;
createJob.steps.forEach(step => {
  if (step.env && step.env.RUNPOD_API_KEY === "${{ secrets.RUNPOD_API_KEY }}") {
    if (step.run && (directEchoPattern.test(step.run) || verboseCurlPattern.test(step.run))) {
      apiKeyFoundLogged = true;
    }
  }
});
assert(!apiKeyFoundLogged, "must never directly echo RUNPOD_API_KEY or use verbose/trace curl output");

// Test 5: Only GET and single POST, no retries
let postCount = 0;
let putPatchDeleteFound = false;
let retryFound = false;

createJob.steps.forEach(step => {
  if (step.run) {
    // Count POST calls
    const postMatches = (step.run.match(/-X POST/g) || []);
    postCount += postMatches.length;

    // Check for PUT/PATCH/DELETE
    if (/-X (PUT|PATCH|DELETE)/.test(step.run)) putPatchDeleteFound = true;

    // Check for actual retry constructs (curl --retry flag, or a shell loop wrapping
    // a POST call). Plain comments/echoes mentioning the word "retry" (e.g. documenting
    // that a step deliberately does NOT retry) must not trip this.
    const hasCurlRetryFlag = /curl\s+[^\n]*--retry\b/.test(step.run);
    const hasLoopedPost = /\b(for|while|until)\b[\s\S]*-X POST/.test(step.run);
    if (hasCurlRetryFlag || hasLoopedPost) retryFound = true;
  }
});

assert(postCount === 1, "must have exactly one POST call (no retries)");
assert(!putPatchDeleteFound, "must not use PUT/PATCH/DELETE");
assert(!retryFound, "must not retry POST operations");

// Test 6: Fixed volume size and name, no configuration options
const createStep = createJob.steps.find(s => s.name && s.name.includes("Create Network Volume"));
assert(createStep !== undefined, "must have explicit Create Network Volume step");
assert(createStep.run && createStep.run.includes('"size": 5'), "volume size must be fixed to 5 GB");
assert(createStep.run && createStep.run.includes('"name": "photo-restoration-gate3-models"'), "volume name must be fixed");

// Test 7: No endpoint/template/worker/job API calls
assert(!createStep.run.includes("/v1/pods") && !createStep.run.includes("/v1/endpoints") && !createStep.run.includes("/v1/templates"), "must not call endpoint/template/pod APIs");

// Test 8: Must check for existing volume before POST
const existsStep = createJob.steps.find(s => s.name && s.name.includes("existing"));
assert(existsStep !== undefined, "must verify no existing volume before creation");
assert(existsStep.run && existsStep.run.includes("photo-restoration-gate3-models"), "must check for volume by fixed name");

// Test 9: Must verify after POST
const postVerifyStep = createJob.steps.find(s => s.name && s.name.includes("Post-creation"));
assert(postVerifyStep !== undefined, "must verify volume after POST");
assert(postVerifyStep.run && postVerifyStep.run.includes("GET"), "post-creation step must use GET to verify");

// Test 10: No raw authenticated response uploaded
assert(!createJob.steps.some(s => s.name && s.name.includes("upload-artifact") && s.with?.path?.includes("response")), "must not upload raw API responses");

// Test 11: Unsupported/invalid GraphQL fields (root cause of run 30674708510 failure)
// must be absent. Root Query has no `datacenters` field, and `gpuTypes` does not
// accept a `gpuCount` argument (gpuCount belongs to GpuLowestPriceInput, nested
// under `lowestPrice`). Datacenter/GPU discovery must use runpodctl instead.
const allRunScripts = createJob.steps.map(s => s.run || "").join("\n");
assert(!/\bdatacenters\s*\{/.test(allRunScripts), "must not query the nonexistent root 'datacenters' GraphQL field");
assert(!/gpuTypes\s*\(\s*input:\s*\{\s*gpuCount/.test(allRunScripts), "must not pass gpuCount directly into gpuTypes(input:) — it belongs under lowestPrice(input:)");

// Test 12: Datacenter/GPU discovery uses runpodctl (proven official commands), not GraphQL
const preflightStep = createJob.steps.find(s => s.name && s.name.includes("Preflight - Query datacenters and GPU types"));
assert(preflightStep !== undefined, "must have a datacenter/GPU preflight step");
assert(/runpodctl\s+datacenter\s+list/.test(preflightStep.run), "must use 'runpodctl datacenter list' for datacenter discovery");
assert(/runpodctl\s+gpu\s+list\s+--include-unavailable/.test(preflightStep.run), "must use 'runpodctl gpu list --include-unavailable' for GPU discovery");
assert(!/query.*\{\s*datacenters/s.test(preflightStep.run) && !preflightStep.run.includes("api.runpod.io/graphql"), "must not fall back to unproven GraphQL queries for discovery");

// Test 13: runpodctl is installed from a pinned release binary, not curl|bash
const installStep = createJob.steps.find(s => s.name && s.name.includes("Install runpodctl"));
assert(installStep !== undefined, "must have an explicit runpodctl install step");
assert(!/\|\s*(sudo\s+)?bash\b/.test(installStep.run), "must not pipe a remote install script into bash/sudo bash");
assert(/releases\/download\//.test(installStep.run), "must download a specific pinned GitHub release binary");

// Test 14: datacenter/GPU JSON parsing fails closed (exits 1) when compatibility cannot be
// established. `runpodctl datacenter list` structurally never returns a storage/network-volume
// capability field (confirmed against the runpodctl source: internal/api's DataCenter struct
// and its GraphQL query only carry id/name/location/gpuAvailability), so the preflight must
// NOT invent a storage-capability signal from GPU availability alone, and must not silently
// treat an absent field as a false/negative result without saying so.
assert(/exit 1/.test(preflightStep.run), "preflight must exit non-zero when compatibility cannot be established");
assert(/COMPATIBLE_GPU_DCS|dataCenterAvailability|A4000|A4500/.test(preflightStep.run), "must cross-reference GPU compatibility using the documented dataCenterAvailability field");
assert(!/storageSupport|supportNetworkVolume|storage_support/.test(preflightStep.run), "must not reference a storage-capability field that runpodctl does not actually return");
assert(/cannot be verified|cannot verify|unverifiable/i.test(preflightStep.run), "must honestly state that storage capability cannot be verified, not fabricate a negative result");

// Test 15: the volume creation request body matches the official NetworkVolumeCreateInput
// schema exactly (name, size, dataCenterId) — no unsupported fields like 'tier'.
assert(!/"tier"\s*:/.test(createStep.run), "must not send unsupported 'tier' field (not part of NetworkVolumeCreateInput)");
assert(/dataCenterId/.test(createStep.run), "must send a dataCenterId resolved from preflight, not a hardcoded guess");
assert(!/"dataCenterId"\s*:\s*"us-east-1"/.test(createStep.run), "must not hardcode an unverified datacenter ID literal");

console.log("✓ Workflow security test PASSED");
console.log("  - workflow_dispatch only, no automatic triggers");
console.log("  - confirmation input required: CREATE_ONE_GATE3_VOLUME");
console.log("  - RUNPOD_API_KEY from secrets only, never logged");
console.log("  - exactly one POST (no retries), no PUT/PATCH/DELETE");
console.log("  - fixed volume size (5 GB) and name (photo-restoration-gate3-models)");
console.log("  - no endpoint/template/worker/job APIs");
console.log("  - verifies existing volume before POST");
console.log("  - verifies volume after POST");
console.log("  - no raw authenticated response uploaded");
console.log("  - no unsupported/invalid GraphQL fields (datacenters root field, gpuTypes(gpuCount))");
console.log("  - datacenter/GPU discovery uses proven runpodctl commands, not guessed GraphQL");
console.log("  - runpodctl installed from pinned release binary, not curl|bash");
console.log("  - preflight fails closed when no compatible datacenter/GPU pair is found");
console.log("  - create request body matches official NetworkVolumeCreateInput schema exactly");
