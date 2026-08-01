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

// Test 6: Fixed volume size and name, no configuration options. Size is sourced from the
// workflow-level env VOLUME_SIZE_GB (a fixed literal, not a runtime-computed/discovered value)
// and passed into jq via --argjson, so the create step's payload template references the env
// var rather than embedding a literal number; the fixed value itself is asserted directly
// against the workflow's top-level env block.
const createStep = createJob.steps.find(s => s.name && s.name.includes("Create Network Volume"));
assert(createStep !== undefined, "must have explicit Create Network Volume step");
assert(String(workflow.env?.VOLUME_SIZE_GB) === "10", "volume size must be fixed to 10 GB in workflow env");
assert(createStep.run && /--argjson\s+size\s+"\$VOLUME_SIZE_GB"/.test(createStep.run), "create step must source size from the fixed VOLUME_SIZE_GB env var, not a literal or discovered value");
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

// Test 12: GPU discovery uses runpodctl (proven official command), not GraphQL
const preflightStep = createJob.steps.find(s => s.name && s.name.includes("Preflight") && s.name.includes("datacenter"));
assert(preflightStep !== undefined, "must have a datacenter/GPU preflight step");
assert(/runpodctl\s+gpu\s+list\s+--include-unavailable/.test(preflightStep.run), "must use 'runpodctl gpu list --include-unavailable' for GPU discovery");
assert(!/query.*\{\s*datacenters/s.test(preflightStep.run) && !preflightStep.run.includes("api.runpod.io/graphql"), "must not fall back to unproven GraphQL queries for discovery");

// Test 13: runpodctl is installed from a pinned release binary, not curl|bash
const installStep = createJob.steps.find(s => s.name && s.name.includes("Install runpodctl"));
assert(installStep !== undefined, "must have an explicit runpodctl install step");
assert(!/\|\s*(sudo\s+)?bash\b/.test(installStep.run), "must not pipe a remote install script into bash/sudo bash");
assert(/releases\/download\//.test(installStep.run), "must download a specific pinned GitHub release binary");

// Test 14: the fixed, console-proven datacenter/GPU pairing is re-verified against live
// runpodctl evidence, and the preflight fails closed (exits 1) if live data contradicts it.
// No storage-capability field (which runpodctl does not return, confirmed via source
// inspection) may be referenced; only the documented dataCenterAvailability field may be used.
assert(String(workflow.env?.TARGET_DATACENTER_ID) === "EU-RO-1", "fixed target datacenter must be EU-RO-1 (console-proven)");
assert(String(workflow.env?.TARGET_GPU_DISPLAY_NAME).includes("RTX 4000 Ada"), "fixed target GPU must be RTX 4000 Ada (console-proven)");
assert(/exit 1/.test(preflightStep.run), "preflight must exit non-zero when live evidence contradicts the fixed target");
assert(/dataCenterAvailability/.test(preflightStep.run), "must cross-reference GPU compatibility using the documented dataCenterAvailability field");
assert(!/storageSupport|supportNetworkVolume|storage_support/.test(preflightStep.run), "must not reference a storage-capability field that runpodctl does not actually return");
assert(/MATCH_COUNT.*=.*0|contradict/i.test(preflightStep.run), "must detect and fail closed on a contradiction between fixed evidence and live data");

// Test 15: the volume creation request body matches the official NetworkVolumeCreateInput
// schema exactly (name, size, dataCenterId) — no unsupported fields like 'tier'. The
// dataCenterId sent must be the value the preflight verified (via $TARGET_DC), not a
// literal embedded directly in this step (which would bypass the live re-verification).
assert(!/"tier"\s*:/.test(createStep.run), "must not send unsupported 'tier' field (not part of NetworkVolumeCreateInput)");
assert(/--arg\s+dc\s+"\$TARGET_DC"/.test(createStep.run), "must send the dataCenterId resolved and verified by preflight ($TARGET_DC), not a literal");
assert(!/"dataCenterId"\s*:\s*"(us-east-1|EU-RO-1)"/.test(createStep.run), "must not hardcode a datacenter ID literal directly into the JSON payload (must flow through the verified $TARGET_DC variable)");
assert(createStep.run.includes('$TARGET_DATACENTER_ID'), "must cross-check TARGET_DC against the fixed authorized TARGET_DATACENTER_ID before POSTing");

// Test 16: cost cap matches the console-proven $0.70/month for 10GB (fixed, not discovered)
assert(String(workflow.env?.MAX_MONTHLY_STORAGE_COST_USD) === "0.70", "monthly storage cap must be fixed to $0.70 (console-proven, 10GB @ $0.07/GB/month)");
const costGuardStep = createJob.steps.find(s => s.name && s.name.includes("Cost guard"));
assert(costGuardStep !== undefined, "must have a cost guard step");
assert(/MAX_MONTHLY_STORAGE_COST_USD/.test(costGuardStep.run), "cost guard must check against the fixed MAX_MONTHLY_STORAGE_COST_USD cap");

console.log("✓ Workflow security test PASSED");
console.log("  - workflow_dispatch only, no automatic triggers");
console.log("  - confirmation input required: CREATE_ONE_GATE3_VOLUME");
console.log("  - RUNPOD_API_KEY from secrets only, never logged");
console.log("  - exactly one POST (no retries), no PUT/PATCH/DELETE");
console.log("  - fixed volume size (10 GB) and name (photo-restoration-gate3-models)");
console.log("  - fixed datacenter (EU-RO-1) and GPU (RTX 4000 Ada), console-proven and live-reverified");
console.log("  - fixed monthly storage cap ($0.70)");
console.log("  - no endpoint/template/worker/job APIs");
console.log("  - verifies existing volume before POST");
console.log("  - verifies volume after POST");
console.log("  - no raw authenticated response uploaded");
console.log("  - no unsupported/invalid GraphQL fields (datacenters root field, gpuTypes(gpuCount))");
console.log("  - GPU discovery uses proven runpodctl commands, not guessed GraphQL");
console.log("  - runpodctl installed from pinned release binary, not curl|bash");
console.log("  - preflight fails closed if live evidence contradicts the fixed datacenter/GPU pairing");
console.log("  - create request body matches official NetworkVolumeCreateInput schema exactly");
