// Workflow security test: validate that publish-restore-unpack-fix-chain.yml
// enforces strict guarded-publication constraints: workflow_dispatch only,
// exact confirmation, one immutable full-SHA tag shared by all three images,
// no floating tags, no RunPod credentials, no deployment, build-order
// dependency chaining by resolved digest only, push only after tests/
// security pass, fail-closed on existing tags, no secret output.

import fs from "node:fs";
import yaml from "js-yaml";

const workflowPath = ".github/workflows/publish-restore-unpack-fix-chain.yml";
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
assert(confirmationInput.description.includes("PUBLISH_CORRECTED_RESTORE_CHAIN"), "description must state the exact confirmation value");
const confirmStep = allSteps.find((s) => s.name && s.name.includes("confirmation"));
assert(confirmStep && confirmStep.run.includes("PUBLISH_CORRECTED_RESTORE_CHAIN"), "must check confirmation value");

// Permissions: contents:read, packages:write, nothing else
assert(workflow.permissions.contents === "read", "permissions must include contents:read");
assert(workflow.permissions.packages === "write", "permissions must include packages:write");
assert(Object.keys(workflow.permissions).length === 2, "no extra permissions allowed");

// Only runs from main
assert(job.if === "github.ref == 'refs/heads/main'", "must only run from the default branch");

// Fixed repositories
assert(workflow.env.CLI_REPO.endsWith("runpod-worker-gpu-dev-restore-unpack-fix"), "CLI repo must be fixed");
assert(workflow.env.SERVERLESS_REPO.endsWith("runpod-worker-gpu-serverless-restore-unpack-fix-dev"), "Serverless repo must be fixed");
assert(workflow.env.VOLUME_REPO.endsWith("runpod-worker-gpu-serverless-volume-restore-unpack-fix-dev"), "Volume repo must be fixed");
assert(workflow.env.OLD_BUGGY_CLI_DIGEST === "sha256:049a304b44bec75562a74eac3f5be312feacd6133da80a0dc86d0a136a86a63a", "old buggy CLI digest must be recorded exactly");

// One immutable full-SHA tag shared by all three images; no floating tags
const shaStep = allSteps.find((s) => s.id === "sha");
assert(shaStep !== undefined, "must have a source-SHA resolution step");
assert(shaStep.run.includes('${#SOURCE_SHA}" -ne 40'), "must enforce a full 40-character SHA");
const buildTags = allSteps.filter((s) => s.uses && s.uses.includes("build-push-action")).map((s) => s.with?.tags || "");
assert(buildTags.some((t) => t.includes("${{ env.CLI_REPO }}:${{ steps.sha.outputs.source_sha }}")), "CLI image must be tagged with the resolved source SHA");
assert(buildTags.some((t) => t.includes("${{ env.SERVERLESS_REPO }}:${{ steps.sha.outputs.source_sha }}")), "Serverless image must be tagged with the resolved source SHA");
assert(buildTags.some((t) => t.includes("${{ env.VOLUME_REPO }}:${{ steps.sha.outputs.source_sha }}")), "Volume image must be tagged with the resolved source SHA");
assert(!/:latest|:main|:stable/.test(source) && !buildTags.some((t) => /:latest|:main|:stable/.test(t)), "must never use a floating tag (latest/main/stable)");

// No RunPod credentials anywhere in this workflow
assert(!/RUNPOD_API_KEY|RUNPOD_S3_ACCESS_KEY|RUNPOD_S3_SECRET_KEY/.test(raw), "must never reference RunPod credentials");
assert(!/rest\.runpod\.io|api\.runpod\.ai/.test(raw), "must never call any RunPod API endpoint");

// No deployment / RunPod resource creation / Gate 3 execution
assert(!/\/v1\/(endpoints|templates)|runpodctl/i.test(raw), "must not create any RunPod endpoint/template resource");
assert(!/kubectl|helm upgrade|northflank/i.test(raw), "must not deploy to any runtime environment");

// No workflow rerun loop
assert(!/for\s+.*docker push|while\s+.*docker push|until\s+.*docker push/.test(source), "must not loop over docker push");
assert((source.match(/docker push /g) || []).length === 3, "must push exactly three times (one per image)");

// Dependency chain: each child derives from the just-published parent by resolved digest
const stage2GenStep = allSteps.find((s) => s.name && s.name.includes("Stage 2 - Generate publish Dockerfile"));
assert(stage2GenStep !== undefined, "must generate a publish Dockerfile for stage 2");
assert(stage2GenStep.run.includes("steps.push-cli.outputs.digest"), "Serverless stage must derive from the CLI stage's resolved push digest");
assert(stage2GenStep.run.includes("OLD_BUGGY_CLI_DIGEST"), "Serverless stage must guard against the old buggy digest");

const stage3GenStep = allSteps.find((s) => s.name && s.name.includes("Stage 3 - Generate publish Dockerfile"));
assert(stage3GenStep !== undefined, "must generate a publish Dockerfile for stage 3");
assert(stage3GenStep.run.includes("steps.push-handler.outputs.digest"), "Volume stage must derive from the Serverless stage's resolved push digest");
assert(stage3GenStep.run.includes("OLD_BUGGY_CLI_DIGEST"), "Volume stage must guard against the old buggy digest");

// Push only after tests/security pass: push steps must appear after the
// corresponding vulnerability-assertion step for each stage
const stepNames = allSteps.map((s) => s.name || "");
const idx = (needle) => stepNames.findIndex((n) => n.includes(needle));
assert(idx("Stage 1 - Assert zero CRITICAL") < idx("Stage 1 - Push"), "CLI push must occur after the CRITICAL/CVE assertion");
assert(idx("Stage 2 - Assert zero CRITICAL") < idx("Stage 2 - Push"), "Serverless push must occur after the CRITICAL/CVE assertion");
assert(idx("Stage 3 - Assert zero CRITICAL") < idx("Stage 3 - Push"), "Volume push must occur after the CRITICAL/CVE assertion");

// Fail-closed on existing tags before any build/push
const tagCheckStep = allSteps.find((s) => s.name && s.name.includes("no matching tag already exists"));
assert(tagCheckStep !== undefined, "must check for existing tags before publishing");
const tagCheckIdx = allSteps.indexOf(tagCheckStep);
const firstPushIdx = idx("Stage 1 - Push");
assert(tagCheckIdx < firstPushIdx, "tag-existence check must run before any push");

// No secret output
const verboseCurlPattern = /curl\s+[^\n]*(-v\b|--verbose|--trace)/;
assert(!verboseCurlPattern.test(source), "must not use verbose/trace curl output");
assert(!/set\s+-[^\n]*x/.test(source), "set -x is prohibited (would dump secrets to logs)");
assert(!/echo\b[^\n]*\$\{?(GITHUB_TOKEN|secrets\.)/.test(source), "must never echo GITHUB_TOKEN or any secret");

// Post-publication verification pulls fresh by digest and re-checks the chain
const postVerifyStep = allSteps.find((s) => s.name && s.name.includes("Post-publication - pull all three by digest"));
assert(postVerifyStep !== undefined, "must have a post-publication digest-pull verification step");
assert(postVerifyStep.run.includes("docker pull") && (postVerifyStep.run.match(/docker pull/g) || []).length === 3, "must pull all three images fresh by digest");
assert(postVerifyStep.run.includes("providerPostCount == 0"), "post-publication verification must confirm providerPostCount=0");
assert(postVerifyStep.run.includes("productionRoutingAllowed == false"), "post-publication verification must confirm productionRoutingAllowed=false");
assert(postVerifyStep.run.includes("_, _, out = model.enhance"), "post-publication verification must re-confirm the corrected unpack line");

console.log("publish-restore-unpack-fix-chain workflow security validator PASSED");
console.log("  - workflow_dispatch only, PUBLISH_CORRECTED_RESTORE_CHAIN confirmation required");
console.log("  - contents:read + packages:write only, no extra permissions");
console.log("  - one immutable full-SHA tag shared by all three images, no floating tags");
console.log("  - no RunPod credentials, no RunPod API calls, no deployment");
console.log("  - exactly three pushes, no retry/rerun loop");
console.log("  - each child image derives from the just-published parent by resolved digest, guarded against the old buggy digest");
console.log("  - push gated behind zero-CRITICAL/CVE-2025-32434-absent assertions for every stage");
console.log("  - fail-closed on any pre-existing tag before any build/push");
console.log("  - post-publication verification pulls fresh by digest and re-checks the full chain contract");
