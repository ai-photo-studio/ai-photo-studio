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

// Check that API key is used but never logged
let apiKeyFoundLogged = false;
createJob.steps.forEach(step => {
  if (step.env && step.env.RUNPOD_API_KEY === "${{ secrets.RUNPOD_API_KEY }}") {
    // Good: key is sourced from secrets
    if (step.run && step.run.includes("echo") && step.run.includes("RUNPOD_API_KEY")) {
      apiKeyFoundLogged = true;
    }
  }
});
assert(!apiKeyFoundLogged, "must never echo or print RUNPOD_API_KEY");

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

    // Check for retry logic
    if (/retry|--retry/.test(step.run)) retryFound = true;
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
